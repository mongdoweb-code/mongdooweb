"use server";
// หมวดหมู่สินค้า: เพิ่ม/แก้ไข/เรียงลำดับ/ลบ + ย้อนกลับเวอร์ชัน
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import type { CategoryGroup } from "../../../../../generated/prisma/client";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { baseline, snapshot } from "@/lib/content-version";
import { ICON_KEYS } from "@/lib/icons";
import { prisma } from "@/lib/prisma";
import { recordSlugChange } from "@/lib/redirects";

export type CatState = { error?: string; fields?: string[]; ok?: string };
const GROUPS: CategoryGroup[] = ["WATER", "OUTDOOR", "BUILDING", "DECO"];
const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function saveCategory(_prev: CatState, f: FormData): Promise<CatState> {
  const admin = await requireAdmin();
  await baseline("CATEGORIES", admin.displayName);
  const id = str(f, "id", 40);
  const bad: string[] = [];
  const nameTh = str(f, "nameTh", 80);
  const nameEn = str(f, "nameEn", 80);
  const slug = str(f, "slug", 80).toLowerCase();
  if (nameTh.length < 2) bad.push("nameTh");
  if (!nameEn) bad.push("nameEn");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) bad.push("slug");
  if (await prisma.category.findFirst({ where: { slug, NOT: id ? { id } : undefined } })) bad.push("slug");
  const legacySlug = str(f, "legacySlug", 300).replace(/^.*\/product-category\//, "").replace(/\/+$/, "").split("/").pop() || null;
  if (legacySlug && (await prisma.category.findFirst({ where: { legacySlug, NOT: id ? { id } : undefined } }))) bad.push("legacySlug");
  if (bad.length) return { error: bad.includes("slug") ? "ลิงก์หมวด (slug) ซ้ำหรือรูปแบบไม่ถูกต้อง" : "กรุณาตรวจช่องที่มีกรอบสีแดง", fields: bad };
  const popular = str(f, "popular", 400).split(/[,\n]/).map((s) => s.trim().slice(0, 40)).filter(Boolean).slice(0, 4);
  const data = {
    nameTh,
    nameEn,
    slug,
    legacySlug,
    icon: ICON_KEYS.includes(str(f, "icon")) ? str(f, "icon") : "deco",
    group: GROUPS.includes(str(f, "group") as CategoryGroup) ? (str(f, "group") as CategoryGroup) : "DECO",
    popular,
    description: str(f, "description", 2000) || null,
    showOnHome: f.get("showOnHome") === "on",
    isActive: f.get("isActive") === "on",
  };
  if (id) {
    const prev = await prisma.category.findUnique({ where: { id }, select: { slug: true } });
    await prisma.category.update({ where: { id }, data });
    if (prev && prev.slug !== slug) await recordSlugChange(`/category/${prev.slug}`, `/category/${slug}`); // ลิงก์เดิม → 301 อัตโนมัติ
  }  else {
    const last = await prisma.category.aggregate({ _max: { sortOrder: true } });
    await prisma.category.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  }
  await snapshot("CATEGORIES", admin.displayName);
  await logAdmin(admin.id, "CATEGORY", `${id ? "แก้ไข" : "เพิ่ม"}หมวด ${nameTh}`);
  refreshStorefront();
  if (!id) redirect("/admin/categories?saved=1");
  refresh();
  return { ok: "บันทึกหมวดแล้ว" };
}

export async function moveCategory(f: FormData) {
  const admin = await requireAdmin();
  await baseline("CATEGORIES", admin.displayName);
  const id = str(f, "id", 40);
  const dir = f.get("dir") === "up" ? -1 : 1;
  const list = await prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } });
  const i = list.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await prisma.$transaction(list.map((c, k) => prisma.category.update({ where: { id: c.id }, data: { sortOrder: k + 1 } })));
  await snapshot("CATEGORIES", admin.displayName);
  refreshStorefront();
  refresh();
}

export async function deleteCategory(f: FormData) {
  const admin = await requireOwner();
  await baseline("CATEGORIES", admin.displayName);
  const id = str(f, "id", 40);
  const c = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!c) redirect("/admin/categories");
  if (c._count.products) redirect(`/admin/categories?edit=${id}&err=has-products`);
  await prisma.category.delete({ where: { id } });
  await snapshot("CATEGORIES", admin.displayName);
  await logAdmin(admin.id, "CATEGORY", `ลบหมวด ${c.nameTh}`);
  refreshStorefront();
  redirect("/admin/categories?deleted=1");
}

/** ย้อนกลับ: คืนค่าชื่อ/ไอคอน/กลุ่ม/ลำดับ/การแสดงผล ของหมวดที่ยังมีอยู่ ตามสำเนาที่เลือก */
export async function rollbackCategories(f: FormData) {
  const admin = await requireAdmin();
  const v = await prisma.contentVersion.findUnique({ where: { id: str(f, "versionId", 40) } });
  if (!v || v.kind !== "CATEGORIES" || !Array.isArray(v.snapshot)) redirect("/admin/categories");
  const rows = v.snapshot as { id: string; nameTh: string; nameEn: string; icon: string | null; group: CategoryGroup; popular: string[]; sortOrder: number; isActive: boolean; showOnHome?: boolean; description?: string | null }[];
  const existing = new Set((await prisma.category.findMany({ select: { id: true } })).map((c) => c.id));
  await prisma.$transaction(
    rows.filter((r) => existing.has(r.id)).map((r) =>
      prisma.category.update({
        where: { id: r.id },
        data: { nameTh: r.nameTh, nameEn: r.nameEn, icon: r.icon, group: r.group, popular: r.popular, sortOrder: r.sortOrder, isActive: r.isActive, showOnHome: r.showOnHome ?? true, description: r.description ?? null },
      }),
    ),
  );
  await snapshot("CATEGORIES", admin.displayName);
  await logAdmin(admin.id, "CONTENT_ROLLBACK", `ย้อนหมวดหมู่เป็นเวอร์ชัน ${v.publishedAt.toISOString()}`);
  refreshStorefront();
  redirect("/admin/categories?rolledback=1");
}
