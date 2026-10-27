// เอกสารขายออนไลน์ผ่านลิงก์ลับ (U25/U26/A20)
// - ลูกค้ายืนยันใบเสนอราคา (ชื่อผู้ยืนยัน + ติ๊กยอมรับ) → ACCEPTED + acceptedAt/By + event + แจ้ง LINE ร้าน (ร้านแปลงเป็นใบแจ้งหนี้เอง)
// - ลูกค้าแนบสลิปชำระใบแจ้งหนี้ (ตรวจชนิดไฟล์จากไบต์จริง, ≤ 5 MB, SHA-256 ที่ server, สลิปซ้ำติดธงไม่บล็อก) → DocSlip PENDING
// - แอดมินอนุมัติ = รับชำระ + ออกใบเสร็จอัตโนมัติใน transaction เดียว (src/lib/doc-payments.ts) · ปฏิเสธพร้อมเหตุผลที่ลูกค้าเห็น
import "server-only";
import { createHash } from "node:crypto";
import { money, ymdBkk } from "@/lib/doc-calc";
import { DocUserError, recordInvoicePaymentTx } from "@/lib/doc-payments";
import { asSnap, todayYmd, ymdOf } from "@/lib/docs";
import { siteUrl } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { getPublicDoc } from "@/lib/public-docs";
import { getSettings } from "@/lib/settings";
import { sniffImage, storage } from "@/lib/storage";

export const DOC_SLIP_MAX_BYTES = 5 * 1024 * 1024;
export const DOC_SLIP_MAX_PENDING = 5;
export const DOC_SLIP_METHOD = "โอนเงินผ่านธนาคาร (สลิปจากลิงก์ใบแจ้งหนี้)";

export class DocOnlineError extends Error {
  constructor(message: string, readonly status = 400, readonly fields: string[] = []) {
    super(message);
  }
}
const NOT_FOUND = "ไม่พบเอกสาร หรือลิงก์ไม่ถูกต้อง";

/** ลูกค้ายืนยันใบเสนอราคา (U25) */
export async function acceptQuoteOnline(input: { id: string; token: string; name: string; agree: boolean }) {
  const d = await getPublicDoc(input.id, input.token);
  if (!d || d.type !== "QUOTATION") throw new DocOnlineError(NOT_FOUND, 404);
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 120);
  if (name.length < 2) throw new DocOnlineError("กรุณากรอกชื่อผู้ยืนยัน", 400, ["name"]);
  if (!input.agree) throw new DocOnlineError("กรุณาติ๊กยอมรับราคาและเงื่อนไขในใบเสนอราคา", 400, ["agree"]);
  if (d.status === "ACCEPTED") throw new DocOnlineError("ใบเสนอราคานี้ยืนยันแล้ว", 409);
  if (d.status !== "ISSUED") throw new DocOnlineError("ใบเสนอราคานี้ไม่อยู่ในสถานะที่ยืนยันได้ กรุณาติดต่อร้าน", 409);
  if (d.validUntil && ymdOf(d.validUntil) < todayYmd()) throw new DocOnlineError("ใบเสนอราคานี้หมดอายุแล้ว กรุณาติดต่อร้านเพื่อขอใบเสนอราคาใหม่", 409);
  const ok = await prisma.$transaction(async (tx) => {
    const r = await tx.salesDocument.updateMany({ where: { id: d.id, type: "QUOTATION", status: "ISSUED" }, data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedBy: name } });
    if (r.count !== 1) return false;
    await tx.salesDocumentEvent.create({ data: { documentId: d.id, type: "CUSTOMER_ACCEPTED", note: `ลูกค้ายืนยันใบเสนอราคาออนไลน์ — ผู้ยืนยัน: ${name}` } });
    return true;
  });
  if (!ok) throw new DocOnlineError("ใบเสนอราคานี้ถูกเปลี่ยนสถานะแล้ว กรุณาโหลดหน้าใหม่", 409);
  return { id: d.id, docNo: d.docNo!, name, customer: asSnap(d.customerSnapshot).name ?? "", grandSatang: d.grandSatang };
}

export const quoteAcceptedMessage = (r: { id: string; docNo: string; name: string; customer: string; grandSatang: number }) =>
  [
    "✅ ลูกค้ายืนยันใบเสนอราคาออนไลน์",
    `${r.docNo} · ${r.customer}`,
    `ผู้ยืนยัน: ${r.name}`,
    `ยอด ฿${money(r.grandSatang)}`,
    "",
    `แปลงเป็นใบแจ้งหนี้: ${siteUrl()}/admin/docs/QUOTATION/${r.id}`,
  ].join("\n");

/** ลูกค้าแนบสลิปชำระใบแจ้งหนี้ (U26) */
export async function attachDocSlip(input: { id: string; token: string; file: File | null; paidAt: string; amount: string }) {
  const d = await getPublicDoc(input.id, input.token);
  if (!d || d.type !== "INVOICE") throw new DocOnlineError(NOT_FOUND, 404);
  if (!["ISSUED", "PARTIAL"].includes(d.status)) throw new DocOnlineError(d.status === "PAID" ? "ใบแจ้งหนี้นี้ชำระครบแล้ว" : "ใบแจ้งหนี้นี้ไม่อยู่ในสถานะที่ชำระได้ กรุณาติดต่อร้าน", 409);
  const outstanding = d.grandSatang - d.paidSatang;
  const pending = d.slips.filter((s) => s.status === "PENDING");
  if (pending.length >= DOC_SLIP_MAX_PENDING) throw new DocOnlineError("มีสลิปรอร้านตรวจหลายรายการแล้ว กรุณารอร้านตรวจก่อน หรือติดต่อร้านทาง LINE", 409, ["slip"]);

  const f = input.file;
  if (!f || f.size === 0) throw new DocOnlineError("กรุณาแนบสลิปการโอน", 400, ["slip"]);
  if (f.size > DOC_SLIP_MAX_BYTES) throw new DocOnlineError("ไฟล์ใหญ่เกิน 5 MB กรุณาเลือกไฟล์ใหม่", 400, ["slip"]);
  const buf = Buffer.from(await f.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) throw new DocOnlineError("รองรับเฉพาะไฟล์ภาพ JPG, PNG หรือ WEBP", 400, ["slip"]);
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(input.paidAt);
  const transferredAt = m ? new Date(`${m[1]}T${m[2]}:00+07:00`) : null;
  if (!transferredAt || isNaN(transferredAt.getTime()) || transferredAt.getTime() > Date.now() + 10 * 60e3)
    throw new DocOnlineError("กรุณาระบุวันและเวลาที่โอนให้ถูกต้อง", 400, ["paidAt"]);
  const amountBaht = Number(String(input.amount).replace(/[,\s฿]/g, ""));
  const amountSatang = Math.round(amountBaht * 100);
  if (!(amountSatang > 0)) throw new DocOnlineError("กรุณากรอกยอดที่โอน", 400, ["amount"]);
  if (amountSatang > outstanding) throw new DocOnlineError(`ยอดที่โอนมากกว่ายอดค้างชำระ (คงค้าง ${money(outstanding)} บาท)`, 400, ["amount"]);

  const sha256 = createHash("sha256").update(buf).digest("hex");
  // ส่งซ้ำไฟล์เดิมกับใบแจ้งหนี้เดิมที่ยังรอตรวจ (ลองใหม่หลังเน็ตหลุด) = สำเร็จแล้ว ไม่สร้างสลิปซ้ำ
  const same = await prisma.docSlip.findFirst({ where: { documentId: d.id, sha256, status: "PENDING" }, select: { id: true, amountSatang: true } });
  if (same) return { slipId: same.id, docNo: d.docNo!, amountSatang: same.amountSatang, outstanding, customer: asSnap(d.customerSnapshot).name ?? "", invoiceId: d.id, repeated: true };
  const now = new Date();
  const key = `slips/docs/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${(d.docNo ?? d.id).toLowerCase()}-${sha256.slice(0, 16)}-${Date.now()}.${kind.ext}`;
  await storage().put(key, buf);
  const slip = await prisma.$transaction(async (tx) => {
    const s = await tx.docSlip.create({ data: { documentId: d.id, storageKey: key, mimeType: kind.mime, sizeBytes: buf.length, sha256, amountSatang, transferredAt } });
    await tx.salesDocumentEvent.create({ data: { documentId: d.id, type: "SLIP_UPLOADED", note: `ลูกค้าแนบสลิปผ่านลิงก์ ยอด ${money(amountSatang)} บาท — รอตรวจ` } });
    return s;
  });
  return { slipId: slip.id, docNo: d.docNo!, amountSatang, outstanding, customer: asSnap(d.customerSnapshot).name ?? "", invoiceId: d.id };
}

/** สลิปนี้ซ้ำกับสลิปอื่น (ทั้งสลิปคำสั่งซื้อและสลิปใบแจ้งหนี้) — ติดธงให้แอดมินตัดสิน */
export async function docSlipDuplicates(slipId: string, sha256: string) {
  const [docs, orders] = await Promise.all([
    prisma.docSlip.findMany({ where: { sha256, id: { not: slipId } }, select: { document: { select: { docNo: true } } }, take: 5 }),
    prisma.paymentSlip.findMany({ where: { sha256 }, select: { order: { select: { orderNo: true } } }, take: 5 }),
  ]);
  return [...docs.map((x) => x.document.docNo ?? "ใบแจ้งหนี้ฉบับร่าง"), ...orders.map((x) => x.order.orderNo)];
}

export async function docSlipMessage(r: { slipId: string; docNo: string; amountSatang: number; outstanding: number; customer: string; invoiceId: string }) {
  const s = await prisma.docSlip.findUnique({ where: { id: r.slipId }, select: { sha256: true } });
  const dups = s ? await docSlipDuplicates(r.slipId, s.sha256) : [];
  return [
    "🧾 สลิปชำระใบแจ้งหนี้ (จากลิงก์) รอตรวจ",
    `${r.docNo} · ${r.customer}`,
    `ยอดในสลิป ฿${money(r.amountSatang)} · ค้างชำระ ฿${money(r.outstanding)}`,
    dups.length ? `⚠️ สลิปนี้เคยใช้กับ ${dups.join(", ")}` : "",
    "",
    `เปิดตรวจ: ${siteUrl()}/admin/docs/INVOICE/${r.invoiceId}#docSlips`,
  ].filter((l, i, a) => l || a[i - 1] !== "").join("\n");
}

/** แอดมินอนุมัติสลิป → รับชำระ + ออกใบเสร็จ (A20) — คืนเลขที่ใบเสร็จ */
export async function approveDocSlip(slipId: string, adminId: string) {
  const s = await getSettings();
  return prisma.$transaction(async (tx) => {
    const slip = await tx.docSlip.findUnique({ where: { id: slipId } });
    if (!slip) throw new DocUserError("ไม่พบสลิป");
    const claim = await tx.docSlip.updateMany({ where: { id: slipId, status: "PENDING" }, data: { status: "ACCEPTED", rejectReason: null } });
    if (claim.count !== 1) throw new DocUserError("สลิปนี้ตรวจไปแล้ว");
    // วันที่รับชำระ = วันที่โอนตามสลิป (ไม่ก่อนวันออกใบแจ้งหนี้ และไม่เกินวันนี้)
    const iv = await tx.salesDocument.findUnique({ where: { id: slip.documentId }, select: { issueDate: true, createdAt: true } });
    const issueYmd = ymdBkk(iv?.issueDate ?? iv?.createdAt ?? new Date());
    let paidYmd = ymdBkk(slip.transferredAt);
    if (paidYmd < issueYmd) paidYmd = issueYmd;
    if (paidYmd > todayYmd()) paidYmd = todayYmd();
    const r = await recordInvoicePaymentTx(
      tx,
      { invoiceId: slip.documentId, paidYmd, amountSatang: slip.amountSatang, method: DOC_SLIP_METHOD, reference: `สลิปลูกค้า ${ymdBkk(slip.transferredAt)} ${slip.transferredAt.toISOString().slice(11, 16)} UTC`, adminId },
      s,
    );
    await tx.docSlip.update({ where: { id: slipId }, data: { paymentId: r.paymentId } });
    return r;
  });
}

export async function rejectDocSlip(slipId: string, adminId: string, reason: string) {
  const slip = await prisma.docSlip.findUnique({ where: { id: slipId }, select: { documentId: true, amountSatang: true } });
  if (!slip) return null;
  const r = await prisma.docSlip.updateMany({ where: { id: slipId, status: "PENDING" }, data: { status: "REJECTED", rejectReason: reason } });
  if (r.count !== 1) return null;
  await prisma.salesDocumentEvent.create({ data: { documentId: slip.documentId, type: "NOTE", adminId, note: `ปฏิเสธสลิปยอด ${money(slip.amountSatang)} บาท — ${reason}`.slice(0, 500) } });
  return slip;
}

export const DOC_SLIP_REJECT_REASONS = ["ไม่พบยอดเงินเข้าบัญชี", "ยอดเงินในสลิปไม่ตรงกับที่แจ้ง", "สลิปซ้ำ / เคยใช้แล้ว", "ภาพสลิปไม่ชัด อ่านไม่ได้", "อื่นๆ"];
