"use server";
// ล็อต 9 (หลังบ้าน): ไฟล์ดาวน์โหลด (A8), แก้หลายรายการพร้อมกัน (A12), ลดราคาตามเวลาทั้งหมวด (A3),
// กลุ่มตัวเลือกสินค้า (A1) — ทุก action ตรวจสิทธิ์ บันทึก AdminLog และล้างแคชหน้าร้าน
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { Prisma } from "../../../../../generated/prisma/client";
import { diffOf, logAdmin, logAdminMany, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { DownloadError, MAX_DOWNLOADS, deletePdf, parseDownloads, savePdf } from "@/lib/product-downloads";
import { parseBkk } from "@/lib/product-extras";
import { parseTiers, priceAfterPercent } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { queueRestockIfAvailableNow } from "@/lib/stock-alerts";
import { MAX_OPTIONS, parseOptionNames, suggestGroups, validateGroup } from "@/lib/variants";

export type Lot9State = { error?: string; ok?: string; fields?: string[] };

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const baht = (s: number) => (s / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });

// A29: ค่าก่อน/หลังของสินค้าแต่ละตัวที่ถูกแก้แบบกลุ่ม (หนึ่งบันทึกต่อสินค้า → ดูได้ที่ /admin/log?entity=Product:<id>)
const AUDIT = {
  id: true, sku: true, categoryId: true, isActive: true, priceSatang: true, compareAtSatang: true, salePriceSatang: true,
  saleStartsAt: true, saleEndsAt: true, tierPrices: true, trackStock: true, stock: true, inStock: true,
} as const;
const AUDIT_FIELDS = ["categoryId", "isActive", "priceSatang", "compareAtSatang", "salePriceSatang", "saleStartsAt", "saleEndsAt", "tierPrices"];
const snapshot = (ids: string[]) => prisma.product.findMany({ where: { id: { in: ids } }, select: AUDIT });

async function logProductDiffs(adminId: string, label: string, before: Awaited<ReturnType<typeof snapshot>>) {
  const after = new Map((await snapshot(before.map((b) => b.id))).map((a) => [a.id, a]));
  const rows = before.flatMap((b) => {
    const a = after.get(b.id);
    const diff = a ? diffOf(b, a, AUDIT_FIELDS) : null;
    if (a) queueRestockIfAvailableNow(b, a); // เปิดขายอีกครั้ง → แจ้งลูกค้าที่รอของ (U9)
    return diff ? [{ note: `${label} — ${b.sku}`, entity: `Product:${b.id}`, diff }] : [];
  });
  await logAdminMany(adminId, "PRODUCT", rows);
}

// ---------------------------------------------------------------------------
// ไฟล์ดาวน์โหลด (PDF ≤ 20 MB, ไม่เกิน 10 ไฟล์ต่อสินค้า)
// ---------------------------------------------------------------------------

export async function uploadDownload(_prev: Lot9State, f: FormData): Promise<Lot9State> {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const p = await prisma.product.findUnique({ where: { id }, select: { sku: true, downloads: true } });
  if (!p) return { error: "ไม่พบสินค้า" };
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "กรุณาเลือกไฟล์ PDF", fields: ["file"] };
  const list = parseDownloads(p.downloads);
  if (list.length >= MAX_DOWNLOADS) return { error: `ไฟล์ดาวน์โหลดได้ไม่เกิน ${MAX_DOWNLOADS} ไฟล์ต่อสินค้า` };
  let saved;
  try {
    saved = await savePdf(Buffer.from(await file.arrayBuffer()), str(f, "name", 150) || file.name);
  } catch (e) {
    return { error: e instanceof DownloadError ? e.message : "อัปโหลดไม่สำเร็จ", fields: ["file"] };
  }
  await prisma.product.update({ where: { id }, data: { downloads: [...list, saved] as unknown as Prisma.InputJsonValue } });
  await logAdmin(admin.id, "PRODUCT", `เพิ่มไฟล์ดาวน์โหลด "${saved.name}.pdf" ให้สินค้า ${p.sku}`);
  refreshStorefront();
  refresh();
  return { ok: `อัปโหลด "${saved.name}" แล้ว` };
}

export async function removeDownload(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const key = str(f, "key", 200);
  const p = await prisma.product.findUnique({ where: { id }, select: { sku: true, downloads: true } });
  if (!p) return;
  const list = parseDownloads(p.downloads);
  const d = list.find((x) => x.key === key);
  if (!d) return;
  await prisma.product.update({ where: { id }, data: { downloads: list.filter((x) => x.key !== key) as unknown as Prisma.InputJsonValue } });
  await deletePdf(key).catch(() => {});
  await logAdmin(admin.id, "PRODUCT", `ลบไฟล์ดาวน์โหลด "${d.name}.pdf" ของสินค้า ${p.sku}`);
  refreshStorefront();
  refresh();
}

// ---------------------------------------------------------------------------
// แก้สินค้าหลายรายการพร้อมกัน (A12) — ทั้งหมดใน transaction เดียว
// ---------------------------------------------------------------------------

type Row = { id: string; sku: string; priceSatang: number; compareAtSatang: number | null; salePriceSatang: number | null; tierPrices: Prisma.JsonValue };

/** ราคาใหม่: ล้างราคาขีดฆ่า/ราคาลด/ราคาขายส่งที่ไม่ต่ำกว่าราคาใหม่แล้ว (ไม่งั้นข้อมูลขัดกัน) */
function repriceData(p: Row, price: number): Prisma.ProductUpdateInput {
  const tiers = parseTiers(p.tierPrices).filter((t) => t.priceSatang < price);
  return {
    priceSatang: price,
    ...(p.compareAtSatang != null && p.compareAtSatang <= price ? { compareAtSatang: null } : {}),
    ...(p.salePriceSatang != null && p.salePriceSatang >= price ? { salePriceSatang: null, saleStartsAt: null, saleEndsAt: null } : {}),
    ...(parseTiers(p.tierPrices).length !== tiers.length ? { tierPrices: tiers.length ? tiers : Prisma.DbNull } : {}),
  };
}

function saleWindow(f: FormData): { start: Date | null; end: Date | null; error?: string } {
  const start = parseBkk(str(f, "saleStartsAt", 30));
  const end = parseBkk(str(f, "saleEndsAt", 30));
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) return { start, end, error: "วันเวลาไม่ถูกต้อง" };
  if (start && end && end <= start) return { start, end, error: "วันสิ้นสุดต้องหลังวันเริ่ม" };
  if (end && end <= new Date()) return { start, end, error: "วันสิ้นสุดต้องเป็นเวลาในอนาคต" };
  return { start, end };
}

export async function bulkEditProducts(_prev: Lot9State, f: FormData): Promise<Lot9State> {
  const admin = await requireAdmin();
  const ids = [...new Set(f.getAll("ids").map((v) => String(v).slice(0, 40)))].slice(0, 500);
  if (!ids.length) return { error: "ยังไม่ได้เลือกสินค้า — ติ๊กช่องหน้ารายการที่ต้องการก่อน" };
  const op = str(f, "op", 20);
  const rows: Row[] = await prisma.product.findMany({
    where: { id: { in: ids }, isService: false },
    select: { id: true, sku: true, priceSatang: true, compareAtSatang: true, salePriceSatang: true, tierPrices: true },
  });
  if (!rows.length) return { error: "ไม่พบสินค้าที่เลือก" };
  const skus = rows.map((r) => r.sku).join(", ");
  const before = await snapshot(rows.map((r) => r.id));
  let note = "";
  let skipped = 0;

  if (op === "category") {
    const cat = await prisma.category.findUnique({ where: { id: str(f, "categoryId", 40) } });
    if (!cat) return { error: "กรุณาเลือกหมวด", fields: ["categoryId"] };
    await prisma.product.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { categoryId: cat.id } });
    note = `ย้ายไปหมวด "${cat.nameTh}"`;
  } else if (op === "active" || op === "inactive") {
    await prisma.product.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { isActive: op === "active" } });
    note = op === "active" ? "เปิดขาย" : "ปิดขาย";
  } else if (op === "price") {
    const mode = str(f, "priceMode", 10);
    const v = Number(str(f, "priceValue", 20).replace(/[,\s฿%]/g, ""));
    if (!Number.isFinite(v)) return { error: "กรุณาใส่ตัวเลข", fields: ["priceValue"] };
    if (mode === "pct" && !(v >= -90 && v <= 500 && v !== 0)) return { error: "ปรับราคาได้ตั้งแต่ -90% ถึง +500%", fields: ["priceValue"] };
    if (mode === "set" && !(v > 0 && v < 10_000_000)) return { error: "ราคาไม่ถูกต้อง", fields: ["priceValue"] };
    await prisma.$transaction(async (tx) => {
      for (const p of rows) {
        // สินค้า "สอบถามราคา" (0) ไม่ปรับตาม % — ตั้งราคาตรงได้
        if (mode === "pct" && p.priceSatang <= 0) {
          skipped++;
          continue;
        }
        const price = mode === "pct" ? Math.max(100, Math.round((p.priceSatang * (100 + v)) / 100 / 100) * 100) : Math.round(v * 100);
        await tx.product.update({ where: { id: p.id }, data: repriceData(p, price) });
      }
    });
    note = mode === "pct" ? `ปรับราคา ${v > 0 ? "+" : ""}${v}% (ปัดเป็นบาทเต็ม)` : `ตั้งราคา ฿${baht(Math.round(v * 100))}`;
  } else if (op === "sale") {
    const pct = Number(str(f, "salePct", 10));
    if (!(pct >= 1 && pct <= 90)) return { error: "ส่วนลดต้องอยู่ระหว่าง 1–90%", fields: ["salePct"] };
    const w = saleWindow(f);
    if (w.error) return { error: w.error, fields: ["saleEndsAt"] };
    await prisma.$transaction(async (tx) => {
      for (const p of rows) {
        if (p.priceSatang <= 0) {
          skipped++;
          continue;
        }
        const sale = priceAfterPercent(p.priceSatang, pct);
        if (sale >= p.priceSatang) {
          skipped++;
          continue;
        }
        await tx.product.update({ where: { id: p.id }, data: { salePriceSatang: sale, saleStartsAt: w.start, saleEndsAt: w.end } });
      }
    });
    note = `ตั้งลดราคา ${pct}%${w.end ? ` ถึง ${str(f, "saleEndsAt", 30).replace("T", " ")}` : ""}`;
  } else if (op === "clearSale") {
    await prisma.product.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { salePriceSatang: null, saleStartsAt: null, saleEndsAt: null } });
    note = "ยกเลิกราคาลดตามเวลา";
  } else return { error: "กรุณาเลือกสิ่งที่ต้องการแก้" };

  const n = rows.length - skipped;
  await logAdmin(admin.id, "PRODUCT", `แก้หลายรายการ (${n} รายการ): ${note} — ${skus}`);
  await logProductDiffs(admin.id, `แก้หลายรายการ: ${note}`, before);
  refreshStorefront();
  refresh();
  return { ok: `${note} แล้ว ${n} รายการ${skipped ? ` · ข้าม ${skipped} รายการที่เป็น "สอบถามราคา"` : ""}` };
}

// ---------------------------------------------------------------------------
// ลดราคาตามเวลา: ทั้งหมวด / รายสินค้า (A3)
// ---------------------------------------------------------------------------

export async function categorySale(_prev: Lot9State, f: FormData): Promise<Lot9State> {
  const admin = await requireAdmin();
  const cat = await prisma.category.findUnique({ where: { id: str(f, "categoryId", 40) } });
  if (!cat) return { error: "กรุณาเลือกหมวด", fields: ["categoryId"] };
  const products = await prisma.product.findMany({
    where: { categoryId: cat.id, isService: false, ...(f.get("activeOnly") === "on" ? { isActive: true } : {}) },
    select: { id: true, priceSatang: true },
  });
  const before = await snapshot(products.map((p) => p.id));
  if (str(f, "mode", 10) === "clear") {
    const r = await prisma.product.updateMany({ where: { id: { in: products.map((p) => p.id) }, salePriceSatang: { not: null } }, data: { salePriceSatang: null, saleStartsAt: null, saleEndsAt: null } });
    await logAdmin(admin.id, "PRODUCT", `ยกเลิกลดราคาทั้งหมวด "${cat.nameTh}" (${r.count} รายการ)`);
    await logProductDiffs(admin.id, `ยกเลิกลดราคาทั้งหมวด "${cat.nameTh}"`, before);
    refreshStorefront();
    refresh();
    return { ok: `ยกเลิกลดราคาหมวด "${cat.nameTh}" แล้ว ${r.count} รายการ` };
  }
  const pct = Number(str(f, "salePct", 10));
  if (!(pct >= 1 && pct <= 90)) return { error: "ส่วนลดต้องอยู่ระหว่าง 1–90%", fields: ["salePct"] };
  const w = saleWindow(f);
  if (w.error) return { error: w.error, fields: ["saleEndsAt"] };
  if (!w.end) return { error: "กรุณาใส่วันสิ้นสุด (ลดราคาทั้งหมวดต้องมีวันหมดเขต)", fields: ["saleEndsAt"] };
  let n = 0;
  await prisma.$transaction(async (tx) => {
    for (const p of products) {
      if (p.priceSatang <= 0) continue;
      const sale = priceAfterPercent(p.priceSatang, pct);
      if (sale >= p.priceSatang) continue;
      await tx.product.update({ where: { id: p.id }, data: { salePriceSatang: sale, saleStartsAt: w.start, saleEndsAt: w.end } });
      n++;
    }
  });
  await logAdmin(admin.id, "PRODUCT", `ตั้งลดราคาทั้งหมวด "${cat.nameTh}" ${pct}% (${n} รายการ) ${str(f, "saleStartsAt", 30) || "ทันที"} → ${str(f, "saleEndsAt", 30)}`);
  await logProductDiffs(admin.id, `ตั้งลดราคาทั้งหมวด "${cat.nameTh}" ${pct}%`, before);
  refreshStorefront();
  refresh();
  return { ok: `ตั้งลดราคา ${pct}% ให้หมวด "${cat.nameTh}" แล้ว ${n} รายการ` };
}

/** ยกเลิกราคาลดของสินค้าตัวเดียว (หน้า "ลดราคาตามเวลา") */
export async function clearProductSale(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const p = await prisma.product.findUnique({ where: { id }, select: { sku: true } });
  if (!p) return;
  await prisma.product.update({ where: { id }, data: { salePriceSatang: null, saleStartsAt: null, saleEndsAt: null } });
  await logAdmin(admin.id, "PRODUCT", `ยกเลิกราคาลดของสินค้า ${p.sku}`);
  refreshStorefront();
  refresh();
}

// ---------------------------------------------------------------------------
// กลุ่มตัวเลือกสินค้า (A1)
// ---------------------------------------------------------------------------

type MemberIn = { id: string; options: Record<string, string> };

function readMembers(f: FormData, optionNames: string[]): MemberIn[] {
  const ids = [...new Set(f.getAll("member").map((v) => String(v).slice(0, 40)))].slice(0, 60);
  return ids.map((id) => ({
    id,
    options: Object.fromEntries(optionNames.map((n, i) => [n, str(f, `opt_${id}_${i}`, 60)])),
  }));
}

async function saveGroup(groupId: string | null, f: FormData): Promise<Lot9State & { id?: string }> {
  const admin = await requireAdmin();
  const name = str(f, "name", 120);
  if (name.length < 2) return { error: "กรุณาตั้งชื่อกลุ่ม", fields: ["name"] };
  const optionNames = parseOptionNames(str(f, "optionNames", 200));
  if (!optionNames.length) return { error: "กรุณาใส่ชื่อตัวเลือก เช่น สี, วัตต์", fields: ["optionNames"] };
  const members = readMembers(f, optionNames);
  // เพิ่มสินค้าด้วยรหัส (SKU) คั่นด้วย ,
  const addSkus = str(f, "addSkus", 2000).split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 40);
  if (addSkus.length) {
    const found = await prisma.product.findMany({ where: { sku: { in: addSkus, mode: "insensitive" }, isService: false }, select: { id: true, sku: true, variantGroupId: true } });
    const missing = addSkus.filter((s) => !found.some((p) => p.sku.toLowerCase() === s.toLowerCase()));
    if (missing.length) return { error: `ไม่พบรหัสสินค้า: ${missing.join(", ")}`, fields: ["addSkus"] };
    const busy = found.filter((p) => p.variantGroupId && p.variantGroupId !== groupId);
    if (busy.length) return { error: `สินค้าอยู่ในกลุ่มอื่นแล้ว: ${busy.map((p) => p.sku).join(", ")} — เอาออกจากกลุ่มเดิมก่อน`, fields: ["addSkus"] };
    for (const p of found) if (!members.some((m) => m.id === p.id)) members.push({ id: p.id, options: Object.fromEntries(optionNames.map((n) => [n, ""])) });
  }
  if (members.length < 2) return { error: "กลุ่มต้องมีสินค้าอย่างน้อย 2 รายการ" };
  const products = await prisma.product.findMany({ where: { id: { in: members.map((m) => m.id) } }, select: { id: true, sku: true, name: true, variantGroupId: true } });
  if (products.length !== members.length) return { error: "ไม่พบสินค้าบางรายการ" };
  const busy = products.filter((p) => p.variantGroupId && p.variantGroupId !== groupId);
  if (busy.length) return { error: `สินค้าอยู่ในกลุ่มอื่นแล้ว: ${busy.map((p) => p.sku).join(", ")}` };
  // เพิ่งเพิ่มด้วย SKU และยังไม่มีค่า → บันทึกได้ แต่ต้องใส่ค่าก่อนจึงผ่าน — แจ้งให้กรอก
  const label = (id: string) => products.find((p) => p.id === id)!.sku;
  const err = validateGroup(optionNames, members.map((m) => ({ label: label(m.id), options: m.options })));
  // ค่าซ้ำ/ค่าว่างของสินค้าเดิมในกลุ่ม = ไม่บันทึก · สินค้าที่เพิ่งเพิ่มด้วย SKU ยังไม่มีค่า = บันทึกได้แล้วให้กรอกต่อ
  if (err && !addSkus.length) return { error: err };
  const primary = str(f, "primaryId", 40);
  const primaryId = members.some((m) => m.id === primary) ? primary : members[0].id;

  const id = await prisma.$transaction(async (tx) => {
    const g = groupId
      ? await tx.variantGroup.update({ where: { id: groupId }, data: { name, optionNames, primaryId } })
      : await tx.variantGroup.create({ data: { name, optionNames, primaryId } });
    // สมาชิกที่ถูกเอาออก
    await tx.product.updateMany({ where: { variantGroupId: g.id, id: { notIn: members.map((m) => m.id) } }, data: { variantGroupId: null, variantOptions: Prisma.DbNull } });
    for (const m of members) await tx.product.update({ where: { id: m.id }, data: { variantGroupId: g.id, variantOptions: m.options } });
    return g.id;
  });
  await logAdmin(admin.id, "PRODUCT", `${groupId ? "แก้" : "สร้าง"}กลุ่มตัวเลือก "${name}" (${optionNames.join("/")}) — ${members.map((m) => label(m.id)).join(", ")}`);
  refreshStorefront();
  return err ? { id, error: `บันทึกแล้ว แต่ยังแสดงหน้าร้านไม่ครบ: ${err}` } : { id, ok: "บันทึกกลุ่มตัวเลือกแล้ว — หน้าร้านแสดงปุ่มเลือกตัวเลือกทันที" };
}

export async function createVariantGroup(_prev: Lot9State, f: FormData): Promise<Lot9State> {
  const r = await saveGroup(null, f);
  if (r.id) redirect(`/admin/products/variants/${r.id}?${r.error ? "warn=1" : "saved=1"}`);
  return r;
}

export async function updateVariantGroup(_prev: Lot9State, f: FormData): Promise<Lot9State> {
  const id = str(f, "groupId", 40);
  if (!(await prisma.variantGroup.findUnique({ where: { id } }))) return { error: "ไม่พบกลุ่ม" };
  const r = await saveGroup(id, f);
  refresh();
  return { ok: r.ok, error: r.error, fields: r.fields };
}

export async function deleteVariantGroup(f: FormData) {
  const admin = await requireAdmin();
  const id = str(f, "groupId", 40);
  const g = await prisma.variantGroup.findUnique({ where: { id } });
  if (!g) redirect("/admin/products/variants");
  await prisma.$transaction([
    prisma.product.updateMany({ where: { variantGroupId: id }, data: { variantGroupId: null, variantOptions: Prisma.DbNull } }),
    prisma.variantGroup.delete({ where: { id } }),
  ]);
  await logAdmin(admin.id, "PRODUCT", `ยกเลิกกลุ่มตัวเลือก "${g.name}" (สินค้ายังอยู่ครบ แยกเป็นรายการเดี่ยว)`);
  refreshStorefront();
  redirect("/admin/products/variants?deleted=1");
}

/** แก้ราคาหลายตัวเลือกพร้อมกัน: ตั้งราคาเดียวกัน หรือปรับ ±% (ทุกตัวในกลุ่ม หรือเฉพาะที่ติ๊ก) */
export async function groupPrice(_prev: Lot9State, f: FormData): Promise<Lot9State> {
  const admin = await requireAdmin();
  const id = str(f, "groupId", 40);
  const g = await prisma.variantGroup.findUnique({ where: { id } });
  if (!g) return { error: "ไม่พบกลุ่ม" };
  const pick = new Set(f.getAll("pick").map(String));
  const rows: Row[] = await prisma.product.findMany({
    where: { variantGroupId: id, ...(pick.size ? { id: { in: [...pick] } } : {}) },
    select: { id: true, sku: true, priceSatang: true, compareAtSatang: true, salePriceSatang: true, tierPrices: true },
  });
  if (!rows.length) return { error: "ไม่มีสินค้าที่เลือก" };
  const mode = str(f, "priceMode", 10);
  const v = Number(str(f, "priceValue", 20).replace(/[,\s฿%]/g, ""));
  if (!Number.isFinite(v) || (mode === "pct" ? !(v >= -90 && v <= 500 && v !== 0) : !(v > 0 && v < 10_000_000)))
    return { error: mode === "pct" ? "ปรับราคาได้ตั้งแต่ -90% ถึง +500%" : "ราคาไม่ถูกต้อง", fields: ["priceValue"] };
  await prisma.$transaction(async (tx) => {
    for (const p of rows) {
      if (mode === "pct" && p.priceSatang <= 0) continue;
      const price = mode === "pct" ? Math.max(100, Math.round((p.priceSatang * (100 + v)) / 100 / 100) * 100) : Math.round(v * 100);
      await tx.product.update({ where: { id: p.id }, data: repriceData(p, price) });
    }
  });
  const note = mode === "pct" ? `${v > 0 ? "+" : ""}${v}%` : `฿${baht(Math.round(v * 100))}`;
  await logAdmin(admin.id, "PRODUCT", `แก้ราคากลุ่มตัวเลือก "${g.name}" ${note} — ${rows.map((r) => r.sku).join(", ")}`);
  refreshStorefront();
  refresh();
  return { ok: `แก้ราคา ${rows.length} ตัวเลือกแล้ว (${note})` };
}

/** สร้างกลุ่มจากรายการแนะนำ (เจ้าของร้านติ๊กเลือก) — ข้ามสินค้าที่อยู่ในกลุ่มอื่นแล้ว */
export async function createSuggestedGroups(_prev: Lot9State, f: FormData): Promise<Lot9State> {
  const admin = await requireAdmin();
  const keys = new Set(f.getAll("key").map(String));
  if (!keys.size) return { error: "ยังไม่ได้เลือกกลุ่มที่ต้องการสร้าง" };
  const products = await prisma.product.findMany({
    where: { isService: false, variantGroupId: null },
    select: { id: true, name: true, sku: true, categoryId: true, priceSatang: true, isActive: true, category: { select: { nameTh: true } } },
  });
  const sugg = suggestGroups(products.map((p) => ({ ...p, categoryName: p.category.nameTh }))).filter((s) => keys.has(s.key));
  let n = 0;
  for (const s of sugg) {
    const name = str(f, `name_${s.key}`, 120) || s.name;
    await prisma.$transaction(async (tx) => {
      const g = await tx.variantGroup.create({ data: { name, optionNames: s.optionNames.slice(0, MAX_OPTIONS), primaryId: s.members[0].id } });
      for (const m of s.members) await tx.product.update({ where: { id: m.id }, data: { variantGroupId: g.id, variantOptions: m.options } });
    });
    n++;
    await logAdmin(admin.id, "PRODUCT", `สร้างกลุ่มตัวเลือกจากคำแนะนำ "${name}" — ${s.members.map((m) => m.sku).join(", ")}`);
  }
  refreshStorefront();
  refresh();
  return n ? { ok: `สร้างกลุ่มตัวเลือกแล้ว ${n} กลุ่ม` } : { error: "รายการแนะนำเปลี่ยนไปแล้ว — โหลดหน้าใหม่แล้วลองอีกครั้ง" };
}
