// ลำดับสินค้าที่ร้านจัดเอง (Product.sortOrder) + ปักหมุด (Product.isPinned)
// ลากเรียงในหลังบ้านทีละหน้า: สินค้าที่ลากสลับกัน "แลกช่องลำดับ" กันเอง สินค้าหน้าอื่น/ที่ถูกกรองออกไม่ขยับ
import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";

const STEP = 10;
type Tx = Prisma.TransactionClient;

/** กันสองคนลากพร้อมกันแล้วลำดับซ้ำ — ล็อกเฉพาะงานจัดลำดับสินค้า */
const lock = (tx: Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(84202610)`;

/** เรียงเลขใหม่ทั้งร้าน (10, 20, 30, …) ตามลำดับปัจจุบัน — ใช้เมื่อพบเลขซ้ำ (เช่น สินค้าที่นำเข้าจาก CSV ได้ 0 เท่ากัน) */
async function renumberAll(tx: Tx) {
  await tx.$executeRaw`UPDATE "Product" p SET "sortOrder" = r.n FROM (SELECT id, (row_number() OVER (ORDER BY "sortOrder" ASC, "createdAt" ASC))::int * 10 AS n FROM "Product") r WHERE p.id = r.id`;
}

/**
 * บันทึกลำดับใหม่ของสินค้าชุดหนึ่ง (ตามที่เห็นบนหน้าจอ): สินค้าในชุดใช้ "ช่องลำดับ" เดิมของชุดนั้นเรียงใหม่
 * แยกกลุ่มปักหมุด/ไม่ปักหมุด (ปักหมุดอยู่บนเสมอ จึงสลับข้ามกลุ่มไม่ได้)
 */
export async function reorderProducts(ids: string[]) {
  const uniq = [...new Set(ids)];
  if (uniq.length !== ids.length || ids.length < 2 || ids.length > 200) throw new Error("bad ids");
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    const load = () => tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, sortOrder: true, isPinned: true } });
    let rows = await load();
    if (rows.length !== ids.length) throw new Error("missing");
    const slotsOf = (pinned: boolean) => rows.filter((r) => r.isPinned === pinned).map((r) => r.sortOrder).sort((a, b) => a - b);
    const distinct = (a: number[]) => new Set(a).size === a.length;
    if (!distinct(slotsOf(true)) || !distinct(slotsOf(false))) {
      await renumberAll(tx);
      rows = await load();
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    let changed = 0;
    for (const pinned of [true, false]) {
      const slots = slotsOf(pinned);
      const inOrder = ids.filter((id) => byId.get(id)!.isPinned === pinned);
      for (const [k, id] of inOrder.entries()) {
        if (byId.get(id)!.sortOrder === slots[k]) continue;
        await tx.product.update({ where: { id }, data: { sortOrder: slots[k] } });
        changed++;
      }
    }
    return changed;
  });
}

/** ย้ายไปบนสุด/ล่างสุดของทั้งร้าน (ในกลุ่มปักหมุดหรือไม่ปักหมุดของตัวเอง) */
export async function moveProductToEdge(id: string, edge: "top" | "bottom") {
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    const agg = await tx.product.aggregate({ _min: { sortOrder: true }, _max: { sortOrder: true } });
    const sortOrder = edge === "top" ? (agg._min.sortOrder ?? 0) - STEP : (agg._max.sortOrder ?? 0) + STEP;
    await tx.product.update({ where: { id }, data: { sortOrder } });
  });
}

/** ลำดับของสินค้าใหม่/สำเนา = บนสุด (ร้านเห็นสินค้าใหม่ก่อน ลากย้ายภายหลังได้) */
export async function topSortOrder() {
  const agg = await prisma.product.aggregate({ _min: { sortOrder: true } });
  return (agg._min.sortOrder ?? STEP) - STEP;
}
