// นำเข้าสินค้าจากไฟล์ส่งออกของ WooCommerce (data/woocommerce/*.csv) — รันซ้ำได้ (อัปเดตตาม wooId)
// รัน: npm run import:woo            (ดาวน์โหลดรูปจากเว็บเดิม)
//      npm run import:woo -- --no-images
// - จับคู่หมวดเดิมกับหมวดใหม่ / สร้างหมวดที่ยังไม่มี (สินค้าที่ไม่ใช่ไฟ ไม่แสดงในเมนูหน้าแรก)
// - ราคา/ราคาลด, สต็อก, คำอธิบาย (ล้าง HTML), SEO, คำค้น, ลิงก์เดิม (redirect 301)
// - รูปดาวน์โหลดจากเว็บเดิม ย่อเป็น WebP เก็บผ่าน storage driver (จำไว้ใน cache ไม่โหลดซ้ำ)
import "dotenv/config";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type CategoryGroup, type LightColor, type UseArea } from "../generated/prisma/client";
import { htmlToText, sanitizeDescription } from "../src/lib/html";
import { saveImage } from "../src/lib/media";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const DATA = join(__dirname, "../data/woocommerce");
const OLD_HOST = "www.xn--72c0asz6a7a5fqc6c.com";
const NO_IMAGES = process.argv.includes("--no-images");

type Row = Record<string, string>;

// ---------- หมวดหมู่ ----------

type CatSpec = {
  slug: string; th: string; en: string; icon: string; group: CategoryGroup; showOnHome: boolean;
  popular: string[]; legacy?: string; order: number;
};
// หมวดที่เว็บเดิมมีแต่ต้นแบบไม่มี
const NEW_CATS: CatSpec[] = [
  { slug: "power-supply", th: "หม้อแปลงไฟ LED", en: "Power Supply", icon: "deco", group: "DECO", showOnHome: true, popular: ["DC12V", "กันน้ำ IP68", "สำหรับไฟใต้น้ำ"], legacy: "ชุดแปลงไฟ-power-supply", order: 13 },
  { slug: "led-controller", th: "รีโมทและคอนโทรลเลอร์", en: "LED Controller", icon: "strip", group: "DECO", showOnHome: true, popular: ["รีโมท RGB", "คอนโทรลเลอร์"], legacy: "รีโมทคอลโทรล-led-controller", order: 14 },
  { slug: "bollard-led", th: "โคมไฟสนามภายนอก", en: "Bollard & Outdoor LED", icon: "uplight", group: "OUTDOOR", showOnHome: true, popular: ["โคมไฟสนาม", "ทางเดิน", "ภายนอกอาคาร"], legacy: "โคมไฟสนามภายนอก-bollard-led", order: 15 },
  { slug: "rfid-access", th: "บัตรและเครื่องอ่าน RFID", en: "RFID & Access Control", icon: "deco", group: "DECO", showOnHome: false, popular: [], legacy: "คอมพิวเตอร์และอุปกรณ์เสริม", order: 90 },
  { slug: "mosquito-fogger", th: "เครื่องพ่นหมอกควันกำจัดยุง", en: "Mosquito Fogger", icon: "deco", group: "DECO", showOnHome: false, popular: [], legacy: "เครื่องพ่นหมอกควันกำจัดยุงและแมลง", order: 91 },
  { slug: "security", th: "อุปกรณ์รักษาความปลอดภัย", en: "Security", icon: "deco", group: "DECO", showOnHome: false, popular: [], legacy: "อุปกรณ์รักษาความปลอดภั", order: 92 },
];
// URL เดิมของหมวดที่มีอยู่แล้ว (ส่วนท้ายของ /product-category/...) — ไฟส่องตึกใช้ของ "ไฟส่องกำแพง ย้อมสี" ตามที่เจ้าของร้านยืนยัน
const LEGACY_EXISTING: Record<string, string> = {
  "underwater-light": "ไฟใต้น้ำ-underwater-light",
  "pool-light": "โคมไฟสระว่ายน้ำ-สแตนเลส-เปลี่ยนสี-led-pool-light-rgb",
  "fountain-light": "ไฟส่องน้ำพุ-ไฟใต้น้ำ-fountain-light",
  "uplight-led": "โคมไฟฝังพื้น-uplight-led",
  "garden-light": "ไฟส่องต้นไม้-led-garden-light",
  "spotlight-led": "สปอร์ตไลท์-flood-light",
  "led-wall-washer": "ไฟส่องกำแพง-ย้อมสี-led-wall-washer",
  "wall-lamp": "โคมไฟติดผนัง-led-wall-lamp",
  "downlight-led": "ไฟฝังฝ้า-ไฟติดเพดาน-ดาวน์ไลท์-ฝังฝ้า-downlight",
  "stage-lighting": "ไฟคอนเสิร์ต-ไฟเวที-ไฟย้อมสี",
  "strip-light": "ไฟเส้นแอลอีดี-strip-light",
  "home-garden-decor": "สินค้าตกแต่งบ้านและสวน",
};
// ชื่อหมวดในไฟล์ส่งออก → slug หมวดใหม่
const WOO_CAT: Record<string, string> = {
  "ไฟเส้นแอลอีดี Strip light": "strip-light",
  "ไฟแอลอีดี > ไฟส่องต้นไม้ LED Garden light": "garden-light",
  "ไฟดาวน์ไลท์ฝังฝ้า Downlight LED": "downlight-led",
  "โคมไฟใต้น้ำ Underwater Light": "underwater-light",
  "ไฟแอลอีดี > หม้อแปลงไฟแอลอีดี กันน้ำ IP68": "power-supply",
  "ไฟแอลอีดี > โคมไฟฝังพื้น Uplight LED": "uplight-led",
  "ไฟแอลอีดี > ไฟส่องน้ำพุ Fountain light": "fountain-light",
  "คอมพิวเตอร์และอุปกรณ์เสริม": "rfid-access",
  "ไฟแอลอีดี > Flood light โคมไฟสปอร์ตไลท์": "spotlight-led",
  "ไฟแอลอีดี > ไฟส่องกำแพง ย้อมสี LED Wall Washer": "led-wall-washer",
  "ไฟแอลอีดี > ไฟคอนเสิร์ต งานเวที": "stage-lighting",
  "ไฟแอลอีดี > โคมไฟสนามภายนอก Bollard LED": "bollard-led",
  "ไฟแอลอีดี > รีโมทคอลโทรล LED Controller": "led-controller",
  "โคมไฟสระว่ายน้ำ Pool light": "pool-light",
  "เครื่องพ่นหมอกควันกำจัดยุงและแมลง": "mosquito-fogger",
  "อุปกรณ์รักษาความปลอดภัย": "security",
  "ไฟแอลอีดี > โคมไฟภายนอก Outdoor lighting": "bollard-led",
  "สินค้าตกแต่งบ้านและสวน": "home-garden-decor",
  "ไฟแอลอีดี > โคมไฟติดผนัง Led Wall Lamp": "wall-lamp",
};
// สินค้าที่อยู่แค่หมวดรวม "ไฟแอลอีดี" → เดาหมวดจากชื่อ (ลำดับสำคัญ: เจาะจงก่อน)
const NAME_RULES: [RegExp, string][] = [
  [/หม้อแปลง|power\s*supply|adapter|อะแดปเตอร์|switching/i, "power-supply"],
  [/รีโมท|controller|คอนโทรล/i, "led-controller"],
  [/สระว่ายน้ำ|pool/i, "pool-light"],
  [/น้ำพุ|fountain/i, "fountain-light"],
  [/ใต้น้ำ|underwater/i, "underwater-light"],
  [/ฝังพื้น|uplight|in-?ground/i, "uplight-led"],
  [/wall\s*washer|ส่องกำแพง|ย้อมสี|ส่องตึก/i, "led-wall-washer"],
  [/ดาวน์ไลท์|ฝังฝ้า|downlight/i, "downlight-led"],
  [/ไฟเส้น|strip|ริบบิ้น/i, "strip-light"],
  [/สปอร์ตไลท์|flood/i, "spotlight-led"],
  [/เวที|คอนเสิร์ต|stage|par\b|moving\s*head/i, "stage-lighting"],
  [/ติดผนัง|wall\s*lamp/i, "wall-lamp"],
  [/สนาม|bollard|ทางเดิน|เสา/i, "bollard-led"],
  [/ต้นไม้|สวน|garden|ปักดิน/i, "garden-light"],
];

// ---------- ตัวช่วย ----------

const num = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return v && String(v).trim() !== "" && Number.isFinite(n) ? n : null;
};
const clean = (s: string) => s.replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
const ascii = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
const asciiLegacy = (path: string | null) => {
  const slug = path?.replace(/^\/product\//, "").replace(/\/$/, "");
  return slug && /^[a-z0-9-]+$/.test(slug) ? slug : null;
};
const decodePath = (p: string) => {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
};

function inferUse(slug: string, name: string): UseArea[] {
  if (slug === "pool-light") return ["POOL"];
  if (slug === "fountain-light") return ["FOUNTAIN"];
  if (slug === "underwater-light") return /น้ำพุ|fountain/i.test(name) ? ["POND", "FOUNTAIN"] : ["POND", "FOUNTAIN"];
  if (slug === "garden-light" || slug === "uplight-led" || slug === "bollard-led") return ["GARDEN"];
  return [];
}
function inferColor(name: string): LightColor {
  if (/rgb|เปลี่ยนสี|7\s*สี|multi\s*colou?r|ย้อมสี/i.test(name)) return "RGB";
  if (/ขาว|white|warm|วอร์ม|daylight|เดย์ไลท์|cool|6000k|3000k|3200k/i.test(name)) return "WHITE";
  return "ANY";
}

// ---------- รูปภาพ ----------

const CACHE_DIR = process.env.UPLOAD_DIR ?? "uploads";
const CACHE_FILE = join(CACHE_DIR, ".woo-image-cache.json");
const imgCache: Record<string, string | null> = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, "utf8")) : {};
const saveCache = () => {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(imgCache, null, 0));
};

async function fetchImage(url: string): Promise<string | null> {
  if (url in imgCache) return imgCache[url];
  if (NO_IMAGES) return null;
  let key: string | null = null;
  for (let attempt = 0; attempt < 3 && !key; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "mongdoweb-migration" }, signal: AbortSignal.timeout(60_000) });
      if (res.status === 404) break;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      key = await saveImage(Buffer.from(await res.arrayBuffer()), "products");
    } catch (e) {
      if (attempt === 2) console.warn(`  ! โหลดรูปไม่ได้ ${url}: ${(e as Error).message}`);
    }
  }
  imgCache[url] = key;
  return key;
}

/** โหลดรูปพร้อมกันทีละไม่กี่รูป (ไม่ให้เว็บเดิมรับภาระมากเกิน) */
async function prefetch(urls: string[], concurrency = 6) {
  const todo = [...new Set(urls)].filter((u) => !(u in imgCache));
  let i = 0, done = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < todo.length) {
        const u = todo[i++];
        await fetchImage(u);
        if (++done % 25 === 0) {
          console.log(`  รูป ${done}/${todo.length}`);
          saveCache();
        }
      }
    }),
  );
  saveCache();
}

// ---------- main ----------

async function main() {
  const rows: Row[] = ["products-1.csv", "products-2.csv"].flatMap((f) =>
    parse(readFileSync(join(DATA, f)), { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true }) as Row[],
  );
  const legacyProducts: Record<string, string> = JSON.parse(readFileSync(join(DATA, "legacy-product-urls.json"), "utf8"));
  console.log(`อ่านไฟล์ได้ ${rows.length} แถว`);

  // หมวด: อัปเดต URL เดิมของหมวดที่มี + สร้างหมวดใหม่
  for (const [slug, legacy] of Object.entries(LEGACY_EXISTING)) {
    await prisma.category.updateMany({ where: { slug }, data: { legacySlug: legacy } });
  }
  for (const c of NEW_CATS) {
    const data = { nameTh: c.th, nameEn: c.en, icon: c.icon, group: c.group, showOnHome: c.showOnHome, popular: c.popular, legacySlug: c.legacy ?? null };
    await prisma.category.upsert({ where: { slug: c.slug }, update: data, create: { slug: c.slug, sortOrder: c.order, ...data } });
  }
  const catId = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));

  // สินค้าแบบมีตัวเลือก: นำเข้าตัวเลือกย่อยเป็นสินค้าแยก (ข้ามตัวแม่) ใช้หมวด/คำอธิบาย/รูปของตัวแม่
  const bySku = new Map(rows.filter((r) => r["รหัสสินค้า"]).map((r) => [r["รหัสสินค้า"], r]));
  const items = rows.filter((r) => r["ชนิด"] !== "variable");
  const parentOf = (r: Row) => (r["ชนิด"] === "variation" ? bySku.get(r["หลัก"]) : undefined);

  // รูปทั้งหมด (รูปสินค้า + รูปในคำอธิบายที่อยู่บนเว็บเดิม)
  const imgList = (r?: Row) => (r?.["ไฟล์รูปภาพ"] ?? "").split(",").map((s) => s.trim()).filter((u) => u.startsWith("https://"));
  const descImgs = (html: string) =>
    [...html.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => m[1]).filter((u) => u.includes(OLD_HOST) && !/\.svg$/i.test(u));
  const allUrls = items.flatMap((r) => {
    const p = parentOf(r);
    return [...imgList(r), ...imgList(p), ...descImgs(r["คำอธิบาย"] ?? ""), ...descImgs(p?.["คำอธิบาย"] ?? "")];
  });
  console.log(`รูปทั้งหมด ${new Set(allUrls).size} รูป${NO_IMAGES ? " (ข้ามการดาวน์โหลด)" : ""}`);
  await prefetch(allUrls);

  // จัดอันดับขายดีจากยอดเข้าชมของเว็บเดิม (เฉพาะสินค้าไฟที่มีราคา)
  const views = (r: Row) => num(r["Meta : views"] ?? parentOf(r)?.["Meta : views"]) ?? 0;
  const usedSlugs = new Set((await prisma.product.findMany({ where: { wooId: null }, select: { slug: true } })).map((p) => p.slug));
  const usedSkus = new Set((await prisma.product.findMany({ where: { wooId: null }, select: { sku: true } })).map((p) => p.sku.toLowerCase()));
  const unique = (base: string, used: Set<string>, id: string) => {
    let s = base || `p${id}`;
    if (used.has(s.toLowerCase())) s = `${s}-${id}`;
    used.add(s.toLowerCase());
    return s;
  };

  const prepared = [];
  const fallbackCount: Record<string, number> = {};
  for (const r of items) {
    const p = parentOf(r);
    const id = r["ID"];
    const catNames = (p ?? r)["หมวดหมู่"].split(",").map((s) => s.trim()).filter(Boolean);
    let slug = catNames.map((n) => WOO_CAT[n]).find(Boolean);
    const name = clean(r["ชื่อ"]).replace(/\s*-\s*สีเขียว \(BLUE\)/, " - สีน้ำเงิน (BLUE)"); // แก้ชื่อสีผิดในเว็บเดิม
    if (!slug) {
      slug = NAME_RULES.find(([re]) => re.test(name))?.[1] ?? "home-garden-decor";
      fallbackCount[slug] = (fallbackCount[slug] ?? 0) + 1;
    }
    const regular = num(r["ราคาปกติ"]);
    const sale = num(r["ราคาที่ลด"]);
    const price = sale ?? regular ?? 0;
    const stockRaw = num(r["คลังสินค้า"]);
    const descHtml = r["คำอธิบาย"] || p?.["คำอธิบาย"] || "";
    const rewrite = (src: string) => (src.includes(OLD_HOST) ? (imgCache[src] ? `/media/${imgCache[src]}` : null) : src);
    const description = sanitizeDescription(descHtml, rewrite) || null;
    const short = sanitizeDescription(r["คำอธิบายแบบย่อ"] || p?.["คำอธิบายแบบย่อ"] || "") || null;
    const images = [...new Set([...imgList(r), ...imgList(p)])].map((u) => imgCache[u]).filter((k): k is string => !!k);
    const attrName = clean(r["ชื่อคุณสมบัติ 1"] ?? "");
    const attrVal = clean(r["ค่าคุณสมบัติ 1"] ?? r["ค่าคุณสมบัติ 1 "] ?? "");
    const specs = attrName && attrVal && !attrVal.includes(",") ? [{ label: attrName, value: attrVal }] : [];
    const weight = num(r["น้ำหนัก (กก.)"]);
    const isAcc = ["power-supply", "led-controller"].includes(slug) || /ท่อหด|ข้อต่อ|connector|ขั้วต่อ/i.test(name);
    prepared.push({
      wooId: Number(id),
      slugBase: ascii(r["รหัสสินค้า"]) || ascii(name.replace(/[^\x00-\x7F]+/g, " ")),
      skuBase: (r["รหัสสินค้า"] || `WOO-${id}`).slice(0, 60),
      data: {
        name,
        categoryId: catId.get(slug)!,
        priceSatang: Math.round(price * 100),
        compareAtSatang: sale != null && regular != null && regular > sale ? Math.round(regular * 100) : null,
        trackStock: stockRaw != null,
        stock: stockRaw != null ? Math.max(0, Math.floor(stockRaw)) : 0,
        inStock: (r["มีสินค้าในคลังสินค้า?"] ?? "1") !== "0",
        description,
        shortDescription: short && htmlToText(short) !== htmlToText(name) ? short : null,
        keywords: (p ?? r)["ป้ายกำกับ"] || null,
        seoTitle: clean((p ?? r)["Meta : title_tag"] || (p ?? r)["Meta : _su_title"] || "") || null,
        seoDescription: clean((p ?? r)["Meta : meta_description"] || (p ?? r)["Meta : _su_description"] || "") || null,
        weightGram: weight && weight > 0 ? Math.round(weight * 1000) : null,
        sortOrder: num(r["ตำแหน่ง"]) ?? 0,
        views: views(r),
        images,
        specs,
        useAreas: inferUse(slug, name),
        lightColor: inferColor(name),
        includesPsu: /พร้อม(หม้อแปลง|อะแดปเตอร์|adapter)|ชุดพร้อมใช้/i.test(name),
        isAccessory: isAcc,
        isActive: (p ?? r)["เผยแพร่แล้ว"] === "1" && (p ?? r)["การมองเห็นในแค็ตตาล็อก"] !== "hidden",
        legacyPath: decodePath(legacyProducts[id] ?? (p ? legacyProducts[p["ID"]] ?? "" : "")) || null,
        badge: (p ?? r)["เป็นรายการเด่นหรือไม่"] === "1" ? "แนะนำ" : null,
      },
    });
  }
  // URL เดิมของสินค้าแม่ใช้ได้กับตัวเลือกแรกเท่านั้น (legacyPath ต้องไม่ซ้ำ)
  const seenLegacy = new Set<string>();
  for (const x of prepared) {
    if (x.data.legacyPath && seenLegacy.has(x.data.legacyPath)) x.data.legacyPath = null;
    if (x.data.legacyPath) seenLegacy.add(x.data.legacyPath);
  }
  // ขายดี: 8 อันดับแรกตามยอดเข้าชม (สินค้าไฟที่มีราคา), 4 อันดับแรกติดป้าย "ขายดี"
  const nonLight = new Set(["rfid-access", "mosquito-fogger", "security"].map((s) => catId.get(s)));
  const ranked = prepared.filter((x) => x.data.priceSatang > 0 && x.data.isActive && !nonLight.has(x.data.categoryId) && x.data.images.length)
    .sort((a, b) => b.data.views - a.data.views);
  const best = new Set(ranked.slice(0, 8).map((x) => x.wooId));
  const hot = new Set(ranked.slice(0, 4).map((x) => x.wooId));

  let created = 0, updated = 0;
  for (const x of prepared) {
    const existing = await prisma.product.findUnique({ where: { wooId: x.wooId } });
    const data = { ...x.data, isBestSeller: best.has(x.wooId), badge: hot.has(x.wooId) ? "ขายดี" : x.data.badge };
    if (existing) {
      // ไม่ทับ slug/sku ที่อาจถูกแก้ในหลังบ้านแล้ว
      await prisma.product.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.product.create({
        data: {
          ...data,
          wooId: x.wooId,
          // URL เดิมเป็นภาษาอังกฤษล้วน → ใช้ slug เดิมเลย (ลิงก์เก่าใช้ได้ทันที)
          slug: unique(asciiLegacy(data.legacyPath) ?? x.slugBase.slice(0, 80), usedSlugs, String(x.wooId)),
          sku: unique(x.skuBase, usedSkus, String(x.wooId)),
        },
      });
      created++;
    }
  }
  // สินค้าตัวอย่างจากต้นแบบ (ไม่มี wooId) ปิดขายหน้าร้าน — เก็บไว้เพราะอาจอยู่ในคำสั่งซื้อทดสอบ
  const hidden = await prisma.product.updateMany({ where: { wooId: null, isService: false }, data: { isActive: false } });

  const missingImg = prepared.filter((x) => !x.data.images.length).length;
  console.log(`เสร็จ: เพิ่ม ${created} · อัปเดต ${updated} · ปิดสินค้าตัวอย่าง ${hidden.count} · ไม่มีรูป ${missingImg}`);
  console.log("สินค้าที่เดาหมวดจากชื่อ:", fallbackCount);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
