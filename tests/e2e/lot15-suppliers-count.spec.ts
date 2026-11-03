// ล็อต 15 — ทะเบียนผู้ขาย (ผูกใบสั่งซื้อ ประวัติราคาทุน) + นับสต็อกทั้งร้าน (กรอกหลายรายการ → ปรับทีเดียว ใช้ส่วนต่าง)
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, confirmClick, login } from "./helpers";

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
const SUP = `ผู้ขายทดสอบ ${TAG}`;
const CAT = `e2e-l15-cat-${TAG}`;
const P1 = `e2e-l15-p1-${TAG}`;
const P2 = `e2e-l15-p2-${TAG}`;
const stockOf = async (id: string) => (await q<{ s: number }>(`SELECT stock s FROM "Product" WHERE id=$1`, [id]))[0].s;

test.beforeAll(async () => {
  await q(`INSERT INTO "Category"(id, slug, "nameTh", "nameEn") VALUES ($1,$2,$3,'E2E L15')`, [CAT, CAT, `หมวดนับสต็อก ${TAG}`]);
  for (const [id, n, st] of [[P1, "1", 10], [P2, "2", 5]] as const)
    await q(`INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "trackStock", stock, "inStock", images, "categoryId", "updatedAt") VALUES ($1,$2,$3,$4,10000,true,$5,true,'{}',$6,now())`, [
      id, `E2E-L15-${n}-${TAG}`, `e2e-l15-${n}-${TAG}`, `สินค้านับสต็อก${n} ${TAG}`, st, CAT,
    ]);
});
test.afterAll(async () => {
  const pos = await q<{ id: string }>(`SELECT p.id FROM "PurchaseOrder" p JOIN "Supplier" s ON s.id=p."supplierId" WHERE s.name=$1`, [SUP]);
  for (const p of pos) await q(`DELETE FROM "PurchaseOrder" WHERE id=$1`, [p.id]);
  await q(`DELETE FROM "Supplier" WHERE name=$1`, [SUP]);
  await q(`DELETE FROM "StockCount" WHERE id IN (SELECT "countId" FROM "StockCountLine" WHERE "productId" = ANY($1))`, [[P1, P2]]);
  await q(`DELETE FROM "StockMovement" WHERE "productId" = ANY($1)`, [[P1, P2]]);
  await q(`DELETE FROM "Product" WHERE id = ANY($1)`, [[P1, P2]]);
  await q(`DELETE FROM "Category" WHERE id=$1`, [CAT]);
});

test("ผู้ขาย: เพิ่ม → สร้างใบสั่งซื้อจากผู้ขาย → ผูกกัน + ประวัติราคาทุน · ลบไม่ได้เมื่อมีใบสั่งซื้อ", async ({ page }) => {
  await login(page);
  await page.goto("/admin/suppliers/new");
  await page.fill("#sName", SUP);
  await page.fill("#sContact", "คุณทดสอบ");
  await page.fill("#sPhone", "081-234-5678");
  await page.fill("#sTerms", "เครดิต 30 วัน");
  await page.click("#supForm button[type=submit]");
  await expect(page.locator(".ok-box" + V)).toContainText("บันทึกข้อมูลผู้ขายแล้ว");

  await page.goto(`/admin/suppliers?q=${encodeURIComponent(TAG)}`);
  const row = page.locator(`tr[data-sup="${SUP}"]` + V);
  await expect(row).toContainText("เครดิต 30 วัน");
  await row.getByRole("link", { name: `สร้างใบสั่งซื้อจาก ${SUP}` }).click();
  await expect(page.locator("#poSup")).toHaveValue(SUP);
  await expect(page.locator("#poCon")).toHaveValue(/คุณทดสอบ/);
  await page.fill("#poPq", `สินค้านับสต็อก1 ${TAG}`);
  await page.locator("#poPq").press("Enter");
  await page.fill("#poc0", "123.50");
  await page.getByRole("button", { name: "บันทึกและออกใบสั่งซื้อ" }).click();
  await expect(page.locator("#poStatus")).toBeVisible();
  const [po] = await q<{ sid: string | null; no: string }>(`SELECT p."supplierId" sid, p."poNo" no FROM "PurchaseOrder" p JOIN "Supplier" s ON s.id=p."supplierId" WHERE s.name=$1`, [SUP]);
  expect(po.no).toMatch(/^PO\d{4}-\d{5}$/);

  await page.goto(`/admin/suppliers/${po.sid}`);
  await expect(page.locator("#supPos" + V)).toContainText(po.no);
  await expect(page.locator("#supItems" + V)).toContainText("฿123.50");
  await page.goto(`/admin/suppliers?q=${encodeURIComponent(TAG)}`);
  await expect(page.locator(`tr[data-sup="${SUP}"] .ra-del[aria-disabled="true"]` + V)).toHaveCount(1);
});

test("ผู้ขาย: พิมพ์ชื่อใหม่ในใบสั่งซื้อ → เพิ่มในทะเบียนอัตโนมัติ", async ({ page }) => {
  await login(page);
  const NEW = `${SUP} สาขา2`;
  await page.goto("/admin/purchase-orders/new");
  await page.fill("#poSup", NEW);
  await expect(page.getByText("ผู้ขายรายใหม่")).toBeVisible();
  await page.fill("#poPq", "ของนอกระบบ");
  await page.locator("#poPq").press("Enter");
  await page.fill("#poc0", "10");
  await page.getByRole("button", { name: "บันทึกฉบับร่าง" }).click();
  await expect(page.locator(".ok-box" + V)).toContainText("บันทึกฉบับร่างแล้ว");
  const r = await q<{ id: string }>(`SELECT s.id FROM "Supplier" s JOIN "PurchaseOrder" p ON p."supplierId"=s.id WHERE s.name=$1`, [NEW]);
  expect(r.length).toBe(1);
  await q(`DELETE FROM "PurchaseOrder" WHERE "supplierId"=$1`, [r[0].id]);
  await q(`DELETE FROM "Supplier" WHERE id=$1`, [r[0].id]);
});

test("นับสต็อก: เปิดรอบตามหมวด → กรอกยอด/บันทึก → ขายระหว่างนับ → ปรับตามส่วนต่าง", async ({ page }) => {
  await login(page);
  await page.goto("/admin/stock/count");
  await page.locator('#countNew input[name="scope"][value="category"]').check();
  await page.selectOption("#cCat", CAT);
  await page.fill("#cTitle", `รอบทดสอบ ${TAG}`);
  await page.click("#countNew button[type=submit]");
  await expect(page.getByRole("heading", { name: `รอบทดสอบ ${TAG}` })).toBeVisible();
  await expect(page.locator("#cntDone")).toHaveText("0/2");

  await page.fill(`#c_${P1}`, "8");
  await page.getByRole("button", { name: `ยอดตรงกับระบบ E2E-L15-2-${TAG}` }).click();
  await expect(page.locator("#cntDone")).toHaveText("2/2");
  await expect(page.locator("#cntDiff")).toHaveText("1 รายการ");
  await page.getByRole("tab", { name: "ยอดต่าง" }).click();
  await expect(page.locator(".cnt-tbl tbody tr:not([hidden])" + V)).toHaveCount(1);
  await page.getByRole("button", { name: "บันทึกยอดนับ (ทำต่อทีหลังได้)" }).click();
  await expect(page.locator(".ok-box" + V)).toContainText("บันทึกยอดนับแล้ว (2 รายการเปลี่ยน)");
  await expect(page.locator(`#c_${P1}`)).toHaveValue("8");
  expect(await stockOf(P1)).toBe(10); // บันทึกยอดนับยังไม่แตะสต็อก

  // ระหว่างนับมีขายไป 1 ชิ้น (จำลอง) → ตอนปรับต้องได้ 10 − 1 + (8 − 10) = 7
  await q(`UPDATE "Product" SET stock=9 WHERE id=$1`, [P1]);
  await page.reload();
  await expect(page.locator(`tr[data-sku="E2E-L15-1-${TAG}"]` + V)).toContainText("ตอนนี้ 9");
  await confirmClick(page, 'button:has-text("ปรับสต็อกตามยอดนับ")', "ปรับสต็อก");
  await expect(page.locator(".ok-box" + V)).toContainText("ปรับสต็อกตามยอดนับแล้ว");
  await expect(page.locator("#countStatus")).toHaveText("ปรับสต็อกแล้ว");
  expect(await stockOf(P1)).toBe(7);
  expect(await stockOf(P2)).toBe(5);
  const [mv] = await q<{ change: number; ref: string }>(`SELECT change, ref FROM "StockMovement" WHERE "productId"=$1 AND reason='COUNT' ORDER BY "createdAt" DESC LIMIT 1`, [P1]);
  expect(mv.change).toBe(-2);
  expect(mv.ref).toMatch(/^SC\d{4}-\d{5}$/);
  await expect(page.locator(`#c_${P1}`)).toHaveCount(0); // ปิดรอบแล้วแก้ไม่ได้

  const print = await page.request.get(page.url().replace("/admin/stock/count/", "/admin/print/count/"));
  expect(print.ok()).toBe(true);
  expect(await print.text()).toContain("ใบนับสต็อก");
});
