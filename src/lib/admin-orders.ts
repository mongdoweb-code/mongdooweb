// ข้อมูลคำสั่งซื้อสำหรับหลังบ้าน (รายการ, KPI, กราฟ, รายละเอียด + ตรวจสลิปอัตโนมัติ)
import "server-only";
import type { OrderStatus, Prisma } from "../../generated/prisma/client";
import { nextCustomerCode } from "@/lib/docs";
import { prisma } from "@/lib/prisma";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  AWAITING_SLIP: "รอแนบสลิป",
  PENDING_VERIFICATION: "รอตรวจสลิป",
  PAID: "ชำระแล้ว · รอส่ง",
  SHIPPED: "จัดส่งแล้ว",
  REJECTED: "สลิปไม่ผ่าน",
  CANCELLED: "ยกเลิก",
};

export const TABS = [
  ["PENDING_VERIFICATION", "รอตรวจสลิป"],
  ["COD", "รอยืนยัน COD"], // รอบ 3: เก็บเงินปลายทาง = PENDING_VERIFICATION + paymentMethod COD
  ["PAID", "รอจัดส่ง"],
  ["SHIPPED", "จัดส่งแล้ว"],
  ["REJECTED", "สลิปไม่ผ่าน"],
  ["AWAITING_SLIP", "ยังไม่แนบสลิป"],
  ["ALL", "ทั้งหมด"],
] as const;
export type Tab = (typeof TABS)[number][0];

export const REJECT_REASONS = [
  "ยอดเงินในสลิปไม่ตรงกับยอดสั่งซื้อ",
  "สลิปซ้ำ / เคยใช้แล้ว",
  "ภาพสลิปไม่ชัด อ่านไม่ได้",
  "ไม่พบยอดเงินเข้าบัญชี",
  "อื่นๆ",
];
export const CARRIERS = ["Kerry Express", "Flash Express", "ไปรษณีย์ไทย (EMS)", "J&T Express"];

export const RANGES = { all: "ทั้งหมด", today: "วันนี้", "7": "7 วัน", "30": "30 วัน", custom: "กำหนดเอง" } as const;
export type Range = keyof typeof RANGES;

export type OrderFilter = { tab: Tab; q: string; range: Range; from: string; to: string; page: number; size: number };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilter(sp: Record<string, string | string[] | undefined>): OrderFilter {
  const tab = TABS.some(([k]) => k === one(sp.tab)) ? (one(sp.tab) as Tab) : "PENDING_VERIFICATION";
  const range = one(sp.range) in RANGES ? (one(sp.range) as Range) : "all";
  const size = [10, 20, 50, 100].includes(Number(one(sp.size))) ? Number(one(sp.size)) : 20;
  return {
    tab,
    q: one(sp.q).trim().slice(0, 60),
    range,
    from: ymdRe.test(one(sp.from)) ? one(sp.from) : "",
    to: ymdRe.test(one(sp.to)) ? one(sp.to) : "",
    page: Math.max(1, Math.floor(Number(one(sp.page))) || 1),
    size,
  };
}

/** สร้าง query string จากตัวกรอง (ใช้ทำลิงก์แท็บ/หน้า/เปิดรายละเอียด) */
export function filterQuery(f: OrderFilter, patch: Partial<OrderFilter> & { open?: string; mode?: string } = {}) {
  const v = { ...f, ...patch };
  const qs = new URLSearchParams();
  if (v.tab !== "PENDING_VERIFICATION") qs.set("tab", v.tab);
  if (v.q) qs.set("q", v.q);
  if (v.range !== "all") qs.set("range", v.range);
  if (v.range === "custom" && v.from) qs.set("from", v.from);
  if (v.range === "custom" && v.to) qs.set("to", v.to);
  if (v.page > 1) qs.set("page", String(v.page));
  if (v.size !== 20) qs.set("size", String(v.size));
  if (patch.open) qs.set("open", patch.open);
  if (patch.mode) qs.set("mode", patch.mode);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

// ---------- วันที่ตามเวลาไทย ----------
const TZ_OFFSET = 7 * 60 * 60e3;
/** เที่ยงคืนเวลาไทยของวันที่ d (คืนเป็น Date แบบ UTC) */
function bkkMidnight(d: Date) {
  const x = new Date(d.getTime() + TZ_OFFSET);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()) - TZ_OFFSET);
}
const fromYmd = (s: string) => new Date(`${s}T00:00:00+07:00`);

function rangeWhere(f: OrderFilter): { where: Prisma.OrderWhereInput; badRange: boolean } {
  const today = bkkMidnight(new Date());
  if (f.range === "today") return { where: { createdAt: { gte: today } }, badRange: false };
  if (f.range === "7" || f.range === "30")
    return { where: { createdAt: { gte: new Date(today.getTime() - (Number(f.range) - 1) * 864e5) } }, badRange: false };
  if (f.range === "custom") {
    const from = f.from ? fromYmd(f.from) : null;
    const to = f.to ? new Date(fromYmd(f.to).getTime() + 864e5) : null;
    if (from && to && from >= to) return { where: { id: "__none__" }, badRange: true };
    return { where: { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }, badRange: false };
  }
  return { where: {}, badRange: false };
}

/** เงื่อนไขของแท็บ — "รอตรวจสลิป" ไม่รวม COD (COD มีแท็บ "รอยืนยัน COD" แยก) */
function tabWhere(tab: Tab): Prisma.OrderWhereInput {
  if (tab === "ALL") return {};
  if (tab === "COD") return { status: "PENDING_VERIFICATION", paymentMethod: "COD" };
  if (tab === "PENDING_VERIFICATION") return { status: "PENDING_VERIFICATION", paymentMethod: "TRANSFER" };
  return { status: tab };
}

/** ยอดรวมของสลิปที่ยังไม่ถูกปฏิเสธ (โอนหลายครั้ง/โอนเพิ่ม U19) */
export const liveSlipSum = (slips: { declaredAmountSatang: number; status: string }[]) =>
  slips.filter((x) => x.status !== "REJECTED").reduce((a, x) => a + x.declaredAmountSatang, 0);

function searchWhere(q: string): Prisma.OrderWhereInput {
  if (!q) return {};
  const digits = q.replace(/\D/g, "");
  return {
    OR: [
      { orderNo: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { trackingNo: { contains: q, mode: "insensitive" } },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ],
  };
}

// ---------- ตรวจสลิปอัตโนมัติ ----------

export type SlipCheck = { diffSatang: number; dupOrderNos: string[]; late: boolean };

async function duplicatesFor(slips: { orderId: string; sha256: string }[]) {
  if (!slips.length) return new Map<string, string[]>();
  const others = await prisma.paymentSlip.findMany({
    where: { sha256: { in: [...new Set(slips.map((s) => s.sha256))] } },
    select: { sha256: true, orderId: true, order: { select: { orderNo: true } } },
  });
  const map = new Map<string, string[]>();
  for (const s of slips) {
    const nos = others.filter((o) => o.sha256 === s.sha256 && o.orderId !== s.orderId).map((o) => o.order.orderNo);
    map.set(s.orderId, [...new Set(nos)]);
  }
  return map;
}

// ---------- รายการ ----------

export async function listOrders(f: OrderFilter) {
  const { where: rw, badRange } = rangeWhere(f);
  const base: Prisma.OrderWhereInput = { AND: [rw, searchWhere(f.q)] };
  const where: Prisma.OrderWhereInput = f.tab === "ALL" ? base : { AND: [base, tabWhere(f.tab)] };
  const total = await prisma.order.count({ where });
  const pages = Math.max(1, Math.ceil(total / f.size));
  const page = Math.min(f.page, pages);
  const rows = await prisma.order.findMany({
    where,
    // คิวรอตรวจ: เก่าสุดก่อน, อื่นๆ ใหม่สุดก่อน
    orderBy: { createdAt: f.tab === "PENDING_VERIFICATION" || f.tab === "COD" ? "asc" : "desc" },
    skip: (page - 1) * f.size,
    take: f.size,
    include: {
      items: { select: { qty: true } },
      slips: { orderBy: { uploadedAt: "desc" } },
      events: { where: { type: "NOTE" }, select: { id: true }, take: 1 },
    },
  });
  const latest = rows.filter((o) => o.status === "PENDING_VERIFICATION" && o.slips[0]).map((o) => ({ orderId: o.id, sha256: o.slips[0].sha256 }));
  const dups = await duplicatesFor(latest);
  return {
    total,
    page,
    pages,
    badRange,
    rows: rows.map((o) => {
      const s = o.slips[0];
      const check: SlipCheck | null =
        o.status === "PENDING_VERIFICATION" && s
          ? {
              diffSatang: liveSlipSum(o.slips) - o.totalSatang,
              dupOrderNos: dups.get(o.id) ?? [],
              late: o.createdAt.getTime() - s.transferredAt.getTime() > 3 * 864e5,
            }
          : null;
      return {
        orderNo: o.orderNo,
        createdAt: o.createdAt,
        status: o.status,
        customerName: o.customerName,
        phone: o.phone,
        province: o.province,
        itemCount: o.items.reduce((n, i) => n + i.qty, 0),
        shippingName: o.shippingName,
        totalSatang: o.totalSatang,
        noSlip: o.status === "PENDING_VERIFICATION" && o.paymentMethod === "TRANSFER" && !s,
        check,
        hasNote: o.events.length > 0,
        channel: o.channel,
        paymentMethod: o.paymentMethod,
        couponCode: o.couponCode,
        slipCount: o.slips.length,
        codSettled: !!o.codSettledAt,
      };
    }),
  };
}

export async function orderStats() {
  const today = bkkMidnight(new Date());
  const [byStatus, todayAll, todaySales, week] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.order.count({ where: { createdAt: { gte: today }, status: { not: "AWAITING_SLIP" } } }),
    prisma.order.aggregate({ where: { createdAt: { gte: today }, status: { in: ["PAID", "SHIPPED"] } }, _sum: { totalSatang: true } }),
    prisma.order.findMany({
      where: { createdAt: { gte: new Date(today.getTime() - 6 * 864e5) }, status: { in: ["PAID", "SHIPPED"] } },
      select: { createdAt: true, totalSatang: true },
    }),
  ]);
  const count = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Partial<Record<OrderStatus | "COD", number>>;
  // แท็บ "รอตรวจสลิป" ไม่รวม COD ที่รอยืนยัน
  const cod = await prisma.order.count({ where: { status: "PENDING_VERIFICATION", paymentMethod: "COD" } });
  count.COD = cod;
  count.PENDING_VERIFICATION = (count.PENDING_VERIFICATION ?? 0) - cod;
  // ยอดขาย 7 วัน (ยืนยันแล้ว) ตามวันที่สั่งซื้อ เวลาไทย
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(today.getTime() - (6 - i) * 864e5);
    const end = new Date(start.getTime() + 864e5);
    const list = week.filter((o) => o.createdAt >= start && o.createdAt < end);
    return { start, satang: list.reduce((s, o) => s + o.totalSatang, 0), orders: list.length };
  });
  return { count, todayOrders: todayAll, todaySalesSatang: todaySales._sum.totalSatang ?? 0, days };
}

// ---------- รายละเอียด ----------

export async function getOrderDetail(orderNo: string) {
  const o = await prisma.order.findUnique({
    where: { orderNo },
    include: {
      items: { orderBy: { id: "asc" } },
      slips: { orderBy: { uploadedAt: "asc" } },
      events: { orderBy: { createdAt: "asc" }, include: { admin: { select: { displayName: true } } } },
      documents: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, docNo: true, status: true } },
    },
  });
  if (!o) return null;
  const slip = o.slips.at(-1) ?? null;
  const liveSlips = o.slips.filter((x) => x.status !== "REJECTED");
  const dupAll = await prisma.paymentSlip.findMany({
    where: { sha256: { in: liveSlips.map((x) => x.sha256) }, orderId: { not: o.id } },
    select: { order: { select: { orderNo: true } } },
  });
  // สลิปเดียวกันแนบซ้ำในคำสั่งซื้อนี้เอง ก็ติดธงด้วย
  const selfDup = new Set(liveSlips.map((x) => x.sha256)).size < liveSlips.length;
  const dups = [...new Set([...dupAll.map((d) => d.order.orderNo), ...(selfDup ? [`${o.orderNo} (สลิปเดียวกันแนบซ้ำ)`] : [])])];
  const slipSumSatang = liveSlipSum(o.slips);
  const totalOrders = await prisma.order.count();
  return {
    ...o,
    slip,
    slipCount: o.slips.length,
    slipSumSatang,
    totalOrders,
    coupon: o.couponCode ? await prisma.couponRedemption.findUnique({ where: { orderId: o.id }, select: { couponId: true, discountSatang: true } }) : null,
    check: slip
      ? {
          diffSatang: slipSumSatang - o.totalSatang,
          dupOrderNos: dups,
          late: o.createdAt.getTime() - slip.transferredAt.getTime() > 3 * 864e5,
        }
      : null,
  };
}

/** คำสั่งซื้อก่อน/ถัดไปในรายการเดียวกัน (ปุ่ม ← → ในหน้ารายละเอียด) */
export async function neighbours(f: OrderFilter, orderNo: string) {
  const { where: rw } = rangeWhere(f);
  const base: Prisma.OrderWhereInput = { AND: [rw, searchWhere(f.q)] };
  const where: Prisma.OrderWhereInput = f.tab === "ALL" ? base : { AND: [base, tabWhere(f.tab)] };
  const list = await prisma.order.findMany({
    where,
    orderBy: { createdAt: f.tab === "PENDING_VERIFICATION" || f.tab === "COD" ? "asc" : "desc" },
    select: { orderNo: true },
    take: 1000,
  });
  const i = list.findIndex((x) => x.orderNo === orderNo);
  return { prev: i > 0 ? list[i - 1].orderNo : null, next: i >= 0 && i < list.length - 1 ? list[i + 1].orderNo : null };
}

/** คำสั่งซื้อที่รอตรวจเก่าสุด (ใช้ "ตรวจสลิปที่ค้างอยู่" และไปต่อหลังอนุมัติ/ปฏิเสธ) */
export async function nextPending(exceptOrderNo?: string) {
  const o = await prisma.order.findFirst({
    where: { status: "PENDING_VERIFICATION", paymentMethod: "TRANSFER", ...(exceptOrderNo ? { orderNo: { not: exceptOrderNo } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { orderNo: true },
  });
  return o?.orderNo ?? null;
}

// =============================================================
// รอบ 2: แก้ไข/ยกเลิก/คืนเงิน, คำสั่งซื้อจากหลังร้าน, ใบกำกับภาษี, จัดส่งหลายรายการ
// =============================================================

/** สถานะที่ยังแก้ที่อยู่/เบอร์/หมายเหตุได้ (จัดส่งหรือยกเลิกแล้ว = ห้ามแก้) */
export const EDITABLE: OrderStatus[] = ["AWAITING_SLIP", "PENDING_VERIFICATION", "PAID", "REJECTED"];
/** ยกเลิกได้โดยไม่ต้องคืนเงิน (ยังไม่ได้รับเงิน) */
export const CANCELLABLE: OrderStatus[] = ["AWAITING_SLIP", "PENDING_VERIFICATION", "REJECTED"];
/** รับเงินแล้ว → ยกเลิกพร้อมคืนเงิน */
export const REFUNDABLE: OrderStatus[] = ["PAID", "SHIPPED"];

export const CANCEL_REASONS = ["ลูกค้าขอยกเลิก", "ไม่ชำระเงินภายในกำหนด", "สินค้าหมด", "คำสั่งซื้อซ้ำ", "ติดต่อลูกค้าไม่ได้", "อื่นๆ"];
export const REFUND_REASONS = ["ลูกค้าขอยกเลิก", "สินค้าหมด / ส่งไม่ได้", "สินค้าชำรุด / คืนสินค้า", "ส่งผิดรายการ", "โอนเงินเกิน / ซ้ำ", "อื่นๆ"];
/** ช่องทางที่ลูกค้าติดต่อสั่ง (คำสั่งซื้อที่แอดมินสร้างให้) */
export const ADMIN_SOURCES = ["โทรศัพท์", "LINE", "หน้าร้าน", "Facebook", "อื่นๆ"];

// ---------- ใบกำกับภาษีที่ลูกค้าขอตอนสั่งซื้อ (Order.taxInvoice) ----------

export type TaxInvoiceInfo = { kind: "COMPANY" | "PERSON"; name: string; taxId: string; branch: string; address: string };

export function parseTaxInvoice(v: unknown): TaxInvoiceInfo | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const s = (k: string, max: number) => (typeof o[k] === "string" ? (o[k] as string).trim().slice(0, max) : "");
  const taxId = s("taxId", 20).replace(/\D/g, "");
  const name = s("name", 200);
  if (!name || !taxId) return null;
  return { kind: o.kind === "COMPANY" ? "COMPANY" : "PERSON", name, taxId, branch: s("branch", 60), address: s("address", 500) };
}

/** "0" / "00000" / "" (นิติบุคคล) → "สำนักงานใหญ่", "1" → "สาขาที่ 00001" */
export function branchLabel(kind: TaxInvoiceInfo["kind"], b: string) {
  const t = b.trim();
  if (/^\d{1,5}$/.test(t)) return Number(t) === 0 ? "สำนักงานใหญ่" : `สาขาที่ ${t.padStart(5, "0")}`;
  return t || (kind === "COMPANY" ? "สำนักงานใหญ่" : "");
}

/**
 * ลูกค้าสำหรับออกใบเสร็จ/ใบกำกับภาษีตามข้อมูลที่ลูกค้าขอในคำสั่งซื้อ
 * จับคู่ลูกค้าเดิมด้วยเลขผู้เสียภาษี + สาขา ถ้าไม่มีสร้างใหม่ (ไม่แก้ข้อมูลลูกค้าเดิม)
 */
export async function customerForTaxInvoice(
  tx: Prisma.TransactionClient,
  t: TaxInvoiceInfo,
  o: { orderNo: string; phone: string; email: string | null },
) {
  const branch = branchLabel(t.kind, t.branch) || null;
  const found = await tx.customer.findFirst({ where: { taxId: t.taxId, branch }, orderBy: { createdAt: "asc" } });
  if (found) return found;
  return tx.customer.create({
    data: {
      code: await nextCustomerCode(tx), kind: t.kind, name: t.name, taxId: t.taxId, branch, phone: o.phone, email: o.email,
      addressLine: t.address, note: `สร้างจากข้อมูลใบกำกับภาษีในคำสั่งซื้อ ${o.orderNo}`,
    },
  });
}

// ---------- เลขที่คำสั่งซื้อ (รูปแบบเดียวกับหน้าเว็บ: MDW-YYMMDD-NNNN เวลาไทย) ----------

export function makeOrderNo(now = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "2-digit", month: "2-digit", day: "2-digit" })
    .format(now)
    .replace(/-/g, "");
  return `MDW-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ---------- ขนส่ง / เลขพัสดุ ----------

export const TRACKING_RE = /^[A-Z0-9-]{6,40}$/;
export const normTracking = (s: string) => s.toUpperCase().replace(/\s+/g, "");
const CARRIER_ALIAS: [RegExp, string][] = [
  [/kerry|เคอรี่|kex/i, "Kerry Express"],
  [/flash|แฟลช/i, "Flash Express"],
  [/ems|thai\s*post|thailand\s*post|ไปรษณีย์|ปณ/i, "ไปรษณีย์ไทย (EMS)"],
  [/j\s*&\s*t|jnt|เจแอนด์ที/i, "J&T Express"],
];
/** ชื่อขนส่งจาก CSV → ชื่อมาตรฐานในระบบ (null = ไม่รู้จัก) */
export function normalizeCarrier(s: string) {
  const t = s.trim();
  if (!t) return null;
  const exact = CARRIERS.find((c) => c.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  return CARRIER_ALIAS.find(([re]) => re.test(t))?.[1] ?? null;
}

export type ShipRow = { line: number; orderNo: string; carrier: string; trackingNo: string; customerName?: string; error?: string };

/** ตรวจไฟล์ CSV เลขพัสดุ (เลขที่คำสั่งซื้อ, ขนส่ง, เลขพัสดุ) — ทุกแถวต้องเป็นคำสั่งซื้อที่ชำระแล้ว รอจัดส่ง */
export async function checkShipRows(rows: Record<string, string>[]): Promise<ShipRow[]> {
  const pick = (r: Record<string, string>, keys: string[]) => keys.map((k) => r[k]).find((v) => v != null && v !== "") ?? "";
  const parsed: ShipRow[] = rows.slice(0, 500).map((r, i) => {
    const rawCarrier = pick(r, ["carrier", "ขนส่ง", "บริษัทขนส่ง"]);
    return {
      line: i + 2,
      orderNo: pick(r, ["orderno", "order_no", "order", "เลขที่", "เลขที่คำสั่งซื้อ"]).toUpperCase().trim(),
      carrier: normalizeCarrier(rawCarrier) ?? rawCarrier,
      trackingNo: normTracking(pick(r, ["trackingno", "tracking_no", "tracking", "เลขพัสดุ"])),
    };
  });
  const orders = await prisma.order.findMany({
    where: { orderNo: { in: parsed.map((p) => p.orderNo).filter(Boolean) } },
    select: { orderNo: true, status: true, customerName: true },
  });
  const byNo = new Map(orders.map((o) => [o.orderNo, o]));
  const seen = new Set<string>();
  const seenTrack = new Set<string>();
  for (const p of parsed) {
    const o = byNo.get(p.orderNo);
    p.customerName = o?.customerName;
    if (!p.orderNo) p.error = "ไม่มีเลขที่คำสั่งซื้อ";
    else if (!o) p.error = "ไม่พบคำสั่งซื้อนี้";
    else if (seen.has(p.orderNo)) p.error = "เลขที่คำสั่งซื้อซ้ำในไฟล์";
    else if (o.status !== "PAID") p.error = `สถานะปัจจุบัน "${STATUS_LABEL[o.status]}" — ใส่เลขพัสดุได้เฉพาะคำสั่งซื้อที่รอจัดส่ง`;
    else if (!CARRIERS.includes(p.carrier)) p.error = p.carrier ? `ไม่รู้จักขนส่ง "${p.carrier}"` : "ไม่ได้ระบุขนส่ง";
    else if (!TRACKING_RE.test(p.trackingNo)) p.error = "เลขพัสดุไม่ถูกต้อง (A–Z, 0–9, - อย่างน้อย 6 ตัว)";
    else if (seenTrack.has(p.trackingNo)) p.error = "เลขพัสดุซ้ำในไฟล์";
    seen.add(p.orderNo);
    if (p.trackingNo) seenTrack.add(p.trackingNo);
  }
  return parsed;
}

// ---------- คืนสต็อกตอนยกเลิกคำสั่งซื้อที่ชำระแล้ว ----------

/**
 * จำนวนที่ต้องคืนต่อสินค้า = ยอดที่ตัดไปจริงจากประวัติสต็อกของคำสั่งซื้อนี้ (SALE + CANCEL)
 * คำสั่งซื้อเก่าที่อนุมัติก่อนมีประวัติสต็อก → ใช้จำนวนในรายการสินค้า
 */
export async function restockLines(tx: Prisma.TransactionClient, orderId: string, orderNo: string) {
  const moves = await tx.stockMovement.groupBy({ by: ["productId"], where: { ref: orderNo, reason: { in: ["SALE", "CANCEL"] } }, _sum: { change: true } });
  if (moves.length) return moves.map((m) => ({ productId: m.productId, delta: -(m._sum.change ?? 0) })).filter((l) => l.delta > 0);
  const items = await tx.orderItem.findMany({ where: { orderId, productId: { not: null } }, select: { productId: true, qty: true } });
  return items.map((i) => ({ productId: i.productId!, delta: i.qty }));
}
