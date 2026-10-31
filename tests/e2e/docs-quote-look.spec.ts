// ใบเสนอราคา: รูปสินค้าหน้ารายการ (ค่าเริ่มต้น = รูปสินค้า · เปลี่ยน/ซ่อนได้) · วันที่ในช่องลงนามผู้เสนอราคา (แก้ได้) · ไอคอนติดต่อร้าน · กรอบขอบคุณโค้งมน
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const DOC = `e2e-qlook-${TAG}`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
let prod: { id: string; sku: string; name: string; images: string[] };

test.beforeAll(async () => {
  [prod] = await q(`SELECT id, sku, name, images FROM "Product" WHERE array_length(images, 1) >= 1 ORDER BY sku LIMIT 1`);
  if (!prod) {
    // ฐานข้อมูลใหม่ไม่มีรูปสินค้า — ใส่ key ปลอม (ทดสอบแค่ src ของรูป)
    [prod] = await q(`SELECT id, sku, name, images FROM "Product" ORDER BY sku LIMIT 1`);
    prod.images = ["products/e2e/look.webp"];
  }
  // ลูกค้าของเทสต์นี้เอง (ฐานข้อมูลใหม่ใน CI ยังไม่มีลูกค้า — ฉบับร่างต้องมีลูกค้าถึงจะบันทึกได้)
  const [cust] = await q<{ id: string }>(
    `INSERT INTO "Customer" (id, code, kind, name, phone, "updatedAt") VALUES ($1, $2, 'PERSON', 'ลูกค้าทดสอบรูปสินค้า', '0811111111', now()) RETURNING id`,
    [`${DOC}-c`, `Q${TAG.slice(-7)}`],
  );
  await q(
    `INSERT INTO "SalesDocument"(id, type, status, "issueDate", "validUntil", "customerId", "customerSnapshot", "subtotalSatang", "grandSatang", "updatedAt")
     VALUES ($1, 'QUOTATION', 'DRAFT', '2026-10-30', '2026-11-29', $2, '{"name":"ลูกค้าทดสอบรูปสินค้า"}', 70000, 70000, now())`,
    [DOC, cust.id],
  );
  await q(`INSERT INTO "SalesDocumentItem"(id, "documentId", "sortOrder", "productId", sku, name, unit, "qtyMilli", "priceSatang", image) VALUES ($1,$2,1,$3,$4,$5,'ชิ้น',1000,65000,$6)`, [
    `${DOC}-1`, DOC, prod.id, prod.sku, prod.name, prod.images[0] === "products/e2e/look.webp" ? prod.images[0] : null,
  ]);
  await q(`INSERT INTO "SalesDocumentItem"(id, "documentId", "sortOrder", sku, name, unit, "qtyMilli", "priceSatang") VALUES ($1,$2,2,'Shipping','ค่าส่งสินค้า','กล่อง',1000,5000)`, [`${DOC}-2`, DOC]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "SalesDocument" WHERE id=$1`, [DOC]);
  await q(`DELETE FROM "Customer" WHERE id=$1`, [`${DOC}-c`]);
});

test("ตัวอย่าง A4: รูปสินค้า · วันที่ลงนาม · ไอคอนติดต่อร้าน · กรอบโค้งมน แล้วแก้วันที่ลงนามได้", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/docs/QUOTATION/${DOC}`);
  const sheet = page.locator(".sheet" + V).first();
  await expect(sheet.locator(".sh-tbl tbody tr").first().locator(".it-img img")).toHaveAttribute("src", /\/media\/products\/.+-sm\.webp$|^https:/);
  await expect(sheet.locator(".sh-tbl tbody tr").nth(1).locator(".it-img img")).toHaveCount(0); // ค่าส่ง: ช่องว่าง
  await expect(sheet.locator(".sh-ct svg")).toHaveCount(await sheet.locator(".sh-ct").count());
  expect(await sheet.locator(".sh-ct").count()).toBeGreaterThanOrEqual(2);
  expect(await sheet.locator(".sh-thanks").evaluate((e) => getComputedStyle(e).borderTopLeftRadius)).not.toBe("0px");
  // วันที่ลงนาม = วันที่เอกสาร (30/10/2026 หรือ พ.ศ.)
  await expect(sheet.locator(".sh-sign .sg-date")).toHaveText(/30\/10\/(2026|2569)/);
  // แก้วันที่ลงนาม
  await page.locator('.sign-form input[name="signDate"]' + V).fill("2026-11-02");
  await page.locator('.sign-form button[type=submit]' + V).click();
  await expect(page.locator(".sheet .sh-sign .sg-date" + V).first()).toHaveText(/\b0?2\/11\/(2026|2569)/);
  expect((await q<{ d: string }>(`SELECT to_char("signDate" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') d FROM "SalesDocument" WHERE id=$1`, [DOC]))[0].d).toBe("2026-11-02");
});

test("ตัวแก้ไข: เปลี่ยนรูปหน้ารายการ → ไม่แสดงรูป → บันทึก", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/docs/QUOTATION/${DOC}/edit`);
  const btn = page.getByRole("button", { name: "รูปรายการที่ 1 (กดเพื่อเปลี่ยน)" });
  await expect(btn.locator("img")).toHaveCount(1);
  await btn.click();
  await page.getByRole("dialog", { name: "รูปรายการที่ 1" }).getByRole("button", { name: "ไม่แสดงรูป" }).click();
  await expect(btn.locator("img")).toHaveCount(0);
  await expect(page.locator(".de-pv .sh-tbl .it-img img" + V)).toHaveCount(0);
  await page.locator('button[name=intent][value=save]' + V).click();
  await expect.poll(async () => (await q<{ image: string | null }>(`SELECT image FROM "SalesDocumentItem" WHERE "documentId"=$1 AND "sortOrder"=1`, [DOC]))[0]?.image).toBe("");
});
