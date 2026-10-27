"use server";
// บทความ (A10): ร่าง / เผยแพร่ / ตั้งเวลา (publishAt ในอนาคต = ขึ้นเองเมื่อถึงเวลา), รูปปก, SEO, แท็ก, สินค้าที่เกี่ยวข้อง
// เปลี่ยน slug ของบทความที่เคยเผยแพร่ → redirect 301 จากลิงก์เดิมอัตโนมัติ · URL เดิมจาก WordPress (legacyPath / ?p=wpId)
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { logAdmin, refreshStorefront } from "@/lib/admin-log";
import { requireAdmin, requireOwner } from "@/lib/auth";
import { SLUG_RE, cleanTags } from "@/lib/blog";
import { prisma } from "@/lib/prisma";
import { invalidateRedirects, normalizePath, recordSlugChange } from "@/lib/redirects";
import { storage } from "@/lib/storage";
import { bkkDateTime, longText, productIdsFromSkus, str, uploadImages, type ContentFormState } from "../_lot10/content-shared";

export async function savePost(_prev: ContentFormState, f: FormData): Promise<ContentFormState> {
  const admin = await requireAdmin();
  const id = str(f, "id", 40);
  const old = id ? await prisma.post.findUnique({ where: { id } }) : null;
  if (id && !old) return { error: "ไม่พบบทความ (อาจถูกลบไปแล้ว)" };
  const bad: string[] = [];
  const title = str(f, "title", 200);
  const slug = str(f, "slug", 100).toLowerCase();
  if (title.length < 3) bad.push("title");
  if (!SLUG_RE.test(slug)) bad.push("slug");
  else if (await prisma.post.findFirst({ where: { slug, NOT: id ? { id } : undefined }, select: { id: true } })) bad.push("slug");
  const status = str(f, "status") === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
  const publishRaw = str(f, "publishAt", 20);
  const publishAt = publishRaw ? bkkDateTime(publishRaw) : null;
  if (publishRaw && !publishAt) bad.push("publishAt");
  let body = longText(f, "body", 100_000);
  if (body.length < 10 && status === "PUBLISHED") bad.push("body");
  const wpRaw = str(f, "wpId", 12);
  const wpId = wpRaw ? Math.floor(Number(wpRaw)) : null;
  if (wpRaw && !(wpId && wpId > 0 && wpId < 2 ** 31)) bad.push("wpId");
  else if (wpId && (await prisma.post.findFirst({ where: { wpId, NOT: id ? { id } : undefined }, select: { id: true } }))) bad.push("wpId");
  const legacyRaw = str(f, "legacyPath", 300);
  let legacyPath: string | null = null;
  if (legacyRaw) {
    const m = /^https?:\/\/[^/]+(\/.*)?$/i.exec(legacyRaw);
    const p = normalizePath(m ? (m[1] ?? "/") : legacyRaw);
    if (!p.startsWith("/") || p === "/" || /^\/(admin|api|blog|product|category|_next|media)(\/|$)/.test(p)) bad.push("legacyPath");
    else if (await prisma.post.findFirst({ where: { legacyPath: p, NOT: id ? { id } : undefined }, select: { id: true } })) bad.push("legacyPath");
    else legacyPath = p;
  }
  const { ids: productIds, missing } = await productIdsFromSkus(str(f, "products", 2000));
  if (missing.length) bad.push("products");
  if (bad.length) {
    const msg: Record<string, string> = {
      title: "กรุณากรอกหัวข้อบทความ",
      slug: "ลิงก์บทความ (slug) ซ้ำหรือรูปแบบไม่ถูกต้อง — ใช้ a-z 0-9 และ - เท่านั้น",
      publishAt: "วันเวลาเผยแพร่ไม่ถูกต้อง",
      body: "เนื้อหาสั้นเกินไปสำหรับการเผยแพร่",
      wpId: "ID บทความเดิม (WordPress) ไม่ถูกต้องหรือซ้ำกับบทความอื่น",
      legacyPath: "URL เดิมไม่ถูกต้องหรือซ้ำกับบทความอื่น (ต้องเป็น path เช่น /2019/05/ชื่อบทความ/)",
      products: `ไม่พบรหัสสินค้า: ${missing.join(", ")}`,
    };
    return { error: msg[bad[0]], fields: bad };
  }

  // รูปปก (ใหม่แทนของเดิม) + รูปในเนื้อหา (ต่อท้ายเนื้อหาเป็นบรรทัด ![](...))
  const cover = await uploadImages(f, "cover", "posts", 1);
  if (cover.error) return { error: cover.error, fields: ["cover"] };
  const inline = await uploadImages(f, "bodyImages", "posts", 10);
  if (inline.error) return { error: inline.error, fields: ["bodyImages"] };
  if (inline.keys.length) body = `${body}\n\n${inline.keys.map((k) => `![](/media/${k})`).join("\n\n")}`.trim();
  const removeCover = f.get("removeCover") === "on";
  const coverKey = cover.keys[0] ?? (removeCover ? null : (old?.coverKey ?? null));

  const data = {
    title,
    slug,
    excerpt: str(f, "excerpt", 300) || null,
    body,
    coverKey,
    seoTitle: str(f, "seoTitle", 120) || null,
    seoDescription: str(f, "seoDescription", 300) || null,
    status: status as "DRAFT" | "PUBLISHED",
    // เผยแพร่โดยไม่ระบุเวลา = ตอนนี้ (เก็บเวลาไว้เรียงลำดับ/แสดงวันที่)
    publishAt: publishAt ?? (status === "PUBLISHED" ? (old?.publishAt ?? new Date()) : null),
    tags: cleanTags(str(f, "tags", 400)),
    productIds,
    wpId,
    legacyPath,
    authorName: str(f, "authorName", 80) || null,
  };
  const saved = old ? await prisma.post.update({ where: { id: old.id }, data }) : await prisma.post.create({ data });
  // ลิงก์เดิมของบทความที่เคยเผยแพร่ → 301 ไปลิงก์ใหม่
  if (old && old.slug !== slug && old.status === "PUBLISHED") await recordSlugChange(`/blog/${old.slug}`, `/blog/${slug}`);
  if (old?.coverKey && old.coverKey !== coverKey) await Promise.all([old.coverKey, old.coverKey.replace(/\.webp$/, "-sm.webp")].map((k) => storage().delete(k).catch(() => {})));
  invalidateRedirects();
  const when = data.publishAt && data.publishAt.getTime() > Date.now() ? "ตั้งเวลา" : data.status === "PUBLISHED" ? "เผยแพร่" : "ร่าง";
  await logAdmin(admin.id, "POST", `${old ? "แก้ไข" : "เพิ่ม"}บทความ "${title}" (${when})`);
  refreshStorefront();
  if (!old) redirect(`/admin/posts/${saved.id}?saved=1`);
  refresh();
  return { n: Date.now(), body, ok: when === "ตั้งเวลา" ? "บันทึกแล้ว — บทความจะขึ้นหน้าเว็บเองตามเวลาที่ตั้ง" : when === "เผยแพร่" ? "บันทึกแล้ว — บทความแสดงบนหน้าเว็บแล้ว" : "บันทึกฉบับร่างแล้ว (ยังไม่แสดงบนหน้าเว็บ)" };
}

export async function deletePost(f: FormData) {
  const admin = await requireOwner();
  const p = await prisma.post.findUnique({ where: { id: String(f.get("id") ?? "").slice(0, 40) } });
  if (p) {
    await prisma.post.delete({ where: { id: p.id } });
    if (p.coverKey) await Promise.all([p.coverKey, p.coverKey.replace(/\.webp$/, "-sm.webp")].map((k) => storage().delete(k).catch(() => {})));
    invalidateRedirects();
    await logAdmin(admin.id, "POST", `ลบบทความ "${p.title}"`);
    refreshStorefront();
  }
  redirect("/admin/posts?deleted=1");
}
