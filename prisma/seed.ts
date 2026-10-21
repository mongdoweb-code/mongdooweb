// prisma/seed.ts — ใส่ข้อมูลเริ่มต้น (รันซ้ำได้ ไม่สร้างข้อมูลซ้ำ)
// รัน: npx prisma db seed
// - สไลด์ 5 อัน + หมวดหมู่ 12 หมวด จาก docs/shared-data.js (ไฟล์เดียวกับที่ต้นแบบใช้)
// - สินค้าตัวอย่างจากต้นแบบ (ราคายังเป็นค่าตัวอย่าง)
// - ตั้งค่าร้าน (ค่าตัวอย่าง ต้องแก้จากหลังบ้าน) + แอดมินคนแรก
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type CategoryGroup,
  type LightColor,
  type UseArea,
} from "../generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ---------- ข้อมูลกลางจากต้นแบบ ----------

type SharedSlide = {
  id: string; active: boolean; order: number; image: string;
  focal: { x: number; y: number }; alt: string; eyebrow: string; title: string; subtitle: string;
  cta1: { label: string; href: string }; cta2: { label: string; href: string } | null;
  align: "left" | "center"; overlay: number; startAt: string | null; endAt: string | null; credit: string;
};
type SharedCategory = {
  id: string; th: string; en: string; icon: string; group: string; slug: string;
  popular: string[]; visible: boolean; order: number;
};

// shared-data.js เป็นสคริปต์ธรรมดา (ไม่ใช่ module) จึงอ่านเป็นข้อความแล้วดึงค่าคงที่ออกมา
function loadSharedData() {
  const src = readFileSync(join(__dirname, "../docs/shared-data.js"), "utf8");
  return new Function(`${src}\nreturn { DEFAULT_SLIDES, DEFAULT_CATEGORIES };`)() as {
    DEFAULT_SLIDES: SharedSlide[];
    DEFAULT_CATEGORIES: SharedCategory[];
  };
}

// slug ใหม่ภาษาอังกฤษ (URL เดิมภาษาไทยเก็บใน legacySlug ไว้ทำ redirect 301)
const CATEGORY_SLUG: Record<string, string> = {
  underwater: "underwater-light",
  pool: "pool-light",
  fountain: "fountain-light",
  uplight: "uplight-led",
  garden: "garden-light",
  spot: "spotlight-led",
  wash: "led-wall-washer",
  wall: "wall-lamp",
  down: "downlight-led",
  stage: "stage-lighting",
  strip: "strip-light",
  decor: "home-garden-decor",
};
// TODO: slug เดิมของ "ไฟส่องตึก" ซ้ำกับ "ไฟเวทีคอนเสิร์ต" — รอเจ้าของร้านยืนยัน slug จริง
const LEGACY_SLUG_UNKNOWN = new Set(["wash"]);

// สินค้าตัวอย่าง: รวม CATALOG (หน้าร้าน) + SEED_PRODUCTS (เอกสารขาย) ในต้นแบบ
// TODO: ราคาและรายการเป็นค่าตัวอย่าง — แทนด้วยข้อมูลจริงตอนนำเข้าจาก WooCommerce
type SeedProduct = {
  sku: string; slug: string; name: string; categoryKey: string; unit: string; price: number;
  specs?: string[]; badge?: string; best?: boolean; use?: UseArea[]; color?: LightColor;
  kit?: boolean; acc?: boolean; service?: boolean;
};
const PRODUCTS: SeedProduct[] = [
  { sku: "UW-RGB-10", slug: "uw-rgb", name: "โคมไฟใต้น้ำ RGB เปลี่ยนสีได้ พร้อมรีโมท (ชุดพร้อมใช้)", categoryKey: "underwater", unit: "ชุด", price: 890, specs: ["10W COB", "DC12V", "IP67"], badge: "ขายดี", best: true, use: ["POND", "FOUNTAIN"], color: "RGB", kit: true },
  { sku: "UW-WH-10", slug: "uw-white", name: "โคมไฟใต้น้ำ 10W แสงขาว White DC12V", categoryKey: "underwater", unit: "ชิ้น", price: 590, specs: ["10W", "850 LM", "IP67"], best: true, use: ["POND", "FOUNTAIN"], color: "WHITE" },
  { sku: "PL-RGB-12", slug: "pool-rgb", name: "โคมไฟสระว่ายน้ำ LED RGB สแตนเลส", categoryKey: "pool", unit: "ชิ้น", price: 1290, specs: ["12W", "IP68", "RGB"], badge: "แนะนำ", best: true, use: ["POOL"], color: "RGB" },
  { sku: "FT-RING", slug: "fountain-ring", name: "ไฟส่องน้ำพุ LED แบบวงแหวน", categoryKey: "fountain", unit: "ชุด", price: 1490, specs: ["DC12V", "IP68", "สแตนเลส"], best: true, use: ["FOUNTAIN"], color: "ANY" },
  { sku: "PL-WH-12", slug: "pool-white", name: "โคมไฟสระว่ายน้ำ LED แสงขาว สแตนเลส", categoryKey: "pool", unit: "ชิ้น", price: 1190, specs: ["12W", "IP68", "แสงขาว"], use: ["POOL"], color: "WHITE" },
  { sku: "GL-WH", slug: "garden-white", name: "ไฟส่องต้นไม้ LED แบบปักดิน แสงขาว", categoryKey: "garden", unit: "ชิ้น", price: 450, specs: ["DC12V", "ปักดิน"], use: ["GARDEN"], color: "WHITE" },
  { sku: "GL-RGB", slug: "garden-rgb", name: "ไฟส่องต้นไม้ LED แบบปักดิน RGB", categoryKey: "garden", unit: "ชิ้น", price: 590, specs: ["DC12V", "RGB"], use: ["GARDEN"], color: "RGB" },
  { sku: "PSU-12V", slug: "psu", name: "หม้อแปลงไฟ DC12V สำหรับไฟ LED", categoryKey: "underwater", unit: "ตัว", price: 350, specs: ["AC220V → DC12V"], acc: true },
  { sku: "ACC-SHRINK", slug: "shrink", name: "ท่อหดกันน้ำ สำหรับต่อสายเพิ่ม", categoryKey: "underwater", unit: "ชิ้น", price: 59, specs: ["กันน้ำรอยต่อ"], acc: true },
  { sku: "DL1-ww", slug: "dl1-ww", name: "โคมไฟฝังฝ้า ไฟดาวไลท์ Downlight 1w (วอร์มไวท์)", categoryKey: "down", unit: "อัน", price: 190 },
  { sku: "GDL-F24WH-1-2-1-1", slug: "gdl-f24wh-1-2-1-1", name: "ไฟส่องต้นไม้ ไฟส่องสวนหย่อม ไฟส่องสนามหญ้า 24W แสงวอร์มไวท์", categoryKey: "garden", unit: "ชุด", price: 2150 },
  // ค่าบริการ — ใช้ในเอกสารขายเท่านั้น ไม่ตัดสต็อก ไม่แสดงหน้าร้าน
  { sku: "Shipping", slug: "shipping", name: "ค่าส่งสินค้า", categoryKey: "decor", unit: "กล่อง", price: 60, service: true },
];

const satang = (baht: number) => Math.round(baht * 100);

async function main() {
  const { DEFAULT_SLIDES, DEFAULT_CATEGORIES } = loadSharedData();

  // หมวดหมู่
  const categoryIdByKey = new Map<string, string>();
  for (const c of DEFAULT_CATEGORIES) {
    const slug = CATEGORY_SLUG[c.id];
    if (!slug) throw new Error(`ไม่มี slug ภาษาอังกฤษสำหรับหมวด ${c.id}`);
    const data = {
      legacySlug: LEGACY_SLUG_UNKNOWN.has(c.id) ? null : c.slug,
      nameTh: c.th,
      nameEn: c.en,
      icon: c.icon,
      group: c.group.toUpperCase() as CategoryGroup,
      popular: c.popular.slice(0, 4),
      sortOrder: c.order,
      isActive: c.visible,
    };
    const row = await prisma.category.upsert({ where: { slug }, update: data, create: { slug, ...data } });
    categoryIdByKey.set(c.id, row.id);
  }

  // สไลด์ — ใส่เฉพาะตอนตารางยังว่าง (ไม่ทับสไลด์ที่แอดมินแก้แล้ว)
  if ((await prisma.heroSlide.count()) === 0) {
    await prisma.heroSlide.createMany({
      data: DEFAULT_SLIDES.map((s) => ({
        sortOrder: s.order,
        isActive: s.active,
        imageUrl: s.image,
        focalX: s.focal.x,
        focalY: s.focal.y,
        alt: s.alt,
        eyebrow: s.eyebrow,
        title: s.title,
        subtitle: s.subtitle,
        cta1Label: s.cta1.label,
        cta1Href: s.cta1.href,
        cta2Label: s.cta2?.label ?? null,
        cta2Href: s.cta2?.href ?? null,
        align: s.align === "center" ? "CENTER" : "LEFT",
        overlay: Math.max(30, s.overlay),
        startAt: s.startAt ? new Date(s.startAt) : null,
        endAt: s.endAt ? new Date(s.endAt) : null,
        credit: s.credit,
      })),
    });
  }

  // สินค้า
  for (const p of PRODUCTS) {
    const categoryId = categoryIdByKey.get(p.categoryKey);
    if (!categoryId) throw new Error(`ไม่พบหมวด ${p.categoryKey} ของสินค้า ${p.sku}`);
    const data = {
      slug: p.slug,
      name: p.name,
      unit: p.unit,
      isService: p.service ?? false,
      priceSatang: satang(p.price),
      specs: (p.specs ?? []).map((value) => ({ label: "", value })),
      useAreas: p.use ?? [],
      lightColor: p.color ?? "ANY",
      includesPsu: p.kit ?? false,
      isAccessory: p.acc ?? false,
      badge: p.badge ?? null,
      isBestSeller: p.best ?? false,
      categoryId,
    };
    await prisma.product.upsert({ where: { sku: p.sku }, update: data, create: { sku: p.sku, ...data } });
  }

  // ตั้งค่าร้าน (ข้อมูลจากเจ้าของร้าน) — สร้างครั้งแรกเท่านั้น หลังจากนั้นแก้จากหลังบ้าน /admin/settings
  // TODO: ชื่อบัญชีธนาคาร, PromptPay, ที่อยู่ และเลขผู้เสียภาษี รอเจ้าของร้านยืนยัน
  await prisma.shopSetting.upsert({
    where: { id: "shop" },
    update: {},
    create: {
      id: "shop",
      legalName: "ร้านมองดูเว็บ",
      bankAccounts: [
        { bank: "KBANK", account: "4982105000", holder: "" },
        { bank: "SCB", account: "0852358798", holder: "" },
      ],
      promptpayId: null,
      promptpayName: "มองดูเว็บ",
      // ค่าส่งตามยอดสั่งซื้อ 6 ขั้น (ช่วงยอดเป็นค่าเริ่มต้น แก้ได้ในหลังบ้าน)
      shippingTiers: [
        { minSatang: 0, feeSatang: 6000 },
        { minSatang: 100000, feeSatang: 10000 },
        { minSatang: 300000, feeSatang: 15000 },
        { minSatang: 500000, feeSatang: 25000 },
        { minSatang: 1000000, feeSatang: 36000 },
        { minSatang: 2000000, feeSatang: 0 },
      ],
      slipCheckWithin: "ภายใน 2 ชั่วโมง ในเวลาทำการ",
      addressText: "88/2 หมู่ที่ 8 ตำบลบางกรวย อำเภอบางกรวย จังหวัดนนทบุรี 11130",
      phone: "080-884-9597",
      email: "mongdoweb@gmail.com",
      lineId: "@mongdoweb",
      lineOaUrl: "https://line.me/ti/p/~@mongdoweb",
      website: "https://www.mongdooweb.com",
      businessHours: "จ.–ส. 09:00–18:00",
    },
  });

  // แอดมินคนแรก (OWNER) — สร้างครั้งเดียว ไม่รีเซ็ตรหัสผ่านถ้ามีอยู่แล้ว
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!(await prisma.admin.findUnique({ where: { username } }))) {
    if (!password) throw new Error("ตั้งค่า SEED_ADMIN_PASSWORD ใน .env ก่อนสร้างแอดมินคนแรก");
    await prisma.admin.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
        displayName: "เจ้าของร้าน",
        role: "OWNER",
        // รหัสจาก .env เป็นรหัสเริ่มต้น — ต้องตั้งรหัสใหม่ตอนเข้าสู่ระบบครั้งแรก (CI/เทสต์ตั้ง SEED_ADMIN_FORCE_CHANGE=0)
        mustChangePassword: process.env.SEED_ADMIN_FORCE_CHANGE !== "0",
      },
    });
  }

  console.log(
    `seed เสร็จ: หมวด ${await prisma.category.count()} · สไลด์ ${await prisma.heroSlide.count()} · สินค้า ${await prisma.product.count()} · แอดมิน ${await prisma.admin.count()}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
