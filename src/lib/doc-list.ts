// รายการเอกสารขาย (หน้า list + CSV) — ตัวกรองอยู่ใน URL
import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { fromYmd, type DocTypeT } from "@/lib/doc-calc";
import { DOC_TABS, type DocSt } from "@/lib/doc-render";
import { statusWhere } from "@/lib/docs";
import { phoneDigits } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
export type DocFilter = { tab: DocSt | "all"; q: string; from: string; to: string; page: number; per: number };

export function parseDocFilter(type: DocTypeT, sp: Record<string, string | string[] | undefined>): DocFilter {
  const tab = one(sp.tab);
  return {
    tab: DOC_TABS[type].some(([k]) => k === tab) ? (tab as DocSt) : "all",
    q: one(sp.q).trim().slice(0, 80),
    from: ymdRe.test(one(sp.from)) ? one(sp.from) : "",
    to: ymdRe.test(one(sp.to)) ? one(sp.to) : "",
    page: Math.max(1, Number(one(sp.page)) || 1),
    per: [10, 20, 30, 50, 100].includes(Number(one(sp.per))) ? Number(one(sp.per)) : 20,
  };
}

export function docWhere(type: DocTypeT, f: DocFilter, withTab = true): Prisma.SalesDocumentWhereInput {
  const and: Prisma.SalesDocumentWhereInput[] = [{ type }];
  if (withTab) and.push(statusWhere(f.tab));
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
    include: { customer: { select: { code: true, name: true } }, _count: { select: { items: true } }, order: { select: { orderNo: true } } },
  });
  return { rows, total, page, pages };
}
