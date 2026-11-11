// รูปสินค้ามาตรฐาน 1:1 ทุกหน้า (หน้าร้าน + หลังบ้าน): กรอบรูปเป็นจัตุรัส และรูปแสดงแบบ contain (ไม่ครอป ไม่ยืด)
import { expect, test, type Page } from "@playwright/test";
import { V, login } from "./helpers";

/** อัตราส่วนกว้าง/สูงของกรอบทุกอันที่มองเห็น (ไม่เกิน n อัน) */
async function ratios(page: Page, sel: string, n = 12) {
  return page.locator(sel + V).evaluateAll((els, max) => els.slice(0, max as number).map((e) => {
    const r = e.getBoundingClientRect();
    return r.height ? Math.round((r.width / r.height) * 100) / 100 : 0;
  }), n);
}
const square = (rs: number[]) => rs.every((x) => Math.abs(x - 1) <= 0.02);
async function fits(page: Page, sel: string) {
  return page.locator(sel + V).evaluateAll((els) => els.slice(0, 8).map((e) => getComputedStyle(e).objectFit));
}

test("หน้าร้าน: การ์ดสินค้าทุกมุมมอง · หน้าสินค้า · การ์ดหมวดหน้าแรก · หมวดยอดนิยม = 1:1", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const cat = await ratios(page, ".cat-media");
  expect(cat.length).toBeGreaterThan(0);
  expect(square(cat), `cat-media ${cat}`).toBe(true);
  const pc = await ratios(page, ".pc-img");
  if (pc.length) expect(square(pc), `pc-img ${pc}`).toBe(true);
  for (const view of ["g2", "g3", "g4", "g6", "list"]) {
    await context.addCookies([{ name: "mdw_shop_view", value: view, url: page.url() }]);
    await page.goto("/products");
    await expect(page.locator(".prod-grid[data-listing] .prod-img" + V).first()).toBeVisible();
    const r = await ratios(page, ".prod-grid[data-listing] .prod-img");
    expect(r.length).toBeGreaterThan(0);
    expect(square(r), `${view}: ${r}`).toBe(true);
    expect((await fits(page, ".prod-grid[data-listing] .prod-img img")).every((f) => f === "contain")).toBe(true);
  }
  const href = await page.locator(".prod-grid[data-listing] .prod-name a" + V).first().getAttribute("href");
  await page.goto(href!);
  await expect(page.locator(".pdp-main" + V).first()).toBeVisible();
  expect(square(await ratios(page, ".pdp-main", 1))).toBe(true);
  expect(square(await ratios(page, ".pdp-thumbs button"))).toBe(true);
  // มือถือ
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/products");
  await expect(page.locator(".prod-grid[data-listing] .prod-img" + V).first()).toBeVisible();
  expect(square(await ratios(page, ".prod-grid[data-listing] .prod-img"))).toBe(true);
  await page.goto("/");
  expect(square(await ratios(page, ".cat-media"))).toBe(true);
});

test("หลังบ้าน: การ์ดสินค้า / การ์ดเล็ก / ตัวอย่างหมวดยอดนิยม = 1:1 แสดงทั้งภาพ", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page);
  await page.goto("/admin/products?per=20");
  for (const name of ["มุมมองการ์ด", "มุมมองการ์ดเล็ก"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".pcard" + V).first()).toBeVisible();
    const r = await ratios(page, ".pcard-img");
    expect(square(r), `${name}: ${r}`).toBe(true);
    expect((await fits(page, ".pcard-img img")).every((f) => f === "contain")).toBe(true);
  }
  await page.getByRole("button", { name: "มุมมองตาราง", exact: true }).click();
  await page.goto("/admin/home/popular");
  const pv = await ratios(page, ".pce-pv-img");
  if (pv.length) expect(square(pv), `pce-pv-img ${pv}`).toBe(true);
});
