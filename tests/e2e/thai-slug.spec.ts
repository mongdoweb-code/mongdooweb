// ลิงก์สินค้าภาษาไทยแบบยาว (เหมือน URL เว็บเดิม): ฟอร์มหลังบ้าน (สร้างจากชื่อ / เว้นวรรค → -) · หน้าร้านเปิดได้ · ลิงก์เดิม 301 · sitemap · ตะกร้า
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const NAME = `ไฟส่องต้นไม้ ไฟส่องส่วนหย่อม ส่องสนามหญ้า ขนาด10วัตต์ แสงวอร์มไวท์ LED Garden light (ทดสอบ ${TAG})`;
const P = { id: `e2e-th-${TAG}`, sku: `E2E-TH-${TAG}`, slug: `e2e-th-${TAG}` };
const THAI = `ไฟส่องต้นไม้-ไฟส่องส่วนหย่อม-ส่องสนามหญ้า-ขนาด10วัตต์-แสงวอร์มไวท์-led-garden-light-ทดสอบ-${TAG}`;
const href = (s: string) => `/product/${encodeURIComponent(s)}`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
test.beforeAll(async () => {
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" WHERE "isActive" ORDER BY "sortOrder" LIMIT 1`);
  await q(`INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "inStock", "isActive", "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,69000,true,true,$5,969000,now())`, [
    P.id, P.sku, P.slug, NAME, cat.id,
  ]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "Product" WHERE id=$1`, [P.id]);
  await q(`DELETE FROM "Redirect" WHERE "fromPath" LIKE $1 OR "toPath" LIKE $1`, [`%${TAG}%`]);
  await q(`DELETE FROM "AdminLog" WHERE entity=$1`, [`Product:${P.id}`]);
});

test("หลังบ้าน: สร้างลิงก์จากชื่อ (ภาษาไทย) · พิมพ์เว้นวรรคได้ · บันทึกแล้วลิงก์ใหม่ใช้ได้ทันที", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  const slug = page.locator("#slug" + V);
  await expect(slug).toHaveValue(P.slug);
  // พิมพ์เองแบบมีเว้นวรรค/ตัวใหญ่ → ออกจากช่องแล้วจัดรูปให้
  await slug.fill(`ไฟ ทดสอบ  ลิงก์ไทย ${TAG.toUpperCase()}`);
  await slug.blur();
  await expect(slug).toHaveValue(`ไฟ-ทดสอบ-ลิงก์ไทย-${TAG}`);
  // ปุ่มสร้างจากชื่อสินค้า
  await page.locator("#slugFromName" + V).click();
  await expect(slug).toHaveValue(THAI);
  expect(THAI.length).toBeGreaterThan(80);
  await page.locator('button[type=submit]:has-text("บันทึกสินค้า")' + V).first().click();
  const ok = page.getByRole("status").filter({ hasText: "บันทึกสำเร็จ" });
  await expect(ok).toBeVisible();
  const [row] = await q<{ slug: string }>(`SELECT slug FROM "Product" WHERE id=$1`, [P.id]);
  expect(row.slug).toBe(THAI);
  // ช่องค้นหาตัวอย่าง Google แสดงลิงก์ภาษาไทย
  await expect(page.locator(".u", { hasText: "product ›" }).first()).toContainText(THAI);
});

test("หลังบ้าน: ลิงก์ที่มีแต่สัญลักษณ์ → ช่องว่าง บันทึกไม่ได้ · เซิร์ฟเวอร์ก็ไม่รับ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  const slug = page.locator("#slug" + V);
  await slug.fill("฿฿฿");
  await slug.blur();
  await expect(slug).toHaveValue("");
  expect(await slug.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  // ข้ามการตรวจของเบราว์เซอร์ → เซิร์ฟเวอร์ตอบ "บันทึกไม่สำเร็จ"
  await page.evaluate(() => { (document.getElementById("productForm") as HTMLFormElement).noValidate = true; });
  await page.locator('button[type=submit]:has-text("บันทึกสินค้า")' + V).first().click();
  await expect(page.getByRole("alertdialog", { name: "บันทึกไม่สำเร็จ" })).toBeVisible();
  const [row] = await q<{ slug: string }>(`SELECT slug FROM "Product" WHERE id=$1`, [P.id]);
  expect(row.slug).toBe(THAI);
});

test("หน้าร้าน: URL ภาษาไทยยาวเปิดได้ · ลิงก์อังกฤษเดิม 301 มาที่ลิงก์ไทย · canonical/sitemap ใช้ลิงก์ไทย", async ({ page, request }) => {
  const res = await page.goto(href(THAI));
  expect(res?.status()).toBe(200);
  await expect(page.locator("h1")).toContainText(`ทดสอบ ${TAG}`);
  expect(decodeURIComponent(new URL(page.url()).pathname)).toBe(`/product/${THAI}`);
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
  expect(decodeURIComponent(canonical ?? "")).toContain(`/product/${THAI}`);

  const old = await request.get(`/product/${P.slug}`, { maxRedirects: 0 });
  expect(old.status()).toBe(301);
  expect(decodeURIComponent(old.headers()["location"])).toContain(`/product/${THAI}`);

  // ไม่มีสินค้านี้ (ภาษาไทย) → ยัง 301 ไปหน้าสินค้าทั้งหมดเหมือนเดิม
  const none = await request.get(href(`ไม่มีสินค้านี้-${TAG}`), { maxRedirects: 0 });
  expect(none.status()).toBe(301);

  // ปิดขาย → 404 จริง (ไม่ใช่ส่งต่อไปหน้าอื่น)
  await q(`UPDATE "Product" SET "isActive" = false WHERE id = $1`, [P.id]);
  try {
    expect((await request.get(href(THAI), { maxRedirects: 0 })).status()).toBe(404);
  } finally {
    await q(`UPDATE "Product" SET "isActive" = true WHERE id = $1`, [P.id]);
  }

  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain(encodeURIComponent(THAI));
});

test("ตะกร้า/สั่งซื้อรับลิงก์ไทยยาว", async ({ request }) => {
  const r = await request.post("/api/cart/validate", { data: { items: { [THAI]: 2 } } });
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  const line = j.lines.find((l: { id: string }) => l.id === THAI);
  expect(line?.status).toBe("ok");
  expect(line?.qty).toBe(2);
});
