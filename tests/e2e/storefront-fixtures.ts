// ข้อมูลทดสอบหน้าร้านที่ฐานข้อมูลใหม่ (migrate + seed อย่างเดียว เช่นใน CI) ไม่มี:
//   สินค้าที่มีหลายรูป + นับสต็อก (เหลือ ≤ 5) + URL เดิมของ WooCommerce (wooId 27, /product/led-strip-...),
//   สินค้าราคา 0 (สอบถามราคา) ที่มีรูป
// สร้างเฉพาะส่วนที่ขาด (ฐานข้อมูลจริงที่นำเข้าสินค้าแล้วจะไม่ถูกแตะ) แล้วลบ/คืนค่าเมื่อจบ
// หน้าร้านแคชข้อมูลไว้ (tag storefront) → บันทึกตั้งค่าร้านในหลังบ้าน 1 ครั้งเพื่อล้างแคชหลังสร้าง/ลบ
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, type Browser } from "@playwright/test";
import pg from "pg";
import sharp from "sharp";
import { V, login } from "./helpers";

const IMG_KEYS = ["products/e2e/fx-red-1.webp", "products/e2e/fx-red-2.webp", "products/e2e/fx-red-3.webp"];
const ASK_KEY = "products/e2e/fx-ask-1.webp";
const COLORS = ["#d23c2c", "#2c7bd2", "#2cd27b", "#d2b02c"];

async function writeImage(key: string, color: string) {
  const dir = process.env.UPLOAD_DIR ?? "uploads";
  for (const [k, size] of [[key, 800], [key.replace(/\.webp$/, "-sm.webp"), 480]] as const) {
    const buf = await sharp({ create: { width: size, height: size, channels: 3, background: color } }).webp({ quality: 70 }).toBuffer();
    const p = join(dir, k);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, buf);
  }
}

/** บันทึกตั้งค่าร้าน (ไม่เปลี่ยนค่า) → หลังบ้านเรียก updateTag("storefront") ให้หน้าร้านอ่านข้อมูลใหม่ */
export async function refreshStorefront(browser: Browser) {
  const page = await browser.newPage();
  try {
    await login(page);
    await page.goto("/admin/settings");
    await page.locator("button[type=submit]:has-text('บันทึกการตั้งค่า')" + V).first().click();
    await expect(page.locator(".login-info[role=status]" + V).first()).toBeVisible();
  } finally {
    await page.close();
  }
}

export type Fixtures = { changed: boolean; cleanup: (browser: Browser) => Promise<void> };

export async function ensureStorefrontFixtures(browser: Browser): Promise<Fixtures> {
  const db = new pg.Client({ connectionString: (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "") });
  await db.connect();
  const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows as T[];
  const created: string[] = [];
  try {
    const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" WHERE slug = 'underwater-light'`);
    const active = `p."isActive" AND NOT p."isService" AND c."isActive"`;
    const has = async (where: string) =>
      (await q(`SELECT 1 FROM "Product" p JOIN "Category" c ON c.id = p."categoryId" WHERE ${active} AND ${where} LIMIT 1`)).length > 0;

    // สินค้าที่มีรูปหลายรูป นับสต็อก เหลือน้อย และมี URL เดิมจาก WooCommerce
    const needRed = !(await has(`p.slug = 'red-5050-led'`)) || !(await has(`p."priceSatang" > 0 AND cardinality(p.images) > 1 AND p."trackStock" AND p.stock BETWEEN 1 AND 5`));
    if (needRed && !(await q(`SELECT 1 FROM "Product" WHERE slug = 'red-5050-led'`)).length) {
      for (const [i, k] of IMG_KEYS.entries()) await writeImage(k, COLORS[i]);
      const wooFree = !(await q(`SELECT 1 FROM "Product" WHERE "wooId" = 27`)).length;
      const legacy = "/product/led-strip-ไฟเส้นแอลอีดีเส้นสีแดง-5050";
      const legacyFree = !(await q(`SELECT 1 FROM "Product" WHERE "legacyPath" = $1`, [legacy])).length;
      const [r] = await q<{ id: string }>(
        `INSERT INTO "Product" (id, sku, slug, name, description, "shortDescription", "priceSatang", "trackStock", stock, "inStock", images, "lightColor", "useAreas", "categoryId", "wooId", "legacyPath", "sortOrder", "updatedAt")
         VALUES ($1, 'E2E-RED-5050', 'red-5050-led', 'ไฟเส้น LED สีแดง 5050 12V กันน้ำ (ทดสอบ)', $2, $3, 25000, true, 3, true, $4, 'RGB', '{POOL,POND}', $5, $6, $7, -1, now()) RETURNING id`,
        [
          `e2e-fx-red-${Date.now()}`,
          "<p>ไฟเส้น LED สีแดง ชนิด 5050 ใช้ไฟ 12V กันน้ำ IP65 ยาว 5 เมตร เหมาะกับงานตกแต่งสระและบ่อน้ำ</p>",
          "<p>ไฟเส้นสีแดง 5050 กันน้ำ 12V</p>",
          IMG_KEYS,
          cat.id,
          wooFree ? 27 : null,
          legacyFree ? legacy : null,
        ],
      );
      created.push(r.id);
    }
    // สินค้าราคา 0 = สอบถามราคา (มีรูป)
    if (!(await has(`p."priceSatang" = 0 AND cardinality(p.images) > 0`)) && !(await q(`SELECT 1 FROM "Product" WHERE slug = 'e2e-fx-ask'`)).length) {
      await writeImage(ASK_KEY, COLORS[3]);
      const [r] = await q<{ id: string }>(
        `INSERT INTO "Product" (id, sku, slug, name, description, "priceSatang", images, "lightColor", "categoryId", "sortOrder", "updatedAt")
         VALUES ('e2e-fx-ask-' || floor(extract(epoch from now()) * 1000)::bigint, 'E2E-ASK-1', 'e2e-fx-ask', 'โคมไฟใต้น้ำสั่งทำ (ทดสอบ สอบถามราคา)', '<p>สินค้าสั่งทำตามขนาดงาน กรุณาสอบถามราคาทาง LINE</p>', 0, $1, 'WHITE', $2, -1, now()) RETURNING id`,
        [[ASK_KEY], cat.id],
      );
      created.push(r.id);
    }
  } finally {
    await db.end();
  }
  if (created.length) await refreshStorefront(browser);
  return {
    changed: created.length > 0,
    async cleanup(b: Browser) {
      if (!created.length) return;
      const c = new pg.Client({ connectionString: (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "") });
      await c.connect();
      try {
        for (const id of created) {
          // สินค้าที่ถูกสั่งซื้อ/อยู่ในเอกสารระหว่างทดสอบลบไม่ได้ → ปิดขายแทน
          await c.query(`DELETE FROM "StockMovement" WHERE "productId" = $1`, [id]).catch(() => {});
          await c.query(`DELETE FROM "Product" WHERE id = $1`, [id]).catch(() =>
            c.query(`UPDATE "Product" SET "isActive" = false, "wooId" = NULL, "legacyPath" = NULL, slug = slug || '-' || extract(epoch from now())::bigint, sku = sku || '-' || extract(epoch from now())::bigint WHERE id = $1`, [id]),
          );
        }
      } finally {
        await c.end();
      }
      await refreshStorefront(b);
    },
  };
}
