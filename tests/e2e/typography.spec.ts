// ตั้งค่า → ตัวอักษร: ชุดสำเร็จรูป · ค่ารวม · ปรับแยกส่วน → บันทึก → หลังบ้าน/หน้าร้านเปลี่ยนจริง · เอกสาร A4 ไม่เปลี่ยน · คืนค่าเริ่มต้น
import { expect, test } from "@playwright/test";
import pg from "pg";
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
let orig: unknown = {};
test.beforeAll(async () => { [{ t: orig }] = await q<{ t: unknown }>(`SELECT typography t FROM "ShopSetting" WHERE id='shop'`); await q(`UPDATE "ShopSetting" SET typography='{}' WHERE id='shop'`); });
test.afterAll(async () => { await q(`UPDATE "ShopSetting" SET typography=$1::jsonb WHERE id='shop'`, [JSON.stringify(orig ?? {})]); });

test("หลังบ้าน + หน้าร้าน: ตั้งฟอนต์/ขนาด/ตัวหนา/สี → บันทึก → ใช้จริง · คืนค่าเริ่มต้น", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await login(page);
  // ค่าเดิม: ไม่มี CSS ตัวอักษร
  await page.goto("/admin/settings/fonts");
  await expect(page.locator("style[data-typography]")).toHaveCount(0);

  // หลังบ้าน: ชุด "โมเดิร์น" + เมนูซ้าย ใหญ่ขึ้น 1 + ตัวหนา (ลองซ้ำจนหน้าโต้ตอบได้)
  await expect(async () => {
    await page.locator('[data-preset="modern"]').click();
    await expect(page.locator("#tyThai")).toHaveAttribute("data-font-value", "IBM Plex Sans Thai", { timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await expect(page.locator("#tyLatin")).toHaveAttribute("data-font-value", "Geist");
  await page.locator('[data-area="sidebar"] .ty-area-t').click();
  await page.getByRole("button", { name: "เพิ่มขนาดเมนูซ้าย" }).click();
  await page.locator('[data-area="sidebar"] [title="ตัวหนา"]').click();
  // ตัวอย่างสดเปลี่ยนทันที
  const pvNav = page.locator('[data-ty-preview="admin"] .nav-i').first();
  await expect.poll(() => pvNav.evaluate((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).fontWeight].join("|"))).toBe("16px|700");
  expect(await pvNav.evaluate((e) => getComputedStyle(e).fontFamily)).toContain("IBM Plex Sans Thai");

  // หน้าร้าน: เลือกฟอนต์ไทยจากรายการ (ค้นหา) + สีชื่อสินค้า
  await page.getByRole("tab", { name: "หน้าร้าน" }).click();
  await page.locator("#tyThai").click();
  await page.getByRole("searchbox", { name: "ค้นหาฟอนต์" }).fill("anu");
  await page.locator('.ty-fp-it[data-font="Anuphan"]').click();
  await expect(page.locator("#tyThai")).toHaveAttribute("data-font-value", "Anuphan");
  await page.locator('[data-area="product"] .ty-area-t').click();
  await page.locator('[data-area="product"]').getByRole("button", { name: "สี #C2410C" }).click();
  await expect(page.locator('[data-ty-preview="shop"] .prod-name')).toHaveCSS("color", "rgb(194, 65, 12)");

  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => (await q<{ t: { admin?: { base: { thai: string }; areas: Record<string, unknown> }; shop?: { base: { thai: string }; areas: Record<string, unknown> } } }>(`SELECT typography t FROM "ShopSetting" WHERE id='shop'`))[0].t)
    .toMatchObject({ admin: { base: { thai: "IBM Plex Sans Thai", latin: "Geist" }, areas: { sidebar: { size: 16, weight: 700 } } }, shop: { base: { thai: "Anuphan" }, areas: { product: { color: "#C2410C" } } } });

  // หลังบ้านจริง: เมนูซ้ายใช้ค่าใหม่ · โหลดฟอนต์จาก Google เฉพาะที่ใช้
  await page.goto("/admin/dashboard");
  const nav = page.locator(".side .nav-i" + V).first();
  await expect(nav).toHaveCSS("font-weight", "700");
  await expect(nav).toHaveCSS("font-size", "16px");
  expect(await page.locator("body").evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/^"?Geist"?, "?IBM Plex Sans Thai"?/);
  expect(await page.locator('link[href^="https://fonts.googleapis.com/css2"]').first().getAttribute("href")).toContain("IBM+Plex+Sans+Thai");

  // หน้าร้านจริง (ธีมสว่าง): ฟอนต์ + สีชื่อสินค้า
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, colorScheme: "light" });
  const shop = await ctx.newPage();
  await shop.goto("/products");
  expect(await shop.locator("body").evaluate((e) => getComputedStyle(e).fontFamily)).toContain("Anuphan");
  await expect(shop.locator(".prod-name").first()).toHaveCSS("color", "rgb(194, 65, 12)");
  await ctx.close();

  // คืนค่าเริ่มต้นทั้งสองแท็บ → ไม่มี CSS ตัวอักษร
  await page.goto("/admin/settings/fonts");
  await expect(async () => {
    await page.getByRole("button", { name: "คืนค่าเริ่มต้น (หลังบ้าน)" }).click();
    await expect(page.getByRole("button", { name: "คืนค่าเริ่มต้น (หลังบ้าน)" })).toBeDisabled({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await page.getByRole("tab", { name: "หน้าร้าน" }).click();
  await page.getByRole("button", { name: "คืนค่าเริ่มต้น (หน้าร้าน)" }).click();
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(async () => (await q<{ t: unknown }>(`SELECT typography t FROM "ShopSetting" WHERE id='shop'`))[0].t).toEqual({});
  await page.goto("/admin/dashboard");
  await expect(page.locator("style[data-typography]")).toHaveCount(0);
});

test("เอกสาร A4 ในหน้าหลังบ้านใช้ฟอนต์เดิมแม้ตั้งตัวอักษรหลังบ้าน", async ({ page }) => {
  await q(`UPDATE "ShopSetting" SET typography=$1::jsonb WHERE id='shop'`, [JSON.stringify({ admin: { base: { thai: "Kanit", size: 17, weight: 300, ls: 0.3 } } })]);
  try {
    await login(page);
    const [d] = await q<{ id: string; type: string }>(`SELECT id, type FROM "SalesDocument" WHERE status <> 'DRAFT' ORDER BY "createdAt" DESC LIMIT 1`);
    test.skip(!d, "ไม่มีเอกสาร");
    await page.goto(`/admin/docs/${d.type}/${d.id}`);
    const sheet = page.locator(".sheet" + V).first();
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate((e) => getComputedStyle(e).fontFamily)).not.toContain("Kanit");
    expect(await sheet.evaluate((e) => [getComputedStyle(e).fontWeight, getComputedStyle(e).letterSpacing])).toEqual(["400", "normal"]);
    expect(await page.locator("body").evaluate((e) => getComputedStyle(e).fontFamily)).toContain("Kanit");
  } finally {
    await q(`UPDATE "ShopSetting" SET typography='{}' WHERE id='shop'`);
  }
});
