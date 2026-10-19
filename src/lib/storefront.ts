// ข้อมูลหน้าร้านจากฐานข้อมูล แปลงเป็นรูปแบบเดียวกับต้นแบบ (CATALOG / DEFAULT_CATEGORIES / DEFAULT_SLIDES)
// เพื่อให้สคริปต์ที่ย้ายมา (public/js/*.js) ใช้ได้โดยไม่ต้องแก้ตรรกะ
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/prisma";

/** tag ของข้อมูลหน้าร้าน — หลังบ้านเรียก updateTag(STOREFRONT_TAG) หลังแก้สินค้า/หมวด/สไลด์/ตั้งค่า */
export const STOREFRONT_TAG = "storefront";

export const bahtFromSatang = (satang: number) => satang / 100;

/** สินค้าแบบ CATALOG ของต้นแบบ: id = slug, price = บาท */
export type CatalogItem = {
  id: string;
  name: string;
  cat: string;
  catId: string;
  specs: string[];
  price: number;
  badge?: string;
  best?: boolean;
  use: string[];
  color: "white" | "rgb" | "any";
  kit?: boolean;
  acc?: boolean;
};

export type ShopCategory = {
  id: string;
  th: string;
  en: string;
  icon: string;
  group: string;
  slug: string;
  popular: string[];
  visible: boolean;
  order: number;
};

/** specs ในฐานข้อมูลเป็น [{label, value}] — หน้าร้านแสดงแค่ value */
export function specValues(specs: unknown): string[] {
  if (!Array.isArray(specs)) return [];
  return specs
    .map((s) => (s && typeof s === "object" && "value" in s ? String((s as { value: unknown }).value) : ""))
    .filter(Boolean);
}

export async function getShopData() {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);

  const [categories, products, settings] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({
      where: { isActive: true, isService: false, category: { isActive: true } },
      orderBy: [{ isBestSeller: "desc" }, { createdAt: "asc" }],
      include: { category: { select: { slug: true, nameEn: true } } },
    }),
    prisma.shopSetting.findUnique({ where: { id: "shop" } }),
  ]);

  const shopCategories: ShopCategory[] = categories.map((c) => ({
    id: c.slug,
    th: c.nameTh,
    en: c.nameEn,
    icon: c.icon ?? "deco",
    group: c.group.toLowerCase(),
    slug: c.slug,
    popular: c.popular,
    visible: c.isActive,
    order: c.sortOrder,
  }));

  const catalog: CatalogItem[] = products.map((p) => ({
    id: p.slug,
    name: p.name,
    cat: p.isAccessory ? "อุปกรณ์เสริม" : p.category.nameEn,
    catId: p.category.slug,
    specs: specValues(p.specs),
    price: bahtFromSatang(p.priceSatang),
    ...(p.badge ? { badge: p.badge } : {}),
    ...(p.isBestSeller ? { best: true } : {}),
    use: p.useAreas.map((u) => u.toLowerCase()),
    color: p.lightColor.toLowerCase() as CatalogItem["color"],
    ...(p.includesPsu ? { kit: true } : {}),
    ...(p.isAccessory ? { acc: true } : {}),
  }));

  return {
    categories: shopCategories,
    catalog,
    settings: {
      lineUrl: settings?.lineOaUrl ?? null,
      freeShipMin: settings?.freeShipMinSatang != null ? bahtFromSatang(settings.freeShipMinSatang) : null,
    },
  };
}

/** สไลด์ที่เปิดใช้ (กรองช่วงเวลาที่ฝั่งเบราว์เซอร์อีกชั้น เพราะเวลาเปลี่ยนระหว่างเปิดหน้า) */
export async function getHomeSlides() {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);

  const all = await prisma.heroSlide.findMany({ orderBy: { sortOrder: "asc" } });
  const active = all.filter((s) => s.isActive);
  // ไม่มีสไลด์ที่เปิดเลย → ใช้สไลด์แรก (หน้าแรกต้องไม่มี hero ว่าง)
  const list = active.length ? active : all.slice(0, 1).map((s) => ({ ...s, isActive: true }));
  return list.map((s) => ({
    id: s.id,
    active: s.isActive,
    order: s.sortOrder,
    // TODO: รูปที่อัปโหลด (imageKey) ต่อกับ storage driver ในขั้นที่ 4
    image: s.imageUrl ?? "",
    focal: { x: s.focalX, y: s.focalY },
    alt: s.alt,
    eyebrow: s.eyebrow,
    title: s.title,
    subtitle: s.subtitle,
    cta1: { label: s.cta1Label, href: s.cta1Href },
    cta2: s.cta2Label && s.cta2Href ? { label: s.cta2Label, href: s.cta2Href } : null,
    align: s.align === "CENTER" ? "center" : "left",
    overlay: s.overlay,
    startAt: s.startAt?.toISOString() ?? null,
    endAt: s.endAt?.toISOString() ?? null,
    credit: s.credit,
  }));
}

/** JSON สำหรับฝังใน <script type="application/json"> — กัน </script> ปิดแท็กก่อนเวลา */
export function jsonForScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
