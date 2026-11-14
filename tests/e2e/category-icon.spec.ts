// ไอคอนหมวด: เลือกจากคลัง (ค้นหา/กลุ่ม) → เมนูหน้าร้านใช้ไอคอนนั้น · อัปโหลดเอง (PNG/SVG) → แทนไอคอนคลังทุกจุด · เอาออกได้
import { expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const CAT = `e2e-caticon-${TAG}`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const row = async () => (await q<{ icon: string | null; iconKey: string | null }>(`SELECT icon, "iconKey" FROM "Category" WHERE id=$1`, [CAT]))[0];

test.beforeAll(async () => {
  await q(`INSERT INTO "Category"(id, slug, "nameTh", "nameEn", icon, "sortOrder") VALUES ($1,$1,$2,'E2E Pendant',  'deco', 99998)`, [CAT, `โคมแขวนทดสอบ ${TAG}`]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "Category" WHERE id=$1`, [CAT]);
});

const menuIcon = (page: import("@playwright/test").Page) => page.locator(`a[href="/category/${CAT}"] .mi`).first();

test("เลือกไอคอนจากคลัง: ค้นหา 'แขวน' → โคมไฟแขวน → บันทึก → เมนูหน้าร้านแสดงไอคอนใหม่", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/categories?edit=${CAT}`);
  const pick = page.locator("#catIcon" + V);
  await expect(pick.getByRole("tab", { name: /คลังไอคอน/ })).toHaveAttribute("aria-selected", "true");
  expect(await pick.locator(".ip-items button").count()).toBeGreaterThanOrEqual(40);
  await pick.getByLabel("ค้นหาไอคอน").fill("แขวน");
  await expect(pick.getByRole("radio", { name: "โคมไฟแขวน" })).toBeVisible();
  expect(await pick.locator(".ip-items button").count()).toBeLessThan(10);
  await pick.getByRole("radio", { name: "โคมไฟแขวน" }).click();
  await expect(pick.locator(".ip-preview em")).toHaveText("โคมไฟแขวน");
  await expect(pick.locator(".ip-preview b")).toHaveText(`โคมแขวนทดสอบ ${TAG}`);
  await pick.getByLabel("ค้นหาไอคอน").fill("ไม่มีคำนี้แน่นอน");
  await expect(pick.locator(".ip-none")).toBeVisible();
  await page.getByRole("button", { name: "บันทึกหมวด" }).click();
  await expect.poll(async () => (await row()).icon).toBe("pendant");

  // หน้าร้าน: เมนูหมวดใช้ path ของไอคอนโคมแขวน (ไม่ใช่ deco)
  await page.goto("/");
  const { iconPath } = await import("../../src/lib/icons");
  const firstD = (path: string) => path.match(/<path d="([^"]+)"/)?.[1];
  expect(firstD(iconPath("pendant"))).toBeTruthy();
  expect(firstD(iconPath("pendant"))).not.toBe(firstD(iconPath("deco")));
  await expect(menuIcon(page).locator("svg path").first()).toHaveAttribute("d", firstD(iconPath("pendant"))!);
});

test("อัปโหลดไอคอน PNG → แทนไอคอนคลังในหลังบ้านและหน้าร้าน · SVG ใช้ได้ · เอาออกได้", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/categories?edit=${CAT}`);
  const pick = page.locator("#catIcon" + V);
  await pick.getByRole("tab", { name: /อัปโหลดเอง/ }).click();
  await page.setInputFiles("#catIconFile", path.resolve("tests/fixtures/slip.png"));
  await expect(pick.locator(".ip-preview img")).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: "บันทึกหมวด" }).click();
  await expect.poll(async () => (await row()).iconKey).toMatch(/^categories\/\d{4}\/\d{2}\/\w+\.webp$/);
  await expect(page.locator("#catIcon" + V).locator(".ip-preview img")).toHaveAttribute("src", /\/media\/categories\//);

  await page.goto("/admin/categories");
  await expect(page.locator(`img.cat-ico-img[src*="/media/categories/"]`).first()).toBeVisible();

  await page.goto("/");
  const img = menuIcon(page).locator("img.ci-img");
  await expect(img).toHaveAttribute("src", /^\/media\/categories\//);
  expect((await page.request.get((await img.getAttribute("src"))!)).ok()).toBe(true);

  // SVG ก็อัปโหลดได้ (ระบบแปลงเป็นรูปให้)
  const dir = mkdtempSync(path.join(os.tmpdir(), "mdw-ico-"));
  const svgFile = path.join(dir, "icon.svg");
  writeFileSync(svgFile, `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#E8590C"/></svg>`);
  const before = (await row()).iconKey;
  await page.goto(`/admin/categories?edit=${CAT}`);
  await page.locator("#catIcon" + V).getByRole("tab", { name: /อัปโหลดเอง/ }).click();
  await page.setInputFiles("#catIconFile", svgFile);
  await page.getByRole("button", { name: "บันทึกหมวด" }).click();
  await expect.poll(async () => (await row()).iconKey).not.toBe(before);
  expect((await row()).iconKey).toMatch(/\.webp$/);

  // ไฟล์ที่ไม่ใช่รูป → แจ้งข้อผิดพลาด ไม่เปลี่ยนไอคอน
  const bad = path.join(dir, "bad.png");
  writeFileSync(bad, "not an image");
  const cur = (await row()).iconKey;
  await page.goto(`/admin/categories?edit=${CAT}`);
  await page.locator("#catIcon" + V).getByRole("tab", { name: /อัปโหลดเอง/ }).click();
  await page.setInputFiles("#catIconFile", bad);
  await page.getByRole("button", { name: "บันทึกหมวด" }).click();
  await expect(page.getByText(/ไอคอน:/).first()).toBeVisible();
  expect((await row()).iconKey).toBe(cur);

  // เอาออก → กลับไปใช้ไอคอนคลัง (โคมแขวน)
  await page.goto(`/admin/categories?edit=${CAT}`);
  await page.locator("#catIcon" + V).getByRole("tab", { name: /อัปโหลดเอง/ }).click();
  await page.getByLabel(/เอาไอคอนที่อัปโหลดออก/).check();
  await page.getByRole("button", { name: "บันทึกหมวด" }).click();
  await expect.poll(async () => (await row()).iconKey).toBeNull();
  expect((await row()).icon).toBe("pendant");
  await page.goto("/");
  await expect(menuIcon(page).locator("svg")).toHaveCount(1);
  await expect(menuIcon(page).locator("img")).toHaveCount(0);
});
