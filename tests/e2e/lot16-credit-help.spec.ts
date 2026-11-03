// ล็อต 16 — ใบลดหนี้/คืนเงิน (อ้างใบเสร็จเดิม · จำกัดไม่เกินยอดใบเสร็จ · รับคืนเข้าสต็อก · หักในปิดยอด · พิมพ์) + คู่มือการใช้งาน
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, confirmClick, login, todayBkk } from "./helpers";

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
const CUST = `e2e-l16-c-${TAG}`;
const PROD = `e2e-l16-p-${TAG}`;
const RC = `e2e-l16-rc-${TAG}`;
const RCNO = `RCE2E-${TAG}`;
const stockOf = async () => (await q<{ s: number }>(`SELECT stock s FROM "Product" WHERE id=$1`, [PROD]))[0].s;
const cns = () => q<{ id: string; docNo: string | null; status: string; grand: number; reason: string | null }>(`SELECT id, "docNo", status::text, "grandSatang" grand, "creditReason" reason FROM "SalesDocument" WHERE "sourceId"=$1 AND type='CREDIT_NOTE' ORDER BY "createdAt"`, [RC]);

test.beforeAll(async () => {
  await q(`INSERT INTO "Customer"(id, code, name, phone, "updatedAt") VALUES ($1,$2,$3,'0812223333',now())`, [CUST, `C${TAG.slice(-5).toUpperCase()}`, `ลูกค้าลดหนี้ ${TAG}`]);
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`);
  await q(`INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "trackStock", stock, "inStock", images, "categoryId", "updatedAt") VALUES ($1,$2,$3,$4,150000,true,10,true,'{}',$5,now())`, [
    PROD, `E2E-L16-${TAG}`, `e2e-l16-${TAG}`, `โคมทดสอบลดหนี้ ${TAG}`, cat.id,
  ]);
  // ใบเสร็จเดิม: 2 ชิ้น × 1,500 = 3,000 บาท (ออกเมื่อวาน)
  await q(
    `INSERT INTO "SalesDocument"(id, type, status, "docNo", "customerId", "customerSnapshot", "issueDate", "subtotalSatang", "grandSatang", "paymentMethod", "updatedAt")
     VALUES ($1,'RECEIPT','ISSUED',$2,$3,$4,now() - interval '1 day',300000,300000,'โอนเงินผ่านธนาคาร',now())`,
    [RC, RCNO, CUST, JSON.stringify({ name: `ลูกค้าลดหนี้ ${TAG}`, code: "x" })],
  );
  await q(`INSERT INTO "SalesDocumentItem"(id, "documentId", "sortOrder", "productId", sku, name, unit, "qtyMilli", "priceSatang") VALUES ($1,$2,1,$3,$4,$5,'ชิ้น',2000,150000)`, [
    `${RC}-1`, RC, PROD, `E2E-L16-${TAG}`, `โคมทดสอบลดหนี้ ${TAG}`,
  ]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "SalesDocument" WHERE "sourceId"=$1`, [RC]);
  await q(`DELETE FROM "SalesDocument" WHERE id=$1`, [RC]);
  await q(`DELETE FROM "StockMovement" WHERE "productId"=$1`, [PROD]);
  await q(`DELETE FROM "Product" WHERE id=$1`, [PROD]);
  await q(`DELETE FROM "Customer" WHERE id=$1`, [CUST]);
});

test("ใบลดหนี้: จากใบเสร็จ → แก้จำนวนคืน → ออกเลข CN · รับคืนเข้าสต็อก · ลดได้ไม่เกินยอดใบเสร็จ · ยกเลิกใบเสร็จไม่ได้", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/docs/RECEIPT/${RC}`);
  await page.getByRole("button", { name: "ออกใบลดหนี้ / คืนเงิน" }).click();
  await expect(page.getByRole("heading", { name: "แก้ไขใบลดหนี้ (ฉบับร่าง)" })).toBeVisible();
  await expect(page.locator(".de-cn")).toContainText("ยอดใบเสร็จเดิม ฿3,000.00");

  // ไม่ใส่เหตุผล → ออกไม่ได้
  await page.getByLabel("จำนวน").first().fill("1");
  await page.getByRole("button", { name: "บันทึกและออกเอกสาร" }).click();
  await expect(page.locator(".login-err" + V).first()).toContainText("เหตุผลการลดหนี้");
  await page.fill("#creditReason", "รับคืนสินค้าชำรุด 1 ชิ้น");
  await page.getByRole("button", { name: "บันทึกและออกเอกสาร" }).click();
  await expect(page.locator(".login-info" + V)).toContainText("ออกใบลดหนี้เลขที่");
  const [cn] = await cns();
  expect(cn.docNo).toMatch(/^CN\d{4}-\d{5}$/);
  expect(cn.grand).toBe(150000);
  expect(cn.reason).toBe("รับคืนสินค้าชำรุด 1 ชิ้น");
  await expect(page.locator(".dv-kv" + V)).toContainText(RCNO);

  // ตัวเอกสาร: มูลค่าเดิม/ที่ถูกต้อง/ผลต่าง
  const sheet = page.locator(".de-pv .sheet" + V).first();
  await expect(sheet).toContainText("ใบลดหนี้");
  await expect(sheet).toContainText("มูลค่าตามใบเสร็จเดิม");
  await expect(sheet).toContainText("3,000.00");

  // รับคืนเข้าสต็อก (ครั้งเดียว)
  await confirmClick(page, 'button:has-text("รับสินค้าคืนเข้าสต็อก")', "รับคืนเข้าสต็อก");
  await expect(page.locator(".login-info" + V)).toContainText("รับสินค้าคืนเข้าสต็อกแล้ว");
  expect(await stockOf()).toBe(11);
  await expect(page.getByRole("button", { name: "รับสินค้าคืนเข้าสต็อก" })).toHaveCount(0);

  // ใบเสร็จเดิม: ลดหนี้แล้ว 1,500 · ลดเพิ่มได้อีก 1,500 · เกินไม่ได้
  await page.goto(`/admin/docs/RECEIPT/${RC}`);
  await expect(page.locator(".dv-kv" + V)).toContainText("ลดหนี้แล้ว");
  await page.getByRole("button", { name: /ออกใบลดหนี้เพิ่ม \(ลดได้อีก ฿1,500\.00\)/ }).click();
  await expect(page.locator(".de-cn")).toContainText("ลดได้อีก ฿1,500.00");
  await page.fill("#creditReason", "ทดสอบเกินยอด");
  await page.getByLabel("จำนวน").first().fill("2");
  await expect(page.locator(".de-cn .login-err")).toContainText("เกินยอดที่ลดได้");
  await page.getByRole("button", { name: "บันทึกและออกเอกสาร" }).click();
  await expect(page.locator(".login-err" + V).first()).toContainText("เกินยอดที่ลดได้");
  expect((await cns()).filter((x) => x.status === "ISSUED").length).toBe(1);

  // ยกเลิกใบเสร็จที่มีใบลดหนี้ไม่ได้
  await page.goto(`/admin/docs/RECEIPT/${RC}`);
  await page.getByRole("button", { name: "ยกเลิกใบเสร็จรับเงิน" }).click();
  await page.fill("#vReason", "ทดสอบยกเลิก");
  await page.getByRole("button", { name: "ยืนยันยกเลิกใบเสร็จรับเงิน" }).click();
  await expect(page.locator(".login-err" + V).first()).toContainText(`มีใบลดหนี้ ${cn.docNo}`);

  // ปิดยอดวันนี้: คืนเงินเป็นยอดติดลบ
  await page.goto(`/admin/reports/daily?day=${todayBkk()}`);
  const row = page.locator(".dc-tbl tr", { hasText: cn.docNo! });
  await expect(row).toContainText("−฿1,500");
  await expect(row).toContainText("คืนเงินตามใบลดหนี้");

  // รายการใบลดหนี้ + พิมพ์
  await page.goto(`/admin/docs/CREDIT_NOTE?q=${encodeURIComponent(cn.docNo!)}`);
  await expect(page.locator(".doc-tbl tbody" + V)).toContainText(RCNO);
  const pr = await page.request.get(`/admin/print/doc/${cn.id}`);
  expect(pr.ok()).toBe(true);
});

test("ใบลดหนี้สร้างเองโดยไม่อ้างใบเสร็จไม่ได้", async ({ page }) => {
  await login(page);
  await page.goto("/admin/docs/CREDIT_NOTE/new/edit");
  await expect(page).toHaveURL(/\/admin\/docs\/RECEIPT/);
  await expect(page.locator(".login-err" + V)).toContainText("ใบลดหนี้สร้างจากหน้าใบเสร็จรับเงิน");
});

test("คู่มือการใช้งาน: เมนู · ค้นหา · ลิงก์ไปหน้าจริง", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "คู่มือการใช้งาน" }).first().click();
  await expect(page.getByRole("heading", { name: "คู่มือการใช้งาน", level: 1 })).toBeVisible();
  const all = await page.locator("[data-guide]" + V).count();
  expect(all).toBeGreaterThan(15);
  await page.fill("#hpQ", "ใบลดหนี้");
  await expect(page.locator(".hp-search [role=status]")).toContainText("พบ");
  const shown = await page.locator("[data-guide]:not([hidden])").count();
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(all);
  const card = page.locator("#credit");
  await expect(card).toBeVisible();
  await card.getByRole("link", { name: "ใบลดหนี้ / คืนเงิน →" }).click();
  await expect(page).toHaveURL(/\/admin\/docs\/CREDIT_NOTE$/);
});
