// ลูกค้าหลายเบอร์ + โทรสาร + อีเมล: "+ ลูกค้าใหม่" ในใบเสนอราคา (วางหลายเบอร์ในช่องเดียว → แยกแถว, ตรวจรูปแบบทันที)
// · ข้อผิดจาก server บอกเบอร์ที่ผิด · หน้าลูกค้า: ตั้งเบอร์หลัก/ลบเบอร์ · ค้นหาด้วยเบอร์ที่สอง
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const NAME = `บริษัท ทดสอบหลายเบอร์ ${TAG} จำกัด`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
type Row = { id: string; phone: string | null; phones: string[]; fax: string | null; email: string | null; contactName: string | null };
const cust = async () => (await q<Row>(`SELECT id, phone, phones, fax, email, "contactName" FROM "Customer" WHERE name=$1`, [NAME]))[0];

test.afterAll(async () => {
  const c = await cust();
  if (!c) return;
  await q(`DELETE FROM "SalesDocument" WHERE "customerId"=$1 AND status='DRAFT'`, [c.id]);
  await q(`DELETE FROM "Customer" WHERE id=$1`, [c.id]);
});

test("ลูกค้าใหม่ในใบเสนอราคา: หลายเบอร์ + โทรสาร + อีเมล", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/docs/QUOTATION/new/edit");
  await page.getByRole("button", { name: "+ ลูกค้าใหม่" }).click();
  const box = page.locator(".de-qc" + V);
  await expect(box.getByRole("heading", { name: "ข้อมูลติดต่อ" })).toBeVisible();
  await box.getByRole("button", { name: "นิติบุคคล / บริษัท" }).click();
  await page.fill("#qcName" + V, NAME);
  await page.fill("#qcContactName" + V, "คุณทดสอบ ฝ่ายจัดซื้อ");

  // วาง 2 เบอร์ในช่องเดียว (แบบที่เคยใส่ไม่ได้) → แยกเป็น 2 แถว
  await page.locator("#qcPhone" + V).focus();
  await page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement;
    const dt = new DataTransfer();
    dt.setData("text", "086-309-9066, 044-251234");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  const rows = box.locator("input[name=phones]");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveValue("086-309-9066");
  await expect(rows.nth(1)).toHaveValue("044-251234");
  await expect(box).toContainText("✓ 044-251-234 · บ้าน/สำนักงาน");

  // เพิ่มเบอร์ที่ 3 แบบมีเบอร์ต่อ · เบอร์ผิดเห็นข้อความทันที
  await box.getByRole("button", { name: "+ เพิ่มเบอร์โทร" }).click();
  await expect(rows).toHaveCount(3);
  await rows.nth(2).fill("02-123-45");
  await rows.nth(2).blur();
  await expect(box.locator(".cuf-err").first()).toContainText("รูปแบบไม่ถูกต้อง");
  await rows.nth(2).fill("02 123 4567 ต่อ 12");
  await expect(box).toContainText("✓ 02-123-4567 ต่อ 12");

  // อีเมลผิด → ข้อความ · โทรสาร
  await page.fill("#qcEmail" + V, "buy@");
  await expect(box).toContainText("รูปแบบอีเมลไม่ถูกต้อง");
  await page.fill("#qcEmail" + V, "Buy@Test-Shop.co.th");
  await page.fill("#qcFax" + V, "02-123-4568");
  await expect(box).toContainText("✓ 02-123-4568");
  await page.fill("#qcProvince" + V, "นครราชสีมา");

  await box.getByRole("button", { name: "บันทึกลูกค้าและเลือก" }).click();
  const picked = page.locator(".de-cust" + V);
  await expect(picked).toContainText(NAME);
  await expect(picked).toContainText("โทร 086-309-9066, 044-251-234, 02-123-4567 ต่อ 12");
  await expect(picked).toContainText("โทรสาร 02-123-4568");
  await expect(picked).toContainText("อีเมล buy@test-shop.co.th");
  await expect(page.locator(".srp" + V)).toContainText("เพิ่มลูกค้าสำเร็จ");
  // ตัวอย่าง A4: สาขาชิดขวาบรรทัดเดียวกับชื่อลูกค้า (ไม่ซ้ำในบรรทัดที่อยู่) · ทุกเบอร์ + โทรสาร + อีเมล
  const pv = page.locator(".de-pv .sheet .sh-cust" + V).first();
  await expect(pv.locator(".cust-top .cust-br")).toHaveText("สำนักงานใหญ่");
  await expect(pv.locator(".cust-top .cust-name")).toHaveText(NAME);
  await expect(pv).not.toContainText("(สำนักงานใหญ่)");
  await expect(pv.locator(".cust-ct")).toContainText("โทร 086-309-9066, 044-251-234, 02-123-4567 ต่อ 12");
  await expect(pv.locator(".cust-ct")).toContainText("โทรสาร 02-123-4568");

  const c = await cust();
  expect(c.phone).toBe("0863099066");
  expect(c.phones).toEqual(["0863099066", "044251234", "021234567#12"]);
  expect(c.fax).toBe("021234568");
  expect(c.email).toBe("buy@test-shop.co.th");
  expect(c.contactName).toBe("คุณทดสอบ ฝ่ายจัดซื้อ");
  expect(errors).toEqual([]);
});

test("server ปฏิเสธเบอร์ผิดและบอกว่าเบอร์ไหน", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  await page.goto("/admin/docs/QUOTATION/new/edit");
  await page.getByRole("button", { name: "+ ลูกค้าใหม่" }).click();
  const box = page.locator(".de-qc" + V);
  await page.fill("#qcName" + V, `ลูกค้าเบอร์ผิด ${TAG}`);
  await page.fill("#qcPhone" + V, "044-25");
  await box.getByRole("button", { name: "บันทึกลูกค้าและเลือก" }).click();
  await expect(box.locator(".login-err")).toContainText("เบอร์โทรไม่ถูกต้อง: 044-25");
  await expect(page.locator(".srp" + V)).toContainText("ไม่สำเร็จ");
  expect((await q(`SELECT 1 FROM "Customer" WHERE name=$1`, [`ลูกค้าเบอร์ผิด ${TAG}`])).length).toBe(0);
});

test("หน้าลูกค้า: ตั้งเบอร์หลัก ลบเบอร์ แล้วค้นหาด้วยเบอร์อื่นได้", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await login(page);
  const c = await cust();
  await page.goto(`/admin/customers/${c.id}`);
  const form = page.locator("form.cu-page" + V);
  const rows = form.locator("input[name=phones]");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toHaveValue("02-123-4567 ต่อ 12");
  await expect(page.locator("#c-fax" + V)).toHaveValue("02-123-4568");
  // เบอร์ 2 เป็นเบอร์หลัก · ลบเบอร์ 3
  await form.getByRole("button", { name: "ตั้งเบอร์ที่ 2 เป็นเบอร์หลัก" }).click();
  await expect(rows.nth(0)).toHaveValue("044-251-234");
  await form.getByRole("button", { name: "ลบเบอร์ที่ 3" }).click();
  await expect(rows).toHaveCount(2);
  // พิมพ์เบอร์แล้วกด "+ เพิ่มเบอร์โทร" ทันที (ช่องเสียโฟกัส) → ปุ่มต้องไม่เลื่อนหนีจนคลิกไม่ติด
  await form.getByRole("button", { name: "+ เพิ่มเบอร์โทร" }).click();
  await rows.nth(2).pressSequentially("0899999999");
  await form.getByRole("button", { name: "+ เพิ่มเบอร์โทร" }).click();
  await expect(rows).toHaveCount(4);
  await form.getByRole("button", { name: "ลบเบอร์ที่ 4" }).click();
  await form.getByRole("button", { name: "ลบเบอร์ที่ 3" }).click();
  await expect(rows).toHaveCount(2);
  await form.getByRole("button", { name: "บันทึกข้อมูลลูกค้า" }).click();
  await expect(form.locator(".login-info")).toContainText("บันทึกข้อมูลลูกค้าแล้ว");
  await expect.poll(async () => (await cust()).phones).toEqual(["044251234", "0863099066"]);
  expect((await cust()).phone).toBe("044251234");

  // ค้นหารายชื่อลูกค้าด้วยเบอร์ที่สอง (ไม่ใช่เบอร์หลัก)
  await page.goto(`/admin/customers?q=0863099066`);
  await expect(page.locator(`tr:has-text("${NAME}")` + V)).toContainText("044-251-234, 086-309-9066");
  expect(errors).toEqual([]);
});
