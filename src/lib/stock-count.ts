// นับสต็อกทั้งร้าน (ล็อต 15): เปิดรอบนับ → กรอกยอดนับหลายรายการ (บันทึกเป็นระยะได้) → ปรับสต็อกทีเดียว
// - ยอด "ในระบบ" ถูกจดไว้ตอนเปิดรอบ (expected) — ตอนปรับใช้ส่วนต่าง (นับได้ − expected) บวกกับสต็อกปัจจุบัน
//   เพื่อไม่ให้การขาย/รับของที่เกิดระหว่างนับหายไป (ถ้าไม่มีอะไรเกิดระหว่างนับ ผลเท่ากับตั้งเป็นยอดนับ)
// - การปรับทั้งหมดอยู่ใน transaction เดียว ผ่าน moveStock (StockMovement เหตุผล COUNT อ้างเลขรอบนับ)
import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { nextSeq } from "@/lib/sequence";
import { moveStock, type StockResult } from "@/lib/stock";

export class CountError extends Error {}
export type CountScope = { kind: "all" } | { kind: "category"; categoryId: string } | { kind: "low"; threshold: number };

export async function createCount(title: string, scope: CountScope, adminId: string) {
  const where: Prisma.ProductWhereInput = {
    trackStock: true, isService: false,
    ...(scope.kind === "category" ? { categoryId: scope.categoryId } : scope.kind === "low" ? { isActive: true, stock: { lte: scope.threshold } } : {}),
  };
  return prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where, select: { id: true, stock: true }, orderBy: { name: "asc" } });
    if (!products.length) throw new CountError("ไม่มีสินค้าที่นับสต็อกตามเงื่อนไขนี้");
    const countNo = await nextSeq(tx, "SC");
    return tx.stockCount.create({
      data: { countNo, title: title.trim().slice(0, 120) || `นับสต็อก ${countNo}`, createdById: adminId, lines: { create: products.map((p) => ({ productId: p.id, expected: p.stock })) } },
      select: { id: true, countNo: true, _count: { select: { lines: true } } },
    });
  });
}

/** บันทึกยอดนับ (null = ล้างยอดนับ) — เฉพาะรอบที่ยังเปิด */
export async function saveCounts(countId: string, entries: { productId: string; counted: number | null }[]) {
  return prisma.$transaction(async (tx) => {
    const c = await tx.stockCount.findUnique({ where: { id: countId }, select: { status: true } });
    if (c?.status !== "OPEN") throw new CountError("รอบนับนี้ปิดแล้ว แก้ยอดไม่ได้");
    const lines = await tx.stockCountLine.findMany({ where: { countId }, select: { id: true, productId: true, counted: true } });
    const byProduct = new Map(lines.map((l) => [l.productId, l]));
    let changed = 0;
    for (const e of entries) {
      const l = byProduct.get(e.productId);
      if (!l || l.counted === e.counted) continue;
      if (e.counted !== null && !(Number.isInteger(e.counted) && e.counted >= 0 && e.counted <= 1_000_000)) throw new CountError("ยอดนับต้องเป็นจำนวนเต็ม 0 ขึ้นไป");
      await tx.stockCountLine.update({ where: { id: l.id }, data: { counted: e.counted, countedAt: e.counted === null ? null : new Date() } });
      changed++;
    }
    return changed;
  });
}

/** ปรับสต็อกตามยอดนับ (เฉพาะบรรทัดที่นับแล้ว) แล้วปิดรอบ */
export async function applyCount(countId: string, adminId: string): Promise<{ countNo: string; results: StockResult[]; counted: number; skipped: number }> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "StockCount" WHERE "id" = ${countId} FOR UPDATE`;
    const c = await tx.stockCount.findUnique({ where: { id: countId }, include: { lines: true } });
    if (!c || c.status !== "OPEN") throw new CountError("รอบนับนี้ปรับไปแล้วหรือถูกยกเลิก");
    const done = c.lines.filter((l) => l.counted !== null);
    if (!done.length) throw new CountError("ยังไม่ได้กรอกยอดนับเลย");
    const results = await moveStock(tx, done.map((l) => ({ productId: l.productId, delta: l.counted! - l.expected })), { reason: "COUNT", ref: c.countNo, adminId, note: `นับสต็อก ${c.title}`.slice(0, 200) });
    const byId = new Map(results.map((r) => [r.productId, r.change]));
    for (const l of done) await tx.stockCountLine.update({ where: { id: l.id }, data: { applied: byId.get(l.productId) ?? 0 } });
    await tx.stockCount.update({ where: { id: countId }, data: { status: "APPLIED", appliedAt: new Date(), appliedById: adminId } });
    return { countNo: c.countNo, results, counted: done.length, skipped: c.lines.length - done.length };
  });
}

export async function cancelCount(countId: string) {
  const r = await prisma.stockCount.updateMany({ where: { id: countId, status: "OPEN" }, data: { status: "CANCELLED" } });
  if (r.count !== 1) throw new CountError("ยกเลิกได้เฉพาะรอบที่ยังเปิดอยู่");
}
