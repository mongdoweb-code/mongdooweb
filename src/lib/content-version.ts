// เก็บสำเนาสไลด์/หมวดหมู่/เนื้อหาหน้า ทุกครั้งที่บันทึก (ContentVersion) เพื่อ "ย้อนกลับเป็นเวอร์ชันก่อนหน้า"
// - SLIDES / CATEGORIES: snapshot = รายการแถวทั้งชุด (array)
// - PAGES: snapshot = { pages: Page[], faq: [{q,a}] } (หน้าเนื้อหาทั้งหมด + คำถามที่พบบ่อยในตั้งค่าร้าน)
import "server-only";
import type { ContentKind } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";

const KEEP = 30;

export type FaqItem = { q: string; a: string };
export type PagesSnapshot = { pages: { slug: string; title: string; body: string; updatedBy: string | null }[]; faq: FaqItem[] };

/** อ่าน FAQ จาก JSON ในตั้งค่าร้าน (กรองค่าที่ไม่ถูกต้องทิ้ง) */
export function parseFaq(v: unknown): FaqItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is FaqItem => !!x && typeof x === "object" && typeof (x as FaqItem).q === "string" && typeof (x as FaqItem).a === "string")
    .map((x) => ({ q: x.q, a: x.a }));
}

export function asPagesSnapshot(v: unknown): PagesSnapshot | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Partial<PagesSnapshot>;
  if (!Array.isArray(o.pages)) return null;
  return {
    pages: o.pages.filter((p) => p && typeof p.slug === "string" && typeof p.body === "string").map((p) => ({ slug: p.slug, title: String(p.title ?? ""), body: p.body, updatedBy: p.updatedBy ?? null })),
    faq: parseFaq(o.faq),
  };
}

async function dataOf(kind: ContentKind) {
  if (kind === "SLIDES") return prisma.heroSlide.findMany({ orderBy: { sortOrder: "asc" } });
  if (kind === "CATEGORIES") return prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
  const [pages, s] = await Promise.all([prisma.page.findMany({ orderBy: { slug: "asc" } }), prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { faq: true } })]);
  const snap: PagesSnapshot = { pages: pages.map((p) => ({ slug: p.slug, title: p.title, body: p.body, updatedBy: p.updatedBy })), faq: parseFaq(s?.faq) };
  return snap;
}

export async function snapshot(kind: ContentKind, publishedBy: string) {
  const data = await dataOf(kind);
  await prisma.contentVersion.create({ data: { kind, snapshot: JSON.parse(JSON.stringify(data)), publishedBy } });
  // เก็บแค่ 30 เวอร์ชันล่าสุด
  const old = await prisma.contentVersion.findMany({ where: { kind }, orderBy: { publishedAt: "desc" }, skip: KEEP, select: { id: true } });
  if (old.length) await prisma.contentVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

export async function listVersions(kind: ContentKind, take = 10) {
  return prisma.contentVersion.findMany({ where: { kind }, orderBy: { publishedAt: "desc" }, take, select: { id: true, publishedAt: true, publishedBy: true, snapshot: true } });
}

/** ก่อนแก้ครั้งแรก เก็บสภาพเดิมไว้ก่อน เพื่อให้ย้อนกลับไปค่าเริ่มต้นได้ */
export async function baseline(kind: ContentKind, by: string) {
  if (!(await prisma.contentVersion.count({ where: { kind } }))) await snapshot(kind, `${by} (ก่อนแก้ไข)`);
}

/** คืนเนื้อหาหน้าทั้งหมด + FAQ ตามเวอร์ชันที่เลือก (หน้าที่ไม่มีในเวอร์ชันนั้น = กลับไปใช้ค่าเริ่มต้น) */
export async function restorePages(snap: PagesSnapshot, by: string) {
  await prisma.$transaction([
    prisma.page.deleteMany({ where: { slug: { notIn: snap.pages.map((p) => p.slug) } } }),
    ...snap.pages.map((p) =>
      prisma.page.upsert({ where: { slug: p.slug }, create: { slug: p.slug, title: p.title, body: p.body, updatedBy: by }, update: { title: p.title, body: p.body, updatedBy: by } }),
    ),
    prisma.shopSetting.update({ where: { id: "shop" }, data: { faq: snap.faq } }),
  ]);
}
