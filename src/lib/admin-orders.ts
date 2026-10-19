// ข้อมูลคำสั่งซื้อสำหรับหลังบ้าน (รายการ, KPI, กราฟ, รายละเอียด + ตรวจสลิปอัตโนมัติ)
import "server-only";
import type { OrderStatus, Prisma } from "../../generated/prisma/client";
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
  const where: Prisma.OrderWhereInput = f.tab === "ALL" ? base : { AND: [base, { status: f.tab }] };
  const total = await prisma.order.count({ where });
  const pages = Math.max(1, Math.ceil(total / f.size));
  const page = Math.min(f.page, pages);
  const rows = await prisma.order.findMany({
    where,
    // คิวรอตรวจ: เก่าสุดก่อน, อื่นๆ ใหม่สุดก่อน
    orderBy: { createdAt: f.tab === "PENDING_VERIFICATION" ? "asc" : "desc" },
    skip: (page - 1) * f.size,
    take: f.size,
    include: {
      items: { select: { qty: true } },
      slips: { orderBy: { uploadedAt: "desc" }, take: 1 },
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
              diffSatang: s.declaredAmountSatang - o.totalSatang,
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
        noSlip: o.status === "PENDING_VERIFICATION" && !s,
        check,
        hasNote: o.events.length > 0,
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
  const count = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Partial<Record<OrderStatus, number>>;
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
    },
  });
  if (!o) return null;
  const slip = o.slips.at(-1) ?? null;
  const dups = slip ? (await duplicatesFor([{ orderId: o.id, sha256: slip.sha256 }])).get(o.id) ?? [] : [];
  const totalOrders = await prisma.order.count();
  return {
    ...o,
    slip,
    slipCount: o.slips.length,
    totalOrders,
    check: slip
      ? {
          diffSatang: slip.declaredAmountSatang - o.totalSatang,
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
  const where: Prisma.OrderWhereInput = f.tab === "ALL" ? base : { AND: [base, { status: f.tab }] };
  const list = await prisma.order.findMany({
    where,
    orderBy: { createdAt: f.tab === "PENDING_VERIFICATION" ? "asc" : "desc" },
    select: { orderNo: true },
    take: 1000,
  });
  const i = list.findIndex((x) => x.orderNo === orderNo);
  return { prev: i > 0 ? list[i - 1].orderNo : null, next: i >= 0 && i < list.length - 1 ? list[i + 1].orderNo : null };
}

/** คำสั่งซื้อที่รอตรวจเก่าสุด (ใช้ "ตรวจสลิปที่ค้างอยู่" และไปต่อหลังอนุมัติ/ปฏิเสธ) */
export async function nextPending(exceptOrderNo?: string) {
  const o = await prisma.order.findFirst({
    where: { status: "PENDING_VERIFICATION", ...(exceptOrderNo ? { orderNo: { not: exceptOrderNo } } : {}) },
    orderBy: { createdAt: "asc" },
    select: { orderNo: true },
  });
  return o?.orderNo ?? null;
}
