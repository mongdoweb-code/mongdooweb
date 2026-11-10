// หน้าแก้ไขสินค้า: แถบเมนูด่วนติดด้านบน (เลื่อนไปส่วน · ไฮไลต์ตามการเลื่อน · จุดแดงส่วนที่ผิด · ปุ่มบันทึกในแถบ · มือถือ)
// + หน้าสินค้า: ปุ่ม ‹ › บนแถบรูปย่อ
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const P = { id: `e2e-nav-${TAG}`, sku: `E2E-NAV-${TAG}`, slug: `e2e-nav-${TAG}` };
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
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`);
  // key รูปสมมติ 14 รูป (ล้นแถบรูปย่อ) (ไม่ซ้ำกัน — บันทึกสินค้าตัดรูปซ้ำทิ้ง) ทดสอบแค่ปุ่มรูปย่อ ไม่ต้องโหลดรูปได้
  const imgs = Array.from({ length: 14 }, (_, i) => `products/2026/01/e2enav${i}.webp`);
  await q(`INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "inStock", "isActive", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,15000,true,true,$5,$6,968000,now())`, [
    P.id, P.sku, P.slug, `สินค้าทดสอบเมนูด่วน ${TAG}`, imgs, cat.id,
  ]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "Product" WHERE id=$1`, [P.id]);
});

const labels = ["ข้อมูลสินค้า", "รูปสินค้า", "ราคาและการขาย", "SEO และการค้นหา", "ตัวช่วยเลือกไฟ (หน้าแรก)", "สเปกสินค้า", "คำอธิบาย", "ไฟล์ดาวน์โหลด", "ทำสำเนาสินค้า", "ลดราคาตามช่วงเวลา"];

test("เมนูด่วน: ครบทุกส่วน · กดแล้วเลื่อนไปส่วนนั้น + ไฮไลต์ · ติดด้านบนตอนเลื่อน · ลิงก์ #ส่วน", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  const nav = page.getByRole("navigation", { name: "ไปยังส่วนของฟอร์ม" });
  const links = nav.locator(".snav-a");
  await expect(links.filter({ hasText: "ทำสำเนาสินค้า" })).toBeVisible();
  const got = await links.allTextContents();
  for (const l of labels) expect(got).toContain(l);
  for (const [label, id] of [["ราคาและการขาย", "sec-price"], ["คำอธิบาย", "sec-desc"], ["ไฟล์ดาวน์โหลด", "downloadsBox"], ["ทำสำเนาสินค้า", "sec-dup"], ["รูปสินค้า", "productMedia"]] as const) {
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute("aria-current", "true");
    await expect.poll(async () => {
      const [navBottom, top] = await Promise.all([
        nav.evaluate((e) => e.getBoundingClientRect().bottom),
        page.locator(`#${id}`).evaluate((e) => e.getBoundingClientRect().top),
      ]);
      return Math.abs(top - navBottom - 12) < 30 || top > navBottom; // อยู่ใต้แถบพอดี (ส่วนท้ายหน้าอาจเลื่อนไม่ถึง)
    }).toBe(true);
    await expect(page.locator(`#${id} h3`).first()).toBeFocused();
  }
  // ติดขอบบนจอ (sticky): เลื่อนลงสุดหน้า → แถบยังอยู่บนสุด (ไม่ขึ้นกับความยาวข้อมูลในฐานข้อมูลทดสอบ)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => nav.evaluate((e) => Math.round(e.getBoundingClientRect().top))).toBe(0);
  expect(page.url()).toContain("#productMedia");
  // เลื่อนเองขึ้นบนสุด → ไฮไลต์กลับไปส่วนแรก
  await page.waitForTimeout(1000);
  await page.mouse.wheel(0, -20000);
  await expect(nav.getByRole("link", { name: "ข้อมูลสินค้า" })).toHaveAttribute("aria-current", "true");
  // เปิดลิงก์ #saleBox ตรง ๆ
  await page.goto(`/admin/products/${P.id}#saleBox`);
  await expect(nav.getByRole("link", { name: "ลดราคาตามช่วงเวลา" })).toHaveAttribute("aria-current", "true");
});

test("สินค้าใหม่ไม่มีเมนูไฟล์ดาวน์โหลด/ทำสำเนา · บันทึกที่ผิด → จุดแดงที่ส่วนนั้น + เลื่อนไปให้ · ปุ่มบันทึกในแถบใช้ได้", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto("/admin/products/new");
  const nav = page.getByRole("navigation", { name: "ไปยังส่วนของฟอร์ม" });
  await expect(nav.getByRole("link", { name: "ข้อมูลสินค้า" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "ไฟล์ดาวน์โหลด" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "ทำสำเนาสินค้า" })).toHaveCount(0);

  await page.goto(`/admin/products/${P.id}`);
  await page.fill("#price" + V, "abc");
  await page.mouse.wheel(0, 3000);
  await nav.getByRole("button", { name: "บันทึก" }).click();
  await expect(nav.locator(".snav-a.err")).toContainText("ราคาและการขาย");
  await expect(nav.getByRole("link", { name: "ราคาและการขาย" })).toHaveAttribute("aria-current", "true");
  await page.fill("#price" + V, "189");
  await nav.getByRole("button", { name: "บันทึก" }).click();
  await expect.poll(async () => (await q<{ p: number }>(`SELECT "priceSatang" p FROM "Product" WHERE id=$1`, [P.id]))[0].p).toBe(18900);
  // บันทึกจากปุ่มในแถบต้องส่งทุกช่องของฟอร์ม — สถานะเปิดขาย/สต็อก/ชื่อ/ลิงก์ไม่เปลี่ยน
  const row = (await q<{ a: boolean; s: string; n: string; i: boolean }>(`SELECT "isActive" a, slug s, name n, "inStock" i FROM "Product" WHERE id=$1`, [P.id]))[0];
  expect(row).toEqual({ a: true, s: P.slug, n: `สินค้าทดสอบเมนูด่วน ${TAG}`, i: true });
});

test("มือถือ: แถบติดใต้หัวเว็บ เลื่อนด้วย ‹ › ได้ ไม่ล้นจอ", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  const nav = page.getByRole("navigation", { name: "ไปยังส่วนของฟอร์ม" });
  const right = nav.getByRole("button", { name: "เลื่อนเมนูไปทางขวา" });
  await expect(right).toBeVisible();
  const track = nav.locator(".snav-track");
  await right.click();
  await expect.poll(() => track.evaluate((e) => e.scrollLeft)).toBeGreaterThan(50);
  await expect(nav.getByRole("button", { name: "เลื่อนเมนูไปทางซ้าย" })).toBeVisible();
  await nav.getByRole("link", { name: "คำอธิบาย" }).click();
  await expect.poll(() => nav.evaluate((e) => Math.round(e.getBoundingClientRect().top))).toBe(56);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
});

test("หน้าสินค้า: แถบรูปย่อมีปุ่ม ‹ › เลื่อนได้ และเลื่อนตามรูปที่กำลังดู", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/product/${P.slug}`);
  const thumbs = page.locator(".pdp-thumbs");
  await expect(thumbs.locator("button")).toHaveCount(14);
  const r = page.getByRole("button", { name: "เลื่อนรูปย่อไปทางขวา" });
  const l = page.getByRole("button", { name: "เลื่อนรูปย่อไปทางซ้าย" });
  await expect(r).toBeVisible();
  await expect(l).toBeHidden();
  await r.click();
  await expect.poll(() => thumbs.evaluate((e) => e.scrollLeft)).toBeGreaterThan(50);
  await expect(l).toBeVisible();
  await l.click();
  await expect.poll(() => thumbs.evaluate((e) => e.scrollLeft)).toBeLessThan(3);
  // ไปรูปสุดท้ายด้วยปุ่มก่อนหน้า (วนไปท้าย) → แถบรูปย่อเลื่อนตาม รูปสุดท้ายอยู่ในกรอบ
  await page.getByRole("button", { name: "รูปก่อนหน้า" }).click();
  await expect.poll(() => thumbs.evaluate((e) => {
    const b = e.lastElementChild!.getBoundingClientRect();
    const t = e.getBoundingClientRect();
    return b.right <= t.right + 1 && b.left >= t.left - 1;
  })).toBe(true);
  await expect(r).toBeHidden();
});

test("บันทึก → ป๊อปอัป 'บันทึกสำเร็จ' (ปิดเองใน ~3 วินาที / ปุ่มตกลง / Esc) · บันทึกผิด → ป๊อปอัป 'บันทึกไม่สำเร็จ' + แก้ไขช่องที่ผิด", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  await page.locator('button[type=submit]:has-text("บันทึกสินค้า")' + V).first().click();
  const ok = page.getByRole("status").filter({ hasText: "บันทึกสำเร็จ" });
  await expect(ok).toBeVisible();
  await expect(ok).toContainText("หน้าร้านแสดงข้อมูลใหม่ทันที");
  await expect(ok.getByRole("link", { name: "ดูหน้าสินค้า" })).toHaveAttribute("href", `/product/${P.slug}`);
  await expect(ok).toBeHidden({ timeout: 6000 }); // ปิดเอง
  // บันทึกอีกครั้ง → แสดงใหม่ · ปิดด้วยปุ่มตกลง
  await page.getByRole("navigation", { name: "ไปยังส่วนของฟอร์ม" }).getByRole("button", { name: "บันทึก" }).click();
  await expect(ok).toBeVisible();
  await ok.getByRole("button", { name: "ตกลง" }).click();
  await expect(ok).toBeHidden();
  // ผิด → ไม่ปิดเอง · แก้ไขช่องที่ผิด → โฟกัสช่องราคา
  await page.fill("#price" + V, "abc");
  await page.locator('button[type=submit]:has-text("บันทึกสินค้า")' + V).first().click();
  const bad = page.getByRole("alertdialog", { name: "บันทึกไม่สำเร็จ" });
  await expect(bad).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(bad).toBeVisible();
  await bad.getByRole("button", { name: "แก้ไขช่องที่ผิด" }).click();
  await expect(bad).toBeHidden();
  await expect(page.locator("#price" + V)).toBeFocused();
  await page.fill("#price" + V, "150");
  await page.keyboard.press("Enter");
  await expect(ok).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ok).toBeHidden();
});
