// เอกสารขาย (ฝั่ง server): เลขที่เอกสาร, สถานะ, แปลงข้อมูลเป็น DocView สำหรับแสดง/พิมพ์, ลูกค้า
import "server-only";
import QRCode from "qrcode";
import type { Customer, DocType, Prisma, SalesDocument, ShopSetting } from "../../generated/prisma/client";
import { addrText, calcTotals, docDateTime, fromYmd, promptPayPayload, ymdBkk, type DocTypeT } from "@/lib/doc-calc";
import { DOC_META, displayStatus, type CustSnap, type DocSt, type DocView, type LabelData, type Sender, type ShopHead } from "@/lib/doc-render";
import { formatPhone } from "@/lib/format";
import { mediaUrl } from "@/lib/media";
import { customerForOrder, nextCustomerCode as nextCode, type OrderForCustomer } from "@/lib/order-customer";
import { prisma } from "@/lib/prisma";
import { bankLabel, parseBankAccounts } from "@/lib/settings";

export type Tx = Prisma.TransactionClient;
export const DOC_TYPES = ["QUOTATION", "INVOICE", "RECEIPT"] as const satisfies DocTypeT[];
export const isDocType = (t: string): t is DocTypeT => (DOC_TYPES as readonly string[]).includes(t);
export const PAY_METHODS = ["โอนเงินผ่านธนาคาร", "QR PromptPay", "เงินสด", "เช็ค", "บัตรเครดิต"];
export const DEFAULT_LOGO = "/img/doc-logo.png";
export const UNITS = ["ชิ้น", "อัน", "ชุด", "กล่อง", "ตัว", "ดวง", "เส้น", "เมตร", "ม้วน", "แพ็ค", "งาน"];

export const todayYmd = () => ymdBkk(new Date());
export const ymdOf = (d: Date | null | undefined) => (d ? ymdBkk(d) : "");

/** ค่าเริ่มต้นเงื่อนไขในเอกสาร (เมื่อยังไม่ได้ตั้งในหน้าตั้งค่า) */
export function defaultTerms(s: ShopSetting, type: DocTypeT) {
  if (type === "QUOTATION") return s.termsQuote ?? `ยืนราคา ${s.quoteValidDays} วัน\nจัดส่งภายใน 2–3 วันทำการหลังชำระเงิน\nรับประกันสินค้า 1 ปี`;
  if (type === "INVOICE") return s.termsInvoice ?? "กรุณาชำระภายในวันที่ครบกำหนด\nโอนแล้วแจ้งสลิปทาง LINE พร้อมเลขที่เอกสาร";
  return s.termsReceipt ?? "";
}
export const prefixOf = (s: ShopSetting, t: DocTypeT) => (t === "QUOTATION" ? s.prefixQuote : t === "INVOICE" ? s.prefixInvoice : s.prefixReceipt);

/**
 * จองเลขที่เอกสาร PREFIX+YYMM-NNNNN ภายใน transaction เดียวกับการออกเอกสาร
 * ตัวนับ DocSequence เพิ่มแบบ atomic (UPDATE … next = next + 1) — ไม่นับจาก MAX, ไม่ใช้ซ้ำ, เอกสารยกเลิกยังถือเลขเดิม
 */
export async function allocDocNo(tx: Tx, type: DocType, issueYmd: string, prefix: string) {
  const period = issueYmd.slice(2, 4) + issueYmd.slice(5, 7);
  for (let guard = 0; guard < 50; guard++) {
    const rows = await tx.$queryRaw<{ n: number }[]>`
      INSERT INTO "DocSequence" ("type", "period", "next") VALUES (${type}::"DocType", ${period}, 2)
      ON CONFLICT ("type", "period") DO UPDATE SET "next" = "DocSequence"."next" + 1
      RETURNING "next" - 1 AS n`;
    const no = `${prefix}${period}-${String(Number(rows[0].n)).padStart(5, "0")}`;
    // กันกรณีเปลี่ยนคำนำหน้าแล้วชนกับเลขเก่า: ข้ามไปเลขถัดไป
    if (!(await tx.salesDocument.findUnique({ where: { docNo: no }, select: { id: true } }))) return no;
  }
  throw new Error("ไม่สามารถจองเลขที่เอกสารได้");
}

/** รหัสลูกค้า 4 หลักถัดไป ("0001") — ตัวจริงอยู่ที่ src/lib/order-customer.ts */
export const nextCustomerCode = (tx: Tx | typeof prisma = prisma) => nextCode(tx);

export function custSnapshot(c: Customer): CustSnap {
  const ship = c.shipTo && typeof c.shipTo === "object" && !Array.isArray(c.shipTo) ? (c.shipTo as CustSnap["shipTo"]) : null;
  return {
    code: c.code, kind: c.kind, name: c.name, taxId: c.taxId ?? "", branch: c.branch ?? "", contact: c.contactName ?? "",
    phone: c.phone ? formatPhone(c.phone) : "", email: c.email ?? "",
    address: { line: c.addressLine, sub: c.subdistrict, dist: c.district, prov: c.province, zip: c.postalCode },
    shipTo: ship?.name ? { ...ship, phone: ship.phone ? formatPhone(ship.phone) : "" } : null,
  };
}
export const asSnap = (v: unknown): CustSnap => (v && typeof v === "object" && !Array.isArray(v) ? (v as CustSnap) : {});

export function shopHead(s: ShopSetting): ShopHead {
  return {
    name: s.legalName, address: s.addressText, phone: s.phone, line: s.lineId ?? "", email: s.email ?? "", taxId: s.taxId ?? "", branch: s.branch ?? "",
    logo: (s.logoKey && mediaUrl(s.logoKey)) || DEFAULT_LOGO, era: s.dateEra, showSignature: s.showSignature,
    banks: parseBankAccounts(s.bankAccounts).map((b) => ({ name: bankLabel(b.bank), account: b.account, holder: b.holder })),
    promptpayName: s.promptpayName,
  };
}
export const senderOf = (s: ShopSetting): Sender => ({ name: s.legalName, phone: s.phone, address: s.addressText, logo: (s.logoKey && mediaUrl(s.logoKey)) || DEFAULT_LOGO });

export const DOC_INCLUDE = {
  items: { orderBy: { sortOrder: "asc" } },
  payments: { orderBy: { paidAt: "asc" }, include: { receipt: { select: { id: true, docNo: true, status: true } } } },
  receiptFor: { include: { invoice: { select: { id: true, docNo: true } } } },
  source: { select: { id: true, docNo: true, type: true, status: true } },
  derived: { select: { id: true, docNo: true, type: true, status: true, grandSatang: true }, orderBy: { createdAt: "asc" } },
  order: { select: { orderNo: true } },
  customer: { select: { id: true, code: true, name: true } },
} satisfies Prisma.SalesDocumentInclude;
export type FullDoc = Prisma.SalesDocumentGetPayload<{ include: typeof DOC_INCLUDE }>;

export const statusOf = (d: Pick<SalesDocument, "type" | "status" | "validUntil" | "dueDate" | "paidSatang" | "grandSatang">, today = todayYmd()): DocSt =>
  displayStatus({ type: d.type, status: d.status, validUntil: ymdOf(d.validUntil), dueDate: ymdOf(d.dueDate), paidSatang: d.paidSatang, grandSatang: d.grandSatang }, today);

export function refLine(d: FullDoc) {
  const out: string[] = [];
  if (d.source?.docNo) out.push(d.type === "QUOTATION" ? `แก้ไขจาก ${d.source.docNo}` : d.source.docNo);
  if (d.order) out.push(`คำสั่งซื้อ ${d.order.orderNo}`);
  return out.join(", ");
}

/** PromptPay QR พร้อมยอดค้างชำระ (เฉพาะใบแจ้งหนี้ที่ยังค้าง) */
async function invoiceQr(s: ShopSetting, outstanding: number) {
  const pp = String(s.promptpayId ?? "").replace(/\D/g, "");
  if (![10, 13, 15].includes(pp.length) || outstanding <= 0) return null;
  return QRCode.toDataURL(promptPayPayload(pp, outstanding), { errorCorrectionLevel: "M", margin: 1, width: 300 });
}

export async function toView(d: FullDoc, s: ShopSetting): Promise<DocView> {
  const pay = d.type === "RECEIPT" ? d.receiptFor : null;
  return {
    type: d.type, no: d.docNo, status: d.status, issueDate: ymdOf(d.issueDate) || todayYmd(), validUntil: ymdOf(d.validUntil), dueDate: ymdOf(d.dueDate),
    customer: asSnap(d.customerSnapshot),
    items: d.items.map((i) => ({ sku: i.sku ?? "", name: i.name, detail: i.detail ?? "", unit: i.unit, qtyMilli: i.qtyMilli, priceSatang: i.priceSatang, discountSatang: i.discountSatang })),
    discountSatang: d.discountSatang, vatMode: d.vatMode, vatRateBp: d.vatRateBp || s.vatRateBp,
    paymentMethod: d.paymentMethod ?? "", paymentTerms: d.paymentTerms ?? "", carrier: d.carrier ?? "", note: d.note ?? "", ref: refLine(d), voidReason: d.voidReason ?? "",
    paidSatang: d.paidSatang, payRef: pay?.reference ?? "",
    qr: d.type === "INVOICE" && d.status !== "VOID" && d.status !== "DRAFT" ? await invoiceQr(s, d.grandSatang - d.paidSatang) : null,
    printedAt: docDateTime(new Date(), s.dateEra), shop: shopHead(s),
  };
}

/** ใบปะหน้าจากเอกสาร (ส่งของที่ ถ้ามี ไม่งั้นที่อยู่ลูกค้า) — ไม่รวมค่าส่ง/ค่าบริการ */
export function docLabel(d: FullDoc, services: Set<string>): LabelData {
  const c = asSnap(d.customerSnapshot), st = c.shipTo, a = st?.address ?? c.address ?? {};
  return {
    ref: d.docNo ?? "", name: (st?.name || c.name) ?? "", phone: (st?.phone || c.phone) ?? "", addr: addrText(a, { noZip: true }), zip: a.zip ?? "", carrier: d.carrier ?? "",
    items: d.items.filter((i) => !/^shipping$/i.test(i.sku ?? "") && !services.has(i.sku ?? "")).map((i) => ({ name: i.name, qtyMilli: i.qtyMilli })),
  };
}

/** where ของแท็บสถานะ (สถานะที่คำนวณจากวันที่ → แปลงเป็นเงื่อนไข SQL) */
export function statusWhere(st: DocSt | "all", today = todayYmd()): Prisma.SalesDocumentWhereInput {
  const t0 = fromYmd(today);
  const notPast = (k: "validUntil" | "dueDate") => ({ OR: [{ [k]: null }, { [k]: { gte: t0 } }] });
  switch (st) {
    case "draft": return { status: "DRAFT" };
    case "void": return { status: "VOID" };
    case "accepted": return { status: "ACCEPTED" };
    case "rejected": return { status: "REJECTED" };
    case "paid": return { status: "PAID" };
    case "issued": return { status: "ISSUED" };
    case "open": return { status: "ISSUED", ...notPast("validUntil") };
    case "expired": return { status: "ISSUED", validUntil: { lt: t0 } };
    case "unpaid": return { status: "ISSUED", ...notPast("dueDate") };
    case "partial": return { status: "PARTIAL", ...notPast("dueDate") };
    case "overdue": return { status: { in: ["ISSUED", "PARTIAL"] }, dueDate: { lt: t0 } };
    default: return {};
  }
}

/** ลูกค้าของคำสั่งซื้อ (ผูกไว้แล้ว / จับคู่ด้วยเบอร์โทร-อีเมล / สร้างใหม่) — ดู src/lib/order-customer.ts */
export const customerFromOrder = (tx: Tx, o: OrderForCustomer) => customerForOrder(tx, o);

/** คำนวณยอดเอกสารใหม่จากรายการ (ไม่เชื่อยอดจากเบราว์เซอร์) */
export function totalsFor(items: { qtyMilli: number; priceSatang: number; discountSatang: number }[], discountSatang: number, vatMode: SalesDocument["vatMode"], vatRateBp: number) {
  const t = calcTotals(items, discountSatang, vatMode, vatRateBp);
  return { subtotalSatang: t.subtotal, discountSatang: t.discount, vatSatang: t.vat, grandSatang: t.grand };
}

export const docPath = (d: { type: DocTypeT; id: string }) => `/admin/docs/${DOC_META[d.type].path}/${d.id}`;
