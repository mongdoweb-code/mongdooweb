"use server";
// แก้ไขด่วนจากหน้ารายการ: แก้ราคา/สต็อกในช่องตาราง (กดแล้วพิมพ์ Enter) และแผงแก้ไขด่วน (ชื่อ รหัส หมวด ราคา สต็อก การขาย)
// สต็อกเปลี่ยนผ่าน setStock เท่านั้น (มีประวัติ) · ราคาเป็นสตางค์ · บันทึก AdminLog พร้อมค่าก่อน/หลัง · ล้างแคชหน้าร้าน
import { refresh } from "next/cache";
import { diffOf, logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { bahtText } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { setStock } from "@/lib/stock";
import { queueRestockIfAvailableNow } from "@/lib/stock-alerts";

export type QuickResult = { ok?: string; error?: string; display?: string };
export type QuickField = "price" | "compareAt" | "stock";

/** "1,290" / "฿1290.50" → สตางค์ · ว่าง = null · ผิดรูปแบบ = NaN */
const money = (v: string) => {
  if (!v.trim()) return null;
  const n = Number(v.replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) : NaN;
};
const count = (v: string) => {
  const n = Number(v.replace(/[,\s]/g, ""));
  return Number.isInteger(n) && n >= 0 && n < 1_000_000 ? n : NaN;
};
const SELECT = { id: true, sku: true, name: true, priceSatang: true, compareAtSatang: true, trackStock: true, stock: true, inStock: true, isActive: true } as const;

/** แก้ช่องเดียวในตาราง: ราคา · ราคาก่อนลด · สต็อก (ถ้ายังไม่นับสต็อก ใส่ตัวเลข = เริ่มนับสต็อก) */
export async function quickField(id: string, field: QuickField, raw: string): Promise<QuickResult> {
  const admin = await requireAdmin();
  if (typeof id !== "string" || typeof raw !== "string" || !["price", "compareAt", "stock"].includes(field)) return { error: "ข้อมูลไม่ถูกต้อง" };
  const old = await prisma.product.findUnique({ where: { id }, select: SELECT });
  if (!old) return { error: "ไม่พบสินค้า (อาจถูกลบไปแล้ว)" };
  const value = raw.trim().slice(0, 20);

  if (field === "stock") {
    const n = count(value);
    if (Number.isNaN(n)) return { error: "ใส่จำนวนเต็ม 0 ขึ้นไป" };
    const startTracking = !old.trackStock;
    await prisma.$transaction(async (tx) => {
      if (startTracking) await tx.product.update({ where: { id }, data: { trackStock: true, stock: 0 } });
      await setStock(tx, id, n, { reason: startTracking ? "COUNT" : "EDIT", adminId: admin.id, note: startTracking ? "เริ่มนับสต็อก (แก้ด่วนในหน้ารายการ)" : "แก้ด่วนในหน้ารายการสินค้า" });
      await tx.product.update({ where: { id }, data: { inStock: n > 0 } });
    });
    const now = await prisma.product.findUniqueOrThrow({ where: { id }, select: SELECT });
    queueRestockIfAvailableNow(old, now);
    await logAdmin(admin.id, "PRODUCT", `แก้สต็อก ${old.sku}: ${startTracking ? "เริ่มนับ" : old.stock} → ${n}`, { entity: `Product:${id}`, diff: { stock: [old.trackStock ? old.stock : null, n] } });
    refreshStorefront();
    refresh();
    return { ok: startTracking ? "เริ่มนับสต็อกแล้ว" : "บันทึกสต็อกแล้ว", display: String(n) };
  }

  const satang = money(value);
  if (Number.isNaN(satang)) return { error: "ใส่ราคาเป็นตัวเลข เช่น 1290 หรือ 1,290.50" };
  if (field === "price") {
    const price = satang ?? 0;
    if (old.compareAtSatang != null && old.compareAtSatang <= price && price > 0) return { error: `ราคาขายต้องน้อยกว่าราคาก่อนลด (${bahtText(old.compareAtSatang)})` };
    if (price === old.priceSatang) return { ok: "ไม่มีการเปลี่ยนแปลง", display: price ? bahtText(price) : "สอบถามราคา" };
    await prisma.product.update({ where: { id }, data: { priceSatang: price } });
    await logAdmin(admin.id, "PRODUCT", `แก้ราคา ${old.sku}: ${old.priceSatang ? bahtText(old.priceSatang) : "สอบถามราคา"} → ${price ? bahtText(price) : "สอบถามราคา"}`, { entity: `Product:${id}`, diff: { priceSatang: [old.priceSatang, price] } });
    refreshStorefront();
    refresh();
    return { ok: "บันทึกราคาแล้ว", display: price ? bahtText(price) : "สอบถามราคา" };
  }
  // ราคาก่อนลด (ขีดฆ่า) — ว่าง = ไม่ลด
  if (satang != null && satang <= old.priceSatang) return { error: "ราคาก่อนลดต้องมากกว่าราคาขาย (หรือเว้นว่าง)" };
  await prisma.product.update({ where: { id }, data: { compareAtSatang: satang } });
  await logAdmin(admin.id, "PRODUCT", `แก้ราคาก่อนลด ${old.sku}`, { entity: `Product:${id}`, diff: { compareAtSatang: [old.compareAtSatang, satang] } });
  refreshStorefront();
  refresh();
  return { ok: satang == null ? "เอาราคาก่อนลดออกแล้ว" : "บันทึกราคาก่อนลดแล้ว", display: satang == null ? "" : bahtText(satang) };
}

/** แผงแก้ไขด่วน: ชื่อ รหัส หมวด ราคา ราคาก่อนลด สต็อก/มีของ เปิดขาย ขายดี ป้าย */
export async function quickSaveProduct(f: FormData): Promise<QuickResult & { fields?: string[] }> {
  const admin = await requireAdmin();
  const s = (k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
  const id = s("id", 40);
  const old = await prisma.product.findUnique({ where: { id } });
  if (!old) return { error: "ไม่พบสินค้า (อาจถูกลบไปแล้ว)" };
  const bad: string[] = [];
  const name = s("name", 250);
  if (name.length < 2) bad.push("name");
  const sku = s("sku", 60);
  if (!sku) bad.push("sku");
  const categoryId = s("categoryId", 40);
  if (!(await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }))) bad.push("categoryId");
  const price = money(s("price", 20)) ?? 0;
  if (Number.isNaN(price)) bad.push("price");
  const compareAt = money(s("compareAt", 20));
  if (Number.isNaN(compareAt) || (compareAt != null && compareAt <= price)) bad.push("compareAt");
  const trackStock = f.get("trackStock") === "on";
  const stock = trackStock ? count(s("stock", 10) || "0") : 0;
  if (trackStock && Number.isNaN(stock)) bad.push("stock");
  const dupSku = sku ? await prisma.product.findFirst({ where: { sku: { equals: sku, mode: "insensitive" }, NOT: { id } }, select: { id: true } }) : null;
  if (dupSku) bad.push("sku");
  if (bad.length)
    return {
      error: dupSku ? "รหัสสินค้า (SKU) ซ้ำกับสินค้าอื่น" : bad.includes("compareAt") ? "ราคาก่อนลดต้องมากกว่าราคาขาย (หรือเว้นว่าง)" : "กรุณาตรวจช่องที่มีกรอบสีแดง",
      fields: bad,
    };

  const data = {
    name, sku, categoryId, priceSatang: price, compareAtSatang: compareAt,
    isActive: f.get("isActive") === "on", isBestSeller: f.get("isBestSeller") === "on", badge: s("badge", 20) || null,
  };
  await prisma.$transaction(async (tx) => {
    if (old.trackStock && !trackStock && old.stock !== 0) await setStock(tx, id, 0, { reason: "EDIT", adminId: admin.id, note: "เลิกนับสต็อก (แก้ไขด่วน)" });
    await tx.product.update({ where: { id }, data: { ...data, trackStock, ...(trackStock ? {} : { stock: 0, inStock: f.get("inStock") === "on" }) } });
    if (trackStock && (!old.trackStock || stock !== old.stock)) {
      await setStock(tx, id, stock, { reason: old.trackStock ? "EDIT" : "COUNT", adminId: admin.id, note: old.trackStock ? "แก้ไขด่วนในหน้ารายการ" : "เริ่มนับสต็อก (แก้ไขด่วน)" });
    }
    if (trackStock) await tx.product.update({ where: { id }, data: { inStock: stock > 0 } });
  });
  const now = await prisma.product.findUniqueOrThrow({ where: { id } });
  queueRestockIfAvailableNow(old, now);
  await logAdmin(admin.id, "PRODUCT", `แก้ไขด่วน ${sku} — ${name}`, { entity: `Product:${id}`, diff: diffOf(old, now) });
  refreshStorefront();
  refresh();
  return { ok: "บันทึกแล้ว" };
}
