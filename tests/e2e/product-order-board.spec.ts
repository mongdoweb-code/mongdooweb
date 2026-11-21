// หลังบ้าน › จัดเรียงสินค้าหน้าร้าน (/admin/products/order): 3 มุมมอง (จำค่า) · พิมพ์ลำดับ · ลากวาง · คีย์บอร์ด · ปักหมุด · ย้อนกลับ
// · เลือกหลายชิ้น · เรียงอัตโนมัติ/ทิ้ง · บันทึกทั้งร้าน → ลำดับในฐานข้อมูล · คืนลำดับก่อนหน้า (สลับกลับได้) · สินค้าเพิ่มระหว่างจัด
// คืนลำดับเดิมของทุกสินค้าตอนจบ (ใช้ได้ทั้งฐานข้อมูลใหม่และสำเนาข้อมูลจริง)
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const P = ["A", "B", "C"].map((k, i) => ({ id: `e2e-ob-${k}-${TAG}`, sku: `E2E-OB-${k}-${TAG}`, slug: `e2e-ob-${k.toLowerCase()}-${TAG}`, name: `สินค้าทดสอบจัดเรียง ${k} ${TAG}`, order: 950000 + i * 10 }));
const EXTRA = `e2e-ob-x-${TAG}`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
let saved: { id: string; sortOrder: number; isPinned: boolean }[] = [];
const started = new Date();
/** ลำดับหน้าร้าน (PRODUCT_ORDER) ของสินค้าทั้งหมดบนกระดาน */
const fullOrder = async () => (await q<{ id: string }>(`SELECT id FROM "Product" WHERE "isService"=false ORDER BY "isPinned" DESC, "sortOrder", "createdAt"`)).map((r) => r.id);
const pos = async (id: string) => (await fullOrder()).indexOf(id) + 1;
const card = (page: Page, k: string) => page.locator(`[data-ob-id="e2e-ob-${k}-${TAG}"]` + V);

test.beforeAll(async () => {
  saved = await q(`SELECT id, "sortOrder", "isPinned" FROM "Product"`);
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`);
  for (const p of P)
    await q(`INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "inStock", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,10000,true,'{}',$5,$6,now())`, [p.id, p.sku, p.slug, p.name, cat.id, p.order]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "Product" WHERE id LIKE $1`, [`e2e-ob-%-${TAG}`]);
  await q(`UPDATE "Product" AS p SET "sortOrder" = v.s, "isPinned" = v.pin FROM unnest($1::text[], $2::int[], $3::bool[]) AS v(id, s, pin) WHERE p.id = v.id`, [saved.map((r) => r.id), saved.map((r) => r.sortOrder), saved.map((r) => r.isPinned)]);
  await q(`DELETE FROM "ContentVersion" WHERE kind='PRODUCT_ORDER' AND "publishedAt" >= $1`, [started]);
});

test("เมนู + 3 มุมมอง (ตาราง/การ์ด/การ์ดเล็ก) จำค่าไว้ · เส้นแบ่งหน้า", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/products");
  await page.getByRole("link", { name: "จัดเรียงหน้าร้าน" }).first().click();
  await expect(page).toHaveURL(/\/admin\/products\/order$/);
  await expect(page.getByRole("heading", { name: "จัดเรียงสินค้าหน้าร้าน", level: 1 })).toBeVisible();
  const total = (await fullOrder()).length;
  await expect(page.locator(".ob-item" + V)).toHaveCount(total);
  await expect(page.locator(".ob-v-card .ob-grid" + V)).toBeVisible();
  await page.locator('.ob-views [data-view="table"]' + V).click();
  await expect(page.locator(".ob-tbl" + V)).toBeVisible();
  await expect(page.locator(".ob-tbl tbody tr.ob-item" + V)).toHaveCount(total);
  await page.locator('.ob-views [data-view="small"]' + V).click();
  await expect(page.locator(".ob-v-small .ob-grid" + V)).toBeVisible();
  await page.reload();
  await expect(page.locator(".ob-v-small" + V)).toBeVisible();
  if (total > 24) await expect(page.locator(".ob-break" + V).first()).toContainText("หน้า 2 ของหน้าร้าน · เริ่มลำดับที่ 25");
  await page.locator('.ob-views [data-view="card"]' + V).click();
});

test("พิมพ์ลำดับ · ลากวาง · คีย์บอร์ด · ปักหมุด/ย้อนกลับ → บันทึกทั้งร้าน → คืนลำดับก่อนหน้า (สลับกลับได้)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/products/order");
  const pinned = (await q(`SELECT 1 FROM "Product" WHERE "isService"=false AND "isPinned"`)).length;
  const total = (await fullOrder()).length;
  // ค้นหา + แสดงเฉพาะที่ตรง
  await page.locator(".ob-search input" + V).fill(TAG);
  await page.locator(".ob-only input" + V).check();
  await expect(page.locator(".ob-item" + V)).toHaveCount(3);
  await expect(card(page, "C").locator(".ob-pos")).toHaveValue(String(total));

  // C → ลำดับที่ 1 (ไปอยู่ใต้ชิ้นที่ปักหมุด)
  await card(page, "C").locator(".ob-pos").fill("1");
  await card(page, "C").locator(".ob-pos").press("Enter");
  await expect(card(page, "C").locator(".ob-pos")).toHaveValue(String(pinned + 1));
  await expect(page.locator("[data-ob-save]" + V)).toHaveText("บันทึกลำดับ (1)");

  // ลาก A ไปวางหลัง B (เมาส์)
  const a = (await card(page, "A").locator(".ob-img").boundingBox())!, b = (await card(page, "B").boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width * 0.8, b.y + b.height / 2, { steps: 8 });
  await expect(page.locator(".ob-ghost")).toBeVisible();
  await page.mouse.up();
  const v = async (k: string) => Number(await card(page, k).locator(".ob-pos").inputValue());
  expect(await v("A")).toBeGreaterThan(await v("B"));

  // คีย์บอร์ด: ปุ่มจับของ A ↑ = ขึ้น 1 ช่อง (กลับมาก่อน B)
  const before = await v("A");
  await card(page, "A").locator("[data-drag-handle]").focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => v("A")).toBe(before - 1);
  await expect(card(page, "A").locator("[data-drag-handle]")).toBeFocused();

  // ปักหมุด B แล้วย้อนกลับ
  await card(page, "B").locator(".ob-ib.pin").click();
  await expect(card(page, "B").locator(".t-pin")).toBeVisible();
  await expect(card(page, "B").locator(".ob-pos")).toHaveValue(String(pinned + 1));
  await page.getByRole("button", { name: "↶ ย้อนกลับ" }).click();
  await expect(card(page, "B").locator(".t-pin")).toHaveCount(0);

  // บันทึก → ฐานข้อมูล
  await page.locator("[data-ob-save]" + V).click();
  await expect.poll(() => pos(`e2e-ob-C-${TAG}`)).toBe(pinned + 1);
  await expect(page.locator(".ob-msg" + V)).toContainText("ลำดับตรงกับหน้าร้าน");
  const afterSave = await fullOrder();
  expect(afterSave.indexOf(`e2e-ob-A-${TAG}`)).toBeLessThan(afterSave.indexOf(`e2e-ob-B-${TAG}`));
  expect(afterSave.length).toBe(total);

  // คืนลำดับก่อนหน้า → C กลับไปท้าย · กดอีกครั้ง = สลับกลับ
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "คืนลำดับก่อนหน้า" }).click();
  await expect.poll(() => pos(`e2e-ob-C-${TAG}`)).toBe(total);
  await expect(card(page, "C").locator(".ob-pos")).toHaveValue(String(total));
  await page.getByRole("button", { name: "คืนลำดับก่อนหน้า" }).click();
  await expect.poll(() => pos(`e2e-ob-C-${TAG}`)).toBe(pinned + 1);
});

test("เลือกหลายชิ้น → ล่างสุด · เรียงอัตโนมัติแล้วทิ้ง · มีสินค้าเพิ่มระหว่างจัด = ให้โหลดใหม่", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/products/order");
  page.on("dialog", (d) => d.accept());
  const total = (await fullOrder()).length;
  await page.locator(".ob-search input" + V).fill(TAG);
  await page.locator(".ob-only input" + V).check();
  await card(page, "C").locator(".ob-chk").check();
  await card(page, "A").locator(".ob-chk").check();
  await expect(page.locator(".ob-selbar" + V)).toContainText("เลือก 2 ชิ้น");
  await page.locator(".ob-selbar" + V).getByRole("button", { name: "⤓ ย้ายไปล่างสุด" }).click();
  // ย้ายพร้อมกันโดยคงลำดับที่เห็น (C อยู่ก่อน A)
  await expect(card(page, "C").locator(".ob-pos")).toHaveValue(String(total - 1));
  await expect(card(page, "A").locator(".ob-pos")).toHaveValue(String(total));
  await page.getByRole("button", { name: "ทิ้งการเปลี่ยนแปลง" }).click();
  await expect(page.locator("[data-ob-save]" + V)).toBeDisabled();

  await page.locator('select[aria-label="เรียงอัตโนมัติทั้งร้าน"]' + V).selectOption("name");
  await expect(page.locator(".ob-toast")).toContainText("เรียงแบบ");
  await expect(page.locator("[data-ob-save]" + V)).toBeEnabled();

  // มีคนเพิ่มสินค้าระหว่างจัด → บันทึกไม่ได้ ต้องโหลดใหม่ (ไม่เดาตำแหน่ง)
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`);
  await q(`INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "inStock", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$3,'สินค้าเพิ่มระหว่างจัด',100,true,'{}',$4,960000,now())`, [EXTRA, `E2E-OB-X-${TAG}`, `e2e-ob-x-${TAG}`, cat.id]);
  const beforeIds = await fullOrder();
  await page.locator("[data-ob-save]" + V).click();
  await expect(page.locator(".ob-msg" + V)).toContainText("โหลดหน้าใหม่");
  expect(await fullOrder()).toEqual(beforeIds);
});
