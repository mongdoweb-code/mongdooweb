// เมนูหน้าร้าน (Navbar) จากหลังบ้าน: ซ่อน/เปลี่ยนชื่อ/เรียง/เพิ่มลิงก์เอง/ปิดไอคอน → หน้าร้านเปลี่ยนทันที · คืนค่าเดิม
// · ชื่อเมนูไม่ขึ้นบรรทัดใหม่ · เมนูล้นจอ → ใช้เมนูข้าง ☰
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
test.afterAll(async () => { await q(`UPDATE "ShopSetting" SET "navMenu"='{}' WHERE id='shop'`); });
const navTexts = (page: import("@playwright/test").Page) => page.locator(".header .nav > a, .header .nav .nav-trigger .t").allInnerTexts();

test("ค่าเริ่มต้น: เมนูเดิม บรรทัดเดียวทุกเมนู", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  const t = (await navTexts(page)).map((s) => s.split("\n")[0].replace(/\d[\d,]*$/, "").trim());
  expect(t).toEqual(["หน้าแรก", "หมวดสินค้า", "สินค้าทั้งหมด", "สินค้าขายดี", "ช่วยเลือกไฟ", "วิธีสั่งซื้อ", "ติดต่อเรา"]);
  // ทุกเมนูสูงเท่าบรรทัดเดียว
  const hs = await page.locator(".header .nav > a").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.max(...hs)).toBeLessThan(40);
});

test("หลังบ้าน: ซ่อน/เปลี่ยนชื่อ/เพิ่มลิงก์/ปิดไอคอน → หน้าร้าน", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/home/nav");
  const list = page.locator("#navList" + V);
  // ซ่อน "ช่วยเลือกไฟ" · เปลี่ยนชื่อ "ติดต่อเรา" → "ติดต่อร้าน" · แสดง "บทความ"
  await list.getByRole("switch", { name: "แสดงเมนู ช่วยเลือกไฟ" }).click();
  await list.getByLabel("ชื่อเมนู ติดต่อเรา").fill("ติดต่อร้าน");
  await list.getByRole("switch", { name: "แสดงเมนู บทความ" }).click();
  // ลิงก์เพิ่มเองผิด → แจ้งเตือน
  await page.getByRole("button", { name: /\+ เพิ่มลิงก์เอง/ }).click();
  const c1 = list.locator('li[data-key="c1"]');
  await c1.locator(".nav-label").fill("Shopee");
  await c1.locator(".nav-href").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "บันทึกเมนู" }).click();
  await expect(page.locator(".nav-ed .login-err" + V)).toContainText("ต้องขึ้นต้นด้วย");
  await c1.locator(".nav-href").fill("https://shopee.co.th/mongdoweb");
  await c1.getByLabel("เปิดแท็บใหม่").check();
  // เลื่อน Shopee ขึ้นไปอยู่หลัง "หน้าแรก"
  for (let i = 0; i < 20; i++) {
    const keys = await list.locator("li").evaluateAll((els) => els.map((e) => e.getAttribute("data-key")));
    if (keys.indexOf("c1") <= 1) break;
    await c1.getByRole("button", { name: /เลื่อน .* ขึ้น/ }).click();
  }
  await page.getByLabel("ติดตามคำสั่งซื้อ (ไอคอนคน)").uncheck();
  await page.getByLabel("ปุ่มสลับธีมกลางวัน/กลางคืน").uncheck();
  await expect(page.locator(".nav-pv" + V)).toContainText("Shopee");
  await page.getByRole("button", { name: "บันทึกเมนู" }).click();
  await expect(page.locator(".srp" + V)).toContainText("สำเร็จ");
  await expect.poll(async () => JSON.stringify((await q<{ n: unknown }>(`SELECT "navMenu" n FROM "ShopSetting" WHERE id='shop'`))[0].n)).toContain("shopee");

  await page.goto("/");
  const t = (await navTexts(page)).map((s) => s.split("\n")[0].replace(/\d[\d,]*$/, "").trim());
  expect(t[0]).toBe("หน้าแรก");
  expect(t[1]).toBe("Shopee");
  expect(t).toContain("ติดต่อร้าน");
  expect(t).toContain("บทความ");
  expect(t).not.toContain("ช่วยเลือกไฟ");
  const shopee = page.locator('.header .nav a[href="https://shopee.co.th/mongdoweb"]');
  await expect(shopee).toHaveAttribute("target", "_blank");
  await expect(page.locator('.header a.icon-btn[href="/track"]')).toHaveCount(0);
  await expect(page.locator(".header [data-theme-toggle]")).toHaveCount(0);
  await expect(page.locator("#searchBtn")).toBeVisible(); // ค้นหายังเปิดอยู่
  // มือถือ: เมนูข้างตามที่ตั้ง + ลิงก์จำเป็นยังอยู่
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#menuBtn").click();
  const drawer = page.locator("#drawer .dr-other");
  await expect(drawer).toContainText("Shopee");
  await expect(drawer).toContainText("ติดตามคำสั่งซื้อ");
  await expect(drawer).not.toContainText("ช่วยเลือกไฟ");
});

test("เมนูยาวเกินจอ → ใช้เมนูข้าง ☰ อัตโนมัติ · คืนค่าเมนูเดิม", async ({ page }) => {
  await q(`UPDATE "ShopSetting" SET "navMenu"=$1 WHERE id='shop'`, [JSON.stringify({ items: ["home", "cats", "all", "best", "finder", "howto", "contact", "projects", "blog"].map((k) => ({ key: k, show: true, label: k === "blog" ? "บทความและความรู้เรื่องไฟ" : undefined })) })]);
  await login(page);
  await page.goto("/admin/home/nav"); // ให้ action ล้างแคชหน้าร้าน: บันทึกซ้ำค่าเดิม
  await page.getByRole("button", { name: "บันทึกเมนู" }).click();
  await expect(page.locator(".srp" + V)).toContainText("สำเร็จ");
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/");
  await expect(page.locator("#header")).toHaveClass(/nav-over/);
  await expect(page.locator("#menuBtn")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  // คืนค่าเดิม
  await page.goto("/admin/home/nav");
  await page.getByRole("button", { name: "คืนค่าเมนูเดิม" }).click();
  await expect(page.locator(".srp" + V)).toContainText("สำเร็จ");
  expect((await q<{ n: object }>(`SELECT "navMenu" n FROM "ShopSetting" WHERE id='shop'`))[0].n).toEqual({});
});
