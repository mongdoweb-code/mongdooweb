// ล็อต 13 — ทุกตารางหลังบ้านมีคอลัมน์ "การดำเนินการ" (ไอคอน + เหตุผลเมื่อใช้ไม่ได้) · ค้นหา + แบ่งหน้า · แก้ไขงาน · แก้สต็อกในตาราง · สวิตช์คูปอง
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
const CP = `L13${TAG.slice(-6).toUpperCase()}`;
const TASK = `e2e-l13-t-${TAG}`;
const PROD = `e2e-l13-p-${TAG}`;
test.beforeAll(async () => {
  await q(`INSERT INTO "Coupon"(id, code, kind, value, "isActive", "updatedAt") VALUES ($1,$2,'PERCENT',1000,true,now())`, [`c-${TAG}`, CP]);
  const [me] = await q<{ id: string }>(`SELECT id FROM "Admin" WHERE username=$1`, [process.env.E2E_ADMIN_USER ?? "admin"]);
  await q(`INSERT INTO "AdminTask"(id, title, "assigneeId", "createdById") VALUES ($1,$2,$3,$3)`, [TASK, `งานล็อต13 ${TAG}`, me.id]);
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`);
  await q(`INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "trackStock", stock, "inStock", images, "categoryId", "updatedAt") VALUES ($1,$2,$3,$4,10000,true,5,true,'{}',$5,now())`, [
    PROD, `E2E-L13-${TAG}`, `e2e-l13-${TAG}`, `สินค้าทดสอบล็อต13 ${TAG}`, cat.id,
  ]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "Coupon" WHERE id=$1`, [`c-${TAG}`]);
  await q(`DELETE FROM "AdminTask" WHERE id=$1`, [TASK]);
  await q(`DELETE FROM "StockMovement" WHERE "productId"=$1`, [PROD]);
  await q(`DELETE FROM "Product" WHERE id=$1`, [PROD]);
});

test("ทุกตารางมีคอลัมน์การดำเนินการ", async ({ page }) => {
  await login(page);
  for (const url of ["/admin", "/admin/customers", "/admin/posts", "/admin/projects", "/admin/coupons", "/admin/purchase-orders", "/admin/claims?tab=ALL", "/admin/data-requests", "/admin/stock", "/admin/products", "/admin/categories", "/admin/docs/QUOTATION"]) {
    await page.goto(url);
    await expect(page.locator("th.col-acts" + V), url).toHaveCount(1);
  }
});

test("คูปอง: สวิตช์เปิด/ปิด · ค้นหาโค้ด · ปุ่มลบใช้ได้เมื่อยังไม่มีคนใช้", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/coupons?q=${CP}`);
  await expect(page.locator("tbody tr" + V)).toHaveCount(1);
  const sw = page.getByRole("switch", { name: `เปิดใช้คูปอง ${CP}` });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect.poll(async () => (await q<{ a: boolean }>(`SELECT "isActive" a FROM "Coupon" WHERE code=$1`, [CP]))[0].a).toBe(false);
  await page.goto(`/admin/coupons?q=${CP}`);
  await expect(page.getByRole("button", { name: `ลบ ${CP}` })).toBeVisible();
});

test("งานที่ต้องทำ: แก้ไขหัวข้อ/วันครบกำหนดได้ในรายการ", async ({ page }) => {
  await login(page);
  await page.goto("/admin/tasks");
  const li = page.locator(`li[data-task="งานล็อต13 ${TAG}"]` + V);
  await li.locator("summary.ra-edit").click();
  await li.locator('input[name="title"]').fill(`งานล็อต13 แก้แล้ว ${TAG}`);
  await li.locator('input[name="dueDate"]').fill("2030-01-15");
  await li.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect(page.locator(".ok-box" + V)).toContainText("บันทึกงานแล้ว");
  const [t] = await q<{ title: string; d: string }>(`SELECT title, to_char("dueAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') d FROM "AdminTask" WHERE id=$1`, [TASK]);
  expect(t).toEqual({ title: `งานล็อต13 แก้แล้ว ${TAG}`, d: "2030-01-15" });
});

test("สต็อก: แก้จำนวนในตารางได้ทันที (มีประวัติ)", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/stock?q=E2E-L13-${TAG}`);
  await page.getByRole("button", { name: `สต็อก E2E-L13-${TAG} (กดเพื่อแก้)` }).click();
  await page.getByRole("textbox", { name: `สต็อก E2E-L13-${TAG}` }).fill("12");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await q<{ s: number }>(`SELECT stock s FROM "Product" WHERE id=$1`, [PROD]))[0].s).toBe(12);
  expect((await q(`SELECT 1 FROM "StockMovement" WHERE "productId"=$1`, [PROD])).length).toBeGreaterThan(0);
});

test("ลูกค้า: ปุ่มสร้างใบเสนอราคา · ลบไม่ได้เมื่อมีเอกสาร (บอกเหตุผล)", async ({ page }) => {
  await login(page);
  await page.goto("/admin/customers");
  const row = page.locator("tbody tr" + V).first();
  await expect(row.locator('a[href*="/admin/docs/QUOTATION/new/edit?customer="]')).toHaveCount(1);
  const [withDocs] = await q<{ code: string }>(`SELECT c.code FROM "Customer" c WHERE EXISTS (SELECT 1 FROM "SalesDocument" d WHERE d."customerId"=c.id) LIMIT 1`);
  if (withDocs) {
    await page.goto(`/admin/customers?q=${withDocs.code}`);
    await expect(page.locator(`tr[data-code="${withDocs.code}"] .ra-del[aria-disabled="true"]` + V)).toHaveAttribute("data-tip", /มีเอกสาร/);
  }
});
