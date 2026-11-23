"use server";
// Data Sheet ในฟอร์มสินค้า: คัดลอกจากสินค้าอื่น · บันทึกเป็นแม่แบบของหมวด (หัวข้อ/กลุ่ม ไม่มีค่า)
import { logAdmin } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { parseDatasheet, toTemplate, type DsGroup } from "@/lib/datasheet";
import { prisma } from "@/lib/prisma";

/** Data Sheet ของสินค้าอื่น (ใช้คัดลอกมาแก้ต่อ) */
export async function loadDatasheet(productId: string): Promise<{ groups?: DsGroup[]; note?: string; name?: string; error?: string }> {
  await requireAdmin();
  const p = await prisma.product.findUnique({ where: { id: String(productId ?? "").slice(0, 40) }, select: { name: true, datasheet: true } });
  if (!p) return { error: "ไม่พบสินค้า" };
  const ds = parseDatasheet(p.datasheet);
  if (!ds.groups.length) return { error: "สินค้านี้ยังไม่มี Data Sheet" };
  return { groups: ds.groups, note: ds.note, name: p.name };
}

/** บันทึกหัวข้อ/กลุ่มปัจจุบันเป็นแม่แบบของหมวด — สินค้าใหม่ในหมวดนี้กด "ใช้แม่แบบหมวด" ได้ */
export async function saveCategoryTemplate(categoryId: string, groups: unknown): Promise<{ ok?: string; error?: string; template?: DsGroup[] }> {
  const admin = await requireAdmin();
  const c = await prisma.category.findUnique({ where: { id: String(categoryId ?? "").slice(0, 40) }, select: { id: true, nameTh: true } });
  if (!c) return { error: "เลือกหมวดของสินค้าก่อน" };
  const tpl = toTemplate(Array.isArray(groups) ? (groups as DsGroup[]).filter((g) => g && Array.isArray(g.rows)) : []);
  if (!tpl.length) return { error: "ยังไม่มีหัวข้อให้บันทึกเป็นแม่แบบ" };
  await prisma.category.update({ where: { id: c.id }, data: { datasheetTemplate: { groups: tpl } } });
  await logAdmin(admin.id, "CATEGORY", `แม่แบบ Data Sheet หมวด ${c.nameTh}: ${tpl.reduce((n, g) => n + g.rows.length, 0)} หัวข้อ`, { entity: `Category:${c.id}` });
  return { ok: `บันทึกเป็นแม่แบบหมวด “${c.nameTh}” แล้ว`, template: tpl };
}
