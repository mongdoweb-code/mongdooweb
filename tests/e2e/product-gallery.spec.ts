// รูปภาพประกอบใต้ Data Sheet: อัปโหลดหลายรูปพร้อมกัน → เรียง/คำบรรยาย → รูปแบบ + แถบเลื่อน → บันทึก → หน้าสินค้าแสดงตามแบบ → คลิกเปิดเต็มจอ
import { expect, test } from "@playwright/test";
import pg from "pg";
import sharp from "sharp";
import { V, login } from "./helpers";

async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const TAG = Date.now().toString(36);
const ID = `e2e-gal-${TAG}`, SLUG = `e2e-gallery-${TAG}`;
const png = (r: number, g: number, b: number) => sharp({ create: { width: 640, height: 480, channels: 3, background: { r, g, b } } }).png().toBuffer();

test.beforeAll(async () => {
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" WHERE "isActive" ORDER BY "sortOrder" LIMIT 1`);
  await q(`INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "categoryId", "sortOrder", "updatedAt") VALUES ($1, $2, $3, 'ทดสอบรูปประกอบ E2E', 50000, $4, 99997, now())`, [ID, `E2E-GAL-${TAG}`, SLUG, cat.id]);
});
test.afterAll(async () => { await q(`DELETE FROM "Product" WHERE id=$1`, [ID]); });

test("หลังบ้าน: อัปโหลดหลายรูป + รูปแบบ + แถบเลื่อน → หน้าสินค้าแสดงตามแบบ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto(`/admin/products/${ID}#sec-gallery`);
  const box = page.locator("#sec-gallery");
  await expect(box).toBeVisible();
  const files = await Promise.all([png(30, 90, 160), png(40, 140, 90), png(200, 80, 30), png(90, 60, 180)]);
  await expect(async () => {
    await box.locator("[data-gallery-file]").setInputFiles(files.map((buffer, i) => ({ name: `g${i + 1}.png`, mimeType: "image/png", buffer })));
    await expect(box.locator("[data-gallery-item]")).toHaveCount(4, { timeout: 20_000 });
  }).toPass({ timeout: 60_000 });
  // คำบรรยาย + ย้ายรูปที่ 4 ขึ้นก่อนด้วย ‹
  await box.getByRole("textbox", { name: "คำบรรยายรูปที่ 1" }).fill("ทางเดินสวน");
  for (let i = 0; i < 3; i++) await box.getByRole("button", { name: `เลื่อนรูปที่ ${4 - i} ไปก่อน` }).click({ force: true });
  const firstKey = await box.locator("[data-gallery-item]").first().getAttribute("data-gallery-item");
  await box.locator("#glTitle").fill("ภาพตัวอย่างงานติดตั้ง");
  await box.locator('[data-layout="bigLeft"]').click();
  // แถบเลื่อน: ระยะห่าง 20 · ระยะขอบ 12 · รัศมี 10 (ใช้คีย์บอร์ดบนแถบเลื่อน)
  const setRange = async (id: string, v: number) => box.locator(`#${id}`).evaluate((el, val) => {
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    s.call(el, String(val));
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
  await setRange("glGap", 20);
  await setRange("glPad", 12);
  await setRange("glRadius", 10);
  await expect(box.locator('output[for="glGap"]')).toHaveText("20");
  // ตัวอย่างสดในหลังบ้าน
  await expect(box.locator('[data-gallery-preview] [data-block="bigLeft"]')).toHaveCount(1);
  await page.locator('button[form="productForm"], #productForm button[type=submit]').first().click();
  await expect.poll(async () => (await q<{ g: { layout: string; gap: number; pad: number; radius: number; title: string; items: { key: string; cap: string }[] } | null }>(`SELECT gallery g FROM "Product" WHERE id=$1`, [ID]))[0].g, { timeout: 20_000 })
    .toMatchObject({ layout: "bigLeft", gap: 20, pad: 12, radius: 10, title: "ภาพตัวอย่างงานติดตั้ง" });
  const [{ g }] = await q<{ g: { items: { key: string; cap: string }[] } }>(`SELECT gallery g FROM "Product" WHERE id=$1`, [ID]);
  expect(g.items).toHaveLength(4);
  expect(g.items[0].key).toBe(firstKey);
  expect(g.items[1].cap).toBe("ทางเดินสวน");

  // หน้าสินค้า: ใต้ Data Sheet · 4 รูป = คอลลาจ 3 + เรียง 1 · ตัวแปรระยะ · คลิกเปิดเต็มจอ
  await page.goto(`/product/${SLUG}`);
  const sec = page.locator(".pg-sec" + V);
  await expect(sec.locator("#pg-h")).toHaveText("ภาพตัวอย่างงานติดตั้ง");
  await expect(sec.locator('[data-block="bigLeft"] .pg-cell')).toHaveCount(3);
  await expect(sec.locator('[data-block="col1"] .pg-cell')).toHaveCount(1);
  expect(await sec.evaluate((e) => [getComputedStyle(e).getPropertyValue("--pg-gap"), getComputedStyle(e).paddingTop])).toEqual(["20px", "12px"]);
  await expect(sec.locator(".pg-cell").first()).toHaveCSS("border-top-left-radius", "10px");
  await expect(sec.locator(".pg-cap-over", { hasText: "ทางเดินสวน" })).toBeVisible();
  await sec.locator(".pg-img").nth(1).click();
  await expect(page.locator(".lb-count")).toContainText("2");
  await page.keyboard.press("Escape");

  // ลบทุกรูป → บันทึก → ส่วนนี้หายจากหน้าสินค้า
  await page.goto(`/admin/products/${ID}#sec-gallery`);
  await expect(async () => {
    while (await box.locator("[data-gallery-item]").count()) await box.getByRole("button", { name: /^ลบรูปที่ 1$/ }).click();
    await expect(box.locator("[data-gallery-item]")).toHaveCount(0, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await page.locator('button[form="productForm"], #productForm button[type=submit]').first().click();
  await expect.poll(async () => (await q<{ g: unknown }>(`SELECT gallery g FROM "Product" WHERE id=$1`, [ID]))[0].g, { timeout: 20_000 }).toBeNull();
  await page.goto(`/product/${SLUG}`);
  await expect(page.locator(".pg-sec")).toHaveCount(0);
});

test("ลายน้ำ (ตั้งค่าร้าน) + อัตราส่วน 9:16: ไฟล์ที่ลูกค้าเห็นมีลายน้ำจริง ต้นฉบับไม่เปลี่ยน", async ({ page, request }) => {
  const [{ w: oldWm }] = await q<{ w: unknown }>(`SELECT watermark w FROM "ShopSetting" WHERE id='shop'`);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await login(page);
    // ตั้งลายน้ำ: แถบขาวทึบ 400×120 ล่างขวา ขนาด 40% ความทึบ 100%
    const mark = await sharp({ create: { width: 400, height: 120, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
    await page.goto("/admin/settings#watermark");
    const wf = page.locator("#watermark");
    await wf.locator("#watermarkFile").setInputFiles({ name: "wm.png", mimeType: "image/png", buffer: mark });
    const setRange = async (id: string, v: number) => wf.locator(`#${id}`).evaluate((el, val) => {
      const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      s.call(el, String(val));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, v);
    await expect(async () => { await setRange("wmSize", 40); await expect(wf.locator('output[for="wmSize"]')).toHaveText("40", { timeout: 500 }); }).toPass({ timeout: 10_000 });
    await setRange("wmOpacity", 100);
    await wf.getByRole("radio", { name: "ล่างขวา" }).click();
    await page.locator("button[type=submit]:has-text('บันทึกการตั้งค่า')" + V).first().click();
    await expect.poll(async () => (await q<{ w: { key?: string; size?: number; pos?: string } }>(`SELECT watermark w FROM "ShopSetting" WHERE id='shop'`))[0].w, { timeout: 20_000 })
      .toMatchObject({ size: 40, opacity: 100, pos: "br", key: expect.stringMatching(/^logo\/.+\.webp$/) });

    // รูปประกอบ: 1 รูป สีเข้ม · เรียง 1 · 9:16 · เปิดลายน้ำ
    await page.goto(`/admin/products/${ID}#sec-gallery`);
    const box = page.locator("#sec-gallery");
    await expect(box.locator("[data-gallery-wm]")).toBeEnabled();
    await expect(async () => {
      await box.locator("[data-gallery-file]").setInputFiles({ name: "dark.png", mimeType: "image/png", buffer: await png(20, 40, 90) });
      await expect(box.locator("[data-gallery-item]")).toHaveCount(1, { timeout: 20_000 });
    }).toPass({ timeout: 60_000 });
    await box.locator('[data-layout="col1"]').click();
    await box.locator('[data-ratio="9:16"]').click();
    await expect(box.locator("[data-gallery-wm]")).toBeChecked();
    await expect(box.locator("[data-gallery-preview] .pg-wm")).toHaveCount(1); // ตัวอย่างลายน้ำในหลังบ้าน
    await page.locator('button[form="productForm"]').first().click();
    await expect.poll(async () => (await q<{ g: { ratio?: string; layout?: string } | null }>(`SELECT gallery g FROM "Product" WHERE id=$1`, [ID]))[0].g, { timeout: 20_000 }).toMatchObject({ layout: "col1", ratio: "9:16", wm: true });

    await page.goto(`/product/${SLUG}`);
    const img = page.locator(".pg-sec .pg-img img" + V).first();
    const src = await img.getAttribute("src");
    expect(src).toMatch(/^\/media\/wm\/[0-9a-z]+\/products\/.+\.webp$/);
    const box9 = await page.locator(".pg-sec .pg-img" + V).first().boundingBox();
    expect(Math.abs(box9!.height / box9!.width - 16 / 9)).toBeLessThan(0.03);
    // ไฟล์จริง: มุมล่างขวาเป็นสีขาวของลายน้ำ · มุมบนซ้ายยังเป็นสีเดิม · ไฟล์ต้นฉบับไม่มีลายน้ำ
    const res = await request.get(src!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/webp");
    const pix = async (buf: Buffer, fx: number, fy: number) => {
      const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
      const i = (Math.round(info.height * fy) * info.width + Math.round(info.width * fx)) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const marked = Buffer.from(await res.body());
    expect((await pix(marked, 0.85, 0.9)).every((c) => c > 230)).toBe(true);
    expect((await pix(marked, 0.1, 0.1))[0]).toBeLessThan(60);
    const orig = Buffer.from(await (await request.get(src!.replace(/^\/media\/wm\/[0-9a-z]+\//, "/media/"))).body());
    expect((await pix(orig, 0.85, 0.9))[0]).toBeLessThan(60);
  } finally {
    await q(`UPDATE "ShopSetting" SET watermark=$1::jsonb WHERE id='shop'`, [JSON.stringify(oldWm ?? {})]);
  }
});
