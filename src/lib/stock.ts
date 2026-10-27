// สต็อกสินค้า — จุดเดียวที่เปลี่ยน Product.stock และบันทึก StockMovement ใน transaction เดียวกัน
// กติกา
// - ทุกการตัด/คืน/ปรับสต็อกต้องผ่าน moveStock / setStock เท่านั้น → ยอดสต็อก = ผลรวมการเคลื่อนไหวเสมอ
// - ล็อกแถวสินค้า (SELECT … FOR UPDATE) เรียงตาม id กัน deadlock และกันสองคนแก้พร้อมกัน
// - สินค้าที่ไม่นับสต็อก (trackStock = false) ไม่ถูกแตะ
// - สินค้าที่มีสต็อกอยู่ก่อนเริ่มใช้ระบบนี้ (ยังไม่มีประวัติ) จะได้รายการ "ยอดยกมา" (OPENING) ก่อนการเคลื่อนไหวแรก
import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { logAdmin } from "@/lib/admin-log";
import { notifyShop, siteUrl } from "@/lib/line";
import { prisma } from "@/lib/prisma";
import { queueRestockAlert } from "@/lib/stock-alerts";

type Tx = Prisma.TransactionClient;

export const STOCK_REASONS = {
  OPENING: "ยอดยกมา",
  SALE: "ขาย (ตัดสต็อก)",
  CANCEL: "ยกเลิก/คืนสินค้า",
  RESTOCK: "รับของเข้า",
  COUNT: "นับสต็อก",
  ADJUST: "ปรับปรุง",
  IMPORT: "นำเข้า CSV",
  EDIT: "แก้ในหน้าสินค้า",
} as const;
export type StockReason = keyof typeof STOCK_REASONS;
export const isStockReason = (s: string): s is StockReason => s in STOCK_REASONS;

export type StockMeta = { reason: StockReason; ref?: string | null; note?: string | null; adminId?: string | null };
export type StockResult = { productId: string; sku: string; name: string; before: number; after: number; change: number };

type Locked = { id: string; sku: string; name: string; stock: number; trackStock: boolean };

async function lock(tx: Tx, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  if (!sorted.length) return new Map<string, Locked>();
  const rows = await tx.$queryRaw<Locked[]>`
    SELECT "id", "sku", "name", "stock", "trackStock" FROM "Product"
    WHERE "id" = ANY(${sorted}::text[]) ORDER BY "id" FOR UPDATE`;
  return new Map(rows.map((r) => [r.id, { ...r, stock: Number(r.stock) }]));
}

async function write(tx: Tx, p: Locked, after: number, meta: StockMeta): Promise<StockResult | null> {
  const before = p.stock;
  if (after === before) return null;
  // ยอดยกมา: สินค้าที่มีสต็อกก่อนเริ่มเก็บประวัติ
  if (before !== 0 && (await tx.stockMovement.count({ where: { productId: p.id } })) === 0)
    await tx.stockMovement.create({ data: { productId: p.id, change: before, balance: before, reason: "OPENING", note: "ยอดคงเหลือก่อนเริ่มบันทึกประวัติ" } });
  await tx.product.update({ where: { id: p.id }, data: { stock: after, inStock: after > 0 } });
  await tx.stockMovement.create({
    data: {
      productId: p.id, change: after - before, balance: after, reason: meta.reason,
      ref: meta.ref?.slice(0, 60) || null, note: meta.note?.slice(0, 300) || null, adminId: meta.adminId ?? null,
    },
  });
  p.stock = after;
  if (before <= 0 && after > 0) queueRestockAlert(p.id); // แจ้ง LINE ร้านเมื่อมีลูกค้ารอของ (U9) — ตรวจซ้ำหลัง transaction จบ
  return { productId: p.id, sku: p.sku, name: p.name, before, after, change: after - before };
}

/**
 * เพิ่ม/ลดสต็อกหลายรายการ (delta: + เพิ่ม, − ลด) — ไม่ให้ติดลบ (ลดได้ถึง 0)
 * เรียกภายใน transaction ของงานหลัก (อนุมัติ/ยกเลิก/รับของ) เพื่อให้สำเร็จหรือล้มเหลวพร้อมกัน
 */
export async function moveStock(tx: Tx, lines: { productId: string; delta: number }[], meta: StockMeta) {
  const sum = new Map<string, number>();
  for (const l of lines) if (l.productId && Number.isInteger(l.delta) && l.delta) sum.set(l.productId, (sum.get(l.productId) ?? 0) + l.delta);
  const locked = await lock(tx, [...sum.keys()]);
  const out: StockResult[] = [];
  for (const [id, delta] of [...sum.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const p = locked.get(id);
    if (!p || !p.trackStock) continue;
    const r = await write(tx, p, Math.max(0, p.stock + delta), meta);
    if (r) out.push(r);
  }
  return out;
}

/** ตั้งสต็อกเป็นจำนวนที่นับได้จริง (นับสต็อก / นำเข้า CSV / แก้ในหน้าสินค้า) */
export async function setStock(tx: Tx, productId: string, target: number, meta: StockMeta) {
  if (!Number.isInteger(target) || target < 0) throw new Error("จำนวนสต็อกไม่ถูกต้อง");
  const p = (await lock(tx, [productId])).get(productId);
  if (!p || !p.trackStock) return null;
  return write(tx, p, target, meta);
}

/** ตรวจว่า stock ตรงกับผลรวมการเคลื่อนไหว (สินค้าที่ยังไม่มีประวัติถือว่าตรง) */
export async function ledgerCheck(productId: string) {
  const [p, agg] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { stock: true } }),
    prisma.stockMovement.aggregate({ where: { productId }, _sum: { change: true }, _count: { _all: true } }),
  ]);
  const sum = agg._sum.change ?? 0;
  return { stock: p?.stock ?? 0, sum, moves: agg._count._all, ok: agg._count._all === 0 || sum === (p?.stock ?? 0) };
}

// ---------- สินค้าใกล้หมด ----------

/** สินค้าที่เพิ่งลดลงจาก "เกินเกณฑ์" มาเป็น "≤ เกณฑ์" ในการเปลี่ยนแปลงนี้ (แจ้งครั้งเดียวต่อรอบ) */
export const lowStockCrossings = (results: StockResult[], threshold: number) =>
  results.filter((r) => r.before > threshold && r.after <= threshold);

export async function lowStockProducts(threshold: number, take = 200) {
  return prisma.product.findMany({
    where: { trackStock: true, isActive: true, isService: false, stock: { lte: threshold } },
    orderBy: [{ stock: "asc" }, { name: "asc" }],
    take,
    select: { id: true, sku: true, name: true, stock: true, category: { select: { nameTh: true } } },
  });
}

export function lowStockText(list: { sku: string; name: string; after?: number; stock?: number }[], threshold: number, title = "📦 สินค้าใกล้หมด") {
  const lines = list.slice(0, 15).map((p) => {
    const n = p.after ?? p.stock ?? 0;
    return `• ${p.name} (${p.sku}) — ${n <= 0 ? "หมดแล้ว" : `เหลือ ${n}`}`;
  });
  if (list.length > 15) lines.push(`…และอีก ${list.length - 15} รายการ`);
  return [`${title} (เกณฑ์ ≤ ${threshold})`, ...lines, "", `ดูทั้งหมด: ${siteUrl()}/admin/stock?tab=low`].join("\n");
}

/**
 * แจ้ง LINE เมื่อสต็อกลดลงถึงเกณฑ์ — เรียกใน after() หลังอนุมัติ/ขาย
 * เคารพค่าตั้ง lineLowStock และ lowStockThreshold · ส่งไม่สำเร็จไม่กระทบงานหลัก
 */
export async function alertLowStock(results: StockResult[], ref?: string) {
  try {
    if (!results.length) return;
    const s = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { lineLowStock: true, lowStockThreshold: true } });
    if (!s?.lineLowStock) return;
    const crossed = lowStockCrossings(results, s.lowStockThreshold);
    if (!crossed.length) return;
    await notifyShop(lowStockText(crossed, s.lowStockThreshold, `📦 สินค้าใกล้หมด${ref ? ` หลังคำสั่งซื้อ ${ref}` : ""}`));
  } catch (e) {
    await logAdmin(null, "LINE", `แจ้งเตือนสินค้าใกล้หมดไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
  }
}
