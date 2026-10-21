// ย้ายรูป/ลิงก์ในคำอธิบายสินค้าที่ยังชี้ไปเว็บ WordPress เดิม (จะใช้ไม่ได้หลังย้าย DNS) — รันซ้ำได้ (idempotent)
//   npm run migrate:desc-images              ดาวน์โหลดรูป + แก้ลิงก์
//   npm run migrate:desc-images -- --dry     ดูว่าจะเปลี่ยนอะไรบ้าง ไม่เขียนฐานข้อมูล/ไฟล์
//   npm run migrate:desc-images -- --build   โหมดตอน build บน Railway: ไม่ทำให้ build ล้ม; ถ้า STORAGE_DRIVER ไม่ใช่ s3
//                                            จะแก้เฉพาะลิงก์ (ตอน build เขียนไฟล์ลง volume ไม่ได้)
// สิ่งที่ทำกับ Product.description และ Product.shortDescription:
// - <img src="(เว็บเดิม)/wp-content/uploads/..."> → ดาวน์โหลดครั้งเดียว ย่อเป็น WebP ผ่าน saveImage("products") แล้วเปลี่ยน src เป็น /media/...
//   โหลดไม่ได้ (404/เน็ตล่ม/ไม่ใช่รูป) → บันทึก log และคง src เดิมไว้ (รันใหม่ภายหลังได้)
// - <a href="(เว็บเดิม)/wp-content/uploads/รูป.jpg"> ที่ครอบรูปไว้ → เหลือแต่รูป · ลิงก์ข้อความไปไฟล์รูป → ลิงก์ไปรูปที่ย้ายแล้ว
// - ลิงก์ไปหน้าอื่นของเว็บเดิม → path ภายในเว็บใหม่ (สินค้าที่รู้จัก → /product/<slug> ตรงๆ, ที่เหลือ → path เดิมให้ redirect 301 จัดการ
//   หรือ /products เมื่อไม่มี redirect รองรับ)
// - รูปอีโมจิของ WordPress (s.w.org/images/core/emoji) → ตัวอีโมจิจาก alt
// ผลลัพธ์ผ่าน sanitizeDescription อีกครั้งก่อนบันทึก (ต้องไม่ทำให้รูป /media หายไป ไม่เช่นนั้นจะไม่บันทึกสินค้านั้น)
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OLD_HOST_SQL, makeLinkResolver, migrateHtml } from "./lib/desc-migrate";

async function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes("--dry");
  const build = argv.includes("--build");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../generated/prisma/client");
  const { sanitizeDescription } = await import("../src/lib/html");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const where = {
      OR: OLD_HOST_SQL.flatMap((h) => [{ description: { contains: h } }, { shortDescription: { contains: h } }]),
    };
    const rows = await prisma.product.findMany({ where, select: { id: true, sku: true, description: true, shortDescription: true } });
    if (!rows.length) return console.log("คำอธิบายสินค้าไม่มีลิงก์/รูปจากเว็บเดิมแล้ว — ไม่ต้องทำอะไร");
    console.log(`พบสินค้า ${rows.length} รายการที่ยังอ้างถึงเว็บเดิม${dry ? " (ทดลอง ไม่บันทึก)" : ""}`);

    const driver = process.env.STORAGE_DRIVER ?? "local";
    const canStore = !dry && !(build && driver !== "s3");
    if (!canStore && !dry) console.log(`STORAGE_DRIVER=${driver} ตอน build — แก้เฉพาะลิงก์ (รูปให้รัน npm run migrate:desc-images บนเซิร์ฟเวอร์)`);

    // รูปที่สคริปต์นำเข้า WooCommerce เคยโหลดไว้ (ถ้ามีไฟล์ cache ในเครื่อง) — ใช้ซ้ำได้ถ้าไฟล์ยังอยู่จริง
    const { saveImage } = await import("../src/lib/media");
    const { storage } = await import("../src/lib/storage");
    const cacheFile = join(process.env.UPLOAD_DIR ?? "uploads", ".woo-image-cache.json");
    const wooCache: Record<string, string | null> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
    const done = new Map<string, Promise<string | null>>();
    let ok = 0, failed = 0, active = 0;
    const queue: (() => void)[] = [];
    const slot = async () => {
      if (active >= 4) await new Promise<void>((r) => queue.push(r));
      active++;
    };
    const release = () => {
      active--;
      queue.shift()?.();
    };

    async function download(url: string): Promise<string | null> {
      const cached = wooCache[url];
      if (cached && (await storage().get(cached).catch(() => null))) return `/media/${cached}`;
      if (!canStore) return null;
      let href: string;
      try {
        href = new URL(url.startsWith("//") ? `https:${url}` : url).href;
      } catch {
        return null;
      }
      await slot();
      try {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const res = await fetch(href, { headers: { "User-Agent": "mongdoweb-migration" }, signal: AbortSignal.timeout(30_000), redirect: "follow" });
            if (res.status === 404 || res.status === 410) throw Object.assign(new Error(`HTTP ${res.status}`), { final: true });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const key = await saveImage(Buffer.from(await res.arrayBuffer()), "products");
            ok++;
            return `/media/${key}`;
          } catch (e) {
            if (attempt === 2 || (e as { final?: boolean }).final || (e as Error).name === "MediaError") {
              failed++;
              console.warn(`  ! โหลดรูปไม่ได้ (คง src เดิมไว้) ${url}: ${(e as Error).message}`);
              return null;
            }
          }
        }
        return null;
      } finally {
        release();
      }
    }
    const image = (url: string) => {
      if (!done.has(url)) done.set(url, download(url));
      return done.get(url)!;
    };
    const link = makeLinkResolver(async (legacyPath) => {
      const p = await prisma.product.findFirst({ where: { legacyPath, isActive: true }, select: { slug: true } });
      return p?.slug ?? null;
    });

    const mediaCount = (h: string) => (h.match(/src="\/media\//g) ?? []).length;
    let changed = 0;
    for (const r of rows) {
      const data: { description?: string | null; shortDescription?: string | null } = {};
      for (const field of ["description", "shortDescription"] as const) {
        const before = r[field];
        if (!before) continue;
        const migrated = await migrateHtml(before, { image, link });
        if (migrated === before) continue;
        const clean = sanitizeDescription(migrated) || null;
        if (mediaCount(clean ?? "") < mediaCount(migrated)) {
          console.warn(`  ! ${r.sku} ${field}: ผลลัพธ์ไม่ผ่านตัวกรอง HTML — ข้าม`);
          continue;
        }
        data[field] = clean;
      }
      if (!Object.keys(data).length) continue;
      changed++;
      if (!dry) await prisma.product.update({ where: { id: r.id }, data });
    }
    console.log(`แก้คำอธิบายสินค้า ${changed} รายการ · ย้ายรูป ${ok} รูป · โหลดไม่ได้ ${failed} รูป`);
    if (changed && !dry) {
      // ล้างแคชหน้าร้าน (หน้า/ข้อมูลสินค้าใช้ tag "storefront") — ตอน build ไม่มีแคชเก่า ข้ามได้
      console.log("หน้าร้านจะแสดงคำอธิบายใหม่เมื่อแคชหมดอายุ (≤ 1 ชม.) หรือหลัง deploy ครั้งถัดไป");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  // ตอน build ห้ามทำให้ build ล้มเพราะการย้ายรูป
  process.exit(process.argv.includes("--build") ? 0 : 1);
});
