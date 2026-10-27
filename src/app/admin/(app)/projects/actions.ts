"use server";
// ผลงานติดตั้ง (A9): รูปงานจริง (เรียง/ลบ/เพิ่ม) ประเภทงาน สถานที่ รายละเอียด สินค้าที่ใช้ เผยแพร่/ซ่อน
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { SLUG_RE } from "@/lib/blog";
import { prisma } from "@/lib/prisma";
import { recordSlugChange } from "@/lib/redirects";
import { storage } from "@/lib/storage";
import { longText, productIdsFromSkus, str, uploadImages, type ContentFormState } from "../_lot10/content-shared";

const delKeys = (keys: string[]) =>
  Promise.all(keys.flatMap((k) => [k, k.replace(/\.webp$/, "-sm.webp")]).map((k) => storage().delete(k).catch(() => {})));

export async function saveProject(_prev: ContentFormState, f: FormData): Promise<ContentFormState> {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const old = id ? await prisma.project.findUnique({ where: { id } }) : null;
  if (id && !old) return { error: "ไม่พบผลงาน (อาจถูกลบไปแล้ว)" };
  const bad: string[] = [];
  const title = str(f, "title", 200);
  const slug = str(f, "slug", 100).toLowerCase();
  if (title.length < 3) bad.push("title");
  if (!SLUG_RE.test(slug)) bad.push("slug");
  else if (await prisma.project.findFirst({ where: { slug, NOT: id ? { id } : undefined }, select: { id: true } })) bad.push("slug");
  const { ids: productIds, missing } = await productIdsFromSkus(str(f, "products", 2000));
  if (missing.length) bad.push("products");
  // รูปเดิมที่เก็บไว้ (ตามลำดับที่จัด) — รับเฉพาะ key ที่เป็นของผลงานนี้จริง
  let keep: string[] = [];
  try {
    const raw = JSON.parse(String(f.get("images") ?? "[]"));
    keep = Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string" && !!old?.images.includes(k)) : [];
  } catch {}
  if (bad.length) {
    const msg: Record<string, string> = {
      title: "กรุณากรอกชื่อผลงาน",
      slug: "ลิงก์ผลงาน (slug) ซ้ำหรือรูปแบบไม่ถูกต้อง — ใช้ a-z 0-9 และ - เท่านั้น",
      products: `ไม่พบรหัสสินค้า: ${missing.join(", ")}`,
    };
    return { error: msg[bad[0]], fields: bad };
  }
  const up = await uploadImages(f, "newImages", "projects", 20);
  if (up.error) {
    await delKeys(up.keys);
    return { error: up.error, fields: ["newImages"] };
  }
  const images = [...keep, ...up.keys].slice(0, 40);
  const isPublished = f.get("isPublished") === "on";
  const data = {
    title,
    slug,
    kind: str(f, "kind", 60) || null,
    location: str(f, "location", 120) || null,
    summary: str(f, "summary", 300) || null,
    body: longText(f, "body", 50_000),
    images,
    productIds,
    isPublished,
    sortOrder: Math.max(-9999, Math.min(9999, Math.floor(Number(str(f, "sortOrder", 6)) || 0))),
    publishedAt: isPublished ? (old?.publishedAt ?? new Date()) : (old?.publishedAt ?? null),
  };
  const saved = old ? await prisma.project.update({ where: { id: old.id }, data }) : await prisma.project.create({ data });
  if (old && old.slug !== slug && old.isPublished) await recordSlugChange(`/projects/${old.slug}`, `/projects/${slug}`);
  if (old) await delKeys(old.images.filter((k) => !images.includes(k)));
  await logAdmin(admin.id, "PROJECT", `${old ? "แก้ไข" : "เพิ่ม"}ผลงาน "${title}" (${isPublished ? "เผยแพร่" : "ซ่อน"}, รูป ${images.length})`);
  refreshStorefront();
  if (!old) redirect(`/admin/projects/${saved.id}?saved=1`);
  refresh();
  return { n: Date.now(), ok: isPublished ? "บันทึกแล้ว — แสดงในหน้าผลงานแล้ว" : "บันทึกแล้ว (ซ่อนอยู่ ยังไม่แสดงบนหน้าเว็บ)" };
}

export async function deleteProject(f: FormData) {
  const admin = await requireOwner();
  const p = await prisma.project.findUnique({ where: { id: String(f.get("id") ?? "").slice(0, 40) } });
  if (p) {
    await prisma.project.delete({ where: { id: p.id } });
    await delKeys(p.images);
    await logAdmin(admin.id, "PROJECT", `ลบผลงาน "${p.title}"`);
    refreshStorefront();
  }
  redirect("/admin/projects?deleted=1");
}
