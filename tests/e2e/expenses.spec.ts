// ค่าใช้จ่ายร้าน: บันทึกพร้อมหลักฐาน (รูป) · VAT/หัก ณ ที่จ่าย · รายการ+สรุปหมวด · แก้ไข/เปลี่ยนเป็น PDF · ไฟล์ส่วนตัว · CSV · กำไรสุทธิ · ลบ
import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import pg from "pg";
import { V, login, todayBkk, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const DESC = `ค่าส่งพัสดุทดสอบ ${TAG}`;
// PNG 1×1
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const row = async () => (await q<{ id: string; a: number; v: number; w: number; f: string | null; c: string }>(`SELECT id, "amountSatang" a, "vatSatang" v, "whtSatang" w, "fileKey" f, category c FROM "Expense" WHERE description=$1`, [DESC]))[0];
test.afterAll(async () => { await q(`DELETE FROM "Expense" WHERE description LIKE $1`, [`%${TAG}%`]); });

test("บันทึกค่าใช้จ่าย + หลักฐาน + ภาษี → รายการ/สรุปหมวด/ไฟล์ส่วนตัว", async ({ page, playwright }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/expenses/new");
  // ช่องผิด: ไม่เลือกหมวด/ไม่ใส่ยอด
  await page.fill("#xDesc" + V, DESC);
  await page.locator("#xCat" + V).evaluate((s: HTMLSelectElement) => s.removeAttribute("required"));
  await page.locator("#xAmount" + V).evaluate((s: HTMLInputElement) => s.removeAttribute("required"));
  await page.getByRole("button", { name: "บันทึกค่าใช้จ่าย" }).click();
  await expect(page.locator(".xp-form .login-err" + V)).toContainText("เลือกหมวดค่าใช้จ่าย");
  await expect(page.locator(".xp-form .login-err" + V)).toContainText("กรุณาใส่ยอดเงิน");

  await page.selectOption("#xCat" + V, "LABOR");
  await page.fill("#xPayee" + V, `ช่างทดสอบ ${TAG}`);
  await page.fill("#xAmount" + V, "1070");
  await page.getByText("บิลนี้มีภาษีซื้อ (VAT)").click();
  await expect(page.locator("#xVat" + V)).toHaveValue("70.00");
  await page.getByText("ร้านหักภาษี ณ ที่จ่ายไว้").click();
  await page.fill("#xWht" + V, "30");
  await expect(page.locator(".xp-money .net" + V)).toContainText("1,040.00");
  await page.setInputFiles("#xFile" + V, { name: "bill.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "บันทึกค่าใช้จ่าย" }).click();
  await page.waitForURL(/\/admin\/expenses\?month=\d{4}-\d{2}&saved=1/);
  const r = await row();
  expect([r.a, r.v, r.w, r.c]).toEqual([107000, 7000, 3000, "LABOR"]);
  expect(r.f).toMatch(/^expenses\/\d{4}\/\d{2}\/[a-z0-9]+\.webp$/);

  const tr = page.locator(`#xpTable tr[data-id="${r.id}"]` + V);
  await expect(tr).toContainText("ค่าแรง / ค่าจ้างติดตั้ง");
  await expect(tr).toContainText("฿1,040"); // จ่ายจริง
  await expect(page.locator(".xp-cats" + V)).toContainText("ค่าแรง / ค่าจ้างติดตั้ง");

  // ไฟล์หลักฐาน: แอดมินเปิดได้ (no-store) · คนทั่วไปเปิดไม่ได้ · ไม่อยู่ใน /media
  const f = await page.request.get(`/admin/expenses/${r.id}/file`);
  expect(f.status()).toBe(200);
  expect(f.headers()["content-type"]).toBe("image/webp");
  expect(f.headers()["cache-control"]).toContain("no-store");
  const anon = await playwright.request.newContext({ baseURL: new URL(page.url()).origin });
  expect((await anon.get(`/admin/expenses/${r.id}/file`, { maxRedirects: 0 })).status()).not.toBe(200);
  expect((await anon.get(`/media/${r.f}`)).status()).toBe(404);
  await anon.dispose();
  expect(errors).toEqual([]);
});

test("แก้ไข: เปลี่ยนหลักฐานเป็น PDF (ไฟล์เดิมถูกลบ) · CSV · กำไรสุทธิ", async ({ page }) => {
  await login(page);
  const before = await row();
  await page.goto(`/admin/expenses/${before.id}`);
  await expect(page.locator(".xp-file img" + V)).toBeVisible();
  await page.fill("#xAmount" + V, "2140");
  await page.setInputFiles("#xFile" + V, { name: "bill.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(page.locator(".xp-form .login-info" + V)).toContainText("บันทึกค่าใช้จ่ายแล้ว");
  const after = await row();
  expect(after.a).toBe(214000);
  expect(after.f).toMatch(/\.pdf$/);
  expect((await page.request.get(`/admin/expenses/${after.id}/file`)).headers()["content-type"]).toBe("application/pdf");
  // ไฟล์รูปเดิมถูกลบจากที่เก็บ (STORAGE_DRIVER=local ในเทสต์)
  if ((process.env.STORAGE_DRIVER ?? "local") === "local") expect(existsSync(`${process.env.UPLOAD_DIR ?? "uploads"}/${before.f}`)).toBe(false);

  const csv = await page.request.get(`/admin/expenses/export?month=${todayBkk().slice(0, 7)}`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(DESC);

  // รายงานกำไร: แสดงค่าใช้จ่ายร้านและกำไรสุทธิ
  await page.goto("/admin/reports/profit");
  await expect(page.locator("#pfNet" + V)).toContainText("ค่าแรง / ค่าจ้างติดตั้ง");
  const gross = Number((await page.locator("#pfProfit" + V).innerText()).replace(/[^\d.−-]/g, "").replace("−", "-"));
  const exp = Number((await page.locator("#pfExpense" + V).innerText()).replace(/[^\d.]/g, ""));
  const net = Number((await page.locator("#pfNetProfit" + V).innerText()).replace(/[^\d.−-]/g, "").replace("−", "-"));
  expect(exp).toBeGreaterThanOrEqual(2000); // 2,140 − VAT (เมื่อร้านจด VAT) ≥ 2,000
  expect(Math.round((gross - exp) * 100)).toBe(Math.round(net * 100));
});

test("ลบ (เจ้าของร้าน) → รายการและไฟล์หายไป", async ({ page }) => {
  await login(page);
  const r = await row();
  await page.goto(`/admin/expenses/${r.id}`);
  await page.getByRole("button", { name: "ลบรายการ" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "ลบ" }).click();
  await page.waitForURL(/\/admin\/expenses\?month=.*deleted=1/);
  expect(await row()).toBeUndefined();
  expect((await page.request.get(`/admin/expenses/${r.id}/file`)).status()).toBe(404);
});
