// แก้ไขใบเสนอราคาที่ออกแล้วด้วยเลขที่เดิม (ไม่สร้างฉบับแก้ไข): ไอคอนแก้ไขในรายการ · ปุ่มในหน้าเอกสาร · บันทึกเอกสาร (ยอดคำนวณใหม่ เลขเดิม)
// · ฉบับร่างแก้ไข → "บันทึกเอกสาร" ทับเลขที่เดิมแล้วลบร่าง · ห้ามเมื่อตอบรับแล้ว/มีเอกสารต่อเนื่อง · วันที่ต้องอยู่เดือนเดิม
// · ช่องลงนาม: ไม่ใส่ลายเซ็น = ไม่มีชื่อ/วันที่ฝั่งร้าน · หัวข้อสองฝั่งอยู่ระดับเดียวกัน
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const CUST = `e2e-es-c-${TAG}`;
const QT = `e2e-es-qt-${TAG}`;
const QT_NO = `QTE${TAG.slice(-7)}`;
const IV = `e2e-es-iv-${TAG}`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const quotes = () => q<{ id: string; docNo: string | null; status: string; grandSatang: number }>(`SELECT id, "docNo", status::text, "grandSatang" FROM "SalesDocument" WHERE "customerId"=$1 AND type='QUOTATION' ORDER BY "createdAt"`, [CUST]);

test.beforeAll(async () => {
  await q(`INSERT INTO "Customer" (id, code, kind, name, phone, "updatedAt") VALUES ($1, $2, 'PERSON', $3, '0846666666', now())`, [CUST, `E${TAG.slice(-7)}`, `ลูกค้าทดสอบแก้เลขเดิม ${TAG}`]);
  await q(
    `INSERT INTO "SalesDocument"(id, type, "docNo", status, "issueDate", "validUntil", "customerId", "customerSnapshot", "subtotalSatang", "grandSatang", "signImage", "updatedAt")
     VALUES ($1, 'QUOTATION', $2, 'ISSUED', now(), now() + interval '7 days', $3, $4::jsonb, 50000, 50000, true, now())`,
    [QT, QT_NO, CUST, JSON.stringify({ name: `ลูกค้าทดสอบแก้เลขเดิม ${TAG}` })],
  );
  await q(`INSERT INTO "SalesDocumentItem"(id, "documentId", "sortOrder", sku, name, unit, "qtyMilli", "priceSatang") VALUES ($1,$2,1,'E2E-ES','ไฟทดสอบแก้เลขเดิม','ชิ้น',1000,50000)`, [`${QT}-1`, QT]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "SalesDocument" WHERE "customerId"=$1`, [CUST]);
  await q(`DELETE FROM "Customer" WHERE id=$1`, [CUST]);
});

const priceInput = (page: Page) => page.locator(".de-line" + V).first().locator(".ln-nums input").nth(2);

test("รายการ: ไอคอนแก้ไข = แก้เลขที่เดิม → บันทึกเอกสาร: ยอดใหม่ เลขเดิม ไม่มีใบใหม่ + ประวัติ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`/admin/docs/QUOTATION?q=${encodeURIComponent(TAG)}`);
  const row = page.locator(`.doc-tbl tr:has-text("${QT_NO}")${V}`);
  const edit = row.locator("a.ra-edit");
  await expect(edit).toHaveAttribute("data-tip", "แก้ไข (เลขที่เดิม)");
  await edit.click();
  await page.waitForURL(/\/edit$/);
  await expect(page.locator("h1" + V)).toContainText(QT_NO);
  await expect(page.getByRole("button", { name: "บันทึกและออกเอกสาร" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "บันทึกฉบับร่าง" })).toHaveCount(0);
  // ตัวอย่างแสดงเลขที่เดิม (ไม่ใช่ฉบับร่าง)
  await expect(page.locator(".de-pv" + V)).toContainText(QT_NO);
  await priceInput(page).fill("700");
  await page.getByRole("button", { name: "บันทึกเอกสาร" }).click();
  await page.waitForURL(/\?edited=1/);
  expect(page.url()).toContain(QT);
  await expect(page.locator(".login-info" + V).first()).toContainText("เลขที่เดิม");
  const all = await quotes();
  expect(all).toEqual([{ id: QT, docNo: QT_NO, status: "ISSUED", grandSatang: 70000 }]);
  await expect(page.locator("body")).toContainText("แก้ไข (เลขที่เดิม)");
  await expect(page.locator("body")).toContainText("฿500.00 → ฿700.00");
});

test("หน้าเอกสาร → สร้างฉบับแก้ไข (เลขที่ใหม่) → ฉบับร่างกด 'บันทึกเอกสาร' ทับเลขที่เดิม → ลบร่าง ไม่มีเลขใหม่", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/docs/QUOTATION/${QT}`);
  await expect(page.getByRole("link", { name: "แก้ไขใบเสนอราคา (เลขที่เดิม)" })).toBeVisible();
  await page.getByRole("button", { name: "สร้างฉบับแก้ไข (เลขที่ใหม่)" }).click();
  await page.waitForURL(/\/edit$/);
  const draftId = page.url().split("/").slice(-2)[0];
  expect(draftId).not.toBe(QT);
  const btn = page.getByRole("button", { name: new RegExp(`บันทึกเอกสาร\\s*เลขที่เดิม ${QT_NO}`) });
  await expect(btn).toBeVisible();
  await expect(page.getByRole("button", { name: "บันทึกและออกเอกสาร" })).toBeVisible();
  await priceInput(page).fill("650");
  await btn.click();
  await page.waitForURL(new RegExp(`${QT}\\?edited=1`));
  expect(await quotes()).toEqual([{ id: QT, docNo: QT_NO, status: "ISSUED", grandSatang: 65000 }]);
  expect(await q(`SELECT 1 FROM "SalesDocument" WHERE id=$1`, [draftId])).toHaveLength(0);
});

test("วันที่ต้องอยู่เดือนเดียวกับเลขที่ · แก้ไม่ได้เมื่อมีเอกสารต่อเนื่อง/ตอบรับแล้ว", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/docs/QUOTATION/${QT}/edit`);
  const [{ d }] = await q<{ d: string }>(`SELECT to_char(("issueDate" AT TIME ZONE 'Asia/Bangkok') + interval '40 days', 'YYYY-MM-DD') d FROM "SalesDocument" WHERE id=$1`, [QT]);
  await page.fill("#issueDate" + V, d);
  await page.fill("#validUntil" + V, d).catch(() => {});
  await page.getByRole("button", { name: "บันทึกเอกสาร" }).click();
  await expect(page.locator(".login-err" + V).first()).toContainText(`เดือนเดียวกับเลขที่ ${QT_NO}`);
  expect((await quotes())[0].grandSatang).toBe(65000);

  // มีใบแจ้งหนี้ที่แปลงจากใบนี้ → แก้เลขเดิมไม่ได้ (ไอคอนกลับเป็นสร้างฉบับแก้ไข)
  await q(
    `INSERT INTO "SalesDocument"(id, type, status, "customerId", "customerSnapshot", "sourceId", "updatedAt") VALUES ($1,'INVOICE','DRAFT',$2,'{}'::jsonb,$3, now())`,
    [IV, CUST, QT],
  );
  await page.goto(`/admin/docs/QUOTATION/${QT}/edit`);
  await page.waitForURL(/err=/);
  await expect(page.locator(".login-err" + V).first()).toContainText("มีเอกสารที่สร้างต่อ");
  await expect(page.getByRole("link", { name: "แก้ไขใบเสนอราคา (เลขที่เดิม)" })).toHaveCount(0);
  await page.goto(`/admin/docs/QUOTATION?q=${encodeURIComponent(TAG)}`);
  await expect(page.locator(`.doc-tbl tr:has-text("${QT_NO}") .ra-edit${V}`)).toHaveAttribute("data-tip", "แก้ไข (สร้างฉบับแก้ไข)");
  await q(`DELETE FROM "SalesDocument" WHERE id=$1`, [IV]);

  // ตอบรับแล้ว → แก้ไม่ได้
  await q(`UPDATE "SalesDocument" SET status='ACCEPTED' WHERE id=$1`, [QT]);
  await page.goto(`/admin/docs/QUOTATION/${QT}/edit`);
  await page.waitForURL(/err=/);
  await expect(page.locator(".login-err" + V).first()).toContainText("ตอบรับแล้ว");
  await q(`UPDATE "SalesDocument" SET status='ISSUED' WHERE id=$1`, [QT]);
});

test("ช่องลงนาม: ไม่ใส่ลายเซ็น = ไม่มีชื่อ/วันที่ฝั่งร้าน · หัวข้อและวันที่สองฝั่งอยู่ระดับเดียวกัน", async ({ page }) => {
  await login(page);
  for (const sign of [true, false]) {
    await q(`UPDATE "SalesDocument" SET "signImage"=$2 WHERE id=$1`, [QT, sign]);
    await page.goto(`/admin/print/doc/${QT}`);
    const slots = page.locator(".pp-sheets .sheet .sh-sign .sg-slot");
    await expect(slots).toHaveCount(2);
    const y = async (sel: string) => Promise.all([0, 1].map(async (i) => Math.round((await slots.nth(i).locator(sel).first().boundingBox())!.y)));
    const [t0, t1] = await y(":scope > b");
    expect(Math.abs(t0 - t1)).toBeLessThanOrEqual(1);
    const [d0, d1] = await y(":scope > span");
    expect(Math.abs(d0 - d1)).toBeLessThanOrEqual(1);
    if (sign) {
      await expect(slots.nth(0).locator(".sg-date")).toHaveCount(1);
    } else {
      await expect(slots.nth(0).locator(".sg-name:not(.sg-blank), .sg-date")).toHaveCount(0);
      await expect(slots.nth(0)).toContainText("______/______/__________");
    }
    // สองช่องห่างจากขอบกระดาษเท่ากัน
    const sheet = (await page.locator(".pp-sheets .sheet .sh-sign").first().boundingBox())!;
    const a = (await slots.nth(0).boundingBox())!, b = (await slots.nth(1).boundingBox())!;
    expect(Math.abs((a.x - sheet.x) - (sheet.x + sheet.width - (b.x + b.width)))).toBeLessThanOrEqual(2);
  }
});
