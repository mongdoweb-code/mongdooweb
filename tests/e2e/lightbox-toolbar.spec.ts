// ดูรูปสินค้าเต็มจอแบบ Fancybox: ตัวนับซ้ายบน · แถบเครื่องมือ (ขยาย/ย่อ/1:1/หมุน/พลิก/รีเซ็ต) · เล่นสไลด์ · รูปย่อด้านล่าง · ล้อเมาส์/ลากดู
import { expect, test, type Page } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import pg from "pg";
import { ensureStorefrontFixtures } from "./storefront-fixtures";
import { trackErrors } from "./helpers";

let slug = "";
test.beforeAll(async ({ browser }) => {
  await ensureStorefrontFixtures(browser);
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const r = await c.query(`SELECT slug FROM "Product" WHERE "isActive" AND cardinality(images) > 2 ORDER BY "sortOrder" LIMIT 1`);
    if (!r.rows.length) {
      const r2 = await c.query(`SELECT slug FROM "Product" WHERE "isActive" AND cardinality(images) > 1 ORDER BY "sortOrder" LIMIT 1`);
      slug = r2.rows[0].slug;
    } else slug = r.rows[0].slug;
  } finally {
    await c.end();
  }
});

// รูปจริงทุกไฟล์ใน /media (เครื่องทดสอบอาจไม่มีไฟล์รูปสินค้า → รูปแตกแล้วตรวจขนาดไม่ได้)
//   ใช้รูปขนาดเท่ารูปสินค้าจริง (1600×1600) — รูปเล็กไม่ล้นจอ จึงจับบั๊กรูปล้นทับรูปย่อไม่ได้
const BIG = path.join(os.tmpdir(), `mdw-lb-${process.pid}.png`);
test.beforeAll(async () => {
  await sharp({ create: { width: 1600, height: 1600, channels: 3, background: "#3a7bd5" } }).png().toFile(BIG);
});
test.beforeEach(async ({ page }) => {
  await page.route(/\/media\/.+\.(webp|avif|png|jpe?g)(\?.*)?$/, (r) => r.fulfill({ path: BIG, contentType: "image/png" }));
});
/** รูปต้องอยู่ในพื้นที่ระหว่างแถบบนกับแถบรูปย่อ (ไม่ล้นทับรูปย่อ) */
async function imageInsideStage(page: Page) {
  await expect.poll(() => page.locator(".lb-stage img").evaluate((e) => (e as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const img = (await page.locator(".lb-stage img").boundingBox())!;
  const st = (await page.locator(".lb-stage").boundingBox())!;
  const th = (await page.locator(".lb-thumbs").boundingBox())!;
  expect(img.height).toBeGreaterThan(100);
  expect(img.y).toBeGreaterThanOrEqual(st.y - 1);
  expect(img.y + img.height).toBeLessThanOrEqual(st.y + st.height + 1);
  expect(img.y + img.height).toBeLessThanOrEqual(th.y + 1);
}

const tf = (page: Page) => page.locator(".lb-stage img").evaluate((e) => (e as HTMLElement).style.transform);
const tool = (page: Page, name: string) => page.locator(".lb-top").getByRole("button", { name, exact: true });

test("แถบเครื่องมือ: ขยาย/ย่อ · หมุน · พลิก · รีเซ็ต · รูปย่อ · เล่นสไลด์ · ปิด", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1366, height: 860 });
  await page.goto(`/product/${encodeURIComponent(slug)}`);
  await page.locator(".gal-slide").first().click();
  const lb = page.locator("dialog.lb");
  await expect(lb).toBeVisible();
  const n = await page.locator(".lb-thumb").count();
  expect(n).toBeGreaterThan(1);
  await imageInsideStage(page);
  // ตัวนับมุมซ้ายบน
  const cnt = page.locator(".lb-count");
  await expect(cnt).toHaveText(`1 / ${n}`);
  const cb = (await cnt.boundingBox())!;
  expect(cb.x).toBeLessThan(80);
  expect(cb.y).toBeLessThan(50);
  // เครื่องมือครบ + มีป้ายชื่อไทย
  for (const name of ["ขยาย", "ย่อ", "ขนาดจริง 1:1", "หมุนซ้าย", "หมุนขวา", "พลิกแนวนอน", "พลิกแนวตั้ง", "รีเซ็ต", "เล่นสไลด์", "เต็มจอ", "ปิดรูปขยาย"]) {
    await expect(tool(page, name)).toBeVisible();
  }
  await expect(tool(page, "ย่อ")).toBeDisabled();
  await expect(tool(page, "รีเซ็ต")).toBeDisabled();

  await tool(page, "ขยาย").click();
  expect(await tf(page)).toContain("scale(1.5)");
  await expect(lb).toHaveClass(/is-zoomed/);
  await expect(tool(page, "ย่อ")).toBeEnabled();
  await tool(page, "ย่อ").click();
  expect(await tf(page)).toContain("scale(1)");

  await tool(page, "หมุนขวา").click();
  expect(await tf(page)).toContain("rotate(90deg)");
  await tool(page, "หมุนซ้าย").click();
  await tool(page, "หมุนซ้าย").click();
  expect(await tf(page)).toContain("rotate(-90deg)");
  await tool(page, "พลิกแนวนอน").click();
  expect(await tf(page)).toContain("scale(-1, 1)");
  await expect(tool(page, "พลิกแนวนอน")).toHaveAttribute("aria-pressed", "true");
  await tool(page, "พลิกแนวตั้ง").click();
  expect(await tf(page)).toContain("scale(-1, -1)");
  await tool(page, "รีเซ็ต").click();
  expect(await tf(page)).toBe("translate(0px, 0px) scale(1) rotate(0deg) scale(1, 1)");

  // ล้อเมาส์ = ซูม · ลากดูเมื่อขยาย
  const st = (await page.locator(".lb-stage").boundingBox())!;
  await page.mouse.move(st.x + st.width / 2, st.y + st.height / 2);
  await page.mouse.wheel(0, -400);
  await expect(lb).toHaveClass(/is-zoomed/);
  // คีย์ลัด 0 = รีเซ็ต · + = ขยาย · R = หมุน
  await page.keyboard.press("0");
  await expect(lb).not.toHaveClass(/is-zoomed/);
  await page.keyboard.press("r");
  expect(await tf(page)).toContain("rotate(90deg)");

  // เปลี่ยนรูป → มุมมองกลับค่าเริ่มต้น · รูปย่อที่เลือก
  await page.locator(".lb-thumb").nth(1).click();
  await expect(cnt).toHaveText(`2 / ${n}`);
  await expect(page.locator(".lb-thumb").nth(1)).toHaveAttribute("aria-current", "true");
  expect(await tf(page)).toContain("rotate(0deg)");

  // ดับเบิลคลิก = ขยาย / คืน
  await page.locator(".lb-stage img").dblclick();
  await expect(lb).toHaveClass(/is-zoomed/);
  await page.locator(".lb-stage img").dblclick();
  await expect(lb).not.toHaveClass(/is-zoomed/);

  // เล่นสไลด์ → เลื่อนเอง · หยุดได้
  await tool(page, "เล่นสไลด์").click();
  await expect(page.locator(".lb-progress")).toBeVisible();
  await expect(cnt).toHaveText(`${(2 % n) + 1} / ${n}`, { timeout: 6000 });
  await tool(page, "หยุดเล่นสไลด์").click();
  await expect(page.locator(".lb-progress")).toHaveCount(0);

  // ลูกศร/ปุ่มนำทาง ยังใช้ได้ · ป้ายชื่อเมื่อชี้
  await expect(tool(page, "หมุนขวา")).toHaveAttribute("data-tip", "หมุนขวา (R)");
  await page.keyboard.press("Escape");
  await expect(lb).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("มือถือ: แถบเครื่องมืออยู่ใต้ตัวนับ ไม่ล้นจอ · รูปย่อด้านล่าง", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/product/${encodeURIComponent(slug)}`);
  await page.locator(".gal-slide").first().click();
  await expect(page.locator("dialog.lb")).toBeVisible();
  await imageInsideStage(page);
  const tb = (await page.locator(".lb-toolbar").boundingBox())!;
  expect(tb.x).toBeGreaterThanOrEqual(0);
  expect(tb.x + tb.width).toBeLessThanOrEqual(390.5);
  const cnt = (await page.locator(".lb-count").boundingBox())!;
  expect(tb.y).toBeGreaterThan(cnt.y);
  const th = (await page.locator(".lb-thumbs").boundingBox())!;
  expect(th.y + th.height).toBeLessThanOrEqual(844);
  const img = (await page.locator(".lb-stage img").boundingBox())!;
  expect(img.y).toBeGreaterThanOrEqual(tb.y + tb.height - 1);
  expect(img.y + img.height).toBeLessThanOrEqual(th.y + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
