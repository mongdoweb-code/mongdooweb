// หลังบ้าน: ต้องล็อกอินก่อน และทุกเมนูเปิดได้โดยไม่มี error
import { expect, test } from "@playwright/test";
import { V, login, trackErrors } from "./helpers";

test("ยังไม่ล็อกอิน → ถูกพาไปหน้าเข้าสู่ระบบ", async ({ page, request }) => {
  await page.goto("/admin/products");
  await expect(page).toHaveURL(/\/admin\/login/);
  const csv = await request.get("/admin/orders.csv", { maxRedirects: 0 });
  expect([307, 401]).toContain(csv.status());
});

const PAGES: [string, string][] = [
  ["/admin", "คำสั่งซื้อ"],
  ["/admin/products", "สินค้า"],
  ["/admin/categories", "หมวดหมู่"],
  ["/admin/slides", "สไลด์"],
  ["/admin/docs/QUOTATION", "ใบเสนอราคา"],
  ["/admin/docs/INVOICE", "ใบแจ้งหนี้"],
  ["/admin/docs/RECEIPT", "ใบเสร็จรับเงิน"],
  ["/admin/customers", "ลูกค้า"],
  ["/admin/line", "แจ้งเตือน LINE"],
  ["/admin/log", "บันทึกการใช้งาน"],
  ["/admin/settings", "ตั้งค่า"],
  ["/admin/inquiries", "คำขอจากลูกค้า"],
  ["/admin/pages", "หน้าเนื้อหา"],
  ["/admin/users", "ผู้ใช้หลังบ้าน"],
  ["/admin/system", "สถานะระบบ"],
  ["/admin/account", "บัญชีของฉัน"],
];

test("ทุกเมนูหลังบ้านเปิดได้", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  for (const [path, title] of PAGES) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1" + V).first(), path).toContainText(title);
  }
  expect(errors).toEqual([]);
});
