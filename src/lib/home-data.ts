// ค่าหน้าแรก (ลำดับส่วน + ส่วนความน่าเชื่อถือ) จาก ShopSetting — แคช ล้างด้วย tag storefront เมื่อบันทึกใน /admin/home
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { parseHomeSections, parseTrust } from "@/lib/home";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG } from "@/lib/settings";
import { POPULAR_BG, POPULAR_BG_KEYS, parsePopular, type PopularItem } from "@/lib/popular-cats";
import { getShopData } from "@/lib/storefront";

export async function getHomeConfig() {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const s = await prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { homeSections: true, trust: true } });
  const trust = parseTrust(s?.trust);
  return {
    sections: parseHomeSections(s?.homeSections),
    trust: { ...trust, logos: trust.logos.map((l) => ({ ...l, url: mediaUrl(l.key, "sm")! })) },
  };
}

/** การ์ดหมวดยอดนิยมที่พร้อมแสดง: ตามที่ตั้งใน /admin/home/popular (หมวดที่ปิด/ไม่มีสินค้าถูกข้าม)
 *  ยังไม่ได้ตั้ง = เลือกให้อัตโนมัติจากหมวดที่แสดงบนหน้าแรก 8 หมวดแรก (ลิงก์ = คำยอดนิยมที่กดแล้วเจอสินค้าจริง) */
export async function getPopularCards() {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const [s, { categories }] = await Promise.all([prisma.shopSetting.findUnique({ where: { id: "shop" }, select: { popularCats: true } }), getShopData()]);
  const cfg = parsePopular(s?.popularCats);
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const auto = !cfg.items.length;
  const items: PopularItem[] = auto
    ? categories
        .filter((c) => c.visible && c.count > 0)
        .slice(0, 8)
        .map((c, i) => ({ cat: c.slug, bg: POPULAR_BG_KEYS[i % POPULAR_BG_KEYS.length], links: (c.tags ?? []).map((t) => ({ label: t.t, href: t.h })) }))
    : cfg.items;
  const cards = items.flatMap((it) => {
    const c = bySlug.get(it.cat);
    if (!c || c.count <= 0) return [];
    return [{ slug: c.slug, title: c.th, en: c.en, img: c.img ?? null, count: c.count, bg: POPULAR_BG[it.bg].color, links: it.links }];
  });
  return { title: cfg.title, cards, auto };
}
