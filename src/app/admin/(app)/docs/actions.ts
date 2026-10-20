"use server";
// เอกสารขาย: บันทึก/ออกเอกสาร, ตอบรับ/ไม่ตอบรับ, แปลง QT→IV, ฉบับแก้ไข, รับชำระ→ออกใบเสร็จอัตโนมัติ, ยกเลิก, ออกจากคำสั่งซื้อเว็บ
// ยอดเงินคำนวณใหม่ที่ server ทุกครั้ง · เลขที่เอกสารจองใน transaction · ทุกการเปลี่ยนแปลงเก็บ event + บันทึกการใช้งาน
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import type { DocEventType, DocStatus, VatMode } from "../../../../../generated/prisma/client";
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { fromYmd, money, ymdBkk, type DocTypeT } from "@/lib/doc-calc";
import { DOC_META } from "@/lib/doc-render";
import { allocDocNo, custSnapshot, customerFromOrder, defaultTerms, docPath, isDocType, prefixOf, todayYmd, totalsFor, type Tx } from "@/lib/docs";
import { customerForTaxInvoice, parseTaxInvoice } from "@/lib/admin-orders";
import { formatPhone, isValidThaiTaxId } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export type DocState = { error?: string; fields?: string[]; ok?: string };
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
const isInt = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
const MAX_SAT = 100_000_000_00; // 100 ล้านบาท

async function event(tx: Tx, documentId: string, type: DocEventType, adminId: string, note?: string) {
  await tx.salesDocumentEvent.create({ data: { documentId, type, adminId, note: note?.slice(0, 500) } });
}

// ---------------------------------------------------------------------------
// บันทึกจากตัวแก้ไข (ฉบับร่างเท่านั้น) + ออกเอกสาร
// ---------------------------------------------------------------------------
type Payload = {
  id?: string; type: DocTypeT; customerId: string; issueDate: string; validUntil: string; dueDate: string;
  items: { productId?: string | null; sku: string; name: string; detail: string; unit: string; qtyMilli: number; priceSatang: number; discountSatang: number }[];
  discountSatang: number; vatMode: VatMode; paymentMethod: string; paymentTerms: string; carrier: string; note: string; internalNote: string;
  sourceId?: string | null; orderId?: string | null;
};

export async function saveDoc(_prev: DocState, f: FormData): Promise<DocState> {
  const admin = await requireAdmin();
  let p: Payload;
  try {
    p = JSON.parse(String(f.get("payload") ?? ""));
  } catch {
    return { error: "ข้อมูลไม่ถูกต้อง ลองโหลดหน้าใหม่" };
  }
  const issue = f.get("intent") === "issue";
  if (!p || !isDocType(String(p.type))) return { error: "ชนิดเอกสารไม่ถูกต้อง" };
  const s = await getSettings();
  const bad: string[] = [];
  const msgs: string[] = [];

  const customer = p.customerId ? await prisma.customer.findUnique({ where: { id: String(p.customerId) } }) : null;
  if (!customer) { bad.push("customer"); msgs.push("กรุณาเลือกลูกค้า"); }
  if (!Array.isArray(p.items) || !p.items.length) { bad.push("items"); msgs.push("ต้องมีรายการอย่างน้อย 1 รายการ"); }
  const items = (Array.isArray(p.items) ? p.items : []).slice(0, 300).map((it, i) => {
    const name = String(it.name ?? "").trim().slice(0, 250);
    const ok = name && isInt(it.qtyMilli, 1, 1_000_000_000) && isInt(it.priceSatang, 0, MAX_SAT) && isInt(it.discountSatang, 0, MAX_SAT) &&
      it.discountSatang <= Math.round((it.qtyMilli * it.priceSatang) / 1000);
    if (!ok) bad.push(`line${i}`);
    return {
      sortOrder: i + 1, productId: it.productId ? String(it.productId) : null, sku: String(it.sku ?? "").trim().slice(0, 60) || null, name,
      detail: String(it.detail ?? "").trim().slice(0, 300) || null, unit: String(it.unit ?? "").trim().slice(0, 20) || "ชิ้น",
      qtyMilli: Number(it.qtyMilli) || 0, priceSatang: Number(it.priceSatang) || 0, discountSatang: Number(it.discountSatang) || 0,
    };
  });
  if (bad.some((b) => b.startsWith("line"))) msgs.push("ตรวจรายการที่มีกรอบสีแดง: ต้องมีชื่อ จำนวนมากกว่า 0 ราคาไม่ติดลบ และส่วนลดไม่เกินราคารวม");
  // productId ที่ส่งมาต้องมีอยู่จริง
  const pids = items.map((i) => i.productId).filter((x): x is string => !!x);
  if (pids.length) {
    const found = new Set((await prisma.product.findMany({ where: { id: { in: pids } }, select: { id: true } })).map((x) => x.id));
    items.forEach((i) => { if (i.productId && !found.has(i.productId)) i.productId = null; });
  }
  const issueYmd = ymdRe.test(p.issueDate) ? p.issueDate : todayYmd();
  const validUntil = p.type === "QUOTATION" && ymdRe.test(p.validUntil) ? p.validUntil : "";
  const dueDate = p.type === "INVOICE" && ymdRe.test(p.dueDate) ? p.dueDate : "";
  if (validUntil && validUntil < issueYmd) { bad.push("validUntil"); msgs.push("วันยืนราคาต้องไม่ก่อนวันที่เอกสาร"); }
  if (dueDate && dueDate < issueYmd) { bad.push("dueDate"); msgs.push("วันครบกำหนดต้องไม่ก่อนวันที่เอกสาร"); }
  const vatMode: VatMode = s.vatEnabled && ["EXCLUSIVE", "INCLUSIVE", "NONE"].includes(p.vatMode) ? p.vatMode : "NONE";
  if (vatMode !== "NONE" && p.type === "RECEIPT" && customer?.kind === "COMPANY" && !(customer.taxId && isValidThaiTaxId(customer.taxId))) {
    bad.push("customer");
    msgs.push("ใบกำกับภาษีของนิติบุคคลต้องมีเลขประจำตัวผู้เสียภาษีของลูกค้า — แก้ไขข้อมูลลูกค้าก่อน");
  }
  const discount = isInt(p.discountSatang, 0, MAX_SAT) ? p.discountSatang : -1;
  if (discount < 0) { bad.push("discount"); msgs.push("ส่วนลดท้ายบิลไม่ถูกต้อง"); }
  const totals = totalsFor(items, Math.max(0, discount), vatMode, s.vatRateBp);
  if (discount > totals.subtotalSatang + totals.discountSatang) { bad.push("discount"); msgs.push("ส่วนลดท้ายบิลมากกว่ายอดรวม"); }
  if (issue && p.type !== "QUOTATION" && totals.grandSatang <= 0) { bad.push("items"); msgs.push("ยอดรวมต้องมากกว่า 0 บาท"); }
  if (bad.length) return { error: msgs.join(" · ") || "กรุณาตรวจข้อมูล", fields: bad };

  const data = {
    customerId: customer!.id, customerSnapshot: custSnapshot(customer!),
    issueDate: fromYmd(issueYmd), validUntil: validUntil ? fromYmd(validUntil) : null, dueDate: dueDate ? fromYmd(dueDate) : null,
    ...totals, vatMode, vatRateBp: vatMode === "NONE" ? 0 : s.vatRateBp,
    paymentMethod: String(p.paymentMethod ?? "").trim().slice(0, 60) || null, paymentTerms: String(p.paymentTerms ?? "").trim().slice(0, 2000) || null,
    carrier: String(p.carrier ?? "").trim().slice(0, 60) || null, note: String(p.note ?? "").trim().slice(0, 2000) || null,
    internalNote: String(p.internalNote ?? "").trim().slice(0, 2000) || null,
  };

  let id = p.id ? String(p.id) : "";
  let docNo: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      if (id) {
        const cur = await tx.salesDocument.findUnique({ where: { id } });
        if (!cur || cur.type !== p.type) throw new UserError("ไม่พบเอกสาร");
        if (cur.status !== "DRAFT") throw new UserError("เอกสารนี้ออกแล้ว แก้ไขไม่ได้ — ใช้ \"สร้างฉบับแก้ไข\" หรือยกเลิกแล้วออกใหม่");
        await tx.salesDocument.update({ where: { id }, data });
        await tx.salesDocumentItem.deleteMany({ where: { documentId: id } });
      } else {
        // แหล่งที่มา (QT ฉบับเดิม / QT ที่แปลง / คำสั่งซื้อ) ส่งมาจากตัวแก้ไขของเอกสารใหม่เท่านั้น
        const source = p.sourceId ? await tx.salesDocument.findUnique({ where: { id: String(p.sourceId) }, select: { id: true } }) : null;
        const order = p.orderId ? await tx.order.findUnique({ where: { id: String(p.orderId) }, select: { id: true } }) : null;
        const created = await tx.salesDocument.create({ data: { ...data, type: p.type, status: "DRAFT", sourceId: source?.id ?? null, orderId: order?.id ?? null } });
        id = created.id;
        await event(tx, id, "CREATED", admin.id, "สร้างฉบับร่าง");
      }
      await tx.salesDocumentItem.createMany({ data: items.map((i) => ({ ...i, documentId: id })) });
      if (issue) docNo = await issueInTx(tx, id, admin.id, s);
    });
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
  await logAdmin(admin.id, "DOC", docNo ? `ออก${DOC_META[p.type].th} ${docNo} · ${customer!.name} · ฿${money(totals.grandSatang)}` : `บันทึกฉบับร่าง${DOC_META[p.type].th} · ${customer!.name}`);
  redirect(`${docPath({ type: p.type, id })}?${docNo ? "issued=1" : "saved=1"}`);
}

class UserError extends Error {}

/** ออกเลขที่ + เปลี่ยนสถานะ (เรียกภายใน transaction) */
async function issueInTx(tx: Tx, id: string, adminId: string, s: Awaited<ReturnType<typeof getSettings>>) {
  const d = await tx.salesDocument.findUniqueOrThrow({ where: { id }, include: { source: true, _count: { select: { items: true } } } });
  if (d.status !== "DRAFT") throw new UserError("เอกสารนี้ออกเลขที่แล้ว");
  if (!d._count.items || !d.customerId) throw new UserError("ต้องมีลูกค้าและรายการก่อนออกเอกสาร");
  const ymd = ymdBkk(d.issueDate ?? new Date());
  const no = await allocDocNo(tx, d.type, ymd, prefixOf(s, d.type));
  const r = await tx.salesDocument.updateMany({ where: { id, status: "DRAFT" }, data: { docNo: no, status: "ISSUED", issueDate: fromYmd(ymd) } });
  if (r.count !== 1) throw new UserError("เอกสารนี้ถูกออกเลขที่ไปแล้ว");
  await event(tx, id, "ISSUED", adminId, `ออกเลขที่ ${no}`);
  // ฉบับแก้ไขของใบเสนอราคา → ยกเลิกฉบับเดิม (เลขเดิมยังเก็บไว้)
  if (d.type === "QUOTATION" && d.source?.type === "QUOTATION" && ["ISSUED", "REJECTED"].includes(d.source.status)) {
    await tx.salesDocument.update({ where: { id: d.source.id }, data: { status: "VOID", voidReason: `มีฉบับแก้ไข ${no}` } });
    await event(tx, d.source.id, "VOIDED", adminId, `มีฉบับแก้ไข ${no}`);
  }
  return no;
}

export async function issueDoc(f: FormData) {
  const admin = await requireAdmin();
  const s = await getSettings();
  const id = str(f, "id", 40);
  let no = "";
  let err = "";
  try {
    no = await prisma.$transaction((tx) => issueInTx(tx, id, admin.id, s));
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    err = e.message;
  }
  const d = await prisma.salesDocument.findUnique({ where: { id }, select: { id: true, type: true } });
  if (!d) redirect("/admin/docs/QUOTATION");
  if (no) await logAdmin(admin.id, "DOC", `ออก${DOC_META[d.type].th} ${no}`);
  redirect(`${docPath(d)}?${no ? "issued=1" : `err=${encodeURIComponent(err)}`}`);
}

// ---------------------------------------------------------------------------
// ใบเสนอราคา
// ---------------------------------------------------------------------------
async function setQuoteStatus(f: FormData, to: DocStatus, label: string, ev: DocEventType) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const r = await prisma.salesDocument.updateMany({ where: { id, type: "QUOTATION", status: { in: ["ISSUED", "ACCEPTED", "REJECTED"] } }, data: { status: to } });
  if (r.count) {
    const d = await prisma.salesDocument.findUniqueOrThrow({ where: { id } });
    await prisma.salesDocumentEvent.create({ data: { documentId: id, type: ev, adminId: admin.id, note: label } });
    await logAdmin(admin.id, "DOC", `${d.docNo} ${label}`);
  }
  refresh();
}
export async function acceptQuote(f: FormData) { await setQuoteStatus(f, "ACCEPTED", "ลูกค้าตอบรับ", "ACCEPTED"); }
export async function rejectQuote(f: FormData) { await setQuoteStatus(f, "REJECTED", "ลูกค้าไม่ตอบรับ", "REJECTED"); }
export async function reopenQuote(f: FormData) { await setQuoteStatus(f, "ISSUED", "กลับเป็นรอตอบรับ", "NOTE"); }

/** สร้างเอกสารใหม่ (ฉบับร่าง) โดยคัดลอกรายการจากเอกสารเดิม */
async function copyToDraft(srcId: string, type: DocTypeT, adminId: string, link: { sourceId?: string; orderId?: string | null }, note: string) {
  const s = await getSettings();
  const src = await prisma.salesDocument.findUniqueOrThrow({ where: { id: srcId }, include: { items: { orderBy: { sortOrder: "asc" } }, customer: true } });
  const today = todayYmd();
  const days = type === "QUOTATION" ? s.quoteValidDays : type === "INVOICE" ? s.invoiceDueDays : 0;
  const plus = (n: number) => ymdBkk(new Date(fromYmd(today).getTime() + n * 864e5));
  const vatMode = s.vatEnabled ? src.vatMode : "NONE";
  const items = src.items.map(({ productId, sku, name, detail, unit, qtyMilli, priceSatang, discountSatang, sortOrder }) => ({ productId, sku, name, detail, unit, qtyMilli, priceSatang, discountSatang, sortOrder }));
  const doc = await prisma.$transaction(async (tx) => {
    const d = await tx.salesDocument.create({
      data: {
        type, status: "DRAFT", customerId: src.customerId, customerSnapshot: src.customer ? custSnapshot(src.customer) : (src.customerSnapshot ?? {}),
        issueDate: fromYmd(today), validUntil: type === "QUOTATION" ? fromYmd(plus(days)) : null, dueDate: type === "INVOICE" ? fromYmd(plus(days)) : null,
        ...totalsFor(items, src.discountSatang, vatMode, s.vatRateBp), vatMode, vatRateBp: vatMode === "NONE" ? 0 : s.vatRateBp,
        paymentMethod: src.paymentMethod, paymentTerms: type === src.type ? src.paymentTerms : defaultTerms(s, type) || null, carrier: src.carrier, note: src.note,
        internalNote: src.internalNote, sourceId: link.sourceId ?? null, orderId: link.orderId ?? null,
        items: { create: items },
      },
    });
    await event(tx, d.id, "CREATED", adminId, note);
    return d;
  });
  return doc;
}

export async function convertQuote(f: FormData) {
  const admin = await requireAdmin();
  const q = await prisma.salesDocument.findUnique({ where: { id: str(f, "id", 40) }, include: { derived: { where: { type: "INVOICE", status: { not: "VOID" } } } } });
  if (!q || q.type !== "QUOTATION" || !["ISSUED", "ACCEPTED"].includes(q.status)) redirect("/admin/docs/QUOTATION");
  if (q.derived[0]) redirect(`${docPath(q.derived[0])}?exists=1`);
  const iv = await copyToDraft(q.id, "INVOICE", admin.id, { sourceId: q.id, orderId: q.orderId }, `แปลงจาก ${q.docNo}`);
  await prisma.$transaction([
    prisma.salesDocument.update({ where: { id: q.id }, data: { status: "ACCEPTED" } }),
    prisma.salesDocumentEvent.create({ data: { documentId: q.id, type: "CONVERTED", adminId: admin.id, note: "แปลงเป็นใบแจ้งหนี้ (ฉบับร่าง)" } }),
  ]);
  await logAdmin(admin.id, "DOC", `แปลง ${q.docNo} เป็นใบแจ้งหนี้`);
  redirect(`${docPath(iv)}/edit`);
}

export async function reviseQuote(f: FormData) {
  const admin = await requireAdmin();
  const q = await prisma.salesDocument.findUnique({ where: { id: str(f, "id", 40) } });
  if (!q || q.type !== "QUOTATION" || !["ISSUED", "REJECTED"].includes(q.status)) redirect("/admin/docs/QUOTATION");
  const pending = await prisma.salesDocument.findFirst({ where: { sourceId: q.id, type: "QUOTATION", status: "DRAFT" } });
  if (pending) redirect(`${docPath(pending)}/edit`);
  const n = await copyToDraft(q.id, "QUOTATION", admin.id, { sourceId: q.id, orderId: q.orderId }, `ฉบับแก้ไขของ ${q.docNo}`);
  await logAdmin(admin.id, "DOC", `สร้างฉบับแก้ไขของ ${q.docNo}`);
  redirect(`${docPath(n)}/edit`);
}

export async function duplicateDoc(f: FormData) {
  const admin = await requireAdmin();
  const d = await prisma.salesDocument.findUnique({ where: { id: str(f, "id", 40) } });
  if (!d) redirect("/admin/docs/QUOTATION");
  const n = await copyToDraft(d.id, d.type, admin.id, {}, `ทำสำเนาจาก ${d.docNo ?? "ฉบับร่าง"}`);
  redirect(`${docPath(n)}/edit`);
}

export async function deleteDraft(f: FormData) {
  const admin = await requireAdmin();
  const d = await prisma.salesDocument.findUnique({ where: { id: str(f, "id", 40) } });
  if (!d) redirect("/admin/docs/QUOTATION");
  if (d.status === "DRAFT") {
    await prisma.salesDocument.delete({ where: { id: d.id } });
    await logAdmin(admin.id, "DOC", `ลบฉบับร่าง${DOC_META[d.type].th}`);
  }
  redirect(`/admin/docs/${d.type}?deleted=1`);
}

// ---------------------------------------------------------------------------
// รับชำระ → ใบเสร็จอัตโนมัติ (ชำระบางส่วนได้หลายงวด)
// ---------------------------------------------------------------------------
export async function recordPayment(_prev: DocState, f: FormData): Promise<DocState> {
  const admin = await requireAdmin();
  const s = await getSettings();
  const id = str(f, "id", 40);
  const paidYmd = str(f, "paidAt", 10);
  const amtRaw = Number(str(f, "amount", 20).replace(/[,\s฿]/g, ""));
  const amount = Math.round(amtRaw * 100);
  const method = str(f, "method", 60);
  const reference = str(f, "reference", 100);
  const bad: string[] = [];
  if (!ymdRe.test(paidYmd) || paidYmd > todayYmd()) bad.push("paidAt");
  if (!Number.isFinite(amtRaw) || amount <= 0) bad.push("amount");
  if (!method) bad.push("method");
  if (bad.length) return { error: bad.includes("paidAt") ? "วันที่รับชำระไม่ถูกต้อง (ห้ามเป็นวันในอนาคต)" : bad.includes("amount") ? "กรุณาใส่ยอดเงินที่รับชำระ" : "กรุณาเลือกวิธีชำระเงิน", fields: bad };

  let rcId = "", rcNo = "", ivNo = "";
  try {
    await prisma.$transaction(async (tx) => {
      // ล็อกใบแจ้งหนี้ กันบันทึกรับชำระซ้อนกัน
      await tx.$executeRaw`SELECT 1 FROM "SalesDocument" WHERE "id" = ${id} FOR UPDATE`;
      const iv = await tx.salesDocument.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } }, payments: { where: { voided: false } } } });
      if (!iv || iv.type !== "INVOICE") throw new UserError("ไม่พบใบแจ้งหนี้");
      if (!["ISSUED", "PARTIAL"].includes(iv.status)) throw new UserError(iv.status === "PAID" ? "ใบแจ้งหนี้นี้ชำระครบแล้ว" : "ใบแจ้งหนี้นี้ยังไม่ได้ออก หรือถูกยกเลิก");
      const outstanding = iv.grandSatang - iv.paidSatang;
      if (amount > outstanding) throw new UserError(`ยอดรับชำระเกินยอดค้าง (คงค้าง ${money(outstanding)} บาท)`);
      if (paidYmd < ymdBkk(iv.issueDate ?? iv.createdAt)) throw new UserError("วันที่รับชำระต้องไม่ก่อนวันที่ออกใบแจ้งหนี้");
      ivNo = iv.docNo!;
      const seq = iv.payments.length + 1;
      const full = !iv.payments.length && amount === iv.grandSatang;
      // ชำระเต็มจำนวนครั้งเดียว = คัดลอกรายการ · ชำระบางส่วน = 1 บรรทัด "รับชำระตามใบแจ้งหนี้ … (งวดที่ n)"
      const items = full
        ? iv.items.map(({ productId, sku, name, detail, unit, qtyMilli, priceSatang, discountSatang, sortOrder }) => ({ productId, sku, name, detail, unit, qtyMilli, priceSatang, discountSatang, sortOrder }))
        : [{ sortOrder: 1, productId: null, sku: null, name: `รับชำระตามใบแจ้งหนี้ ${iv.docNo} (งวดที่ ${seq})`, detail: `ยอดตามใบแจ้งหนี้ ${money(iv.grandSatang)} บาท`, unit: "งวด", qtyMilli: 1000, priceSatang: amount, discountSatang: 0 }];
      const vatMode: VatMode = full ? iv.vatMode : iv.vatMode === "NONE" ? "NONE" : "INCLUSIVE";
      const discount = full ? iv.discountSatang : 0;
      const totals = totalsFor(items, discount, vatMode, iv.vatRateBp || s.vatRateBp);
      if (totals.grandSatang !== amount) throw new UserError("คำนวณยอดใบเสร็จไม่ตรงกับยอดรับชำระ");
      const rc = await tx.salesDocument.create({
        data: {
          type: "RECEIPT", status: "DRAFT", customerId: iv.customerId, customerSnapshot: iv.customerSnapshot ?? {}, issueDate: fromYmd(paidYmd),
          ...totals, vatMode, vatRateBp: vatMode === "NONE" ? 0 : iv.vatRateBp || s.vatRateBp, paymentMethod: method, carrier: iv.carrier,
          paymentTerms: s.termsReceipt, sourceId: iv.id, orderId: iv.orderId, items: { create: items },
        },
      });
      rcId = rc.id;
      rcNo = await issueInTx(tx, rc.id, admin.id, s);
      await tx.docPayment.create({ data: { invoiceId: iv.id, receiptId: rc.id, paidAt: fromYmd(paidYmd), amountSatang: amount, method, reference: reference || null } });
      const paid = iv.paidSatang + amount;
      await tx.salesDocument.update({ where: { id: iv.id }, data: { paidSatang: paid, status: paid >= iv.grandSatang ? "PAID" : "PARTIAL" } });
      await event(tx, iv.id, "PAYMENT", admin.id, `รับชำระ ${money(amount)} บาท (${method}${reference ? ` · ${reference}` : ""}) → ${rcNo}`);
    });
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
  await logAdmin(admin.id, "DOC", `รับชำระ ${ivNo} ฿${money(amount)} → ออกใบเสร็จ ${rcNo}`);
  redirect(`${docPath({ type: "INVOICE", id })}?paid=${encodeURIComponent(rcNo)}&rc=${rcId}`);
}

// ---------------------------------------------------------------------------
// ยกเลิก (เก็บเลขที่ไว้ ไม่ลบ)
// ---------------------------------------------------------------------------
export async function voidDoc(_prev: DocState, f: FormData): Promise<DocState> {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const reason = str(f, "reason", 200);
  if (reason.length < 3) return { error: "กรุณาระบุเหตุผลการยกเลิก", fields: ["reason"] };
  let label = "";
  let voided: { type: DocTypeT; id: string } | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "SalesDocument" WHERE "id" = ${id} FOR UPDATE`;
      const d = await tx.salesDocument.findUnique({ where: { id }, include: { payments: { where: { voided: false } }, derived: { where: { status: { not: "VOID" }, type: "INVOICE" } }, receiptFor: true } });
      if (!d) throw new UserError("ไม่พบเอกสาร");
      if (d.status === "DRAFT") throw new UserError("ฉบับร่างใช้ \"ลบฉบับร่าง\" แทน");
      if (d.status === "VOID") throw new UserError("เอกสารนี้ถูกยกเลิกแล้ว");
      if (d.type === "INVOICE" && d.payments.length) throw new UserError("ใบแจ้งหนี้นี้มีการรับชำระแล้ว — ยกเลิกใบเสร็จของทุกงวดก่อน");
      if (d.type === "QUOTATION" && d.derived.length) throw new UserError(`ใบเสนอราคานี้แปลงเป็นใบแจ้งหนี้แล้ว — ยกเลิกใบแจ้งหนี้ก่อน`);
      if (d.type === "RECEIPT" && d.receiptFor && !d.receiptFor.voided) {
        const pay = d.receiptFor;
        await tx.$executeRaw`SELECT 1 FROM "SalesDocument" WHERE "id" = ${pay.invoiceId} FOR UPDATE`;
        const iv = await tx.salesDocument.findUniqueOrThrow({ where: { id: pay.invoiceId } });
        const paid = Math.max(0, iv.paidSatang - pay.amountSatang);
        await tx.docPayment.update({ where: { id: pay.id }, data: { voided: true } });
        await tx.salesDocument.update({ where: { id: iv.id }, data: { paidSatang: paid, status: iv.status === "VOID" ? "VOID" : paid <= 0 ? "ISSUED" : paid >= iv.grandSatang ? "PAID" : "PARTIAL" } });
        await event(tx, iv.id, "NOTE", admin.id, `ยกเลิกการรับชำระ ${money(pay.amountSatang)} บาท (ใบเสร็จ ${d.docNo} ถูกยกเลิก)`);
      }
      await tx.salesDocument.update({ where: { id }, data: { status: "VOID", voidReason: reason } });
      await event(tx, id, "VOIDED", admin.id, reason);
      label = `ยกเลิก${DOC_META[d.type].th} ${d.docNo} · ${reason}`;
      voided = { type: d.type, id: d.id };
    });
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
  await logAdmin(admin.id, "DOC", label);
  redirect(`${docPath(voided!)}?voided=1`);
}

// ---------------------------------------------------------------------------
// จากคำสั่งซื้อเว็บ → ใบเสร็จ (ชำระแล้ว) / ใบแจ้งหนี้ (ฉบับร่าง)
// ---------------------------------------------------------------------------
export async function docFromOrder(f: FormData) {
  const admin = await requireAdmin();
  const s = await getSettings();
  const type = f.get("type") === "INVOICE" ? "INVOICE" : "RECEIPT";
  const o = await prisma.order.findUnique({ where: { orderNo: str(f, "orderNo", 40) }, include: { items: { include: { product: { select: { sku: true, unit: true } } } }, slips: { orderBy: { uploadedAt: "desc" }, take: 1 } } });
  if (!o) redirect("/admin");
  const exist = await prisma.salesDocument.findFirst({ where: { orderId: o.id, type, status: { not: "VOID" } } });
  if (exist) redirect(`${docPath(exist)}?exists=1`);
  if (type === "RECEIPT" && !["PAID", "SHIPPED"].includes(o.status)) redirect(`/admin?tab=ALL&open=${o.orderNo}`);
  const items = [
    ...o.items.map((i, k) => ({ sortOrder: k + 1, productId: i.productId, sku: i.product?.sku ?? null, name: i.nameSnapshot, detail: null, unit: i.product?.unit ?? "ชิ้น", qtyMilli: i.qty * 1000, priceSatang: i.priceSatang, discountSatang: 0 })),
    ...(o.shippingSatang > 0 ? [{ sortOrder: o.items.length + 1, productId: null, sku: "Shipping", name: "ค่าส่งสินค้า", detail: o.shippingName, unit: "กล่อง", qtyMilli: 1000, priceSatang: o.shippingSatang, discountSatang: 0 }] : []),
  ];
  // ราคาหน้าเว็บรวม VAT แล้ว → ถ้าเปิด VAT ให้ถอดภาษีออกมาแสดง (ยอดรวมเท่ายอดที่ลูกค้าโอน)
  const vatMode: VatMode = s.vatEnabled ? "INCLUSIVE" : "NONE";
  const totals = totalsFor(items, 0, vatMode, s.vatRateBp);
  const today = todayYmd();
  const payYmd = o.paidAt ? ymdBkk(o.paidAt) : today;
  // ลูกค้าขอใบกำกับภาษีตอนสั่งซื้อ (A15) → ออกในนามผู้ขอ (เลขผู้เสียภาษี/สาขา/ที่อยู่ออกบิล) ส่งของถึงผู้รับในคำสั่งซื้อ
  const tax = parseTaxInvoice(o.taxInvoice);
  let id = "", no = "";
  try {
    await prisma.$transaction(async (tx) => {
      const c = await customerFromOrder(tx, o);
      if (!o.customerId) await tx.order.update({ where: { id: o.id }, data: { customerId: c.id } });
      const billTo = tax ? await customerForTaxInvoice(tx, tax, o) : c;
      const snap = custSnapshot(billTo);
      if (tax) {
        snap.address = { line: tax.address };
        snap.shipTo = {
          name: o.customerName, phone: formatPhone(o.phone),
          address: { line: o.addressLine, sub: o.subdistrict, dist: o.district, prov: o.province, zip: o.postalCode },
        };
      }
      const d = await tx.salesDocument.create({
        data: {
          type, status: "DRAFT", customerId: billTo.id, customerSnapshot: snap, orderId: o.id,
          issueDate: fromYmd(type === "RECEIPT" ? payYmd : today), dueDate: type === "INVOICE" ? fromYmd(ymdBkk(new Date(fromYmd(today).getTime() + s.invoiceDueDays * 864e5))) : null,
          ...totals, vatMode, vatRateBp: vatMode === "NONE" ? 0 : s.vatRateBp,
          paymentMethod: "โอนเงินผ่านธนาคาร", carrier: o.carrier, paymentTerms: type === "INVOICE" ? defaultTerms(s, "INVOICE") : s.termsReceipt,
          note: o.note ? `หมายเหตุลูกค้า: ${o.note}` : null, items: { create: items },
        },
      });
      id = d.id;
      await event(tx, id, "CREATED", admin.id, `จากคำสั่งซื้อ ${o.orderNo}`);
      if (type === "RECEIPT") no = await issueInTx(tx, id, admin.id, s);
    });
  } catch (e) {
    if (!(e instanceof UserError)) throw e;
    redirect(`/admin?tab=ALL&open=${o.orderNo}`);
  }
  await logAdmin(admin.id, "DOC", type === "RECEIPT" ? `ออกใบเสร็จ ${no} จากคำสั่งซื้อ ${o.orderNo}` : `สร้างใบแจ้งหนี้ (ร่าง) จากคำสั่งซื้อ ${o.orderNo}`);
  redirect(type === "RECEIPT" ? `${docPath({ type, id })}?issued=1` : `${docPath({ type, id })}/edit`);
}

/** บันทึกว่าพิมพ์แล้ว (เรียกจากหน้าพิมพ์) */
export async function markPrinted(kind: "doc" | "label", ref: string) {
  const admin = await requireAdmin();
  const r = ref.slice(0, 200);
  if (kind === "doc") {
    const d = await prisma.salesDocument.findUnique({ where: { id: r }, select: { id: true, docNo: true } });
    if (d) await prisma.salesDocumentEvent.create({ data: { documentId: d.id, type: "PRINTED", adminId: admin.id, note: "พิมพ์/บันทึก PDF" } });
  } else await logAdmin(admin.id, "LABEL", `พิมพ์ใบปะหน้า ${r}`);
}
