// การเงินประจำวัน (ล็อต 14): ลูกหนี้ค้างชำระแยกอายุหนี้ + เงินรับเข้ารายวันจากทุกแหล่ง (ใช้ "ปิดยอด")
// เงินเป็นสตางค์ · วันที่ตามเวลาไทย ("YYYY-MM-DD")
import "server-only";
import { fromYmd, ymdBkk } from "@/lib/doc-calc";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// ลูกหนี้ค้างชำระ (ใบแจ้งหนี้ที่ออกแล้ว ยังชำระไม่ครบ)
// ---------------------------------------------------------------------------

export const AGE_BUCKETS = [
  { key: "current", label: "ยังไม่ถึงกำหนด" },
  { key: "d30", label: "เกิน 1–30 วัน" },
  { key: "d60", label: "เกิน 31–60 วัน" },
  { key: "d90", label: "เกิน 61–90 วัน" },
  { key: "d90p", label: "เกิน 90 วัน" },
] as const;
export type AgeKey = (typeof AGE_BUCKETS)[number]["key"];

/** จำนวนวันที่เลยกำหนด (0 = ยังไม่ถึง/ถึงวันนี้) → ช่วงอายุหนี้ */
export function ageOf(dueYmd: string, today: string): { days: number; bucket: AgeKey } {
  const days = dueYmd ? Math.max(0, Math.round((fromYmd(today).getTime() - fromYmd(dueYmd).getTime()) / 864e5)) : 0;
  return { days, bucket: days <= 0 ? "current" : days <= 30 ? "d30" : days <= 60 ? "d60" : days <= 90 ? "d90" : "d90p" };
}

export type ArInvoice = { id: string; docNo: string; issueYmd: string; dueYmd: string; grand: number; paid: number; outstanding: number; days: number; bucket: AgeKey };
export type ArCustomer = { id: string | null; code: string; name: string; phone: string; invoices: ArInvoice[]; total: number; buckets: Record<AgeKey, number>; oldestDays: number };

const zero = (): Record<AgeKey, number> => ({ current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 });

export async function receivables(today = ymdBkk(new Date())) {
  const docs = await prisma.salesDocument.findMany({
    where: { type: "INVOICE", status: { in: ["ISSUED", "PARTIAL"] } },
    orderBy: [{ dueDate: "asc" }, { issueDate: "asc" }],
    select: { id: true, docNo: true, issueDate: true, dueDate: true, grandSatang: true, paidSatang: true, customerSnapshot: true, customer: { select: { id: true, code: true, name: true, phone: true } } },
  });
  const byCust = new Map<string, ArCustomer>();
  const totals = zero();
  for (const d of docs) {
    const outstanding = d.grandSatang - d.paidSatang;
    if (outstanding <= 0) continue;
    const dueYmd = d.dueDate ? ymdBkk(d.dueDate) : d.issueDate ? ymdBkk(d.issueDate) : today;
    const { days, bucket } = ageOf(dueYmd, today);
    const snap = (d.customerSnapshot ?? {}) as { name?: string; code?: string; phone?: string };
    const key = d.customer?.id ?? `snap:${snap.name ?? "?"}`;
    let c = byCust.get(key);
    if (!c) {
      c = { id: d.customer?.id ?? null, code: d.customer?.code ?? snap.code ?? "", name: d.customer?.name ?? snap.name ?? "—", phone: d.customer?.phone ?? snap.phone ?? "", invoices: [], total: 0, buckets: zero(), oldestDays: 0 };
      byCust.set(key, c);
    }
    c.invoices.push({ id: d.id, docNo: d.docNo ?? "", issueYmd: d.issueDate ? ymdBkk(d.issueDate) : "", dueYmd, grand: d.grandSatang, paid: d.paidSatang, outstanding, days, bucket });
    c.total += outstanding;
    c.buckets[bucket] += outstanding;
    c.oldestDays = Math.max(c.oldestDays, days);
    totals[bucket] += outstanding;
  }
  // ค้างนานสุดขึ้นก่อน แล้วยอดมากก่อน
  const customers = [...byCust.values()].sort((a, b) => b.oldestDays - a.oldestDays || b.total - a.total);
  return { customers, totals, total: Object.values(totals).reduce((s, n) => s + n, 0), invoiceCount: customers.reduce((s, c) => s + c.invoices.length, 0) };
}

// ---------------------------------------------------------------------------
// เงินรับเข้ารายวัน (ปิดยอด)
// ---------------------------------------------------------------------------

export type DailySource = "ORDER" | "COD" | "INVOICE" | "RECEIPT";
export const SOURCE_LABEL: Record<DailySource, string> = {
  ORDER: "คำสั่งซื้อเว็บ (โอน/พร้อมเพย์)",
  COD: "COD — ขนส่งโอนคืนร้าน",
  INVOICE: "รับชำระใบแจ้งหนี้",
  RECEIPT: "ใบเสร็จที่ออกตรง (ไม่ผ่านใบแจ้งหนี้)",
};
export type DailyEntry = { source: DailySource; ref: string; href: string; who: string; method: string; amount: number; at: Date; note?: string };

/** เงินที่ได้รับในวันนั้น (ตามเวลาไทย) จากทุกแหล่ง — ไม่นับรายการที่ยกเลิกแล้ว */
export async function dailyReceipts(ymd: string) {
  const from = fromYmd(ymd), to = new Date(from.getTime() + 864e5);
  const range = { gte: from, lt: to };
  const [orders, cod, pays, rcs] = await Promise.all([
    prisma.order.findMany({
      where: { paymentMethod: "TRANSFER", paidAt: range, status: { in: ["PAID", "SHIPPED"] } },
      orderBy: { paidAt: "asc" },
      select: { orderNo: true, customerName: true, totalSatang: true, paidAt: true },
    }),
    prisma.order.findMany({
      where: { paymentMethod: "COD", codSettledAt: range, status: { not: "CANCELLED" } },
      orderBy: { codSettledAt: "asc" },
      select: { orderNo: true, customerName: true, totalSatang: true, codSettledAt: true, carrier: true },
    }),
    prisma.docPayment.findMany({
      where: { paidAt: range, voided: false },
      orderBy: { paidAt: "asc" },
      select: { amountSatang: true, method: true, reference: true, paidAt: true, invoice: { select: { id: true, docNo: true, customerSnapshot: true } }, receipt: { select: { docNo: true } } },
    }),
    // ใบเสร็จที่ไม่ได้มาจากการรับชำระใบแจ้งหนี้และไม่ผูกคำสั่งซื้อ (เช่น แปลงจากใบเสนอราคา / สร้างเอง)
    prisma.salesDocument.findMany({
      where: { type: "RECEIPT", status: "ISSUED", issueDate: range, orderId: null, receiptFor: null },
      orderBy: { issueDate: "asc" },
      select: { id: true, docNo: true, grandSatang: true, paymentMethod: true, issueDate: true, customerSnapshot: true, note: true },
    }),
  ]);
  const nameOf = (s: unknown) => ((s ?? {}) as { name?: string }).name ?? "—";
  const entries: DailyEntry[] = [
    ...orders.map((o) => ({ source: "ORDER" as const, ref: o.orderNo, href: `/admin?tab=ALL&open=${o.orderNo}`, who: o.customerName, method: "โอน/พร้อมเพย์ (สลิป)", amount: o.totalSatang, at: o.paidAt! })),
    ...cod.map((o) => ({ source: "COD" as const, ref: o.orderNo, href: `/admin?tab=ALL&open=${o.orderNo}`, who: o.customerName, method: `COD${o.carrier ? ` · ${o.carrier}` : ""}`, amount: o.totalSatang, at: o.codSettledAt! })),
    ...pays.map((p) => ({
      source: "INVOICE" as const, ref: p.invoice.docNo ?? "", href: `/admin/docs/INVOICE/${p.invoice.id}`, who: nameOf(p.invoice.customerSnapshot), method: p.method, amount: p.amountSatang, at: p.paidAt,
      note: [p.receipt?.docNo && `ใบเสร็จ ${p.receipt.docNo}`, p.reference].filter(Boolean).join(" · ") || undefined,
    })),
    ...rcs.map((r) => ({ source: "RECEIPT" as const, ref: r.docNo ?? "", href: `/admin/docs/RECEIPT/${r.id}`, who: nameOf(r.customerSnapshot), method: r.paymentMethod ?? "—", amount: r.grandSatang, at: r.issueDate!, note: r.note ?? undefined })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const byMethod = new Map<string, { amount: number; count: number }>();
  const bySource = new Map<DailySource, { amount: number; count: number }>();
  for (const e of entries) {
    const m = byMethod.get(e.method) ?? { amount: 0, count: 0 };
    m.amount += e.amount; m.count++; byMethod.set(e.method, m);
    const s = bySource.get(e.source) ?? { amount: 0, count: 0 };
    s.amount += e.amount; s.count++; bySource.set(e.source, s);
  }
  return {
    entries,
    total: entries.reduce((s, e) => s + e.amount, 0),
    byMethod: [...byMethod.entries()].map(([method, v]) => ({ method, ...v })).sort((a, b) => b.amount - a.amount),
    bySource: [...bySource.entries()].map(([source, v]) => ({ source, ...v })),
  };
}
