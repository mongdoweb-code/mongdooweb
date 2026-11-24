// ข้อความแจ้งเตือนหน้าสินค้า: คลัง /admin/notices (สร้าง · ตามหมวด · ติ๊กสินค้า · ลบ) + หน้าแก้ไขสินค้า (ปิดข้อความอัตโนมัติ · สร้างใหม่แล้วใช้ทันที) → หน้าสินค้า
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const A = { id: `e2e-nt-a-${TAG}`, sku: `E2E-NT-A-${TAG}`, slug: `e2e-nt-a-${TAG}`, name: `ไฟทดสอบข้อความ A ${TAG}` };
const B = { id: `e2e-nt-b-${TAG}`, sku: `E2E-NT-B-${TAG}`, slug: `e2e-nt-b-${TAG}`, name: `ไฟทดสอบข้อความ B ${TAG}` };
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
let cat = "", catName = "";
const notesOf = async (page: Page, slug: string) => {
  await page.goto(`/product/${slug}`);
  return page.locator(".pdp-notes .ntc").allInnerTexts();
};
const saveProduct = async (page: Page) => {
  await page.locator('button[type=submit]:has-text("บันทึกสินค้า")' + V).first().click();
};

test.beforeAll(async () => {
  [{ id: cat, nameTh: catName }] = await q<{ id: string; nameTh: string }>(`SELECT id, "nameTh" FROM "Category" WHERE "isActive" ORDER BY "sortOrder" LIMIT 1`);
  for (const [i, p] of [A, B].entries())
    await q(
      `INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "inStock", "isActive", images, "categoryId", "sortOrder", "updatedAt")
       VALUES ($1,$2,$3,$4,49000,true,true,'{}',$5,$6,now())`,
      [p.id, p.sku, p.slug, p.name, cat, 980000 + i],
    );
});
test.afterAll(async () => {
  await q(`DELETE FROM "Product" WHERE id = ANY($1)`, [[A.id, B.id]]);
  await q(`DELETE FROM "ProductNotice" WHERE name LIKE $1`, [`%${TAG}%`]);
});

test("คลังข้อความ: สร้างแบบตามหมวด (ตัวหนา · สีแดง · ไอคอนห้าม) → แสดงอัตโนมัติ · ติ๊กสินค้าเพิ่ม · แก้ไข · ลบแล้วถอดออกจากสินค้า", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/notices");
  const f = page.locator(".ntc-form" + V).first();
  await f.locator("#ntf-text").fill(`ห้ามเปิดไฟขณะไม่อยู่ในน้ำ ${TAG} · `);
  await f.locator("#ntf-text").press("End");
  await f.getByRole("button", { name: "ทำตัวหนา (ครอบด้วย **)" }).click();
  await expect(f.locator("#ntf-text")).toHaveValue(`ห้ามเปิดไฟขณะไม่อยู่ในน้ำ ${TAG} · **ตัวหนา**`);
  await f.locator("#ntf-text").fill(`ห้ามเปิดไฟขณะไม่อยู่ในน้ำ ${TAG} · **อายุหลอดจะสั้นลง**`);
  await f.locator(".ntf-tone", { hasText: "อันตราย / ห้าม" }).click();
  await f.getByRole("radio", { name: "ห้าม", exact: true }).click();
  await expect(f.locator(".ntc-prev .ntc-danger b")).toHaveText("อายุหลอดจะสั้นลง");
  await f.locator(".ntc-scope", { hasText: "ทุกสินค้าในหมวดที่เลือก" }).click();
  await f.locator(".ntc-chip", { hasText: catName }).click();
  await expect(f.locator(".ntc-hint")).toContainText("แสดงอัตโนมัติกับสินค้า");
  // ติ๊ก B เพิ่ม (B อยู่หมวดเดียวกันอยู่แล้ว → ไม่ซ้ำ)
  await f.locator(".ntc-pick-bar input").fill(B.sku);
  await f.locator(".ntc-pick label", { hasText: B.sku }).click();
  await f.getByRole("button", { name: "เพิ่มข้อความ" }).click();
  await expect(page).toHaveURL(/saved=1/);
  const [n] = await q<{ id: string; tone: string; icon: string; scope: string; categoryIds: string[] }>(`SELECT id, tone, icon, scope, "categoryIds" FROM "ProductNotice" WHERE text LIKE $1`, [`%${TAG}%`]);
  expect([n.tone, n.icon, n.scope, n.categoryIds]).toEqual(["DANGER", "stop", "CATEGORIES", [cat]]);
  expect((await q<{ ids: string[] }>(`SELECT "noticeIds" ids FROM "Product" WHERE id=$1`, [B.id]))[0].ids).toContain(n.id);

  const notes = await notesOf(page, A.slug);
  expect(notes.join("|")).toContain(`ห้ามเปิดไฟขณะไม่อยู่ในน้ำ ${TAG}`);
  await expect(page.locator(".pdp-notes .ntc-danger b")).toHaveText("อายุหลอดจะสั้นลง");
  expect((await notesOf(page, B.slug)).filter((t) => t.includes(TAG))).toHaveLength(1);

  // แก้ไข: เปลี่ยนเป็นเลือกเอง → A ไม่แสดง (ไม่ได้ติ๊ก) · B ยังแสดง
  await page.goto(`/admin/notices/${n.id}`);
  await page.locator(".ntc-scope" + V, { hasText: "เลือกสินค้าเอง" }).click();
  await page.getByRole("button", { name: "บันทึกการแก้ไข" }).click();
  await expect.poll(async () => (await q<{ scope: string }>(`SELECT scope FROM "ProductNotice" WHERE id=$1`, [n.id]))[0].scope).toBe("MANUAL");
  expect((await notesOf(page, A.slug)).some((t) => t.includes(TAG))).toBe(false);
  expect((await notesOf(page, B.slug)).some((t) => t.includes(TAG))).toBe(true);

  // ลบ → ถอดออกจากสินค้า
  await page.goto("/admin/notices");
  const row = page.locator(`tr[data-id="${n.id}"]`);
  await row.getByRole("button", { name: /ลบ/ }).click();
  await page.locator(`.dlg button:has-text("ลบข้อความ")` + V).click();
  await expect(page).toHaveURL(/deleted=1/);
  expect((await q<{ ids: string[] }>(`SELECT "noticeIds" ids FROM "Product" WHERE id=$1`, [B.id]))[0].ids).not.toContain(n.id);
});

test("หน้าแก้ไขสินค้า: ปิดข้อความอัตโนมัติเฉพาะตัวนี้ · สร้างข้อความใหม่แล้วใช้ทันที → หน้าสินค้า", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const auto = `ntc_e2e_${TAG}`;
  await q(`INSERT INTO "ProductNotice"(id, name, text, tone, icon, scope, "updatedAt", "sortOrder") VALUES ($1,$2,$3,'INFO','info','ALL',now(), 99999)`, [auto, `ทุกสินค้า ${TAG}`, `ข้อความทุกสินค้า ${TAG}`]);
  expect((await notesOf(page, A.slug)).some((t) => t.includes(`ข้อความทุกสินค้า ${TAG}`))).toBe(true);

  await login(page);
  await page.goto(`/admin/products/${A.id}`);
  const box = page.locator("#sec-notice" + V);
  const autoItem = box.locator(".pn-item", { hasText: `ทุกสินค้า ${TAG}` });
  await expect(autoItem.locator(".pn-tag.auto")).toBeVisible();
  await autoItem.locator("input[type=checkbox]").uncheck();
  await expect(autoItem.locator(".pn-tag.off")).toHaveText("ปิดเฉพาะสินค้านี้");

  await box.getByRole("button", { name: "+ สร้างข้อความใหม่" }).click();
  await box.locator("#pn-text").fill(`ใช้ไฟบ้านได้ ${TAG} · **ติดตั้งโดยช่าง**`);
  await box.locator(".ntf-tone", { hasText: "จุดเด่น / ข้อดี" }).click();
  await box.getByRole("button", { name: "สร้างและใช้กับสินค้านี้" }).click();
  const created = box.locator(".pn-item.is-on", { hasText: `ใช้ไฟบ้านได้ ${TAG}` });
  await expect(created).toBeVisible();
  await saveProduct(page);
  await expect.poll(async () => (await q<{ off: string[] }>(`SELECT "noticeOff" off FROM "Product" WHERE id=$1`, [A.id]))[0].off).toEqual([auto]);

  const notes = await notesOf(page, A.slug);
  expect(notes.some((t) => t.includes(`ข้อความทุกสินค้า ${TAG}`))).toBe(false);
  expect(notes.some((t) => t.includes(`ใช้ไฟบ้านได้ ${TAG}`))).toBe(true);
  await expect(page.locator(".pdp-notes .ntc-success b")).toHaveText("ติดตั้งโดยช่าง");
  // สินค้าอื่นยังเห็นข้อความทุกสินค้า
  expect((await notesOf(page, B.slug)).some((t) => t.includes(`ข้อความทุกสินค้า ${TAG}`))).toBe(true);
});
