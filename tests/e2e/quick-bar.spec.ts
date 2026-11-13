// แถบเมนูด่วนด้านบนหลังบ้าน: ค่าเริ่มต้น 7 เมนู (ไอคอน + ข้อความ) · กดแล้วไปหน้าจริง + ไฮไลต์หน้าปัจจุบัน
// · ตั้งค่า: เลือก/เอาออก/เรียงลำดับ/สูงสุด 10/คืนค่าเริ่มต้น (บันทึกต่อบัญชี) · จอแคบเหลือไอคอน ไม่ล้นจอ
import { expect, test } from "@playwright/test";
import pg from "pg";
import { ADMIN_USER, V, login } from "./helpers";

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
let orig: unknown = null;
test.beforeAll(async () => {
  [{ m: orig }] = await q<{ m: unknown }>(`SELECT "quickMenu" m FROM "Admin" WHERE username=$1`, [ADMIN_USER]);
  await q(`UPDATE "Admin" SET "quickMenu" = NULL WHERE username=$1`, [ADMIN_USER]);
});
test.afterAll(async () => {
  await q(`UPDATE "Admin" SET "quickMenu" = $2::jsonb WHERE username=$1`, [ADMIN_USER, orig == null ? null : JSON.stringify(orig)]);
});

const DEFAULT = ["ออกใบเสนอราคา", "ออกใบแจ้งหนี้", "เพิ่มสินค้า", "สินค้า", "หมวดหมู่สินค้า", "สต็อก", "นับสต็อกทั้งร้าน"];

test("ค่าเริ่มต้น: 7 เมนูอยู่ซ้ายของช่องค้นหา · กดแล้วไปหน้าจริง + ไฮไลต์", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  await page.goto("/admin/dashboard");
  const bar = page.getByRole("navigation", { name: "เมนูด่วน" });
  await expect(bar.locator(".qb-a")).toHaveText(DEFAULT);
  // ไอคอนทุกปุ่ม · ปุ่มสร้างมีเครื่องหมาย +
  await expect(bar.locator(".qb-a svg")).toHaveCount(DEFAULT.length);
  await expect(bar.locator(".qb-a.qb-new .qb-plus")).toHaveCount(3);
  // อยู่แถวเดียวกับช่องค้นหา และอยู่ทางซ้าย
  const [b, s] = await Promise.all([bar.boundingBox(), page.locator("#gsOpen").boundingBox()]);
  expect(Math.abs(b!.y + b!.height / 2 - (s!.y + s!.height / 2))).toBeLessThan(6);
  expect(b!.x + b!.width).toBeLessThanOrEqual(s!.x + 1);
  // ทุกเมนูเปิดหน้าได้จริง (ไม่ใช่ 404/500)
  for (const href of await bar.locator(".qb-a").evaluateAll((els) => els.map((e) => e.getAttribute("href")!))) {
    const r = await page.request.get(href);
    expect(r.status(), href).toBe(200);
  }
  // กด "สต็อก" → ไปหน้าสต็อก + ไฮไลต์เฉพาะปุ่มนั้น (ไม่ไฮไลต์ "นับสต็อกทั้งร้าน")
  await bar.getByRole("link", { name: "สต็อก", exact: true }).click();
  await page.waitForURL(/\/admin\/stock$/);
  await expect(bar.locator(".qb-a.on")).toHaveText(["สต็อก"]);
  await page.goto("/admin/stock/count");
  await expect(bar.locator(".qb-a.on")).toHaveText(["นับสต็อกทั้งร้าน"]);
  await page.goto("/admin/products/new");
  await expect(bar.locator(".qb-a.on")).toHaveText(["เพิ่มสินค้า"]);
  await expect(bar.locator('.qb-a[aria-current="page"]')).toHaveCount(1);
});

test("ตั้งค่า: เลือก/เอาออก/เรียงลำดับ → บันทึกแล้วแถบเปลี่ยนทันที · สูงสุด 10 · Esc ปิด · คืนค่าเริ่มต้น", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  await page.goto("/admin/dashboard");
  const bar = page.getByRole("navigation", { name: "เมนูด่วน" });
  await bar.getByRole("button", { name: "ตั้งค่าเมนูด่วน" }).click();
  const dlg = page.getByRole("dialog", { name: "ตั้งค่าเมนูด่วน" });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator(".qb-n")).toHaveText("7/10");
  // เอา "หมวดหมู่สินค้า" ออก · เพิ่ม "ลูกค้า" · เลื่อน "ลูกค้า" ขึ้นบนสุด
  await dlg.locator(".qb-opt", { hasText: "หมวดหมู่สินค้า" }).locator("input").uncheck();
  await dlg.locator(".qb-opt", { hasText: /^ลูกค้า$/ }).locator("input").check();
  for (let i = 0; i < 6; i++) await dlg.getByRole("button", { name: "เลื่อนขึ้น: ลูกค้า" }).click();
  await expect(dlg.getByRole("button", { name: "เลื่อนขึ้น: ลูกค้า" })).toBeDisabled();
  await dlg.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dlg).toBeHidden();
  const after = ["ลูกค้า", "ออกใบเสนอราคา", "ออกใบแจ้งหนี้", "เพิ่มสินค้า", "สินค้า", "สต็อก", "นับสต็อกทั้งร้าน"];
  await expect(bar.locator(".qb-a")).toHaveText(after);
  const [{ m }] = await q<{ m: string[] }>(`SELECT "quickMenu" m FROM "Admin" WHERE username=$1`, [ADMIN_USER]);
  expect(m).toEqual(["customers", "qt-new", "iv-new", "product-new", "products", "stock", "stock-count"]);
  // คงอยู่หลังโหลดใหม่ และหน้าอื่นก็เห็น
  await page.goto("/admin/products");
  await expect(bar.locator(".qb-a")).toHaveText(after);

  // สูงสุด 10: เลือกเพิ่มจนครบแล้วช่องที่เหลือกดไม่ได้ · Esc ปิดโดยไม่บันทึก
  await bar.getByRole("button", { name: "ตั้งค่าเมนูด่วน" }).click();
  const free = dlg.locator(".qb-opt:not(.on) input");
  for (let i = 0; i < 3; i++) await free.first().check();
  await expect(dlg.locator(".qb-n")).toHaveText("10/10");
  await expect(dlg.locator(".qb-opt:not(.on) input").first()).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  await expect(bar.locator(".qb-a")).toHaveText(after);

  // คืนค่าเริ่มต้น
  await bar.getByRole("button", { name: "ตั้งค่าเมนูด่วน" }).click();
  await dlg.getByRole("button", { name: "คืนค่าเริ่มต้น" }).click();
  await expect(dlg).toBeHidden();
  await expect(bar.locator(".qb-a")).toHaveText(DEFAULT);
  const [{ m: m2 }] = await q<{ m: unknown }>(`SELECT "quickMenu" m FROM "Admin" WHERE username=$1`, [ADMIN_USER]);
  expect(m2).toBeNull();

  // ไม่เลือกเลย → เหลือปุ่ม "เมนูด่วน" ไว้เปิดตั้งค่าใหม่
  await q(`UPDATE "Admin" SET "quickMenu" = '[]'::jsonb WHERE username=$1`, [ADMIN_USER]);
  await page.reload();
  await expect(bar.locator(".qb-a")).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "ตั้งค่าเมนูด่วน" })).toContainText("เมนูด่วน");
  await q(`UPDATE "Admin" SET "quickMenu" = NULL WHERE username=$1`, [ADMIN_USER]);
});

test("จอแคบ: เหลือไอคอน (ชื่อยังอ่านได้ด้วยโปรแกรมอ่านหน้าจอ) · แถบเต็มแถวบนมือถือ · ไม่ล้นจอ", async ({ page }) => {
  await login(page);
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/dashboard");
    const bar = page.getByRole("navigation", { name: "เมนูด่วน" });
    await expect(bar.getByRole("link", { name: "ออกใบเสนอราคา" })).toBeVisible();
    await expect(bar.locator(".qb-t").first()).toHaveCSS("width", "1px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `width ${width}`).toBe(true);
  }
  // มือถือ: แถบอยู่เหนือช่องค้นหา (เต็มแถว)
  const [b, s] = await Promise.all([page.locator(".qbar").boundingBox(), page.locator("#gsOpen").boundingBox()]);
  expect(b!.y + b!.height).toBeLessThanOrEqual(s!.y + 1);
  await expect(page.locator(".qbar" + V)).toBeVisible();
});
