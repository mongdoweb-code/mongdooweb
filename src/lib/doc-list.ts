// รายการเอกสารขาย (หน้า list + CSV) — ตัวกรองอยู่ใน URL
import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { fromYmd, type DocTypeT } from "@/lib/doc-calc";
import { DOC_TABS, type DocSt } from "@/lib/doc-render";
import { LINKED_WHERE, statusWhere } from "@/lib/docs";
import { parseWorkFilter, workWhere, type WorkFilter } from "@/lib/doc-work";
import { phoneDigits } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
/** work = สถานะงานภายในร้าน (ตัวกรองแยกจากแท็บสถานะเอกสาร ใช้ร่วมกันได้) */
export type DocFilter = { tab: DocSt | "all"; work: WorkFilter; q: string; from: string; to: string; page: number; per: number; showVoid: boolean };

/** คุกกี้จำค่า "แสดงใบที่ยกเลิก" (ต่อเบราว์เซอร์ ใช้ทุกประเภทเอกสาร) · ?void=show|hide ใน URL ชนะคุกกี้ */
export const DOC_VOID_COOKIE = "mdw_doc_void";
export const readShowVoid = (param: string, cookie: string | undefined) => (param === "show" ? true : param === "hide" ? false : cookie === "show");

/** แท็บ "ทั้งหมด" ตอนซ่อนใบที่ยกเลิก (แท็บอื่นไม่มีใบยกเลิกอยู่แล้ว ยกเว้นแท็บ "ยกเลิก" ที่แสดงเสมอ) */
export const hidesVoid = (f: Pick<DocFilter, "tab" | "showVoid">) => f.tab === "all" && !f.showVoid;
export const NOT_VOID: Prisma.SalesDocumentWhereInput = { status: { not: "VOID" } };

export function parseDocFilter(type: DocTypeT, sp: Record<string, string | string[] | undefined>, voidCookie?: string): DocFilter {
  const tab = one(sp.tab);
  return {
    showVoid: readShowVoid(one(sp.void), voidCookie),
    tab: DOC_TABS[type].some(([k]) => k === tab) ? (tab as DocSt) : "all",
    work: parseWorkFilter(one(sp.work)),
    q: one(sp.q).trim().slice(0, 80),
    from: ymdRe.test(one(sp.from)) ? one(sp.from) : "",
    to: ymdRe.test(one(sp.to)) ? one(sp.to) : "",
    page: Math.max(1, Number(one(sp.page)) || 1),
    per: [10, 20, 30, 50, 100].includes(Number(one(sp.per))) ? Number(one(sp.per)) : 20,
  };
}

export function docWhere(type: DocTypeT, f: DocFilter, withTab = true, withWork = true): Prisma.SalesDocumentWhereInput {
  const and: Prisma.SalesDocumentWhereInput[] = [{ type }];
  if (withTab) {
    and.push(statusWhere(f.tab));
    if (hidesVoid(f)) and.push(NOT_VOID);
  }
  if (withWork && f.work) and.push(workWhere(f.work));
  if (f.q) {
    const digits = phoneDigits(f.q);
    and.push({
      OR: [
        { docNo: { contains: f.q, mode: "insensitive" } },
        { customer: { name: { contains: f.q, mode: "insensitive" } } },
        { customer: { code: f.q } },
        ...(digits.length >= 4 ? [{ customer: { phone: { contains: digits } } }, { customer: { taxId: { contains: digits } } }] : []),
        { items: { some: { OR: [{ name: { contains: f.q, mode: "insensitive" as const } }, { sku: { contains: f.q, mode: "insensitive" as const } }] } } },
        { order: { orderNo: { contains: f.q, mode: "insensitive" } } },
      ],
    });
  }
  // ฉบับร่างยังไม่มีวันที่ออก → ใช้วันที่สร้าง
  if (f.from) and.push({ OR: [{ issueDate: { gte: fromYmd(f.from) } }, { issueDate: null, createdAt: { gte: fromYmd(f.from) } }] });
  if (f.to) {
    const end = new Date(fromYmd(f.to).getTime() + 864e5);
    and.push({ OR: [{ issueDate: { lt: end } }, { issueDate: null, createdAt: { lt: end } }] });
  }
  return { AND: and };
}

export async function listDocs(type: DocTypeT, f: DocFilter, size = f.per) {
  const where = docWhere(type, f);
  const total = await prisma.salesDocument.count({ where });
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(pages, f.page);
  const rows = await prisma.salesDocument.findMany({
    where,
    orderBy: [{ issueDate: { sort: "desc", nulls: "first" } }, { docNo: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * size,
    take: size,
    include: { customer: { select: { code: true, name: true } }, _count: { select: { items: true, derived: { where: LINKED_WHERE } } }, order: { select: { orderNo: true } }, source: { select: { docNo: true } }, workBy: { select: { displayName: true } } },
  });
  return { rows, total, page, pages };
}

/** ยอดรวมตามตัวกรองปัจจุบัน (ทุกหน้า ไม่ใช่แค่หน้าที่เห็น) — ไม่นับใบที่ยกเลิก ยกเว้นอยู่ในแท็บ "ยกเลิก" */
export type DocTotals = {
  count: number; grand: number; paid: number; vat: number; qtyMilli: number;
  /** ใบยกเลิกที่อยู่ในผลค้นหาแต่ไม่นับยอด (แท็บทั้งหมด + แสดงใบยกเลิก) */
  voidSkipped: number;
  /** แท็บ "ยกเลิก" = ยอดของใบที่ยกเลิก (ไม่ใช่ยอดขาย) */
  voidTab: boolean;
};

export async function docTotals(type: DocTypeT, f: DocFilter): Promise<DocTotals> {
  const where = docWhere(type, f);
  const voidTab = f.tab === "void";
  const counted: Prisma.SalesDocumentWhereInput = voidTab ? where : { AND: [where, NOT_VOID] };
  const [agg, voidSkipped, qty] = await Promise.all([
    prisma.salesDocument.aggregate({ where: counted, _count: { _all: true }, _sum: { grandSatang: true, paidSatang: true, vatSatang: true } }),
    !voidTab && f.tab === "all" && f.showVoid ? prisma.salesDocument.count({ where: { AND: [where, { status: "VOID" }] } }) : Promise.resolve(0),
    type === "DELIVERY" ? prisma.salesDocumentItem.aggregate({ where: { document: counted, OR: [{ sku: null }, { sku: { notIn: ["Shipping", "COD"] } }] }, _sum: { qtyMilli: true } }) : Promise.resolve(null),
  ]);
  return {
    count: agg._count._all, grand: agg._sum.grandSatang ?? 0, paid: agg._sum.paidSatang ?? 0, vat: agg._sum.vatSatang ?? 0,
    qtyMilli: qty?._sum.qtyMilli ?? 0, voidSkipped, voidTab,
  };
}
