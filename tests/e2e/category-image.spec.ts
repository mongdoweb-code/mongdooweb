// รูปหมวด: อัปโหลดในหลังบ้าน → ใช้ในแถบ "เลือกซื้อตามหมวดหมู่" · เอาออก = กลับไปใช้รูปสินค้า/ตัวอักษร
import { expect, test } from "@playwright/test";
import path from "node:path";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const CAT = `e2e-catimg-${TAG}`;
const PROD = `e2e-catimg-p-${TAG}`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const keyOf = async () => (await q<{ k: string | null }>(`SELECT "imageKey" k FROM "Category" WHERE id=$1`, [CAT]))[0].k;

// สินค้าทดสอบอยู่ท้ายลำดับร้านเสมอ (sortOrder สูง) — ไม่ให้ไปเป็นสินค้าตัวแรกของแคตตาล็อกที่เทสอื่นหยิบใช้
test.beforeAll(async () => {
  await q(`INSERT INTO "Category"(id, slug, "nameTh", "nameEn", "sortOrder") VALUES ($1,$1,$2,'E2E Cat Image',99999)`, [CAT, `หมวดรูปทดสอบ ${TAG}`]);
  await q(`INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "inStock", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,10000,true,'{}',$5,970000,now())`, [
    PROD, `E2E-CATIMG-${TAG}`, PROD, `สินค้าหมวดรูป ${TAG}`, CAT,
  ]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "Product" WHERE id=$1`, [PROD]);
  await q(`DELETE FROM "Category" WHERE id=$1`, [CAT]);
});

test("อัปโหลดรูปหมวด → แถบเลือกซื้อตามหมวดหมู่ใช้รูปนั้น · เอารูปออกได้", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/categories?edit=${CAT}`);
  await expect(page.locator(".cat-img-ctl" + V)).toContainText("ยังไม่ได้อัปโหลด");
  await page.setInputFiles("#catImage", path.resolve("tests/fixtures/slip.png"));
  await expect(page.locator(".cat-img-prev img" + V)).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: "บันทึกหมวด" }).click();
  await expect.poll(keyOf).toMatch(/^categories\/\d{4}\/\d{2}\/\w+\.webp$/);
  await expect(page.locator(".cat-img-prev img" + V)).toHaveAttribute("src", /\/media\/categories\/.+-sm\.webp$/);

  await page.goto("/products");
  const tile = page.locator(`.ccar-item[href="/category/${CAT}"]`);
  await expect(tile.locator("img")).toHaveAttribute("src", /\/media\/categories\//);
  const img = await tile.locator("img").getAttribute("src");
  expect((await page.request.get(img!)).ok()).toBe(true);

  // เอารูปออก → กลับไปใช้รูปสินค้า (สินค้าทดสอบไม่มีรูป = ตัวอักษรแรก)
  await page.goto(`/admin/categories?edit=${CAT}`);
  await page.getByLabel("เอารูปหมวดออก (กลับไปใช้รูปสินค้า)").check();
  await page.getByRole("button", { name: "บันทึกหมวด" }).click();
  await expect.poll(keyOf).toBeNull();
  await page.goto("/products");
  await expect(page.locator(`.ccar-item[href="/category/${CAT}"] img`)).toHaveCount(0);
  await expect(page.locator(`.ccar-item[href="/category/${CAT}"] .ccar-ph`)).toHaveCount(1);
});
