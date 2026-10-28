"use server";
// เพิ่ม/แก้ไข/ลบสินค้า — ราคาเป็นสตางค์, คำอธิบายล้าง HTML, รูปย่อเป็น WebP, ล้างแคชหน้าร้าน
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { Prisma, type LightColor, type UseArea } from "../../../../../generated/prisma/client";
import { diffOf, logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { sanitizeDescription } from "@/lib/html";
import { MediaError, saveImage } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { queueRestockIfAvailableNow } from "@/lib/stock-alerts";
import { setStock } from "@/lib/stock";
import { recordSlugChange } from "@/lib/redirects";
import { parseCsv } from "@/lib/csv";
import { applyImport, checkImport, type ImportRow } from "@/lib/product-csv";
import { readProductExtras } from "@/lib/product-extras";
import { moveProductToEdge, reorderProducts, topSortOrder } from "@/lib/product-order";

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

  // ล็อต 9: ราคาลดตามช่วงเวลา ราคาขายส่ง สเปกแบบมีโครงสร้าง
  const extras = await readProductExtras(f, categoryId, price);
  if ("error" in extras) return { error: extras.error, fields: extras.fields };

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
    ...extras.data,
  };

  // สต็อกเปลี่ยนผ่าน src/lib/stock.ts เท่านั้น (มีประวัติ) — แก้เฉพาะเมื่อผู้ใช้เปลี่ยนตัวเลขจริง กันทับยอดที่ขายไประหว่างเปิดฟอร์ม
  const stock0 = Math.floor(Number(str(f, "stock0", 10) || "0"));
  const { stock: _stock, inStock, ...rest } = data;
  void _stock;
  let saved;
  if (id) {
    const old = await prisma.product.findUnique({ where: { id } });
    if (!old) return { error: "ไม่พบสินค้า" };
    saved = await prisma.$transaction(async (tx) => {
      // เลิกนับสต็อก: บันทึกการล้างยอดก่อน
      if (old.trackStock && !trackStock && old.stock !== 0) await setStock(tx, id, 0, { reason: "EDIT", adminId: admin.id, note: "เลิกนับสต็อก" });
      const u = await tx.product.update({ where: { id }, data: { ...rest, ...(trackStock ? {} : { inStock, stock: 0 }) } });
      if (trackStock && !old.trackStock) await setStock(tx, id, stock, { reason: "COUNT", adminId: admin.id, note: "เริ่มนับสต็อก" });
      else if (trackStock && stock !== stock0) await setStock(tx, id, stock, { reason: "EDIT", adminId: admin.id, note: "แก้จำนวนในหน้าแก้ไขสินค้า" });
      if (trackStock) await tx.product.update({ where: { id }, data: { inStock: (await tx.product.findUniqueOrThrow({ where: { id }, select: { stock: true } })).stock > 0 } });
      return u;
    });
    // A29: เก็บค่าก่อน/หลังของฟิลด์ที่เปลี่ยน (ดูได้ที่ /admin/log?entity=Product:<id>)
    const now = await prisma.product.findUniqueOrThrow({ where: { id }, select: { id: true, trackStock: true, stock: true, inStock: true, isActive: true } });
    queueRestockIfAvailableNow(old, now); // U9: สินค้าไม่นับสต็อกติ๊ก "มีของ" อีกครั้ง / กลับมาเปิดขาย → แจ้งลูกค้าที่รอ
    const diff = diffOf(old, { ...saved, stock: now.stock });
    await logAdmin(admin.id, "PRODUCT", `แก้ไขสินค้า ${sku} — ${name}`, { entity: `Product:${id}`, diff });
    if (old.slug !== slug) await recordSlugChange(`/product/${old.slug}`, `/product/${slug}`); // ลิงก์เดิม → 301 อัตโนมัติ (A13)
  } else {
    const sortOrder = await topSortOrder(); // สินค้าใหม่อยู่บนสุด ลากย้ายได้ในหน้ารายการ
    saved = await prisma.$transaction(async (tx) => {
      const c = await tx.product.create({ data: { ...rest, sortOrder, stock: 0, inStock: trackStock ? false : inStock } });
      if (trackStock && stock > 0) await setStock(tx, c.id, stock, { reason: "COUNT", adminId: admin.id, note: "สต็อกเริ่มต้นตอนเพิ่มสินค้า" });
      return c;
    });
    await logAdmin(admin.id, "PRODUCT", `เพิ่มสินค้า ${sku} — ${name}`, { entity: `Product:${saved.id}` });
  }
  refreshStorefront();
  if (!id) redirect(`/admin/products/${saved.id}?saved=1`);
  refresh();
  return { ok: "บันทึกแล้ว — หน้าร้านแสดงข้อมูลใหม่ทันที" };
}

/** ลบสินค้า: ถ้าเคยอยู่ในคำสั่งซื้อ/เอกสาร จะปิดขายแทน (เก็บประวัติไว้) */
export async function deleteProduct(f: FormData) {
  const admin = await requireOwner();
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
    const u = await prisma.product.update({ where: { id }, data: { isActive: !p.isActive } });
    queueRestockIfAvailableNow(p, u);
    await logAdmin(admin.id, "PRODUCT", `${p.isActive ? "ปิด" : "เปิด"}ขายสินค้า ${p.sku}`, { entity: `Product:${p.id}`, diff: { isActive: [p.isActive, !p.isActive] } });
    refreshStorefront();
  }
  refresh();
}

// ---------------------------------------------------------------------------
// จัดลำดับ (ลากวาง / ไปบนสุด-ล่างสุด) + ปักหมุด
// ---------------------------------------------------------------------------

export type ReorderResult = { ok?: string; error?: string };

/** ลากวางในหน้ารายการ: ids = ลำดับใหม่ของแถวที่เห็นในหน้านั้น */
export async function saveProductOrder(ids: string[]): Promise<ReorderResult> {
  const admin = await requireAdmin();
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string" && x.length <= 40)) return { error: "ข้อมูลไม่ถูกต้อง" };
  try {
    const n = await reorderProducts(ids);
    if (n) {
      await logAdmin(admin.id, "PRODUCT", `จัดลำดับสินค้าใหม่ (ลากวาง ${n} รายการ)`);
      refreshStorefront();
    }
    return { ok: "บันทึกลำดับแล้ว — หน้าร้านเรียงตามนี้" };
  } catch {
    return { error: "บันทึกลำดับไม่สำเร็จ (สินค้าบางรายการอาจถูกลบไปแล้ว) — รีเฟรชหน้าแล้วลองใหม่" };
  }
}

/** ไปบนสุด / ล่างสุดของทั้งร้าน */
export async function moveProduct(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const edge = str(f, "edge", 6) === "bottom" ? "bottom" : "top";
  const p = await prisma.product.findUnique({ where: { id }, select: { sku: true } });
  if (!p) return;
  await moveProductToEdge(id, edge);
  await logAdmin(admin.id, "PRODUCT", `ย้ายสินค้า ${p.sku} ไป${edge === "top" ? "บนสุด" : "ล่างสุด"}`, { entity: `Product:${id}` });
  refreshStorefront();
  refresh();
}

/** ปักหมุด/เลิกปักหมุด (ติดดาว) — ปักหมุดแล้วอยู่บนสุดของรายการและของลำดับ "แนะนำ" หน้าร้าน */
export async function togglePin(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const p = await prisma.product.findUnique({ where: { id }, select: { sku: true, isPinned: true } });
  if (!p) return;
  await prisma.product.update({ where: { id }, data: { isPinned: !p.isPinned } });
  await logAdmin(admin.id, "PRODUCT", `${p.isPinned ? "เลิกปักหมุด" : "ปักหมุด"}สินค้า ${p.sku}`, { entity: `Product:${id}`, diff: { isPinned: [p.isPinned, !p.isPinned] } });
  refreshStorefront();
  refresh();
}

// ---------------------------------------------------------------------------
// ทำสำเนาสินค้า / นำเข้า CSV
// ---------------------------------------------------------------------------

/** ทำสำเนาสินค้า (ปิดขายไว้ก่อน สต็อก 0) แล้วเปิดหน้าแก้ไขของสำเนา */
export async function duplicateProduct(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) redirect("/admin/products");
  let n = 1;
  let sku = `${p.sku}-copy`.slice(0, 60);
  let slug = `${p.slug}-copy`.slice(0, 100);
  while (await prisma.product.findFirst({ where: { OR: [{ sku: { equals: sku, mode: "insensitive" } }, { slug }] }, select: { id: true } })) {
    n++;
    sku = `${p.sku}-copy${n}`.slice(0, 60);
    slug = `${p.slug}-copy${n}`.slice(0, 100);
  }
  // สำเนาไม่รับรีวิว/คะแนน ไม่อยู่ในกลุ่มตัวเลือกเดิม (ค่าตัวเลือกจะซ้ำกัน)
  const { id: _id, createdAt: _c, updatedAt: _u, wooId: _w, legacyPath: _l, views: _v, stock: _s, ratingAvg: _ra, ratingCount: _rc, variantGroupId: _vg, variantOptions: _vo, specs, tierPrices, attrs, downloads, ...rest } = p;
  void [_id, _c, _u, _w, _l, _v, _s, _ra, _rc, _vg, _vo];
  const json = (v: Prisma.JsonValue) => (v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue));
  const copy = await prisma.product.create({
    data: { ...rest, specs: json(specs), tierPrices: json(tierPrices), attrs: json(attrs), downloads: downloads as Prisma.InputJsonValue, sku, slug, name: `${p.name} (สำเนา)`.slice(0, 250), sortOrder: await topSortOrder(), isPinned: false, isActive: false, isBestSeller: false, stock: 0, inStock: !p.trackStock && p.inStock },
  });
  await logAdmin(admin.id, "PRODUCT", `ทำสำเนาสินค้า ${p.sku} → ${sku}`);
  redirect(`/admin/products/${copy.id}?copied=1`);
}

export type ImportState = { error?: string; rows?: ImportRow[]; csv?: string; ok?: string; count?: number };

async function csvFrom(f: FormData): Promise<{ text?: string; error?: string }> {
  const file = f.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) return { error: "ไฟล์ใหญ่เกิน 2 MB" };
    return { text: await file.text() };
  }
  return { text: String(f.get("csv") ?? "").slice(0, 3_000_000) };
}

/** ขั้นที่ 1: ตรวจไฟล์ แสดงรายการที่จะเปลี่ยน + แถวที่ผิด (ยังไม่บันทึก) */
export async function previewImport(_prev: ImportState, f: FormData): Promise<ImportState> {
  await requireOwner();
  const { text, error } = await csvFrom(f);
  if (error || !text) return { error: error ?? "กรุณาเลือกไฟล์ CSV" };
  const parsed = parseCsv(text);
  if (parsed.error) return { error: parsed.error };
  if (!parsed.rows.length) return { error: "ไม่พบข้อมูลในไฟล์" };
  if (!("sku" in parsed.rows[0])) return { error: "ไม่พบคอลัมน์ sku — ใช้ไฟล์ที่ส่งออกจากระบบเป็นแม่แบบ" };
  if (parsed.rows.length > 2000) return { error: "นำเข้าได้ครั้งละไม่เกิน 2,000 แถว" };
  const { rows } = await checkImport(parsed.rows);
  return { rows, csv: text };
}

/** ขั้นที่ 2: ยืนยัน — ตรวจซ้ำกับข้อมูลล่าสุด แล้วบันทึกเฉพาะแถวที่ถูกต้อง */
export async function confirmImport(_prev: ImportState, f: FormData): Promise<ImportState> {
  const admin = await requireOwner();
  const text = String(f.get("csv") ?? "").slice(0, 3_000_000);
  const parsed = parseCsv(text);
  if (parsed.error || !parsed.rows.length) return { error: parsed.error ?? "ไม่พบข้อมูล" };
  if (parsed.rows.length > 2000 || !("sku" in parsed.rows[0])) return { error: "ไฟล์ไม่ถูกต้อง — ตรวจไฟล์ใหม่อีกครั้ง" };
  const { rows, updates } = await checkImport(parsed.rows);
  if (!updates.length) return { rows, csv: text, error: "ไม่มีรายการที่ต้องเปลี่ยน" };
  const n = await applyImport(updates, admin.id);
  const skipped = rows.filter((r) => r.error).length;
  await logAdmin(admin.id, "PRODUCT", `นำเข้า CSV แก้สินค้า ${n} รายการ${skipped ? ` (ข้าม ${skipped} แถวที่ผิด)` : ""}`);
  refreshStorefront();
  return { ok: `บันทึกแล้ว ${n} รายการ${skipped ? ` · ข้าม ${skipped} แถวที่ไม่ผ่านการตรวจ` : ""} — หน้าร้านแสดงข้อมูลใหม่ทันที`, count: n };
}
