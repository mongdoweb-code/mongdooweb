// กลุ่มลูกค้า (A23): แท็ก + ยอดซื้อรวม + ซื้อล่าสุด + ตัวกรอง สำหรับหน้า /admin/customers และไฟล์บรอดแคสต์
// ยอดซื้อรวม = คำสั่งซื้อที่ชำระแล้ว/จัดส่งแล้วของลูกค้า (ผูก customerId) + ใบเสร็จที่ออกแล้วไม่ยกเลิกที่ไม่ได้มาจากคำสั่งซื้อ (ไม่นับซ้ำ)
// ซื้อล่าสุด = วันที่ชำระของคำสั่งซื้อ / วันที่ในใบเสร็จ ล่าสุด
// รายชื่อสำหรับการตลาด (marketingOnly) ไม่รวม: ลูกค้าที่ตั้ง "ไม่รับข่าวสาร" (marketingOptOut) และเบอร์/อีเมลที่ยื่นคำขอคัดค้าน (PDPA OBJECT) ที่ไม่ถูกปฏิเสธ
import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { phoneDigits } from "@/lib/format";
import { marketingAllowed } from "@/lib/pdpa-rules";
import { prisma } from "@/lib/prisma";

export type SegmentFilter = {
  q: string; kind: "" | "COMPANY" | "PERSON"; tag: string; taxId: "" | "yes" | "no";
  minSpend: string; maxSpend: string; lastFrom: string; lastTo: string; sort: "code" | "spend" | "last";
};

const one = (v: string | string[] | undefined | null) => (Array.isArray(v) ? v[0] : v) ?? "";
const ymd = /^\d{4}-\d{2}-\d{2}$/;
const num = /^\d+(\.\d+)?$/;

export function parseSegment(sp: Record<string, string | string[] | undefined>): SegmentFilter {
  const kind = one(sp.kind) === "COMPANY" ? "COMPANY" : one(sp.kind) === "PERSON" ? "PERSON" : "";
  const taxId = one(sp.taxId) === "yes" ? "yes" : one(sp.taxId) === "no" ? "no" : "";
  const sort = one(sp.sort) === "spend" ? "spend" : one(sp.sort) === "last" ? "last" : "code";
  return {
    q: one(sp.q).trim().slice(0, 80), kind, tag: one(sp.tag).trim().slice(0, 40), taxId,
    minSpend: num.test(one(sp.minSpend)) ? one(sp.minSpend) : "", maxSpend: num.test(one(sp.maxSpend)) ? one(sp.maxSpend) : "",
    lastFrom: ymd.test(one(sp.lastFrom)) ? one(sp.lastFrom) : "", lastTo: ymd.test(one(sp.lastTo)) ? one(sp.lastTo) : "", sort,
  };
}

export const segmentQuery = (f: SegmentFilter, patch: Record<string, string> = {}) => {
  const base: Record<string, string> = { ...f, sort: f.sort === "code" ? "" : f.sort };
  const s = new URLSearchParams(Object.entries({ ...base, ...patch }).filter(([, v]) => v)).toString();
  return s ? `?${s}` : "";
};
export const segmentActive = (f: SegmentFilter) => !!(f.tag || f.taxId || f.minSpend || f.maxSpend || f.lastFrom || f.lastTo);

/** แท็ก: ตัดช่องว่าง ไม่ซ้ำ (ไม่สนตัวพิมพ์) สูงสุด 20 แท็ก แท็กละไม่เกิน 30 ตัวอักษร */
export function normalizeTags(raw: string | string[]) {
  const list = (Array.isArray(raw) ? raw : raw.split(/[,\n]/)).map((t) => t.replace(/\s+/g, " ").trim().slice(0, 30)).filter(Boolean);
  const seen = new Set<string>();
  return list.filter((t) => (seen.has(t.toLowerCase()) ? false : (seen.add(t.toLowerCase()), true))).slice(0, 20);
}

export async function allTags() {
  const rows = await prisma.$queryRaw<{ tag: string; n: bigint }[]>`SELECT unnest("tags") AS tag, COUNT(*) AS n FROM "Customer" GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 200`;
  return rows.map((r) => ({ tag: r.tag, n: Number(r.n) }));
}

export type CustomerStats = { spendSatang: number; orders: number; receipts: number; lastAt: Date | null };

/** ยอดซื้อรวม/ซื้อล่าสุดของลูกค้าหลายราย (ใช้ groupBy 2 ครั้ง) */
export async function statsFor(ids: string[]): Promise<Map<string, CustomerStats>> {
  const out = new Map<string, CustomerStats>();
  if (!ids.length) return out;
  const [orders, receipts] = await Promise.all([
    prisma.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, status: { in: ["PAID", "SHIPPED"] } }, _sum: { totalSatang: true }, _count: { _all: true }, _max: { paidAt: true } }),
    prisma.salesDocument.groupBy({
      by: ["customerId"], where: { customerId: { in: ids }, type: "RECEIPT", status: { notIn: ["VOID", "DRAFT"] }, docNo: { not: null }, orderId: null },
      _sum: { grandSatang: true }, _count: { _all: true }, _max: { issueDate: true },
    }),
  ]);
  for (const id of ids) out.set(id, { spendSatang: 0, orders: 0, receipts: 0, lastAt: null });
  const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);
  for (const o of orders) {
    const s = out.get(o.customerId!)!;
    s.spendSatang += o._sum.totalSatang ?? 0;
    s.orders = o._count._all;
    s.lastAt = later(s.lastAt, o._max.paidAt);
  }
  for (const r of receipts) {
    const s = out.get(r.customerId!)!;
    s.spendSatang += r._sum.grandSatang ?? 0;
    s.receipts = r._count._all;
    s.lastAt = later(s.lastAt, r._max.issueDate);
  }
  return out;
}

function baseWhere(f: SegmentFilter): Prisma.CustomerWhereInput {
  const d = phoneDigits(f.q);
  const and: Prisma.CustomerWhereInput[] = [];
  if (f.kind) and.push({ kind: f.kind });
  if (f.tag) and.push({ tags: { has: f.tag } });
  if (f.taxId === "yes") and.push({ taxId: { not: null } }, { NOT: { taxId: "" } });
  if (f.taxId === "no") and.push({ OR: [{ taxId: null }, { taxId: "" }] });
  if (f.q)
    and.push({
      OR: [
        { name: { contains: f.q, mode: "insensitive" } }, { code: f.q }, { contactName: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } },
        { tags: { has: f.q } }, ...(d.length >= 3 ? [{ phone: { contains: d } }, { taxId: { contains: d } }] : []),
      ],
    });
  return and.length ? { AND: and } : {};
}

/** เบอร์/อีเมลที่ยื่นคำขอคัดค้านการตลาด (ไม่นับคำขอที่ถูกปฏิเสธ) */
async function objectedContacts() {
  const reqs = await prisma.dataRequest.findMany({ where: { kind: "OBJECT", status: { not: "REJECTED" } }, select: { phone: true, email: true } });
  return { phones: new Set(reqs.map((r) => phoneDigits(r.phone)).filter(Boolean)), emails: new Set(reqs.map((r) => r.email?.toLowerCase()).filter((e): e is string => !!e)) };
}

/** ลูกค้าตามตัวกรองทั้งหมด (คำนวณยอดแล้ว) — ใช้ทั้งหน้ารายการ (แบ่งหน้าเอง) และไฟล์ CSV */
export async function segmentCustomers(f: SegmentFilter, opts: { marketingOnly?: boolean } = {}) {
  let rows = await prisma.customer.findMany({
    where: { ...baseWhere(f), ...(opts.marketingOnly ? { marketingOptOut: false } : {}) }, orderBy: { code: "desc" }, take: 20000,
    include: { _count: { select: { documents: true, orders: true } } },
  });
  if (opts.marketingOnly) {
    const blocked = await objectedContacts();
    rows = rows.filter((c) => marketingAllowed(c, blocked));
  }
  const stats = await statsFor(rows.map((r) => r.id));
  const min = f.minSpend ? Math.round(Number(f.minSpend) * 100) : null;
  const max = f.maxSpend ? Math.round(Number(f.maxSpend) * 100) : null;
  const from = f.lastFrom ? new Date(`${f.lastFrom}T00:00:00+07:00`) : null;
  const to = f.lastTo ? new Date(new Date(`${f.lastTo}T00:00:00+07:00`).getTime() + 864e5) : null;
  const list = rows
    .map((c) => ({ ...c, stats: stats.get(c.id)! }))
    .filter((c) => (min == null || c.stats.spendSatang >= min) && (max == null || c.stats.spendSatang <= max))
    .filter((c) => (!from && !to) || (c.stats.lastAt && (!from || c.stats.lastAt >= from) && (!to || c.stats.lastAt < to)));
  if (f.sort === "spend") list.sort((a, b) => b.stats.spendSatang - a.stats.spendSatang);
  if (f.sort === "last") list.sort((a, b) => (b.stats.lastAt?.getTime() ?? 0) - (a.stats.lastAt?.getTime() ?? 0));
  return list;
}
