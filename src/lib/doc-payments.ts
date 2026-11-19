// ออกเลขที่เอกสาร + รับชำระใบแจ้งหนี้ → ออกใบเสร็จอัตโนมัติ (ใช้ร่วมกัน: หน้าเอกสารขาย และอนุมัติสลิปจากลิงก์ใบแจ้งหนี้ U26/A20)
// เรียกภายใน transaction ของงานหลักเท่านั้น — ล็อกใบแจ้งหนี้ (FOR UPDATE) กันบันทึกรับชำระซ้อนกัน
import "server-only";
import type { ShopSetting, VatMode } from "../../generated/prisma/client";
import { fromYmd, money, ymdBkk } from "@/lib/doc-calc";
import { allocDocNo, prefixOf, todayYmd, totalsFor, type Tx } from "@/lib/docs";
import { UNPAID_STATUSES, confirmOrderPaidTx, type ConfirmResult } from "@/lib/order-confirm";
import { whtError } from "@/lib/wht";

/** ข้อผิดพลาดที่แสดงให้ผู้ใช้เห็นได้ (ข้อความภาษาไทย) */
export class DocUserError extends Error {}

/** ออกเลขที่ + เปลี่ยนสถานะ (เรียกภายใน transaction) */
export async function issueDocTx(tx: Tx, id: string, adminId: string | null, s: ShopSetting) {
  const d = await tx.salesDocument.findUniqueOrThrow({ where: { id }, include: { source: true, _count: { select: { items: true } } } });
  if (d.status !== "DRAFT") throw new DocUserError("เอกสารนี้ออกเลขที่แล้ว");
  if (!d._count.items || !d.customerId) throw new DocUserError("ต้องมีลูกค้าและรายการก่อนออกเอกสาร");
  const ymd = ymdBkk(d.issueDate ?? new Date());
  if (d.type === "CREDIT_NOTE") {
    // ใบลดหนี้: ต้องอ้างใบเสร็จที่ยังไม่ยกเลิก · มีเหตุผล · รวมทุกใบลดหนี้ของใบเสร็จนั้นต้องไม่เกินยอดใบเสร็จ
    const src = d.source;
    if (!src || src.type !== "RECEIPT" || src.status !== "ISSUED") throw new DocUserError("ใบลดหนี้ต้องอ้างอิงใบเสร็จรับเงินที่ยังไม่ยกเลิก");
    if (!d.creditReason?.trim()) throw new DocUserError("กรุณาระบุเหตุผลการลดหนี้");
    await tx.$queryRaw`SELECT "id" FROM "SalesDocument" WHERE "id" = ${src.id} FOR UPDATE`;
    const prev = await tx.salesDocument.aggregate({ where: { sourceId: src.id, type: "CREDIT_NOTE", status: "ISSUED", NOT: { id } }, _sum: { grandSatang: true } });
    const left = src.grandSatang - (prev._sum.grandSatang ?? 0);
    if (d.grandSatang > left) throw new DocUserError(`ยอดลดหนี้เกินยอดที่ลดได้ของใบเสร็จ ${src.docNo} (ลดได้อีก ฿${money(Math.max(0, left))})`);
    if (ymd < ymdBkk(src.issueDate ?? new Date(0))) throw new DocUserError("วันที่ใบลดหนี้ต้องไม่ก่อนวันที่ใบเสร็จ");
  }
  const no = await allocDocNo(tx, d.type, ymd, prefixOf(s, d.type));
  const r = await tx.salesDocument.updateMany({ where: { id, status: "DRAFT" }, data: { docNo: no, status: "ISSUED", issueDate: fromYmd(ymd) } });
  if (r.count !== 1) throw new DocUserError("เอกสารนี้ถูกออกเลขที่ไปแล้ว");
  await tx.salesDocumentEvent.create({ data: { documentId: id, type: "ISSUED", adminId, note: `ออกเลขที่ ${no}` } });
  // ใบเสร็จ: บันทึกต้นทุนต่อหน่วย ณ วันที่ออก (รายงานกำไรของใบเสร็จที่ไม่ผูกคำสั่งซื้อ ไม่เปลี่ยนตามต้นทุนใหม่)
  if (d.type === "RECEIPT" || d.type === "CREDIT_NOTE")
    await tx.$executeRaw`
      UPDATE "SalesDocumentItem" AS i SET "costSatang" = p."costSatang"
      FROM "Product" AS p
      WHERE i."documentId" = ${id} AND i."productId" = p."id" AND i."costSatang" IS NULL AND p."costSatang" IS NOT NULL`;
  // ใบแจ้งหนี้จากใบเสนอราคาที่รับมัดจำไว้ → หักเงินมัดจำเป็นการรับชำระ (ใช้ใบเสร็จมัดจำเดิม ไม่ออกใบเสร็จใหม่)
  if (d.type === "INVOICE" && d.source?.type === "QUOTATION") await applyDepositsTx(tx, id, d.source.id, adminId);
  // ฉบับแก้ไขของใบเสนอราคา → ยกเลิกฉบับเดิม (เลขเดิมยังเก็บไว้)
  if (d.type === "QUOTATION" && d.source?.type === "QUOTATION" && ["ISSUED", "REJECTED"].includes(d.source.status)) {
    await tx.salesDocument.update({ where: { id: d.source.id }, data: { status: "VOID", voidReason: `มีฉบับแก้ไข ${no}` } });
    await tx.salesDocumentEvent.create({ data: { documentId: d.source.id, type: "VOIDED", adminId, note: `มีฉบับแก้ไข ${no}` } });
  }
  return no;
}

/**
 * รับชำระใบแจ้งหนี้ 1 งวด → สร้างใบเสร็จ (ออกเลขที่ทันที) + DocPayment + ปรับยอดชำระ/สถานะใบแจ้งหนี้
 * ชำระเต็มจำนวนครั้งเดียว = คัดลอกรายการ · ชำระบางส่วน = 1 บรรทัด "รับชำระตามใบแจ้งหนี้ … (งวดที่ n)"
 */
export async function recordInvoicePaymentTx(
  tx: Tx,
  input: {
    invoiceId: string; paidYmd: string; amountSatang: number; method: string; reference: string | null; adminId: string | null;
    /** ภาษีหัก ณ ที่จ่าย (ไม่ใส่ = ไม่มี) — amountSatang ยังเป็นยอดตัดหนี้เต็ม */
    wht?: { rateBp: number; satang: number; certNo: string | null } | null;
  },
  s: ShopSetting,
) {
  const { invoiceId: id, paidYmd, amountSatang: amount, method, reference, adminId } = input;
  const wht = input.wht && (input.wht.satang || input.wht.rateBp) ? input.wht : null;
  const whtErr = wht ? whtError(amount, wht.rateBp, wht.satang) : null;
  if (whtErr) throw new DocUserError(whtErr);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidYmd) || paidYmd > todayYmd()) throw new DocUserError("วันที่รับชำระไม่ถูกต้อง (ห้ามเป็นวันในอนาคต)");
  if (!Number.isInteger(amount) || amount <= 0) throw new DocUserError("กรุณาใส่ยอดเงินที่รับชำระ");
  await tx.$executeRaw`SELECT 1 FROM "SalesDocument" WHERE "id" = ${id} FOR UPDATE`;
  const iv = await tx.salesDocument.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } }, payments: { where: { voided: false } } } });
  if (!iv || iv.type !== "INVOICE") throw new DocUserError("ไม่พบใบแจ้งหนี้");
  if (!["ISSUED", "PARTIAL"].includes(iv.status)) throw new DocUserError(iv.status === "PAID" ? "ใบแจ้งหนี้นี้ชำระครบแล้ว" : "ใบแจ้งหนี้นี้ยังไม่ได้ออก หรือถูกยกเลิก");
  const outstanding = iv.grandSatang - iv.paidSatang;
  if (amount > outstanding) throw new DocUserError(`ยอดรับชำระเกินยอดค้าง (คงค้าง ${money(outstanding)} บาท)`);
  if (paidYmd < ymdBkk(iv.issueDate ?? iv.createdAt)) throw new DocUserError("วันที่รับชำระต้องไม่ก่อนวันที่ออกใบแจ้งหนี้");
  // ใบแจ้งหนี้จากคำสั่งซื้อ: คำสั่งซื้อที่ถูกยกเลิกแล้วห้ามรับชำระ (ยกเลิกใบแจ้งหนี้ หรือสร้างคำสั่งซื้อใหม่)
  const order = iv.orderId ? await tx.order.findUnique({ where: { id: iv.orderId }, select: { id: true, orderNo: true, status: true } }) : null;
  if (order?.status === "CANCELLED") throw new DocUserError(`คำสั่งซื้อ ${order.orderNo} ถูกยกเลิกแล้ว — รับชำระใบแจ้งหนี้นี้ไม่ได้`);
  const seq = iv.payments.length + 1;
  const full = !iv.payments.length && amount === iv.grandSatang;
  const items = full
    ? iv.items.map(({ productId, sku, name, detail, unit, qtyMilli, priceSatang, discountSatang, sortOrder, image }) => ({ productId, sku, name, detail, unit, qtyMilli, priceSatang, discountSatang, sortOrder, image }))
    : [{ sortOrder: 1, productId: null, sku: null, name: `รับชำระตามใบแจ้งหนี้ ${iv.docNo} (งวดที่ ${seq})`, detail: `ยอดตามใบแจ้งหนี้ ${money(iv.grandSatang)} บาท`, unit: "งวด", qtyMilli: 1000, priceSatang: amount, discountSatang: 0 }];
  const vatMode: VatMode = full ? iv.vatMode : iv.vatMode === "NONE" ? "NONE" : "INCLUSIVE";
  const discount = full ? iv.discountSatang : 0;
  const totals = totalsFor(items, discount, vatMode, iv.vatRateBp || s.vatRateBp);
  if (totals.grandSatang !== amount) throw new DocUserError("คำนวณยอดใบเสร็จไม่ตรงกับยอดรับชำระ");
  const rc = await tx.salesDocument.create({
    data: {
      type: "RECEIPT", status: "DRAFT", customerId: iv.customerId, customerSnapshot: iv.customerSnapshot ?? {}, issueDate: fromYmd(paidYmd),
      ...totals, vatMode, vatRateBp: vatMode === "NONE" ? 0 : iv.vatRateBp || s.vatRateBp, paymentMethod: method, carrier: iv.carrier,
      paymentTerms: s.termsReceipt, sourceId: iv.id, orderId: iv.orderId, items: { create: items },
    },
  });
  const rcNo = await issueDocTx(tx, rc.id, adminId, s);
  const payment = await tx.docPayment.create({
    data: {
      invoiceId: iv.id, receiptId: rc.id, paidAt: fromYmd(paidYmd), amountSatang: amount, method, reference: reference || null,
      ...(wht ? { whtRateBp: wht.rateBp, whtSatang: wht.satang, whtCertNo: wht.certNo?.trim().slice(0, 60) || null } : {}),
    },
  });
  const paid = iv.paidSatang + amount;
  await tx.salesDocument.update({ where: { id: iv.id }, data: { paidSatang: paid, status: paid >= iv.grandSatang ? "PAID" : "PARTIAL" } });
  await tx.salesDocumentEvent.create({
    data: { documentId: iv.id, type: "PAYMENT", adminId, note: `รับชำระ ${money(amount)} บาท (${method}${reference ? ` · ${reference}` : ""}${wht ? ` · หัก ณ ที่จ่าย ${wht.rateBp / 100}% ${money(wht.satang)} บาท` : ""}) → ${rcNo}`.slice(0, 500) },
  });
  // ชำระครบ + ผูกคำสั่งซื้อที่ยังไม่ได้รับเงิน → คำสั่งซื้อเป็น "ชำระแล้ว" (ตัดสต็อก/นับยอดขาย/ไม่ถูกยกเลิกอัตโนมัติ) ใน transaction เดียวกัน
  // ยอดขายนับจากคำสั่งซื้อ — ใบเสร็จที่ผูกคำสั่งซื้อไม่นับซ้ำในรายงาน (src/lib/sales-report.ts)
  let orderPaid: ConfirmResult | null = null;
  if (paid >= iv.grandSatang && order && UNPAID_STATUSES.includes(order.status))
    orderPaid = await confirmOrderPaidTx(tx, { orderId: order.id, from: UNPAID_STATUSES, adminId, note: `ชำระครบตามใบแจ้งหนี้ ${iv.docNo} (ใบเสร็จ ${rcNo})` });
  return { rcId: rc.id, rcNo, ivNo: iv.docNo!, paymentId: payment.id, fullyPaid: paid >= iv.grandSatang, orderPaid };
}

/** ใบเสร็จมัดจำของใบเสนอราคาที่ยังไม่ถูกหักในใบแจ้งหนี้ใด */
export const openDepositsWhere = (quoteId: string) => ({ sourceId: quoteId, type: "RECEIPT" as const, isDeposit: true, status: "ISSUED" as const, receiptFor: null });

/**
 * หักเงินมัดจำในใบแจ้งหนี้ (เรียกตอนออกเลขที่ใบแจ้งหนี้ ภายใน transaction เดียวกัน)
 * มัดจำแต่ละใบ = DocPayment 1 รายการที่ผูกใบเสร็จมัดจำเดิม · ยอดมัดจำรวมต้องไม่เกินยอดใบแจ้งหนี้
 */
export async function applyDepositsTx(tx: Tx, invoiceId: string, quoteId: string, adminId: string | null) {
  await tx.$executeRaw`SELECT 1 FROM "SalesDocument" WHERE "id" = ${quoteId} FOR UPDATE`;
  const deps = await tx.salesDocument.findMany({ where: openDepositsWhere(quoteId), orderBy: { issueDate: "asc" } });
  if (!deps.length) return 0;
  const iv = await tx.salesDocument.findUniqueOrThrow({ where: { id: invoiceId } });
  const total = deps.reduce((n, r) => n + r.grandSatang, 0);
  if (total > iv.grandSatang)
    throw new DocUserError(`เงินมัดจำรวม ${money(total)} บาท มากกว่ายอดใบแจ้งหนี้ ${money(iv.grandSatang)} บาท — ปรับรายการในใบแจ้งหนี้ หรือยกเลิกใบเสร็จมัดจำที่เกินก่อน`);
  for (const r of deps)
    await tx.docPayment.create({
      data: { invoiceId, receiptId: r.id, paidAt: r.issueDate ?? new Date(), amountSatang: r.grandSatang, method: r.paymentMethod || "เงินมัดจำ", reference: `มัดจำ ${r.docNo}` },
    });
  const paid = iv.paidSatang + total;
  await tx.salesDocument.update({ where: { id: invoiceId }, data: { paidSatang: paid, status: paid >= iv.grandSatang ? "PAID" : "PARTIAL" } });
  await tx.salesDocumentEvent.create({ data: { documentId: invoiceId, type: "PAYMENT", adminId, note: `หักเงินมัดจำ ${money(total)} บาท (${deps.map((r) => r.docNo).join(", ")})`.slice(0, 500) } });
  return total;
}

/**
 * รับเงินมัดจำจากใบเสนอราคา → ออกใบเสร็จรับเงินมัดจำทันที (1 บรรทัด "เงินมัดจำตามใบเสนอราคา …")
 * VAT: ใบเสนอราคาคิด VAT → ใบเสร็จมัดจำเป็น VAT รวมใน (ใบกำกับภาษีของเงินมัดจำ) · มัดจำรวมต้องไม่เกินยอดใบเสนอราคา
 */
export async function recordDepositTx(
  tx: Tx,
  input: { quoteId: string; paidYmd: string; amountSatang: number; method: string; reference: string | null; adminId: string | null },
  s: ShopSetting,
) {
  const { quoteId, paidYmd, amountSatang: amount, method, reference, adminId } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidYmd) || paidYmd > todayYmd()) throw new DocUserError("วันที่รับเงินไม่ถูกต้อง (ห้ามเป็นวันในอนาคต)");
  if (!Number.isInteger(amount) || amount <= 0) throw new DocUserError("กรุณาใส่ยอดเงินมัดจำ");
  await tx.$executeRaw`SELECT 1 FROM "SalesDocument" WHERE "id" = ${quoteId} FOR UPDATE`;
  const qt = await tx.salesDocument.findUnique({ where: { id: quoteId }, include: { derived: { where: { type: "INVOICE", status: { not: "VOID" } }, select: { docNo: true } } } });
  if (!qt || qt.type !== "QUOTATION") throw new DocUserError("ไม่พบใบเสนอราคา");
  if (!["ISSUED", "ACCEPTED"].includes(qt.status)) throw new DocUserError("รับมัดจำได้เฉพาะใบเสนอราคาที่ออกแล้วและยังไม่ยกเลิก");
  if (qt.derived.length) throw new DocUserError(`ใบเสนอราคานี้มีใบแจ้งหนี้ ${qt.derived[0].docNo ?? "(ฉบับร่าง)"} แล้ว — บันทึกรับชำระที่ใบแจ้งหนี้แทน`);
  if (paidYmd < ymdBkk(qt.issueDate ?? qt.createdAt)) throw new DocUserError("วันที่รับเงินต้องไม่ก่อนวันที่ใบเสนอราคา");
  const prev = await tx.salesDocument.aggregate({ where: { sourceId: quoteId, type: "RECEIPT", isDeposit: true, status: "ISSUED" }, _sum: { grandSatang: true }, _count: { _all: true } });
  const left = qt.grandSatang - (prev._sum.grandSatang ?? 0);
  if (amount > left) throw new DocUserError(`ยอดมัดจำเกินยอดใบเสนอราคา (รับเพิ่มได้อีก ${money(Math.max(0, left))} บาท)`);
  const seq = prev._count._all + 1;
  const pct = Math.round((amount / qt.grandSatang) * 1000) / 10;
  const items = [{ sortOrder: 1, productId: null, sku: null, name: `เงินมัดจำตามใบเสนอราคา ${qt.docNo}${seq > 1 ? ` (ครั้งที่ ${seq})` : ""}`, detail: `${pct}% ของยอด ${money(qt.grandSatang)} บาท · ส่วนที่เหลือชำระตามใบแจ้งหนี้`, unit: "งวด", qtyMilli: 1000, priceSatang: amount, discountSatang: 0 }];
  const vatMode: VatMode = qt.vatMode === "NONE" ? "NONE" : "INCLUSIVE";
  const totals = totalsFor(items, 0, vatMode, qt.vatRateBp || s.vatRateBp);
  const rc = await tx.salesDocument.create({
    data: {
      type: "RECEIPT", status: "DRAFT", isDeposit: true, customerId: qt.customerId, customerSnapshot: qt.customerSnapshot ?? {}, issueDate: fromYmd(paidYmd),
      ...totals, vatMode, vatRateBp: vatMode === "NONE" ? 0 : qt.vatRateBp || s.vatRateBp, paymentMethod: method, paymentTerms: s.termsReceipt,
      note: reference ? `อ้างอิงการชำระ ${reference}` : null, sourceId: qt.id, items: { create: items },
    },
  });
  const rcNo = await issueDocTx(tx, rc.id, adminId, s);
  // ลูกค้าจ่ายมัดจำ = ตอบรับใบเสนอราคาแล้ว
  if (qt.status === "ISSUED") await tx.salesDocument.update({ where: { id: qt.id }, data: { status: "ACCEPTED" } });
  await tx.salesDocumentEvent.create({ data: { documentId: qt.id, type: "PAYMENT", adminId, note: `รับเงินมัดจำ ${money(amount)} บาท (${method}${reference ? ` · ${reference}` : ""}) → ${rcNo}`.slice(0, 500) } });
  return { rcId: rc.id, rcNo, qtNo: qt.docNo! };
}
