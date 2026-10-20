// หน้าร้าน: โหลดได้ไม่มี error, รายการสินค้า, หน้าสินค้า + ใส่ตะกร้า, ค้นหา, SEO, 404, header ความปลอดภัย
import { expect, test } from "@playwright/test";
import { V, buyableProduct, trackErrors } from "./helpers";

test("หน้าแรกแสดงสไลด์ หมวด และสินค้าโดยไม่มี error", async ({ page }) => {
  const errors = trackErrors(page);
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("h1, .hero h2").first()).toBeVisible();
  await expect(page.locator("a[href^='/category/']").first()).toBeAttached();
  expect(errors).toEqual([]);
});

test("รายการสินค้า → หน้าสินค้า → ใส่ตะกร้า", async ({ page }) => {
  const errors = trackErrors(page);
  const p = await buyableProduct(page);
  await page.goto(`/product/${p.id}`);
  await expect(page.locator("h1" + V)).toContainText(p.name.slice(0, 10));
  await page.locator("button:has-text('ใส่ตะกร้า'), [data-add]").filter({ visible: true }).first().click();
  await expect(page.locator("#cart.open, .cart.open, [aria-label*='ตะกร้า'][aria-hidden='false']").first()).toBeVisible();
  await page.goto("/products");
  expect(await page.locator(".prod-card").count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("ค้นหาสินค้าเจอ", async ({ page }) => {
  const p = await buyableProduct(page);
  const word = p.name.split(/\s+/)[0];
  await page.goto(`/search?q=${encodeURIComponent(word)}`);
  expect(await page.locator(".prod-card").count()).toBeGreaterThan(0);
});

test("SEO: robots, sitemap, 404 และ header ความปลอดภัย", async ({ page, request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toContain("Sitemap:");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/product/");
  const nf = await page.goto("/this-page-does-not-exist");
  expect(nf?.status()).toBe(404);
  await expect(page.locator("h1" + V)).toContainText("ไม่พบหน้า");
  const home = await request.get("/");
  expect(home.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await request.get("/api/health")).status()).toBe(200);
});
