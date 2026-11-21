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

// ---------------------------------------------------------------------------
// หน้าจัดเรียงสินค้าหน้าร้าน (/admin/products/order): บันทึกลำดับทั้งร้านครั้งเดียว + เก็บลำดับก่อนหน้าไว้คืนค่า
// ---------------------------------------------------------------------------
type OrderSnap = { id: string; sortOrder: number; isPinned: boolean }[];
/** เก็บประวัติลำดับไว้กี่ชุด */
const KEEP_VERSIONS = 20;
/** สินค้าที่อยู่บนหน้าจัดเรียง = สินค้าที่ขายหน้าร้านได้ (ไม่รวมงานบริการ) */
export const BOARD_WHERE = { isService: false } satisfies Prisma.ProductWhereInput;

export class OrderStaleError extends Error {}

async function snapshotOrder(tx: Tx, by: string | null) {
  const rows: OrderSnap = await tx.product.findMany({ where: BOARD_WHERE, select: { id: true, sortOrder: true, isPinned: true } });
  await tx.contentVersion.create({ data: { kind: "PRODUCT_ORDER", snapshot: rows, publishedBy: by } });
  const old = await tx.contentVersion.findMany({ where: { kind: "PRODUCT_ORDER" }, orderBy: { publishedAt: "desc" }, skip: KEEP_VERSIONS, select: { id: true } });
  if (old.length) await tx.contentVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

/**
 * บันทึกลำดับทั้งร้าน: ids = ทุกสินค้าบนหน้าจัดเรียงตามลำดับใหม่ · pinned = id ที่ปักหมุด
 * สินค้าเพิ่ม/ลบระหว่างจัด → OrderStaleError (ให้โหลดหน้าใหม่ ไม่เดาตำแหน่งให้)
 * คืนจำนวนแถวที่เปลี่ยน (0 = ไม่มีอะไรเปลี่ยน ไม่เก็บประวัติ)
 */
export async function saveBoardOrder(ids: string[], pinned: string[], by: string | null) {
  const uniq = new Set(ids);
  if (uniq.size !== ids.length || ids.length > 20_000) throw new OrderStaleError("bad ids");
  const pin = new Set(pinned);
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    const cur = await tx.product.findMany({ where: BOARD_WHERE, select: { id: true, sortOrder: true, isPinned: true } });
    if (cur.length !== ids.length || cur.some((r) => !uniq.has(r.id))) throw new OrderStaleError("stale");
    const byId = new Map(cur.map((r) => [r.id, r]));
    const updates = ids
      .map((id, i) => ({ id, sortOrder: (i + 1) * STEP, isPinned: pin.has(id) }))
      .filter((u) => byId.get(u.id)!.sortOrder !== u.sortOrder || byId.get(u.id)!.isPinned !== u.isPinned);
    if (!updates.length) return 0;
    await snapshotOrder(tx, by);
    // อัปเดตทีเดียวทั้งชุด (ร้านมีสินค้าหลักพันได้)
    await tx.$executeRaw`UPDATE "Product" AS p SET "sortOrder" = v.s, "isPinned" = v.pin
      FROM unnest(${updates.map((u) => u.id)}::text[], ${updates.map((u) => u.sortOrder)}::int[], ${updates.map((u) => u.isPinned)}::bool[]) AS v(id, s, pin)
      WHERE p."id" = v.id`;
    return updates.length;
  }, { timeout: 60_000 });
}

/** ลำดับที่บันทึกไว้ล่าสุด (ก่อนการบันทึกครั้งล่าสุด) — null = ไม่มี */
export const lastOrderVersion = () => prisma.contentVersion.findFirst({ where: { kind: "PRODUCT_ORDER" }, orderBy: { publishedAt: "desc" }, select: { id: true, publishedAt: true, publishedBy: true } });

/**
 * คืนลำดับก่อนหน้า: ใช้ชุดล่าสุด แล้วเก็บลำดับปัจจุบันเป็นชุดใหม่แทน (กดซ้ำ = สลับกลับ)
 * สินค้าที่เพิ่มหลังจากนั้นคงตำแหน่งเดิม · สินค้าที่ถูกลบข้ามไป
 */
export async function restoreBoardOrder(by: string | null) {
  return prisma.$transaction(async (tx) => {
    await lock(tx);
    const v = await tx.contentVersion.findFirst({ where: { kind: "PRODUCT_ORDER" }, orderBy: { publishedAt: "desc" } });
    if (!v) return null;
    const rows = (Array.isArray(v.snapshot) ? v.snapshot : []) as OrderSnap;
    await tx.contentVersion.delete({ where: { id: v.id } });
    await snapshotOrder(tx, by);
    const live = new Map((await tx.product.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, sortOrder: true, isPinned: true } })).map((r) => [r.id, r]));
    let n = 0;
    for (const r of rows) {
      const c = live.get(r.id);
      if (!c || typeof r.sortOrder !== "number" || (c.sortOrder === r.sortOrder && c.isPinned === !!r.isPinned)) continue;
      await tx.product.update({ where: { id: r.id }, data: { sortOrder: r.sortOrder, isPinned: !!r.isPinned } });
      n++;
    }
    return { changed: n, at: v.publishedAt };
  }, { timeout: 60_000 });
}
