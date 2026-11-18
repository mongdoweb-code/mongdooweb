// ป๊อปอัปแจ้งผลการบันทึก "ทุกเมนู" (SaveCenter): ฟอร์ม useFormAction · ฟอร์ม server action ในหน้า server (redirect ?saved / ?err)
// · ปุ่มยืนยันลบ · ตัวแก้ไขที่เรียก action ตรง · ไม่ซ้ำกับป๊อปอัปของฟอร์มสินค้า · ไม่ขึ้นตอนค้นหา (GET)
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { V, confirmClick, login } from "./helpers";

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
const TAG = Date.now().toString(36);
const DR = `e2e-dr-${TAG}`;
const CAT = `e2e-popup-${TAG}`;
const popup = (page: Page) => page.locator(".srp");

test.beforeAll(async () => {
  await q(`INSERT INTO "DataRequest"(id, kind, name, phone, detail) VALUES ($1,'ACCESS',$2,'0800000000','ทดสอบป๊อปอัป')`, [DR, `ผู้ขอทดสอบ ${TAG}`]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "DataRequest" WHERE id=$1`, [DR]);
  await q(`DELETE FROM "Category" WHERE slug=$1`, [CAT]);
});

test("ฟอร์ม useFormAction: สำเร็จ = ป๊อปอัปเขียวพร้อมข้อความจากระบบ · ผิด = ป๊อปอัปแดง + ปุ่มพาไปช่องที่ผิด", async ({ page }) => {
  await login(page);
  await page.goto("/admin/categories?edit=new");
  const form = page.locator("form" + V).filter({ has: page.locator("#nameTh") }).first();
  // ผิด: ไม่มีชื่ออังกฤษ (ปิดการตรวจของเบราว์เซอร์ ให้เซิร์ฟเวอร์ตรวจ)
  await form.evaluate((f) => ((f as HTMLFormElement).noValidate = true));
  await page.fill("#nameTh", `หมวดป๊อปอัป ${TAG}`);
  await page.fill("#nameEn", "");
  await page.getByRole("button", { name: "บันทึกหมวด" }).click();
  await expect(popup(page)).toHaveClass(/bad/);
  await expect(popup(page).locator("h2")).toHaveText("บันทึกไม่สำเร็จ");
  await popup(page).getByRole("button", { name: "แก้ไขช่องที่ผิด" }).click();
  await expect(popup(page)).toHaveCount(0);
  await expect(page.locator("#nameEn")).toBeFocused();
  // สำเร็จ
  await page.fill("#nameEn", `Popup ${TAG}`);
  await page.fill("#slug", CAT);
  await page.getByRole("button", { name: "บันทึกหมวด" }).click();
  await expect(popup(page)).toHaveClass(/ok/);
  await expect(popup(page).locator("h2")).toHaveText("บันทึกสำเร็จ");
  await expect(popup(page)).toHaveCount(1);
  // ปิดเองภายใน ~3 วินาที
  await expect(popup(page)).toHaveCount(0, { timeout: 6000 });
});

test("ฟอร์ม server action ในหน้า server: redirect ?err= = ไม่สำเร็จ (ข้อความจากแถบแจ้งผล) · ?saved= = สำเร็จ", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/data-requests/${DR}`);
  const f = page.locator("#drResolve" + V);
  await f.evaluate((el) => ((el as HTMLFormElement).noValidate = true));
  await f.locator("textarea[name=result]").fill("ab");
  await f.getByRole("button", { name: "ดำเนินการแล้ว" }).click();
  await expect(popup(page)).toHaveClass(/bad/);
  await expect(popup(page).locator("#srp-d")).toHaveText("กรอกผลการดำเนินการที่จะแจ้งผู้ขอ");
  await popup(page).locator(".srp-acts").getByRole("button", { name: "ปิด" }).click();

  await page.locator("#drResolve" + V).locator("textarea[name=result]").fill("ส่งสำเนาข้อมูลทางอีเมลแล้ว");
  await page.locator("#drResolve" + V).getByRole("button", { name: "ปฏิเสธคำขอ" }).click();
  await expect(popup(page)).toHaveClass(/ok/);
  await expect(popup(page).locator("h2")).toHaveText("ปฏิเสธสำเร็จ");
  await expect(popup(page).locator("#srp-d")).toHaveText("บันทึกแล้ว");
  await expect(page).toHaveURL(/saved=1/);
});

test("ปุ่มยืนยันลบ (ConfirmSubmit) = ลบสำเร็จ", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/data-requests/${DR}`);
  await confirmClick(page, 'button:has-text("ลบข้อมูลตามคำขอ")', "ลบข้อมูล");
  await expect(popup(page)).toHaveClass(/ok/);
  await expect(popup(page).locator("h2")).toHaveText("ลบสำเร็จ");
});

test("ตัวแก้ไขที่เรียก action ตรง (หมวดยอดนิยม) แจ้งผลด้วยป๊อปอัปเดียวกัน · ฟอร์มสินค้าไม่ซ้อน 2 อัน · ค้นหาไม่มีป๊อปอัป", async ({ page }) => {
  await login(page);
  await page.goto("/admin/home/popular");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(popup(page)).toHaveClass(/ok/);
  await expect(popup(page)).toHaveCount(1);
  await popup(page).getByRole("button", { name: "ตกลง" }).click();

  // ฟอร์มสินค้ามีป๊อปอัปของตัวเอง → ต้องเห็นอันเดียว
  const [{ id }] = await q<{ id: string }>(`SELECT id FROM "Product" ORDER BY "createdAt" DESC LIMIT 1`);
  await page.goto(`/admin/products/${id}`);
  await page.locator('button[form="productForm"], #productForm button[type=submit]').first().click();
  await expect(popup(page)).toHaveCount(1);
  await page.waitForTimeout(1200);
  await expect(popup(page)).toHaveCount(1);
  await popup(page).locator(".srp-acts button").first().click();

  // ค้นหา (GET) ไม่มีป๊อปอัป
  await page.goto("/admin/products");
  const search = page.locator('.main input[type=search], .main input[name="q"]').first();
  await search.fill("led");
  await search.press("Enter");
  await page.waitForTimeout(1500);
  await expect(popup(page)).toHaveCount(0);
});
