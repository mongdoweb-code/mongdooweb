// ข้อมูลหน้าร้านจากฐานข้อมูล แปลงเป็นรูปแบบเดียวกับต้นแบบ (CATALOG / DEFAULT_CATEGORIES / DEFAULT_SLIDES)
// เพื่อให้สคริปต์ที่ย้ายมา (public/js/*.js) ใช้ได้โดยไม่ต้องแก้ตรรกะ
import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { mediaUrl } from "@/lib/media";
import { prisma } from "@/lib/prisma";
import { STOREFRONT_TAG, getPublicShopInfo } from "@/lib/settings";

/** tag ของข้อมูลหน้าร้าน — หลังบ้านเรียก updateTag(STOREFRONT_TAG) หลังแก้สินค้า/หมวด/สไลด์/ตั้งค่า */
export { STOREFRONT_TAG };

export const bahtFromSatang = (satang: number) => satang / 100;

/** สินค้าแบบ CATALOG ของต้นแบบ: id = slug, price = บาท (0 = สอบถามราคา) */
export type CatalogItem = {
  id: string;
  name: string;
  cat: string;
  catId: string;
  specs: string[];
  price: number;
  compareAt?: number;
  img?: string;
  inStock: boolean;
  maxQty?: number;
  badge?: string;
  best?: boolean;
  use: string[];
  color: "white" | "rgb" | "any";
  kit?: boolean;
  acc?: boolean;
  kw?: string;
};

export type ShopCategory = {
  id: string;
  th: string;
  en: string;
  icon: string;
  group: string;
  slug: string;
  popular: string[];
  /** แสดงในเมนู/การ์ดหน้าแรก */
  visible: boolean;
  order: number;
};

/** specs ในฐานข้อมูลเป็น [{label, value}] — การ์ดสินค้าแสดงแค่ value */
export function specValues(specs: unknown): string[] {
  if (!Array.isArray(specs)) return [];
  return specs
    .map((s) => (s && typeof s === "object" && "value" in s ? String((s as { value: unknown }).value) : ""))
    .filter(Boolean);
}

const available = (p: { trackStock: boolean; stock: number; inStock: boolean }) => (p.trackStock ? p.stock > 0 : p.inStock);

export async function getShopData() {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);

  const [categories, products, shop] = await Promise.all([
    prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.product.findMany({
      where: { isActive: true, isService: false, category: { isActive: true } },
      orderBy: [{ isBestSeller: "desc" }, { views: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: { category: { select: { slug: true, nameTh: true } } },
    }),
    getPublicShopInfo(),
  ]);

  const shopCategories: ShopCategory[] = categories.map((c) => ({
    id: c.slug,
    th: c.nameTh,
    en: c.nameEn,
    icon: c.icon ?? "deco",
    group: c.group.toLowerCase(),
    slug: c.slug,
    popular: c.popular,
    visible: c.showOnHome,
    order: c.sortOrder,
  }));

  const catalog: CatalogItem[] = products.map((p) => {
    const img = mediaUrl(p.images[0], "sm");
    return {
      id: p.slug,
      name: p.name,
      cat: p.category.nameTh,
      catId: p.category.slug,
      specs: specValues(p.specs).slice(0, 3),
      price: bahtFromSatang(p.priceSatang),
      ...(p.compareAtSatang && p.compareAtSatang > p.priceSatang ? { compareAt: bahtFromSatang(p.compareAtSatang) } : {}),
      ...(img ? { img } : {}),
      inStock: available(p),
      ...(p.trackStock ? { maxQty: p.stock } : {}),
      ...(p.badge ? { badge: p.badge } : {}),
      ...(p.isBestSeller ? { best: true } : {}),
      use: p.useAreas.map((u) => u.toLowerCase()),
      color: p.lightColor.toLowerCase() as CatalogItem["color"],
      ...(p.includesPsu ? { kit: true } : {}),
      ...(p.isAccessory ? { acc: true } : {}),
      ...(p.keywords ? { kw: p.keywords.slice(0, 160) } : {}),
    };
  });

  // อุปกรณ์ที่ตัวช่วยเลือกไฟแนะนำคู่กัน: หม้อแปลง DC12V และท่อหดกันน้ำ (ถ้ามีขาย)
  const orderable = catalog.filter((p) => p.price > 0 && p.inStock);
  const psu = orderable.find((p) => p.catId === "power-supply" && /12\s*v/i.test(p.name)) ?? orderable.find((p) => p.catId === "power-supply");
  const shrink = orderable.find((p) => /ท่อหด|heat\s*shrink/i.test(p.name));

  return {
    categories: shopCategories,
    catalog,
    finderAcc: { psu: psu?.id ?? null, shrink: shrink?.id ?? null },
    settings: {
      lineUrl: shop.lineUrl,
      freeShipMin: shop.freeShipMinSatang != null ? bahtFromSatang(shop.freeShipMinSatang) : null,
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
    image: mediaUrl(s.imageKey) ?? s.imageUrl ?? "",
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

/** หมวดที่เปิดขาย ตาม slug (null = ไม่พบ/ปิดอยู่) */
export async function getCategory(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);

  const c = await prisma.category.findFirst({ where: { slug, isActive: true } });
  if (!c) return null;
  return { slug: c.slug, th: c.nameTh, en: c.nameEn, popular: c.popular, description: c.description, showOnHome: c.showOnHome };
}

/** รายละเอียดสินค้าสำหรับหน้าสินค้า (null = ไม่พบ/ปิดขาย) */
export async function getProductDetail(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);

  const p = await prisma.product.findFirst({
    where: { slug, isActive: true, isService: false, category: { isActive: true } },
    include: { category: { select: { slug: true, nameTh: true, nameEn: true } } },
  });
  if (!p) return null;
  return {
    slug: p.slug,
    sku: p.sku,
    name: p.name,
    description: p.description,
    shortDescription: p.shortDescription,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    unit: p.unit,
    price: bahtFromSatang(p.priceSatang),
    compareAt: p.compareAtSatang && p.compareAtSatang > p.priceSatang ? bahtFromSatang(p.compareAtSatang) : null,
    inStock: available(p),
    stockLeft: p.trackStock ? p.stock : null,
    images: p.images.map((k) => ({ full: mediaUrl(k)!, sm: mediaUrl(k, "sm")! })),
    specs: Array.isArray(p.specs)
      ? (p.specs as { label?: unknown; value?: unknown }[])
          .map((s) => ({ label: String(s?.label ?? ""), value: String(s?.value ?? "") }))
          .filter((s) => s.value)
      : [],
    badge: p.badge,
    isAccessory: p.isAccessory,
    includesPsu: p.includesPsu,
    lightColor: p.lightColor.toLowerCase(),
    category: { slug: p.category.slug, th: p.category.nameTh, en: p.category.nameEn },
  };
}

// ---------- ค้นหา/กรองสินค้า (catalog ร้านเล็ก กรองในหน่วยความจำได้) ----------

export const COLOR_FILTERS = { white: "แสงขาว", rgb: "RGB เปลี่ยนสี" } as const;
export const USE_FILTERS = { pool: "สระว่ายน้ำ", pond: "บ่อปลา / บ่อน้ำ", fountain: "น้ำพุ", garden: "สวน" } as const;
export const SORTS = { popular: "ยอดนิยม", "price-asc": "ราคาต่ำ → สูง", "price-desc": "ราคาสูง → ต่ำ" } as const;

export type ProductFilter = {
  category?: string;
  color?: string;
  use?: string;
  sort?: string;
};

export function filterCatalog(catalog: CatalogItem[], f: ProductFilter) {
  let list = catalog;
  if (f.category) list = list.filter((p) => p.catId === f.category);
  // สี "any" (ใช้ได้ทั้งสองแบบ) นับรวมด้วย แต่ไม่รวมอุปกรณ์เสริมที่ไม่ใช่ตัวโคม
  if (f.color && f.color in COLOR_FILTERS) list = list.filter((p) => p.color === f.color || (p.color === "any" && !p.acc));
  if (f.use && f.use in USE_FILTERS) list = list.filter((p) => p.use.includes(f.use!));
  if (f.sort === "price-asc") list = [...list].sort((a, b) => a.price - b.price);
  else if (f.sort === "price-desc") list = [...list].sort((a, b) => b.price - a.price);
  return list;
}

// คำพ้อง ไทย ↔ อังกฤษ (ชุดเดียวกับช่องค้นหาใน shell.js)
const SYN: Record<string, string> = {
  pool: "สระ", สระ: "pool", fountain: "น้ำพุ", น้ำพุ: "fountain", garden: "สวน", สวน: "garden",
  underwater: "ใต้น้ำ", ใต้น้ำ: "underwater", rgb: "เปลี่ยนสี", เปลี่ยนสี: "rgb", สีขาว: "แสงขาว",
  white: "แสงขาว", ขาว: "white", หม้อแปลง: "adapter", อะแดปเตอร์: "หม้อแปลง",
};
const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[​-‍﻿]/g, "").replace(/\s+/g, "");

export function searchCatalog(catalog: CatalogItem[], categories: ShopCategory[], q: string) {
  const toks = q.trim().split(/\s+/).map(norm).filter(Boolean).slice(0, 8);
  if (!toks.length) return [];
  const catName = new Map(categories.map((c) => [c.slug, `${c.th} ${c.en}`]));
  return catalog
    .map((p) => {
      const name = norm(p.name);
      const hay = norm([p.name, p.cat, catName.get(p.catId) ?? "", p.specs.join(" "), p.kw ?? ""].join(" "));
      let score = 0;
      for (const t of toks) {
        const alt = SYN[t] ? norm(SYN[t]) : null;
        if (!hay.includes(t) && !(alt && hay.includes(alt))) return null;
        score += name.startsWith(t) ? 3 : name.includes(t) ? 2 : 1;
      }
      return { p, score: score + (p.best ? 0.5 : 0) };
    })
    .filter((x): x is { p: CatalogItem; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}
