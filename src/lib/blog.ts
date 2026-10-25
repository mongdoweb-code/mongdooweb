// บทความ (/blog — U13/A10) และผลงานติดตั้ง (/projects — U12/A9)
// - ข้อมูลแคชไว้ (tag storefront) แต่ "ถึงเวลาเผยแพร่หรือยัง" ตัดสินตอนเปิดหน้า (visibleNow) — บทความที่ตั้งเวลาไว้
//   จึงขึ้นเองตรงเวลาโดยไม่ต้องกดอะไร และไม่หลุดออกก่อนเวลาแม้แคชยังไม่หมดอายุ
// - เนื้อหาใช้รูปแบบเดียวกับหน้าเนื้อหา (renderBody: หัวข้อ ## รายการ - ตัวหนา ** ลิงก์ [ข้อความ](/path))
//   + บรรทัดรูป ![คำบรรยาย](/media/posts/...) — escape ทุกอย่าง ไม่มี HTML จากผู้แก้หลุดออกไป
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { renderBody } from "@/lib/content";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG } from "@/lib/settings";

export const POSTS_PER_PAGE = 9;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** รูปในเนื้อหา: เฉพาะรูปที่อัปโหลด (/media/...) หรือ https:// */
export function safeImageSrc(src: string) {
  const s = src.trim();
  if (/^\/media\/[a-z0-9][a-z0-9/_-]*\.(webp|jpg|png)$/i.test(s)) return s;
  if (/^https:\/\/[^\s"'<>()]+$/i.test(s)) return s;
  return null;
}

/** เนื้อหาบทความ/ผลงาน → HTML (renderBody + บรรทัดรูป) */
export function renderArticle(body: string) {
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) out.push(renderBody(buf.join("\n")));
    buf = [];
  };
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    const m = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    const src = m ? safeImageSrc(m[2]) : null;
    if (m && src) {
      flush();
      const alt = m[1].trim().slice(0, 200);
      out.push(
        `<figure><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">${alt ? `<figcaption>${esc(alt)}</figcaption>` : ""}</figure>`,
      );
    } else buf.push(m ? "" : line);
  }
  flush();
  return out.join("\n");
}

/** ข้อความล้วนสำหรับ meta description / ตัวอย่าง */
export function articleText(body: string, max = 160) {
  const t = body
    .replace(/^\s*!\[[^\]]*\]\([^)]*\)\s*$/gm, "")
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*(#{2,3}|[-•]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** เผยแพร่แล้วและถึงเวลา */
export const isLive = (p: { status: string; publishAt: string | Date | null }, now = Date.now()) =>
  p.status === "PUBLISHED" && (!p.publishAt || new Date(p.publishAt).getTime() <= now);

export function visibleNow<T extends { publishAt: string | null }>(list: T[], now = Date.now()) {
  return list.filter((p) => !p.publishAt || new Date(p.publishAt).getTime() <= now);
}

export const thaiDay = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Bangkok" });

/** แท็ก: ตัดช่องว่างซ้ำ ≤ 30 ตัว ≤ 10 แท็ก */
export const cleanTags = (raw: string) =>
  [...new Set(raw.split(/[,\n]+/).map((t) => t.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, 30)).filter(Boolean))].slice(0, 10);

export type PostCard = {
  slug: string;
  title: string;
  excerpt: string;
  cover: { full: string; sm: string } | null;
  tags: string[];
  publishAt: string | null;
  date: string;
};

/** บทความที่สถานะ "เผยแพร่" ทั้งหมด (รวมที่ตั้งเวลาไว้ในอนาคต — กรองด้วย visibleNow ตอนแสดง) เรียงใหม่ → เก่า */
export async function getPublishedPosts(): Promise<PostCard[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const rows = await prisma.post.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ publishAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { slug: true, title: true, excerpt: true, body: true, coverKey: true, tags: true, publishAt: true, createdAt: true },
    take: 500,
  });
  return rows.map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt?.trim() || articleText(p.body, 140),
    cover: p.coverKey ? { full: mediaUrl(p.coverKey)!, sm: mediaUrl(p.coverKey, "sm")! } : null,
    tags: p.tags,
    publishAt: p.publishAt?.toISOString() ?? null,
    date: (p.publishAt ?? p.createdAt).toISOString(),
  }));
}

/** บทความเต็ม (สถานะเผยแพร่) — ผู้เรียกต้องตรวจ isLive เอง */
export async function getPost(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const p = await prisma.post.findFirst({ where: { slug, status: "PUBLISHED" } });
  if (!p) return null;
  const products = p.productIds.length
    ? await prisma.product.findMany({ where: { id: { in: p.productIds }, isActive: true }, select: { id: true, slug: true } })
    : [];
  return {
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    html: renderArticle(p.body),
    text: articleText(p.body, 5000),
    cover: p.coverKey ? { full: mediaUrl(p.coverKey)!, sm: mediaUrl(p.coverKey, "sm")! } : null,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription || p.excerpt || articleText(p.body, 155),
    status: p.status,
    publishAt: p.publishAt?.toISOString() ?? null,
    date: (p.publishAt ?? p.createdAt).toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    tags: p.tags,
    authorName: p.authorName,
    productSlugs: p.productIds.map((id) => products.find((x) => x.id === id)?.slug).filter((s): s is string => !!s),
  };
}

// ---------- ผลงานติดตั้ง ----------

export type ProjectCard = { slug: string; title: string; summary: string; kind: string | null; location: string | null; cover: { full: string; sm: string } | null; photos: number };

export async function getProjects(): Promise<ProjectCard[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const rows = await prisma.project.findMany({
    where: { isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: { slug: true, title: true, summary: true, body: true, kind: true, location: true, images: true },
  });
  return rows.map((p) => ({
    slug: p.slug,
    title: p.title,
    summary: p.summary?.trim() || articleText(p.body, 120),
    kind: p.kind,
    location: p.location,
    cover: p.images[0] ? { full: mediaUrl(p.images[0])!, sm: mediaUrl(p.images[0], "sm")! } : null,
    photos: p.images.length,
  }));
}

export async function getProject(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const p = await prisma.project.findFirst({ where: { slug, isPublished: true } });
  if (!p) return null;
  const products = p.productIds.length
    ? await prisma.product.findMany({ where: { id: { in: p.productIds }, isActive: true }, select: { id: true, slug: true } })
    : [];
  return {
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    html: renderArticle(p.body),
    description: p.summary?.trim() || articleText(p.body, 155),
    kind: p.kind,
    location: p.location,
    images: p.images.map((k) => ({ full: mediaUrl(k)!, sm: mediaUrl(k, "sm")! })),
    date: (p.publishedAt ?? p.createdAt).toISOString(),
    productSlugs: p.productIds.map((id) => products.find((x) => x.id === id)?.slug).filter((s): s is string => !!s),
  };
}

/** ข้อมูลสำหรับ sitemap (บทความเฉพาะที่ถึงเวลาแล้ว ณ ตอนสร้าง sitemap) */
export async function sitemapContent() {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const [posts, projects] = await Promise.all([
    prisma.post.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, status: true, publishAt: true, updatedAt: true } }),
    prisma.project.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
  ]);
  return {
    posts: posts.map((p) => ({ slug: p.slug, publishAt: p.publishAt?.toISOString() ?? null, at: p.updatedAt.toISOString() })),
    projects: projects.map((p) => ({ slug: p.slug, at: p.updatedAt.toISOString() })),
  };
}
