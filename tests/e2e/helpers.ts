// ตัวช่วยร่วมของเทสต์ e2e
import { expect, type Page } from "@playwright/test";

export const ADMIN_USER = process.env.E2E_ADMIN_USER ?? "admin";
export const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? "";
export const V = " >> visible=true"; // Next 16 เก็บหน้าก่อนหน้าไว้ (hidden) — เลือกเฉพาะที่มองเห็น

/** วันนี้ตามเวลาไทย "YYYY-MM-DD" */
export const todayBkk = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

/** เก็บ error ของหน้า (JS error + console.error) ไว้ตรวจท้ายเทสต์ */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_|images\.unsplash|fonts\.g/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

export async function login(page: Page) {
  expect(ADMIN_PASS, "ตั้ง E2E_ADMIN_PASSWORD ก่อนรันเทสต์หลังบ้าน").not.toBe("");
  await page.goto("/admin/login");
  await page.fill("#u" + V, ADMIN_USER);
  await page.fill("#pw" + V, ADMIN_PASS);
  await page.click(".login-card button[type=submit]" + V);
  await expect(page.locator(".kpi" + V).first()).toBeVisible();
}

/** ปุ่มที่มีหน้าต่างยืนยัน (ConfirmSubmit) */
export async function confirmClick(page: Page, button: string, confirm: string) {
  await page.click(`${button}${V}`);
  await page.click(`.dlg button:has-text("${confirm}")${V}`);
}

type CatalogItem = { id: string; name: string; price: number; inStock: boolean };
/** สินค้าที่สั่งซื้อได้ตัวแรกจากข้อมูลหน้าร้าน */
export async function buyableProduct(page: Page) {
  await page.goto("/");
  const catalog = await page.evaluate(() => JSON.parse(document.getElementById("mdw-data")!.textContent!).catalog as CatalogItem[]);
  const p = catalog.find((c) => c.price > 0 && c.inStock);
  expect(p, "ต้องมีสินค้าที่มีราคาและมีของอย่างน้อย 1 รายการ").toBeTruthy();
  return p!;
}
