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
  /** รหัสสินค้า (ใช้ค้นหาด้วยรหัส เช่น "DL1") */
  sku?: string;
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
      sku: p.sku,
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
  // รูปแชร์ (Open Graph) = รูปสินค้าแรกของหมวด ตามลำดับเดียวกับหน้าหมวด
  const first = await prisma.product.findFirst({
    where: { categoryId: c.id, isActive: true, isService: false, images: { isEmpty: false } },
    orderBy: [{ isBestSeller: "desc" }, { views: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    select: { images: true, name: true },
  });
  return {
    slug: c.slug,
    th: c.nameTh,
    en: c.nameEn,
    popular: c.popular,
    description: c.description,
    showOnHome: c.showOnHome,
    image: first ? { url: mediaUrl(first.images[0])!, alt: first.name } : null,
  };
}

/** หมวดจาก slug เดิมของ WordPress/WooCommerce (ใช้ redirect URL เก่า) */
export async function getCategoryByLegacySlug(legacy: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const c = await prisma.category.findFirst({ where: { legacySlug: legacy.normalize("NFC"), isActive: true }, select: { slug: true } });
  return c?.slug ?? null;
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

// ---------- URL เต็ม / LINE ----------

/** โดเมนหลักของเว็บ (ไม่มี / ท้าย) — ใช้ทำ URL เต็มใน JSON-LD / Open Graph */
export function siteBase() {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/** แปลง path ภายใน (/product/x, /media/...) เป็น URL เต็ม — URL http(s) ภายนอกใช้ตามเดิม */
export function absUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return siteBase() + (pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`);
}

/**
 * ลิงก์เปิดแชท LINE OA พร้อมพิมพ์ข้อความไว้ให้ (ลูกค้ากดส่งเอง)
 * รูปแบบ https://line.me/R/oaMessage/{LINE ID}/?{ข้อความ} — ไม่มี LINE ID → ใช้ลิงก์เพิ่มเพื่อนของร้าน
 */
export function lineMessageUrl(lineId: string | null | undefined, text: string, fallback?: string | null) {
  const id = (lineId ?? "").trim();
  if (/^@?[\w.-]{2,40}$/.test(id)) {
    return `https://line.me/R/oaMessage/${encodeURIComponent(id.startsWith("@") ? id : `@${id}`)}/?${encodeURIComponent(text)}`;
  }
  return fallback && /^https:\/\//i.test(fallback) ? fallback : "https://line.me/R/ti/p/@mongdoweb";
}

// ---------- ค้นหา/กรองสินค้า (catalog ร้านเล็ก กรองในหน่วยความจำได้) ----------

export const COLOR_FILTERS = { white: "แสงขาว", rgb: "RGB เปลี่ยนสี" } as const;
export const USE_FILTERS = { pool: "สระว่ายน้ำ", pond: "บ่อปลา / บ่อน้ำ", fountain: "น้ำพุ", garden: "สวน" } as const;
/** ช่วงราคา (บาท) — "min-max", ไม่มี max = ขึ้นไป */
export const PRICE_FILTERS = {
  "0-500": "ต่ำกว่า ฿500",
  "500-1000": "฿500 – 1,000",
  "1000-3000": "฿1,000 – 3,000",
  "3000-": "฿3,000 ขึ้นไป",
} as const;
export const STOCK_FILTERS = { in: "มีของพร้อมส่ง" } as const;
/** "" = แนะนำ (ลำดับเริ่มต้นของร้าน: ขายดี → ยอดเข้าชม → ลำดับที่ตั้ง) */
export const SORTS = {
  "": "แนะนำ",
  "price-asc": "ราคาต่ำ → สูง",
  "price-desc": "ราคาสูง → ต่ำ",
  best: "ขายดี",
  new: "มาใหม่",
} as const;

export type ProductFilter = {
  category?: string;
  color?: string;
  use?: string;
  price?: string;
  stock?: string;
  sort?: string;
};

/** ข้อมูลประกอบการเรียงลำดับ (ไม่ส่งไปเบราว์เซอร์): ยอดขายจริง + วันที่เพิ่มสินค้า */
export type ListingMeta = Record<string, { sold: number; created: number; views: number }>;

/** ยอดขายจากคำสั่งซื้อที่ชำระแล้ว/ส่งแล้ว + วันที่เพิ่มสินค้า ต่อ slug */
export async function getListingMeta(): Promise<ListingMeta> {
  "use cache";
  cacheLife("hours");
  cacheTag(STOREFRONT_TAG);
  const [products, sold] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, isService: false },
      select: { id: true, slug: true, createdAt: true, views: true },
    }),
    prisma.orderItem.groupBy({
      by: ["productId"],
      where: { productId: { not: null }, order: { status: { in: ["PAID", "SHIPPED"] } } },
      _sum: { qty: true },
    }),
  ]);
  const soldBy = new Map(sold.map((r) => [r.productId, r._sum.qty ?? 0]));
  const out: ListingMeta = {};
  for (const p of products) out[p.slug] = { sold: soldBy.get(p.id) ?? 0, created: p.createdAt.getTime(), views: p.views };
  return out;
}

function priceRange(v: string | undefined): [number, number] | null {
  if (!v || !(v in PRICE_FILTERS)) return null;
  const [a, b] = v.split("-");
  return [Number(a) || 0, b ? Number(b) : Infinity];
}

export function filterCatalog(catalog: CatalogItem[], f: ProductFilter, meta?: ListingMeta) {
  let list = catalog;
  if (f.category) list = list.filter((p) => p.catId === f.category);
  // สี "any" (ใช้ได้ทั้งสองแบบ) นับรวมด้วย แต่ไม่รวมอุปกรณ์เสริมที่ไม่ใช่ตัวโคม
  if (f.color && f.color in COLOR_FILTERS) list = list.filter((p) => p.color === f.color || (p.color === "any" && !p.acc));
  if (f.use && f.use in USE_FILTERS) list = list.filter((p) => p.use.includes(f.use!));
  const range = priceRange(f.price);
  // กรองช่วงราคา = ไม่รวมสินค้า "สอบถามราคา" (ราคา 0)
  if (range) list = list.filter((p) => p.price > 0 && p.price >= range[0] && p.price < range[1]);
  if (f.stock === "in") list = list.filter((p) => p.price > 0 && p.inStock);
  const priced = (p: CatalogItem) => (p.price > 0 ? 0 : 1); // "สอบถามราคา" อยู่ท้ายเสมอเมื่อเรียงตามราคา
  if (f.sort === "price-asc") list = [...list].sort((a, b) => priced(a) - priced(b) || a.price - b.price);
  else if (f.sort === "price-desc") list = [...list].sort((a, b) => priced(a) - priced(b) || b.price - a.price);
  else if (f.sort === "best" && meta) {
    const m = (p: CatalogItem) => meta[p.id] ?? { sold: 0, views: 0, created: 0 };
    list = [...list].sort((a, b) => m(b).sold - m(a).sold || Number(!!b.best) - Number(!!a.best) || m(b).views - m(a).views);
  } else if (f.sort === "new" && meta) {
    list = [...list].sort((a, b) => (meta[b.id]?.created ?? 0) - (meta[a.id]?.created ?? 0));
  }
  return list;
}

// คำพ้อง ไทย ↔ อังกฤษ (รวมชุดเดียวกับช่องค้นหาใน shell.js) — ตรงคำใดคำหนึ่งก็นับว่าเจอ
const SYN: Record<string, string[]> = {
  pool: ["สระ"], สระ: ["pool"], fountain: ["น้ำพุ"], น้ำพุ: ["fountain"], garden: ["สวน"], สวน: ["garden"],
  underwater: ["ใต้น้ำ"], ใต้น้ำ: ["underwater"], rgb: ["เปลี่ยนสี"], เปลี่ยนสี: ["rgb"], สีขาว: ["แสงขาว", "white"],
  white: ["แสงขาว"], ขาว: ["white"], หม้อแปลง: ["adapter", "powersupply", "transformer"], อะแดปเตอร์: ["หม้อแปลง", "adapter"],
  adapter: ["หม้อแปลง"], powersupply: ["หม้อแปลง"], transformer: ["หม้อแปลง"],
  ไฟเส้น: ["strip"], strip: ["ไฟเส้น"], รีโมท: ["remote", "controller"], remote: ["รีโมท"], controller: ["คอนโทรลเลอร์", "รีโมท"],
  คอนโทรลเลอร์: ["controller"], สปอร์ตไลท์: ["spotlight", "floodlight"], spotlight: ["สปอร์ตไลท์"], floodlight: ["สปอร์ตไลท์"],
  ดาวน์ไลท์: ["downlight"], downlight: ["ดาวน์ไลท์"], ฝังพื้น: ["uplight"], uplight: ["ฝังพื้น"], วอร์ม: ["warm", "ww"], warm: ["วอร์ม"],
};
// ตัวพิมพ์เล็ก/ใหญ่ เว้นวรรค ขีด จุด ไม่มีผล ("DL-1", "dl 1", "DL1" เหมือนกัน)
const norm = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[​-‍﻿]/g, "")
    .replace(/[\s\-_./,()[\]"'“”+]+/g, "");

export type SearchResult = { items: CatalogItem[]; approx: boolean };

/**
 * ค้นหาสินค้า: ทุกคำต้องเจอ (ชื่อ รหัสสินค้า หมวด สเปก คำค้น) — ไม่เจอเลย → ลองแบบใกล้เคียง
 * (ตัดท้ายคำทีละตัวจนเหลือ ≥ 60% ของคำ เช่น "ไฟสระน้ำ" → "ไฟสระ") แล้วบอกผู้ใช้ว่าเป็นผลใกล้เคียง
 */
export function searchProducts(catalog: CatalogItem[], categories: ShopCategory[], q: string): SearchResult {
  const toks = q.trim().split(/\s+/).map(norm).filter(Boolean).slice(0, 8);
  if (!toks.length) return { items: [], approx: false };
  const catName = new Map(categories.map((c) => [c.slug, `${c.th} ${c.en}`]));
  const rows = catalog.map((p) => ({
    p,
    name: norm(p.name),
    sku: norm(p.sku ?? ""),
    hay: norm([p.name, p.sku ?? "", p.cat, catName.get(p.catId) ?? "", p.specs.join(" "), p.kw ?? ""].join(" ")),
  }));
  const hit = (hay: string, t: string) => hay.includes(t) || (SYN[t] ?? []).some((a) => hay.includes(norm(a)));

  const strict = rows
    .map((r) => {
      let score = 0;
      for (const t of toks) {
        if (!hit(r.hay, t)) return null;
        score += r.sku === t ? 6 : r.sku.startsWith(t) ? 4 : r.name.startsWith(t) ? 3 : r.name.includes(t) ? 2 : 1;
      }
      return { p: r.p, score: score + (r.p.best ? 0.5 : 0) };
    })
    .filter((x): x is { p: CatalogItem; score: number } => x !== null);
  if (strict.length) return { items: strict.sort((a, b) => b.score - a.score).map((x) => x.p), approx: false };

  // ผลใกล้เคียง: ให้คะแนนตามความยาวส่วนต้นของคำที่ยังเจอ
  const loose = rows
    .map((r) => {
      let score = 0;
      for (const t of toks) {
        const min = Math.max(2, Math.ceil(t.length * 0.6));
        for (let n = t.length; n >= min; n--) {
          if (hit(r.hay, t.slice(0, n))) {
            score += n / t.length;
            break;
          }
        }
      }
      return { p: r.p, score };
    })
    .filter((x) => x.score >= Math.max(0.6, toks.length * 0.5))
    .sort((a, b) => b.score - a.score);
  return { items: loose.slice(0, 48).map((x) => x.p), approx: loose.length > 0 };
}

export function searchCatalog(catalog: CatalogItem[], categories: ShopCategory[], q: string) {
  return searchProducts(catalog, categories, q).items;
}

// ---------- ซื้อคู่กัน ----------

/** หมวดโคมไฟที่ต่อผ่านหม้อแปลง (DC12V / AC24V) */
const LIGHT_CATS = new Set([
  "underwater-light",
  "pool-light",
  "fountain-light",
  "uplight-led",
  "garden-light",
  "strip-light",
  "spotlight-led",
  "bollard-led",
  "led-wall-washer",
]);
/** หมวดที่ต่อสายใต้น้ำ/กลางแจ้ง → แนะนำท่อหดกันน้ำ */
const WET_CATS = new Set(["underwater-light", "pool-light", "fountain-light", "uplight-led", "garden-light"]);

const voltOf = (s: string) => /(?:ac|dc)?\s*(12|24)\s*v/i.exec(s)?.[1] ?? null;
const isPsuName = (name: string, catId: string) => catId === "power-supply" || /หม้อแปลง|power\s*supply|transformer/i.test(name);
const hasRemote = (name: string) => /รีโมท|remote|controller/i.test(name);

export type Pairing = { item: CatalogItem; reason: string };

/**
 * "ซื้อคู่กัน": โคมไฟ → หม้อแปลงแรงดันเดียวกัน + รีโมท RGB (ถ้ารุ่นนั้นไม่มีรีโมท) + ท่อหดกันน้ำ
 * หม้อแปลง → โคมไฟแรงดันเดียวกัน · รีโมท RGB → ไฟ RGB ที่ไม่มีรีโมท
 * ใช้เฉพาะสินค้าที่เปิดขาย (catalog มีแต่สินค้าเปิดขาย) มีราคา และมีของ
 */
export function pairedProducts(
  p: { slug: string; name: string; category: { slug: string }; isAccessory: boolean; includesPsu: boolean; lightColor: string },
  catalog: CatalogItem[],
  limit = 4,
): Pairing[] {
  const pool = catalog.filter((x) => x.id !== p.slug && x.price > 0 && x.inStock);
  const volt = voltOf(p.name);
  const out: Pairing[] = [];
  const add = (list: CatalogItem[], reason: string, n: number) => {
    for (const x of list) {
      if (n <= 0 || out.length >= limit) break;
      if (out.some((o) => o.item.id === x.id)) continue;
      out.push({ item: x, reason });
      n--;
    }
  };
  const byPrice = (a: CatalogItem, b: CatalogItem) => a.price - b.price;

  if (!p.isAccessory && LIGHT_CATS.has(p.category.slug)) {
    if (!p.includesPsu) {
      const v = volt ?? "12";
      const psus = pool.filter((x) => isPsuName(x.name, x.catId) && voltOf(x.name) === v).sort(byPrice);
      add(psus, `หม้อแปลง ${v}V สำหรับรุ่นนี้`, 2);
    }
    if (p.lightColor === "rgb" && !hasRemote(p.name)) {
      add(pool.filter((x) => x.catId === "led-controller" && /rgb/i.test(x.name)).sort(byPrice), "รีโมทควบคุมสี RGB", 1);
    } else if (p.category.slug === "strip-light") {
      add(pool.filter((x) => x.catId === "led-controller" && hasRemote(x.name)).sort(byPrice), "รีโมท/คอนโทรลเลอร์ไฟเส้น", 1);
    }
    if (WET_CATS.has(p.category.slug)) add(pool.filter((x) => /ท่อหด|heat\s*shrink/i.test(x.name)), "ท่อหดกันน้ำ สำหรับต่อสาย", 1);
  } else if (isPsuName(p.name, p.category.slug) && volt) {
    add(
      pool.filter((x) => !x.acc && !x.kit && LIGHT_CATS.has(x.catId) && voltOf(x.name) === volt),
      `โคมไฟ ${volt}V ที่ใช้กับหม้อแปลงนี้`,
      limit,
    );
  } else if (p.category.slug === "led-controller" && /rgb/i.test(p.name)) {
    add(
      pool.filter((x) => !x.acc && x.color === "rgb" && LIGHT_CATS.has(x.catId) && !hasRemote(x.name)),
      "ไฟ RGB ที่ใช้กับรีโมทนี้",
      limit,
    );
  }
  return out;
}
