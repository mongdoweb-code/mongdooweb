"use server";
// เนื้อหาหน้า (Page CMS) + คำถามที่พบบ่อย (FAQ): บันทึก, กลับไปใช้ค่าเริ่มต้น, ย้อนเวอร์ชัน, ตัวอย่างสด
// ทุกการบันทึกเก็บสำเนา ContentVersion (kind PAGES = ทุกหน้า + FAQ) และล้างแคชหน้าร้านทันที
import { redirect } from "next/navigation";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin } from "@/lib/auth";
import { PAGE_TITLES, isPageSlug, renderBody } from "@/lib/content";
import { asPagesSnapshot, baseline, restorePages, snapshot, type FaqItem } from "@/lib/content-version";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { pageVars } from "./vars";

export type PageState = { ok?: string; error?: string; fields?: string[] };
const MAX_BODY = 30_000;
const MAX_FAQ = 60;

/** ตัวอย่างสดของตัวแก้ไข — ใช้ตัวแปลงเดียวกับหน้าร้าน (escape ทุกอย่าง ไม่มี HTML จากผู้แก้หลุดออกไป) */
export async function previewBody(body: string) {
  await requireAdmin();
  const s = await getSettings();
  return renderBody(String(body ?? "").slice(0, MAX_BODY), pageVars(s));
}

export async function savePage(_prev: PageState, f: FormData): Promise<PageState> {
  const admin = await requireAdmin();
  const slug = String(f.get("slug") ?? "");
  if (!isPageSlug(slug)) return { error: "ไม่พบหน้านี้" };
  const title = String(f.get("title") ?? "").trim().slice(0, 120);
  const body = String(f.get("body") ?? "").replace(/\r\n?/g, "\n").trimEnd();
  if (title.length < 2) return { error: "กรอกชื่อหน้า", fields: ["title"] };
  if (!body.trim()) return { error: "เนื้อหาว่าง — ถ้าต้องการใช้ข้อความเริ่มต้นของระบบ กด \"กลับไปใช้ค่าเริ่มต้น\"", fields: ["body"] };
  if (body.length > MAX_BODY) return { error: `เนื้อหายาวเกิน ${MAX_BODY.toLocaleString()} ตัวอักษร`, fields: ["body"] };
  await baseline("PAGES", admin.displayName);
  await prisma.page.upsert({ where: { slug }, create: { slug, title, body, updatedBy: admin.displayName }, update: { title, body, updatedBy: admin.displayName } });
  await snapshot("PAGES", admin.displayName);
  await logAdmin(admin.id, "PAGES", `แก้หน้า "${title}" (/${slug}, ${body.length} ตัวอักษร)`);
  refreshStorefront();
  redirect(`/admin/pages?p=${slug}&saved=1`);
}

export async function resetPage(f: FormData) {
  const admin = await requireAdmin();
  const slug = String(f.get("slug") ?? "");
  if (!isPageSlug(slug)) redirect("/admin/pages");
  await baseline("PAGES", admin.displayName);
  await prisma.page.deleteMany({ where: { slug } });
  await snapshot("PAGES", admin.displayName);
  await logAdmin(admin.id, "PAGES", `กลับไปใช้เนื้อหาเริ่มต้นของหน้า "${PAGE_TITLES[slug]}"`);
  refreshStorefront();
  redirect(`/admin/pages?p=${slug}&reset=1`);
}

export async function saveFaq(_prev: PageState, f: FormData): Promise<PageState> {
  const admin = await requireAdmin();
  let raw: unknown;
  try {
    raw = JSON.parse(String(f.get("faq") ?? "[]").slice(0, 200_000));
  } catch {
    return { error: "ข้อมูลไม่ถูกต้อง" };
  }
  if (!Array.isArray(raw)) return { error: "ข้อมูลไม่ถูกต้อง" };
  const items: FaqItem[] = raw.map((x) => ({ q: String(x?.q ?? "").trim().slice(0, 300), a: String(x?.a ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 3000) }));
  const bad = items.map((x, i) => (!x.q || !x.a ? i : -1)).filter((i) => i >= 0);
  if (bad.length) return { error: `กรอกทั้งคำถามและคำตอบ (ข้อที่ ${bad.map((i) => i + 1).join(", ")})`, fields: bad.map((i) => `faq-${i}`) };
  if (items.length > MAX_FAQ) return { error: `ใส่ได้ไม่เกิน ${MAX_FAQ} ข้อ` };
  await baseline("PAGES", admin.displayName);
  await prisma.shopSetting.update({ where: { id: "shop" }, data: { faq: items } });
  await snapshot("PAGES", admin.displayName);
  await logAdmin(admin.id, "FAQ", `บันทึกคำถามที่พบบ่อย ${items.length} ข้อ`);
  refreshStorefront();
  redirect(`/admin/pages?p=faq&saved=${items.length}`);
}

export async function rollbackPages(f: FormData) {
  const admin = await requireAdmin();
  const back = String(f.get("back") ?? "privacy").slice(0, 20);
  const v = await prisma.contentVersion.findUnique({ where: { id: String(f.get("id") ?? "").slice(0, 40) } });
  const snap = v?.kind === "PAGES" ? asPagesSnapshot(v.snapshot) : null;
  if (!v || !snap) redirect(`/admin/pages?p=${back}`);
  await restorePages(snap, admin.displayName);
  await snapshot("PAGES", `${admin.displayName} (ย้อนเวอร์ชัน)`);
  await logAdmin(admin.id, "CONTENT_ROLLBACK", `ย้อนหน้าเนื้อหา/FAQ เป็นเวอร์ชัน ${v.publishedAt.toISOString()}`);
  refreshStorefront();
  redirect(`/admin/pages?p=${back}&rolled=1`);
}
