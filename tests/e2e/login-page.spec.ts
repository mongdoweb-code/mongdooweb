// หน้าเข้าสู่ระบบใหม่: ซ้าย = โซนการตลาด + แอนิเมชันแสง LED · ขวา = ต้อนรับ + ฟอร์ม + หมวด/สินค้าแนะนำ
// ตั้งค่าที่ /admin/settings/login (ข้อความ ธีม รูป ประกาศ การแสดงหมวด/สินค้า) → หน้าเข้าสู่ระบบเปลี่ยนตาม · ตัวอย่าง ?preview=1 · คืนค่าเริ่มต้น
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
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
test.beforeAll(async () => {
  [{ v: orig }] = await q<{ v: unknown }>(`SELECT "loginPage" v FROM "ShopSetting" WHERE id='shop'`);
  await q(`UPDATE "ShopSetting" SET "loginPage" = '{}'::jsonb WHERE id='shop'`);
});
test.afterAll(async () => {
  await q(`UPDATE "ShopSetting" SET "loginPage" = $1::jsonb WHERE id='shop'`, [JSON.stringify(orig ?? {})]);
});

test("ค่าเริ่มต้น: สองฝั่ง · แถบไฟ LED · หัวข้อเรืองแสง · ฟอร์มเข้าสู่ระบบ · หมวดสินค้าลิงก์ไปหน้าร้าน", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/login");
  const hero = page.locator(".lg-hero");
  await expect(hero.locator("h2")).toHaveText("ทุกงานแสง เริ่มต้นที่หลังร้านนี้");
  await expect(hero.locator(".lg-glow")).toHaveText("งานแสง");
  await expect(page.locator(".lg-strip i")).toHaveCount(36);
  await expect(hero.locator(".lg-hl li")).toHaveCount(4);
  await expect(page.locator(".lg.lg-orange.lg-anim")).toHaveCount(1);
  // แอนิเมชันทำงาน (ไฟวิ่ง)
  expect(await page.locator(".lg-strip i").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("lgChase");
  // ฝั่งขวา: ต้อนรับ + ฟอร์มเดิม
  await expect(page.locator(".login-card h1")).toHaveText("ยินดีต้อนรับกลับมา");
  await expect(page.locator("#u")).toBeVisible();
  await expect(page.locator("#pw")).toBeVisible();
  // สองฝั่งอยู่ข้างกัน
  const [h, s] = await Promise.all([hero.boundingBox(), page.locator(".lg-side").boundingBox()]);
  expect(h!.x + h!.width).toBeLessThanOrEqual(s!.x + 1);
  // หมวดสินค้า (ถ้ามีสินค้าในร้าน) ลิงก์ไปหน้าร้านแท็บใหม่
  const cats = page.locator(".lg-cats a");
  if (await cats.count()) {
    expect(await cats.count()).toBeLessThanOrEqual(8);
    await expect(cats.first()).toHaveAttribute("href", /^\/category\//);
    await expect(cats.first()).toHaveAttribute("target", "_blank");
  }
});

test("เจ้าของร้านตั้งค่า: หัวข้อ/คำเรืองแสง/ธีม/รูป/ประกาศ/ซ่อนสินค้าแนะนำ → หน้าเข้าสู่ระบบเปลี่ยนตาม", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto("/admin/settings/login");
  await expect(page.locator(".lp-pv iframe")).toHaveAttribute("src", "/admin/login?preview=1&frame=1");
  await page.fill("#lpHead", `แสงสวยทุกโปรเจกต์ ${TAG}`);
  await page.fill("#lpGlow", "คำที่ไม่มี");
  await expect(page.locator(".err-msg", { hasText: "ไม่อยู่ในหัวข้อ" })).toBeVisible();
  await page.fill("#lpGlow", "แสงสวย");
  await page.locator(".lp-theme", { hasText: "ฟ้าใต้น้ำ" }).click();
  await page.fill("#lpNotice", `ประชุมทีมขาย ${TAG}`);
  await page.locator('input[name="showProducts"]').uncheck();
  await page.locator('input[name="statValue"]').first().fill("250+");
  await page.setInputFiles("#lpFiles", "tests/fixtures/slip.png");
  await page.locator('#loginPageForm button[type=submit]' + V).click();
  await expect(page.locator(".lp-form .login-info")).toContainText("บันทึกหน้าเข้าสู่ระบบแล้ว");
  const [{ v }] = await q<{ v: { headline: string; theme: string; images: string[]; showProducts: boolean } }>(`SELECT "loginPage" v FROM "ShopSetting" WHERE id='shop'`);
  expect(v.headline).toBe(`แสงสวยทุกโปรเจกต์ ${TAG}`);
  expect(v.theme).toBe("ocean");
  expect(v.showProducts).toBe(false);
  expect(v.images).toHaveLength(1);
  expect(v.images[0]).toMatch(/^login\/\d{4}\/\d{2}\/[a-z0-9]+\.webp$/);
  await expect(page.locator(".lp-imgs img")).toHaveCount(1);

  // ผู้ที่ยังไม่ล็อกอินเห็นหน้าใหม่
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto("/admin/login");
  await expect(p.locator(".lg.lg-ocean")).toHaveCount(1);
  await expect(p.locator(".lg-hero h2")).toHaveText(`แสงสวยทุกโปรเจกต์ ${TAG}`);
  await expect(p.locator(".lg-glow")).toHaveText("แสงสวย");
  await expect(p.locator(".lg-notice")).toHaveText(`ประชุมทีมขาย ${TAG}`);
  await expect(p.locator(".lg-prods")).toHaveCount(0);
  await expect(p.locator(".lg-gal img").first()).toHaveAttribute("src", `/media/${v.images[0]}`);
  expect((await p.request.get(`/media/${v.images[0]}`)).status()).toBe(200);
  await expect(p.locator(".lg-stats dd").first()).toHaveText("250+", { timeout: 5000 }); // นับขึ้นแล้วจบที่ค่าจริง
  await ctx.close();

  // ลดการเคลื่อนไหว → แอนิเมชันหยุด
  const rm = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const r = await rm.newPage();
  await r.goto("/admin/login");
  expect(await r.locator(".lg-strip i").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  await rm.close();

  // ล็อกอินอยู่: /admin/login → ไปหลังบ้าน · ?preview=1 → เห็นตัวอย่าง
  await page.goto("/admin/login");
  await expect(page).not.toHaveURL(/\/admin\/login/);
  await page.goto("/admin/login?preview=1");
  await expect(page.locator(".lg-preview")).toBeVisible();

  // ลบรูป → บันทึก
  await page.goto("/admin/settings/login");
  await page.locator(".lp-rm input").check();
  await page.locator('#loginPageForm button[type=submit]' + V).click();
  await expect(page.locator(".lp-form .login-info")).toContainText("บันทึกหน้าเข้าสู่ระบบแล้ว");
  const [{ v: v2 }] = await q<{ v: { images: string[] } }>(`SELECT "loginPage" v FROM "ShopSetting" WHERE id='shop'`);
  expect(v2.images).toEqual([]);

  // คืนค่าเริ่มต้น
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "คืนค่าเริ่มต้น" }).click();
  await expect(page.locator(".lp-form .login-info")).toContainText("คืนค่าเริ่มต้นแล้ว");
  const [{ v: v3 }] = await q<{ v: unknown }>(`SELECT "loginPage" v FROM "ShopSetting" WHERE id='shop'`);
  expect(v3).toEqual({});
  await expect(page.locator("#lpHead")).toHaveValue("ทุกงานแสง เริ่มต้นที่หลังร้านนี้");
});

test("มือถือ: โซนการตลาดย่อเหลือหัวข้อ + แถบไฟ · ฟอร์มใช้ได้ · ไม่ล้นจอ", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto("/admin/login");
  await expect(p.locator(".lg-hero h2")).toBeVisible();
  await expect(p.locator(".lg-hl")).toBeHidden();
  await expect(p.locator("#u")).toBeVisible();
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await ctx.close();
});
