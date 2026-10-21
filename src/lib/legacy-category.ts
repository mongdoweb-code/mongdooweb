// ใช้ใน src/proxy.ts: /category/<slug> ที่ไม่ใช่หมวดที่เปิดอยู่ (เช่น หมวดบทความ WordPress เดิม "/category/news/"
// หรือ slug ภาษาไทยของหมวดเดิม) → ตอบ 301 ก่อนเริ่มส่งหน้า (redirect ในหน้าเพจที่ stream แล้วจะกลายเป็น 200 + JS)
// เก็บรายชื่อ slug ที่เปิดอยู่ไว้ในหน่วยความจำ 5 นาที · slug ที่ไม่อยู่ในรายการจะถามฐานข้อมูลอีกครั้งเสมอ
// (หมวดที่เพิ่งเพิ่มในหลังบ้านจึงเปิดได้ทันที)
import { prisma } from "@/lib/prisma";

const TTL = 5 * 60_000;
let cache: { at: number; slugs: Set<string> } | null = null;

async function activeSlugs(force = false) {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.slugs;
  const rows = await prisma.category.findMany({ where: { isActive: true }, select: { slug: true } });
  cache = { at: Date.now(), slugs: new Set(rows.map((r) => r.slug)) };
  return cache.slugs;
}

/**
 * เงื่อนไขค้น Category.legacySlug จาก slug เดิม (ถอดรหัสแล้ว) — ข้อมูลเก็บได้ทั้งแบบถอดรหัส (นำเข้า WooCommerce)
 * และแบบ %e0%b8... ตัวเล็ก/ใหญ่ (seed) บางหมวดเก็บทั้ง path เช่น "ไฟแอลอีดี/สปอร์ตไลท์-flood-light"
 */
export function legacySlugWhere(slug: string) {
  const s = slug.normalize("NFC");
  const enc = encodeURIComponent(s);
  const forms = [...new Set([s, enc, enc.toLowerCase()])];
  return { OR: [{ legacySlug: { in: forms } }, ...forms.map((f) => ({ legacySlug: { endsWith: `/${f}` } }))] };
}

/** null = เป็นหมวดที่เปิดอยู่ (ให้หน้าเพจทำงานตามปกติ) · string = path ปลายทางของ redirect 301 */
export async function categoryRedirect(slug: string): Promise<string | null> {
  try {
    if ((await activeSlugs()).has(slug)) return null;
    if ((await activeSlugs(true)).has(slug)) return null;
    const legacy = await prisma.category.findFirst({
      where: { ...legacySlugWhere(slug), isActive: true },
      select: { slug: true },
    });
    return legacy ? `/category/${encodeURIComponent(legacy.slug)}` : "/products";
  } catch {
    // ฐานข้อมูลมีปัญหา → ปล่อยให้หน้าเพจจัดการเอง
    return null;
  }
}
