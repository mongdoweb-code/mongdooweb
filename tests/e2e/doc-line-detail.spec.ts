// รายละเอียดใต้ชื่อรายการ (ตัวแก้ไขเอกสาร): กล่องข้อความหลายบรรทัด (Enter ขึ้นบรรทัดใหม่) · ลากขยายได้ · สูงขึ้นตามเนื้อหา
// → ตัวอย่าง A4 / หน้าพิมพ์ขึ้นบรรทัดใหม่ตามที่พิมพ์ · บันทึกแล้วยังเป็นหลายบรรทัด
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const CUST = `e2e-ld-c-${TAG}`;
const DOC = `e2e-ld-qt-${TAG}`;
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
  await q(`INSERT INTO "Customer" (id, code, kind, name, phone, "updatedAt") VALUES ($1, $2, 'PERSON', 'ลูกค้าทดสอบรายละเอียด', '0855555555', now())`, [CUST, `L${TAG.slice(-7)}`]);
  await q(
    `INSERT INTO "SalesDocument"(id, type, status, "issueDate", "validUntil", "customerId", "customerSnapshot", "subtotalSatang", "grandSatang", "updatedAt")
     VALUES ($1, 'QUOTATION', 'DRAFT', now(), now() + interval '30 days', $2, '{"name":"ลูกค้าทดสอบรายละเอียด"}', 195000, 195000, now())`,
    [DOC, CUST],
  );
  await q(`INSERT INTO "SalesDocumentItem"(id, "documentId", "sortOrder", sku, name, unit, "qtyMilli", "priceSatang") VALUES ($1,$2,1,'BEM-TEST','ไฟบีมทดสอบรายละเอียด','ชิ้น',1000,195000)`, [`${DOC}-1`, DOC]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "SalesDocument" WHERE id=$1`, [DOC]);
  await q(`DELETE FROM "Customer" WHERE id=$1`, [CUST]);
});

test("พิมพ์หลายบรรทัด → ตัวอย่างขึ้นบรรทัดใหม่ → บันทึก → หน้าพิมพ์ยังเป็นหลายบรรทัด", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await login(page);
  await page.goto(`/admin/docs/QUOTATION/${DOC}/edit`);
  const box = page.getByRole("textbox", { name: "รายละเอียด" }).first();
  await expect(box).toBeVisible();
  expect(await box.evaluate((e) => e.tagName)).toBe("TEXTAREA");
  // ลากขยายได้ (resize) และเริ่มที่ความสูงหนึ่งบรรทัด
  expect(await box.evaluate((e) => getComputedStyle(e).resize)).toBe("both");
  const h0 = (await box.boundingBox())!.height;
  await box.click();
  await page.keyboard.type("มุมลำแสง 10 องศา");
  await page.keyboard.press("Enter");
  await page.keyboard.type("กันน้ำ IP65");
  await page.keyboard.press("Enter");
  await page.keyboard.type("รับประกัน 1 ปี");
  await expect(box).toHaveValue("มุมลำแสง 10 องศา\nกันน้ำ IP65\nรับประกัน 1 ปี");
  expect((await box.boundingBox())!.height).toBeGreaterThan(h0 + 20); // สูงขึ้นตามเนื้อหา
  // Enter ไม่ส่งฟอร์ม (ยังอยู่หน้าแก้ไข)
  await expect(page).toHaveURL(/\/edit$/);
  // ตัวอย่าง A4: 3 บรรทัด
  const small = page.locator(".sheet .sh-tbl td.nm small").first();
  await expect(small).toContainText("กันน้ำ IP65");
  expect(await small.evaluate((e) => e.querySelectorAll("br").length)).toBe(2);

  await page.locator('button[name="intent"][value="save"]' + V).click();
  await expect.poll(async () => (await q<{ detail: string }>(`SELECT detail FROM "SalesDocumentItem" WHERE "documentId"=$1`, [DOC]))[0]?.detail).toBe("มุมลำแสง 10 องศา\nกันน้ำ IP65\nรับประกัน 1 ปี");

  // โหลดตัวแก้ไขใหม่ → ค่าเดิมครบ · หน้าพิมพ์ขึ้นบรรทัดใหม่
  await page.goto(`/admin/docs/QUOTATION/${DOC}/edit`);
  await expect(page.getByRole("textbox", { name: "รายละเอียด" }).first()).toHaveValue("มุมลำแสง 10 องศา\nกันน้ำ IP65\nรับประกัน 1 ปี");
  await page.goto(`/admin/print/doc/${DOC}`);
  const ps = page.locator(".sheet .sh-tbl td.nm small").first();
  await expect(ps).toContainText("รับประกัน 1 ปี");
  expect(await ps.evaluate((e) => e.querySelectorAll("br").length)).toBe(2);
});
