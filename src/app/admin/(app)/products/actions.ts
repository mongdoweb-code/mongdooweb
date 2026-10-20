"use server";
// เพิ่ม/แก้ไข/ลบสินค้า — ราคาเป็นสตางค์, คำอธิบายล้าง HTML, รูปย่อเป็น WebP, ล้างแคชหน้าร้าน
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import type { LightColor, UseArea } from "../../../../../generated/prisma/client";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { sanitizeDescription } from "@/lib/html";
import { MediaError, saveImage } from "@/lib/media";
import { prisma } from "@/lib/prisma";

export type ProductFormState = { error?: string; fields?: string[]; ok?: string };

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const money = (v: string) => {
  if (!v.trim()) return null;
  const n = Number(v.replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? Math.round(n * 100) : NaN;
};
const USE: UseArea[] = ["POOL", "POND", "FOUNTAIN", "GARDEN"];
const COLORS: LightColor[] = ["WHITE", "RGB", "ANY"];

export async function saveProduct(_prev: ProductFormState, f: FormData): Promise<ProductFormState> {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const bad: string[] = [];
  const name = str(f, "name", 250);
  if (name.length < 2) bad.push("name");
  const slug = str(f, "slug", 100).toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) bad.push("slug");
  const sku = str(f, "sku", 60);
  if (!sku) bad.push("sku");
  const categoryId = str(f, "categoryId", 40);
  if (!(await prisma.category.findUnique({ where: { id: categoryId } }))) bad.push("categoryId");
  const price = money(str(f, "price", 20)) ?? 0;
  if (Number.isNaN(price)) bad.push("price");
  const compareAt = money(str(f, "compareAt", 20));
  if (Number.isNaN(compareAt) || (compareAt != null && compareAt <= price)) bad.push("compareAt");
  const trackStock = f.get("trackStock") === "on";
  const stock = Math.floor(Number(str(f, "stock", 10) || "0"));
  if (trackStock && !(stock >= 0 && stock < 1_000_000)) bad.push("stock");
  const weight = str(f, "weightGram", 10);
  const weightGram = weight ? Math.floor(Number(weight)) : null;
  if (weightGram != null && !(weightGram >= 0)) bad.push("weightGram");

  let specs: { label: string; value: string }[] = [];
  let keep: string[] = [];
  try {
    specs = (JSON.parse(str(f, "specs", 20000) || "[]") as { label: string; value: string }[])
      .map((s) => ({ label: String(s.label ?? "").trim().slice(0, 60), value: String(s.value ?? "").trim().slice(0, 200) }))
      .filter((s) => s.value)
      .slice(0, 30);
    keep = (JSON.parse(str(f, "images", 20000) || "[]") as string[]).filter((k) => typeof k === "string" && /^products\/[\w/.-]+\.webp$/.test(k));
  } catch {
    bad.push("specs");
  }

  // slug/sku ต้องไม่ซ้ำกับสินค้าอื่น
  const dupSlug = await prisma.product.findFirst({ where: { slug, NOT: id ? { id } : undefined }, select: { id: true } });
  if (dupSlug) bad.push("slug");
  const dupSku = await prisma.product.findFirst({ where: { sku: { equals: sku, mode: "insensitive" }, NOT: id ? { id } : undefined }, select: { id: true } });
  if (dupSku) bad.push("sku");
  if (bad.length)
    return {
      error: dupSlug ? "ลิงก์สินค้า (slug) ซ้ำกับสินค้าอื่น" : dupSku ? "รหัสสินค้า (SKU) ซ้ำกับสินค้าอื่น" : bad.includes("compareAt") ? "ราคาก่อนลดต้องมากกว่าราคาขาย (หรือเว้นว่าง)" : "กรุณาตรวจช่องที่มีกรอบสีแดง",
      fields: bad,
    };

  // รูปใหม่
  const uploaded: string[] = [];
  for (const file of f.getAll("newImages")) {
    if (!(file instanceof File) || file.size === 0) continue;
    try {
      uploaded.push(await saveImage(Buffer.from(await file.arrayBuffer()), "products"));
    } catch (e) {
      return { error: e instanceof MediaError ? `${file.name}: ${e.message}` : `อัปโหลด ${file.name} ไม่สำเร็จ`, fields: ["newImages"] };
    }
  }
  const images = [...keep, ...uploaded].slice(0, 30);

  const data = {
    name,
    slug,
    sku,
    categoryId,
    unit: str(f, "unit", 20) || "ชิ้น",
    priceSatang: price,
    compareAtSatang: compareAt,
    trackStock,
    stock: trackStock ? stock : 0,
    inStock: trackStock ? stock > 0 : f.get("inStock") === "on",
    isActive: f.get("isActive") === "on",
    isBestSeller: f.get("isBestSeller") === "on",
    badge: str(f, "badge", 20) || null,
    shortDescription: sanitizeDescription(str(f, "shortDescription", 5000)) || null,
    description: sanitizeDescription(str(f, "description", 200000)) || null,
    keywords: str(f, "keywords", 2000) || null,
    seoTitle: str(f, "seoTitle", 120) || null,
    seoDescription: str(f, "seoDescription", 300) || null,
    weightGram,
    specs,
    images,
    useAreas: USE.filter((u) => f.getAll("useAreas").includes(u)),
    lightColor: COLORS.includes(str(f, "lightColor") as LightColor) ? (str(f, "lightColor") as LightColor) : "ANY",
    includesPsu: f.get("includesPsu") === "on",
    isAccessory: f.get("isAccessory") === "on",
  };

  let saved;
  if (id) {
    saved = await prisma.product.update({ where: { id }, data });
    await logAdmin(admin.id, "PRODUCT", `แก้ไขสินค้า ${sku} — ${name}`);
  } else {
    saved = await prisma.product.create({ data });
    await logAdmin(admin.id, "PRODUCT", `เพิ่มสินค้า ${sku} — ${name}`);
  }
  refreshStorefront();
  if (!id) redirect(`/admin/products/${saved.id}?saved=1`);
  refresh();
  return { ok: "บันทึกแล้ว — หน้าร้านแสดงข้อมูลใหม่ทันที" };
}

/** ลบสินค้า: ถ้าเคยอยู่ในคำสั่งซื้อ/เอกสาร จะปิดขายแทน (เก็บประวัติไว้) */
export async function deleteProduct(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const p = await prisma.product.findUnique({ where: { id }, include: { _count: { select: { orderItems: true, docItems: true } } } });
  if (!p) redirect("/admin/products");
  if (p._count.orderItems || p._count.docItems) {
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    await logAdmin(admin.id, "PRODUCT", `ปิดขายสินค้า ${p.sku} (มีในคำสั่งซื้อ/เอกสาร จึงไม่ลบ)`);
  } else {
    await prisma.product.delete({ where: { id } });
    await logAdmin(admin.id, "PRODUCT", `ลบสินค้า ${p.sku} — ${p.name}`);
  }
  refreshStorefront();
  redirect("/admin/products?deleted=1");
}

/** เปิด/ปิดขายจากหน้ารายการ */
export async function toggleProduct(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const p = await prisma.product.findUnique({ where: { id } });
  if (p) {
    await prisma.product.update({ where: { id }, data: { isActive: !p.isActive } });
    await logAdmin(admin.id, "PRODUCT", `${p.isActive ? "ปิด" : "เปิด"}ขายสินค้า ${p.sku}`);
    refreshStorefront();
  }
  refresh();
}
