// รูปการ์ดหมวดยอดนิยม: อัปโหลดเอง (เลือกไฟล์) → บันทึก → หน้าแรกใช้รูปนั้น · ไฟล์ไม่ใช่รูปแจ้งเตือน · "ใช้รูปหมวดแทน" กลับไปรูปหมวด
import { expect, test } from "@playwright/test";
import path from "node:path";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const CAT = `e2e-popimg-${TAG}`;
const PROD = `e2e-popimg-p-${TAG}`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
type Cfg = { items?: { cat: string; img?: string }[] };
let saved: unknown = {};
const cfg = async () => (await q<{ p: Cfg }>(`SELECT "popularCats" p FROM "ShopSetting" WHERE id='shop'`))[0].p;
const itemOf = async () => (await cfg()).items?.find((i) => i.cat === CAT);

test.beforeAll(async () => {
  saved = await cfg();
  await q(`INSERT INTO "Category"(id, slug, "nameTh", "nameEn", "sortOrder") VALUES ($1,$1,$2,'E2E Popular Image',99997)`, [CAT, `หมวดรูปการ์ด ${TAG}`]);
  await q(`INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "inStock", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$1,$3,10000,true,'{}',$4,950000,now())`, [
    PROD, `E2E-POPIMG-${TAG}`, `สินค้ารูปการ์ด ${TAG}`, CAT,
  ]);
  // เริ่มจากการ์ดหมวดทดสอบใบเดียว
  await q(`UPDATE "ShopSetting" SET "popularCats"=$1 WHERE id='shop'`, [JSON.stringify({ title: "หมวดหมู่ยอดนิยม", items: [{ cat: CAT, bg: "sky", links: [] }] })]);
});
test.afterAll(async () => {
  await q(`UPDATE "ShopSetting" SET "popularCats"=$1 WHERE id='shop'`, [JSON.stringify(saved ?? {})]);
  await q(`DELETE FROM "Product" WHERE id=$1`, [PROD]);
  await q(`DELETE FROM "Category" WHERE id=$1`, [CAT]);
});

test("อัปโหลดรูปการ์ด → บันทึก → หน้าแรกใช้รูปนั้น · ใช้รูปหมวดแทนได้", async ({ page }) => {
  await login(page);
  await page.goto("/admin/home/popular");
  const card = page.locator(`.pce-item[data-cat="${CAT}"]` + V);
  await expect(card.locator(".pce-img-src")).toHaveText("รูปหมวด (อัตโนมัติ)");

  // ไฟล์ที่ไม่ใช่รูป → แจ้งเตือน ไม่อัปโหลด
  await card.locator("input[data-pce-file]").setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(card.locator(".pce-img-err")).toContainText("JPG, PNG, WEBP");

  // อัปโหลดรูปจริง
  await card.locator("input[data-pce-file]").setInputFiles(path.resolve("tests/fixtures/slip.png"));
  await expect(card.locator(".pce-drop img")).toHaveAttribute("src", /^\/media\/popular\/\d{4}\/\d{2}\/\w+-sm\.webp$/);
  await expect(card.locator(".pce-img-src")).toHaveText("รูปที่อัปโหลดเอง");
  await expect(page.locator(".pce-pv-card .pce-pv-img img").first()).toHaveAttribute("src", /\/media\/popular\//);
  const src = await card.locator(".pce-drop img").getAttribute("src");
  expect((await page.request.get(src!)).ok()).toBe(true);
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator(".ok-box" + V)).toContainText("บันทึกแล้ว");
  await expect.poll(async () => (await itemOf())?.img).toMatch(/^popular\/\d{4}\/\d{2}\/\w+\.webp$/);

  // หน้าแรก: การ์ดใช้รูปที่อัปโหลด
  await page.goto("/");
  const home = page.locator(`.pc-card:has(a[href="/category/${CAT}"])`).first();
  await expect(home.locator(".pc-img img")).toHaveAttribute("src", /\/media\/popular\//);

  // หน้าตรวจรูปภาพรู้จักรูปนี้ (ไม่ถูกมองเป็นไฟล์ขยะ)
  // กลับไปใช้รูปหมวด
  await page.goto("/admin/home/popular");
  const card2 = page.locator(`.pce-item[data-cat="${CAT}"]` + V);
  await card2.getByRole("button", { name: "ใช้รูปหมวดแทน" }).click();
  await expect(card2.locator(".pce-img-src")).toHaveText("รูปหมวด (อัตโนมัติ)");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator(".ok-box" + V)).toContainText("บันทึกแล้ว");
  await expect.poll(async () => (await itemOf())?.img ?? null).toBeNull();
  await page.goto("/");
  await expect(page.locator(`.pc-card:has(a[href="/category/${CAT}"]) .pc-img img`)).toHaveCount(0);
});

test("ปลอมค่ารูปเป็นลิงก์ภายนอก → ระบบไม่รับ", async ({ page }) => {
  await q(`UPDATE "ShopSetting" SET "popularCats"=$1 WHERE id='shop'`, [JSON.stringify({ items: [{ cat: CAT, bg: "sky", img: "https://evil.example/x.webp", links: [] }] })]);
  await login(page);
  await page.goto("/admin/home/popular");
  await expect(page.locator(`.pce-item[data-cat="${CAT}"]` + V).locator(".pce-img-src")).toHaveText("รูปหมวด (อัตโนมัติ)");
  // อัปโหลด route ต้องล็อกอิน
  const anon = await page.context().browser()!.newContext();
  const r = await anon.request.post("/admin/home/popular/upload", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } } });
  expect(r.status()).not.toBe(200);
  await anon.close();
});
