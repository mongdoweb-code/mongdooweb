// การ์ดสินค้าหน้าร้าน: กรอบมน · ไม่มีปุ่มรายการโปรด/เปรียบเทียบบนการ์ด · ชี้ค้าง = รูปทั้งหมดเลื่อนแบบ fade + ตัวนับ
// · มุมมอง 6 คอลัมน์ = ปุ่มรถเข็นอยู่แถวเดียวกับราคา · มุมมองอื่นปุ่มมีไอคอนรถเข็น + ข้อความ
import { expect, test } from "@playwright/test";
import pg from "pg";
import { refreshStorefront, writeImage } from "./storefront-fixtures";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const IMGS = [1, 2, 3].map((i) => `products/e2e/card-${TAG}-${i}.webp`);
// ราคาสูงสุดในร้าน → อยู่ลำดับแรกเมื่อเรียงราคาสูง → ต่ำ (ไม่แตะลำดับ "แนะนำ" ของสินค้าจริง)
const P = { id: `e2e-card-${TAG}`, sku: `E2E-CARD-${TAG}`, slug: `e2e-card-${TAG}`, name: `การ์ดทดสอบ ${TAG}` };
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
test.beforeAll(async ({ browser }) => {
  for (const [i, k] of IMGS.entries()) await writeImage(k, ["#d23c2c", "#2c7bd2", "#2cd27b"][i]);
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" WHERE "isActive" ORDER BY "sortOrder" LIMIT 1`);
  await q(`INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "inStock", "isActive", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,999999900,true,true,$5,$6,970000,now())`, [
    P.id, P.sku, P.slug, P.name, IMGS, cat.id,
  ]);
  await refreshStorefront(browser);
});
test.afterAll(async ({ browser }) => {
  await q(`DELETE FROM "Product" WHERE id=$1`, [P.id]);
  await refreshStorefront(browser);
});

const listing = "/products?sort=price&dir=desc";

test("6 คอลัมน์: กรอบมน · ไม่มีหัวใจ/เปรียบเทียบ · ปุ่มรถเข็นแถวเดียวกับราคา · กดแล้วเข้าตะกร้า", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(listing);
  await page.evaluate(() => { document.cookie = "mdw_shop_view=g6; path=/"; });
  await page.goto(listing);
  const card = page.locator(`#prod-${P.slug}`);
  await expect(card).toBeVisible();
  await expect(page.locator(".prod-grid")).toHaveAttribute("data-view", "g6");
  expect(await card.evaluate((c) => getComputedStyle(c).borderTopLeftRadius)).toBe("6px");
  await expect(page.locator(".prod-card [data-wish], .prod-card [data-compare], .wc-tools")).toHaveCount(0);
  const btn = card.locator(".add-btn");
  await expect(btn).toHaveAccessibleName(`ใส่ตะกร้า: ${P.name}`);
  await expect(btn.locator("svg.add-ic")).toBeVisible();
  await expect(btn.locator(".add-lbl")).toHaveCSS("width", "1px"); // ข้อความซ่อน (เหลือไอคอน)
  const [b, pr] = await Promise.all([btn.boundingBox(), card.locator(".prod-price").boundingBox()]);
  expect(Math.abs(b!.y + b!.height / 2 - (pr!.y + pr!.height / 2))).toBeLessThan(8); // แถวเดียวกัน
  expect(b!.x).toBeGreaterThan(pr!.x + pr!.width - 1); // อยู่ขวาของราคา
  expect(Math.round(b!.width)).toBe(36);
  // ปุ่มเบา: วงกลม พื้นขาว ขอบส้มอ่อน ไอคอนส้ม (ไม่มีพื้นดำ)
  await expect(btn).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(btn).toHaveCSS("border-top-left-radius", "50%");
  await expect(btn).toHaveCSS("color", "rgb(217, 86, 42)");
  await btn.hover();
  await expect(btn).toHaveCSS("background-color", "rgb(242, 107, 56)");
  await expect(btn).toHaveCSS("color", "rgb(255, 255, 255)");
  // การ์ดไม่ล้น
  expect(await card.evaluate((c) => c.scrollWidth <= c.clientWidth + 1)).toBe(true);
  await btn.click();
  await expect(btn).toHaveClass(/added/);
  await page.mouse.move(5, 5);
  await expect(btn).toHaveCSS("background-color", "rgb(232, 245, 238)"); // ใส่แล้ว = เขียวอ่อน
  await expect(btn.locator("svg.add-ic")).toBeVisible(); // ไอคอนยังอยู่
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mdw_cart") || "{}"))).toMatchObject({ [P.slug]: 1 });
  await page.evaluate(() => localStorage.removeItem("mdw_cart"));
  // มุมมองอื่นไม่เปลี่ยน: 4 คอลัมน์ยังเป็นปุ่มดำมีข้อความ
  await page.evaluate(() => { document.cookie = "mdw_shop_view=g4; path=/"; });
  await page.goto(listing);
  const b4 = page.locator(`#prod-${P.slug} .add-btn`);
  await expect(b4).toHaveCSS("background-color", "rgb(20, 20, 20)");
  await expect(b4.locator(".add-lbl")).not.toHaveCSS("width", "1px");
  await page.evaluate(() => { document.cookie = "mdw_shop_view=; path=/; max-age=0"; });
});

test("ชี้ค้าง: รูปทั้งหมดเลื่อนไปทางซ้ายแบบ fade + ตัวนับ 'x จาก 3' · เอาเมาส์ออก = กลับภาพปก", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(listing);
  const card = page.locator(`#prod-${P.slug}`);
  const box = card.locator(".prod-img");
  await expect(box).toHaveAttribute("data-more", /card-.*-2-sm\.webp .*card-.*-3-sm\.webp/);
  await card.hover();
  await expect(box).toHaveClass(/pi-play/);
  await expect(box.locator(".pi-count")).toHaveText("1 จาก 3");
  await expect(box.locator(".pi-count")).toHaveText("2 จาก 3", { timeout: 4000 });
  await expect(box.locator(".pi-slides img.on")).toHaveAttribute("src", /card-.*-2-sm\.webp/);
  await expect(box.locator(".pi-slides img.off")).toHaveCount(1);
  await expect(box.locator(".pi-count")).toHaveText("3 จาก 3", { timeout: 4000 });
  await expect(box.locator(".pi-count")).toHaveText("1 จาก 3", { timeout: 4000 }); // วนกลับ
  await page.mouse.move(5, 5);
  await expect(box).not.toHaveClass(/pi-play/);
  await expect(box.locator(".pi-slides img").first()).toHaveClass("on");
  // ข้อมูลรูปอื่นไม่ถูกส่งซ้ำในข้อมูลทุกหน้า
  const data = await page.evaluate(() => document.getElementById("mdw-data")?.textContent ?? "");
  expect(data).not.toContain('"more"');
});

test("มุมมอง 4 คอลัมน์: ปุ่มมีไอคอนรถเข็น + ข้อความ 'ใส่ตะกร้า'", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await context.clearCookies();
  await page.goto(listing);
  const btn = page.locator(`#prod-${P.slug} .add-btn`);
  await expect(btn.locator("svg.add-ic")).toBeVisible();
  await expect(btn.locator(".add-lbl")).toHaveText("ใส่ตะกร้า");
  await expect(btn.locator(".add-lbl")).not.toHaveCSS("width", "1px");
});
