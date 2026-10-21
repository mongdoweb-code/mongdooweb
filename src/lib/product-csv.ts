// นำเข้า/ส่งออกสินค้าเป็น CSV — แก้ราคา สต็อก สถานะ ชื่อ หมวด หลายรายการในครั้งเดียว
// จับคู่ด้วยรหัสสินค้า (SKU) · ช่องว่าง = ไม่เปลี่ยน · ตรวจทุกแถวก่อนยืนยัน
import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { setStock } from "@/lib/stock";

export const CSV_COLUMNS = ["sku", "name", "category", "price", "compare_at", "stock", "track_stock", "in_stock", "active", "unit"] as const;
export const CSV_HELP: Record<(typeof CSV_COLUMNS)[number], string> = {
  sku: "รหัสสินค้า (ใช้จับคู่ — ห้ามแก้)",
  name: "ชื่อสินค้า",
  category: "หมวด (slug ภาษาอังกฤษ หรือชื่อหมวดภาษาไทย)",
  price: "ราคาขาย (บาท) — 0 = สอบถามราคา",
  compare_at: "ราคาก่อนลด (บาท) — 0 = ไม่ลดราคา",
  stock: "จำนวนคงเหลือ (เฉพาะสินค้าที่นับสต็อก)",
  track_stock: "นับสต็อก 1/0",
  in_stock: "มีสินค้า 1/0 (ใช้เมื่อไม่นับสต็อก)",
  active: "เปิดขาย 1/0",
  unit: "หน่วย เช่น ชิ้น ชุด ม้วน",
};

const baht = (s: number | null) => (s == null ? "" : (s / 100).toFixed(2).replace(/\.00$/, ""));

export async function exportRows() {
  const list = await prisma.product.findMany({ where: { isService: false }, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }], include: { category: { select: { slug: true } } } });
  return [
    [...CSV_COLUMNS],
    ...list.map((p) => [
      p.sku, p.name, p.category.slug, baht(p.priceSatang), baht(p.compareAtSatang), p.trackStock ? p.stock : "",
      p.trackStock ? 1 : 0, p.inStock ? 1 : 0, p.isActive ? 1 : 0, p.unit,
    ]),
  ];
}

export type Change = { field: string; label: string; from: string; to: string };
export type ImportRow = { line: number; sku: string; name: string; productId?: string; changes: Change[]; error?: string };
type Update = { productId: string; data: Prisma.ProductUpdateInput; stock: number | null };

const LABEL: Record<string, string> = {
  name: "ชื่อ", category: "หมวด", price: "ราคา", compare_at: "ราคาก่อนลด", stock: "สต็อก", track_stock: "นับสต็อก", in_stock: "มีสินค้า", active: "เปิดขาย", unit: "หน่วย",
};
const yes = (v: string) => (/^(1|y|yes|true|ใช่|เปิด|on)$/i.test(v) ? true : /^(0|n|no|false|ไม่|ปิด|off)$/i.test(v) ? false : null);
const money = (v: string) => {
  const n = Number(v.replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 && /^\d+(\.\d{1,2})?$/.test(v.replace(/[,\s฿]/g, "")) ? Math.round(n * 100) : NaN;
};
const onOff = (b: boolean) => (b ? "ใช่" : "ไม่");

/** ตรวจทุกแถว → รายการเปลี่ยนแปลง + ข้อผิดพลาด (ยังไม่บันทึก) */
export async function checkImport(rows: Record<string, string>[]) {
  const [products, cats] = await Promise.all([
    prisma.product.findMany({ where: { isService: false }, include: { category: { select: { slug: true, nameTh: true } } } }),
    prisma.category.findMany({ select: { id: true, slug: true, nameTh: true } }),
  ]);
  const bySku = new Map(products.map((p) => [p.sku.toLowerCase(), p]));
  const catOf = (v: string) => cats.find((c) => c.slug.toLowerCase() === v.toLowerCase() || c.nameTh === v);
  const seen = new Set<string>();
  const out: ImportRow[] = [];
  const updates: Update[] = [];
  for (const [i, r] of rows.entries()) {
    const sku = (r.sku ?? "").trim();
    const row: ImportRow = { line: i + 2, sku, name: r.name ?? "", changes: [] };
    out.push(row);
    const p = bySku.get(sku.toLowerCase());
    if (!sku) { row.error = "ไม่มีรหัสสินค้า (sku)"; continue; }
    if (!p) { row.error = "ไม่พบรหัสสินค้านี้ในร้าน (นำเข้าได้เฉพาะแก้สินค้าที่มีอยู่)"; continue; }
    if (seen.has(p.id)) { row.error = "รหัสสินค้าซ้ำในไฟล์"; continue; }
    seen.add(p.id);
    row.productId = p.id;
    row.name = p.name;
    const errs: string[] = [];
    const data: Prisma.ProductUpdateInput = {};
    const add = (field: string, from: string, to: string) => row.changes.push({ field, label: LABEL[field], from, to });
    const v = (k: string) => (r[k] ?? "").trim();

    if (v("name")) {
      if (v("name").length < 2 || v("name").length > 250) errs.push("ชื่อสั้นหรือยาวเกินไป");
      else if (v("name") !== p.name) { data.name = v("name"); add("name", p.name, v("name")); }
    }
    if (v("category")) {
      const c = catOf(v("category"));
      if (!c) errs.push(`ไม่พบหมวด "${v("category")}"`);
      else if (c.id !== p.categoryId) { data.category = { connect: { id: c.id } }; add("category", p.category.nameTh, c.nameTh); }
    }
    let price = p.priceSatang;
    if (v("price")) {
      const n = money(v("price"));
      if (Number.isNaN(n)) errs.push("ราคาไม่ถูกต้อง");
      else if (n !== p.priceSatang) { price = n; data.priceSatang = n; add("price", baht(p.priceSatang) || "0", baht(n) || "0"); }
    }
    if (v("compare_at")) {
      const n = money(v("compare_at"));
      const next = n === 0 ? null : n;
      if (Number.isNaN(n)) errs.push("ราคาก่อนลดไม่ถูกต้อง");
      else if (next != null && next <= price) errs.push("ราคาก่อนลดต้องมากกว่าราคาขาย (หรือใส่ 0)");
      else if (next !== p.compareAtSatang) { data.compareAtSatang = next; add("compare_at", baht(p.compareAtSatang) || "—", baht(next) || "—"); }
    } else if (price !== p.priceSatang && p.compareAtSatang != null && p.compareAtSatang <= price) errs.push("ราคาขายใหม่ต้องน้อยกว่าราคาก่อนลด");
    let track = p.trackStock;
    if (v("track_stock")) {
      const b = yes(v("track_stock"));
      if (b === null) errs.push("track_stock ต้องเป็น 1 หรือ 0");
      else if (b !== p.trackStock) { track = b; data.trackStock = b; add("track_stock", onOff(p.trackStock), onOff(b)); }
    }
    let stock: number | null = null;
    if (v("stock")) {
      const n = /^\d{1,7}$/.test(v("stock")) ? Number(v("stock")) : NaN;
      if (Number.isNaN(n)) errs.push("สต็อกต้องเป็นจำนวนเต็ม 0 ขึ้นไป");
      else if (!track) errs.push("ใส่สต็อกได้เฉพาะสินค้าที่นับสต็อก (track_stock = 1)");
      else if (n !== p.stock || !p.trackStock) { stock = n; add("stock", p.trackStock ? String(p.stock) : "ไม่นับ", String(n)); }
    } else if (track && !p.trackStock) stock = 0;
    if (v("in_stock")) {
      const b = yes(v("in_stock"));
      if (b === null) errs.push("in_stock ต้องเป็น 1 หรือ 0");
      else if (!track && b !== p.inStock) { data.inStock = b; add("in_stock", onOff(p.inStock), onOff(b)); }
    }
    if (v("active")) {
      const b = yes(v("active"));
      if (b === null) errs.push("active ต้องเป็น 1 หรือ 0");
      else if (b !== p.isActive) { data.isActive = b; add("active", onOff(p.isActive), onOff(b)); }
    }
    if (v("unit") && v("unit") !== p.unit) {
      if (v("unit").length > 20) errs.push("หน่วยยาวเกิน 20 ตัวอักษร");
      else { data.unit = v("unit"); add("unit", p.unit, v("unit")); }
    }
    if (errs.length) { row.error = errs.join(" · "); row.changes = []; continue; }
    if (row.changes.length || stock !== null) updates.push({ productId: p.id, data, stock });
  }
  return { rows: out, updates };
}

/** บันทึกทุกแถวที่ถูกต้องใน transaction เดียว (สต็อกบันทึกประวัติชนิด "นำเข้า CSV") */
export async function applyImport(updates: Update[], adminId: string) {
  return prisma.$transaction(
    async (tx) => {
      for (const u of updates) {
        // ปิดการนับสต็อก → ล้างยอดผ่านประวัติก่อน
        if (u.data.trackStock === false) await setStock(tx, u.productId, 0, { reason: "IMPORT", adminId, note: "เลิกนับสต็อก (นำเข้า CSV)" });
        if (Object.keys(u.data).length) await tx.product.update({ where: { id: u.productId }, data: u.data });
        if (u.stock !== null) await setStock(tx, u.productId, u.stock, { reason: "IMPORT", adminId, note: "นำเข้า CSV" });
        const p = await tx.product.findUniqueOrThrow({ where: { id: u.productId }, select: { trackStock: true, stock: true } });
        if (p.trackStock) await tx.product.update({ where: { id: u.productId }, data: { inStock: p.stock > 0 } });
      }
      return updates.length;
    },
    { timeout: 60_000 },
  );
}
