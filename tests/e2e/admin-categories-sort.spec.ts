// หลังบ้าน › หมวดหมู่: เมนูอยู่บนสุดของกลุ่ม "สินค้าและหน้าร้าน" · เรียงตารางตามคอลัมน์ · ใช้ลำดับที่เรียงกับหน้าร้าน · ไปบนสุด/ล่างสุด
// เก็บลำดับเดิมไว้แล้วคืนค่าตอนจบ (ฐานข้อมูลใหม่หรือสำเนาข้อมูลจริงก็ผ่าน)
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, confirmClick, login } from "./helpers";

test.describe.configure({ mode: "serial" });

const db = () => new pg.Client({ connectionString: process.env.DATABASE_URL });
type Row = { id: string; sortOrder: number; nameTh: string; n: number };
async function cats(): Promise<Row[]> {
  const c = db();
  await c.connect();
  try {
    const r = await c.query<Row>(`SELECT c.id, c."sortOrder", c."nameTh", (SELECT count(*)::int FROM "Product" p WHERE p."categoryId" = c.id AND p."isActive") AS n FROM "Category" c ORDER BY c."sortOrder"`);
    return r.rows;
  } finally {
    await c.end();
  }
}
let original: Row[] = [];

test.beforeAll(async () => {
  original = await cats();
});
test.afterAll(async () => {
  const c = db();
  await c.connect();
  try {
    for (const r of original) await c.query(`UPDATE "Category" SET "sortOrder" = $1 WHERE id = $2`, [r.sortOrder, r.id]);
  } finally {
    await c.end();
  }
});

test("เมนู 'หมวดหมู่สินค้า' อยู่บนสุดของกลุ่มสินค้าและหน้าร้าน", async ({ page }) => {
  await login(page);
  await page.goto("/admin/categories");
  const links = await page.locator("#side a" + V).evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const i = links.indexOf("/admin/categories");
  expect(i).toBeGreaterThanOrEqual(0);
  expect(links[i + 1]).toBe("/admin/products");
});

test("กดหัวคอลัมน์ 'สินค้า' เรียงมาก→น้อย/น้อย→มาก (ดูอย่างเดียว) แล้วใช้ลำดับนี้กับหน้าร้าน", async ({ page }) => {
  await login(page);
  await page.goto("/admin/categories");
  await expect(page.locator(".sort-bar" + V)).toHaveCount(0);
  await page.locator('th a.th-sort:has-text("สินค้า")' + V).click();
  await expect(page).toHaveURL(/sort=count&dir=desc/);
  await expect(page.locator('th[aria-sort="descending"]' + V)).toContainText("สินค้า");
  const counts = async () => (await page.locator("tbody tr td.r.num" + V).allTextContents()).map((t) => Number(t.trim()));
  const desc = await counts();
  expect(desc).toEqual([...desc].sort((a, b) => b - a));
  // ลำดับหน้าร้านยังไม่เปลี่ยน + ปุ่มเลื่อนถูกซ่อนในมุมมองนี้
  expect((await cats()).map((r) => r.id)).toEqual(original.map((r) => r.id));
  await expect(page.locator("tbody .mv button" + V)).toHaveCount(0);
  await page.locator('th a.th-sort:has-text("สินค้า")' + V).click();
  await expect(page).toHaveURL(/sort=count(?!&dir=desc)/);
  const asc = await counts();
  expect(asc).toEqual([...asc].sort((a, b) => a - b));
  // ใช้ลำดับ มาก→น้อย กับหน้าร้าน
  await page.locator('th a.th-sort:has-text("สินค้า")' + V).click();
  await confirmClick(page, '.sort-bar button:has-text("ใช้ลำดับนี้กับหน้าร้าน")', "ใช้ลำดับนี้");
  await expect(page.locator(".login-info" + V)).toContainText("บันทึกลำดับใหม่แล้ว");
  const after = await cats();
  const ns = after.map((r) => r.n);
  expect(ns).toEqual([...ns].sort((a, b) => b - a));
  // หน้าร้านเรียงตามนี้
  await page.goto("/");
  const first = await page.locator("#catGrid .cat-card b").first().textContent();
  const visibleFirst = after.find((r) => r.nameTh === first?.trim());
  expect(visibleFirst).toBeTruthy();
});

test("ไปบนสุด / ไปล่างสุด", async ({ page }) => {
  await login(page);
  await page.goto("/admin/categories");
  const before = await cats();
  const last = before[before.length - 1];
  await page.getByRole("button", { name: `ไปบนสุด ${last.nameTh}` }).first().click();
  await expect.poll(async () => (await cats())[0].id).toBe(last.id);
  await page.getByRole("button", { name: `ไปล่างสุด ${last.nameTh}` }).first().click();
  await expect.poll(async () => (await cats()).at(-1)!.id).toBe(last.id);
  expect((await cats()).map((r) => r.id)).toEqual(before.map((r) => r.id));
});

test("ลากวางเรียงหมวด + ปุ่มดู/แก้ไข/ลบ", async ({ page }) => {
  await login(page);
  await page.goto("/admin/categories");
  const before = await cats();
  const [a, b] = before;
  const h = page.locator(`tr[data-id="${a.id}"] [data-drag-handle]` + V);
  const t = (await page.locator(`tr[data-id="${b.id}"]` + V).boundingBox())!;
  const hb = (await h.boundingBox())!;
  await page.mouse.move(hb.x + 5, hb.y + 5);
  await page.mouse.down();
  await page.mouse.move(hb.x + 5, t.y + t.height - 3, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".sort-msg.ok" + V)).toContainText("บันทึกลำดับแล้ว");
  await expect.poll(async () => (await cats()).slice(0, 2).map((r) => r.id)).toEqual([b.id, a.id]);
  const row = page.locator(`tr[data-id="${a.id}"]` + V);
  await expect(row.locator("a.ra-edit")).toHaveAttribute("href", `/admin/categories?edit=${a.id}`);
  // หมวดที่มีสินค้า ลบไม่ได้ (ปุ่มจางพร้อมเหตุผล)
  if (a.n) await expect(row.locator('.ra-del[aria-disabled="true"]')).toHaveAttribute("data-tip", /มีสินค้า/);
});
