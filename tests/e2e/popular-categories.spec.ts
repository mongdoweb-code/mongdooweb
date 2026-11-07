// หมวดยอดนิยมหน้าแรก: อัตโนมัติ → ตั้งเองในหลังบ้าน (หมวด สีพื้น ลิงก์แนะนำ/พิมพ์เอง ตรวจลิงก์) → หน้าแรกแสดงตามนั้น → กลับเป็นอัตโนมัติ
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const CAT = `e2e-pop-${TAG}`;
const PROD = `e2e-pop-p-${TAG}`;
const NAME = `หมวดยอดนิยมทดสอบ ${TAG}`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
let saved: unknown = {};
const cfg = async () => (await q<{ p: { items?: { cat: string; bg: string; links: { label: string; href: string }[] }[] } }>(`SELECT "popularCats" p FROM "ShopSetting" WHERE id='shop'`))[0].p;

// สินค้าทดสอบอยู่ท้ายลำดับร้านเสมอ (sortOrder สูง) — ไม่ให้ไปเป็นสินค้าตัวแรกของแคตตาล็อกที่เทสอื่นหยิบใช้
test.beforeAll(async () => {
  saved = await cfg();
  await q(`UPDATE "ShopSetting" SET "popularCats"='{}' WHERE id='shop'`);
  await q(`INSERT INTO "Category"(id, slug, "nameTh", "nameEn", "sortOrder") VALUES ($1,$1,$2,'E2E Popular',99998)`, [CAT, NAME]);
  await q(`INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "inStock", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$1,$3,10000,true,'{}',$4,960000,now())`, [
    PROD, `E2E-POP-${TAG}`, `สินค้าหมวดยอดนิยม ${TAG}`, CAT,
  ]);
});
test.afterAll(async () => {
  await q(`UPDATE "ShopSetting" SET "popularCats"=$1 WHERE id='shop'`, [JSON.stringify(saved ?? {})]);
  await q(`DELETE FROM "Product" WHERE id=$1`, [PROD]);
  await q(`DELETE FROM "Category" WHERE id=$1`, [CAT]);
});

test("ลำดับหน้าแรก: หมวดยอดนิยมอยู่ต่อจากหมวดหมู่สินค้า · หน้าแรกมีการ์ดอัตโนมัติ", async ({ page }) => {
  await login(page);
  await page.goto("/admin/home");
  const keys = await page.locator(".l10-order li" + V).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key));
  expect(keys.indexOf("popular")).toBe(keys.indexOf("categories") + 1);
  await page.goto("/");
  await expect(page.locator(".pc-sec .pc-card").first()).toBeVisible();
  await expect(page.locator("#pc-h")).toHaveText("หมวดหมู่ยอดนิยม");
});

test("หลังบ้าน: ตั้งการ์ดเอง → หน้าแรกแสดงตามนั้น → กลับเป็นอัตโนมัติ", async ({ page }) => {
  await login(page);
  await page.goto("/admin/home/popular");
  await expect(page.locator(".login-info" + V)).toContainText("ระบบเลือกหมวดให้อัตโนมัติ");
  // ล้างการ์ดเดิม แล้วเพิ่มหมวดทดสอบ
  const del = page.locator(".pce-item .pce-acts button.x" + V);
  while (await del.count()) await del.first().click();
  await page.locator(".pce-add select").selectOption(CAT);
  await page.getByRole("button", { name: "+ เพิ่มการ์ด" }).click();
  const card = page.locator(`.pce-item[data-cat="${CAT}"]`);
  await card.getByRole("radio", { name: "ฟ้า" }).click();
  await card.getByRole("button", { name: "+ ขายดี" }).click();
  await card.getByRole("button", { name: "+ พิมพ์ลิงก์เอง" }).click();
  await card.getByLabel("ข้อความลิงก์ที่ 2").fill("ลิงก์ทดสอบ");
  await card.getByLabel("ลิงก์ที่ 2", { exact: true }).fill("javascript:alert(1)");
  await page.fill("#page-popular input[maxlength='60']", `หมวดเด่น ${TAG}`);
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator(".login-err" + V)).toContainText("ลิงก์ \"ลิงก์ทดสอบ\" ไม่ถูกต้อง");
  await card.getByLabel("ลิงก์ที่ 2", { exact: true }).fill("/search?q=e2e");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator(".ok-box" + V)).toContainText("หน้าแรกแสดง 1 หมวด");
  const c = await cfg();
  expect(c.items).toEqual([{ cat: CAT, bg: "sky", links: [{ label: "ขายดี", href: `/category/${CAT}?sort=best` }, { label: "ลิงก์ทดสอบ", href: "/search?q=e2e" }] }]);

  await page.goto("/");
  await expect(page.locator("#pc-h")).toHaveText(`หมวดเด่น ${TAG}`);
  const pc = page.locator(".pc-card");
  await expect(pc).toHaveCount(1);
  await expect(pc.locator(".pc-name")).toHaveText(NAME);
  await expect(pc.locator(".pc-links a")).toHaveText(["ขายดี", "ลิงก์ทดสอบ", "ดูทั้งหมด (1)"]);
  await expect(pc.locator(".pc-img")).toHaveCSS("background-color", "rgb(221, 233, 244)");
  await pc.locator(".pc-links a", { hasText: "ขายดี" }).click();
  await expect(page).toHaveURL(new RegExp(`/category/${CAT}\\?sort=best$`));

  // กลับไปเลือกอัตโนมัติ
  await page.goto("/admin/home/popular");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "ให้ระบบเลือกอัตโนมัติ" }).click();
  await expect(page.locator(".ok-box" + V)).toContainText("กลับไปเลือกหมวดอัตโนมัติแล้ว");
  expect(await cfg()).toEqual({});
});
