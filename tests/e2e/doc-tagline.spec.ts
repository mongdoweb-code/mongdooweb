// แถบท้ายเอกสาร (รายการสินค้าของร้าน) อยู่ชิดล่างสุดของแผ่นสุดท้าย เหนือบรรทัด "พิมพ์เมื่อ · หน้า x/y"
// ทุกเอกสาร (ใบเสนอราคา / ใบแจ้งหนี้หลายหน้า) ทุกหน้าที่แสดง (หน้าดูเอกสาร · หน้าพิมพ์) · ไม่ทับเนื้อหา · หน้าที่ยังไม่ใช่หน้าสุดท้ายไม่มีแถบ
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const CUST = `e2e-tag-c-${TAG}`;
const QT = `e2e-tag-qt-${TAG}`;
const IV = `e2e-tag-iv-${TAG}`;
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
  await q(`INSERT INTO "Customer" (id, code, kind, name, phone, "updatedAt") VALUES ($1, $2, 'PERSON', 'ลูกค้าทดสอบแถบท้าย', '0833333333', now())`, [CUST, `T${TAG.slice(-7)}`]);
  await q(
    `INSERT INTO "SalesDocument"(id, type, status, "issueDate", "validUntil", "customerId", "customerSnapshot", "subtotalSatang", "grandSatang", "updatedAt")
     VALUES ($1, 'QUOTATION', 'DRAFT', now(), now() + interval '30 days', $2, '{"name":"ลูกค้าทดสอบแถบท้าย"}', 130000, 130000, now())`,
    [QT, CUST],
  );
  await q(`INSERT INTO "SalesDocumentItem"(id, "documentId", "sortOrder", sku, name, unit, "qtyMilli", "priceSatang") VALUES ($1,$2,1,'E2E-T1','ไฟใต้น้ำทดสอบแถบท้าย','ชิ้น',2000,65000)`, [`${QT}-1`, QT]);
  // ใบแจ้งหนี้ 45 รายการ → หลายหน้า
  await q(
    `INSERT INTO "SalesDocument"(id, type, "docNo", status, "issueDate", "dueDate", "customerId", "customerSnapshot", "subtotalSatang", "grandSatang", "updatedAt")
     VALUES ($1, 'INVOICE', $2, 'ISSUED', now(), now() + interval '7 days', $3, '{"name":"ลูกค้าทดสอบแถบท้าย"}', 450000, 450000, now())`,
    [IV, `IVT${TAG.slice(-6)}`, CUST],
  );
  const rows = Array.from({ length: 45 }, (_, i) => `('${IV}-${i}', '${IV}', ${i + 1}, 'E2E-T${i}', 'รายการทดสอบหลายหน้า ลำดับที่ ${i + 1}', 'ชิ้น', 1000, 10000)`).join(",");
  await q(`INSERT INTO "SalesDocumentItem"(id, "documentId", "sortOrder", sku, name, unit, "qtyMilli", "priceSatang") VALUES ${rows}`);
});
test.afterAll(async () => {
  await q(`DELETE FROM "SalesDocument" WHERE id = ANY($1)`, [[QT, IV]]);
  await q(`DELETE FROM "Customer" WHERE id=$1`, [CUST]);
});

/** ตรวจทุกแผ่นในหน้า: แถบท้ายมีเฉพาะแผ่นสุดท้าย · ชิดล่างของเนื้อเอกสาร · ไม่ทับเนื้อหาใดๆ · อยู่เหนือบรรทัดท้ายแผ่น */
async function checkSheets(page: Page, minPages: number) {
  const sheets = page.locator(".sheet:not(#docMeasure .sheet)");
  await expect(sheets.first()).toBeVisible();
  const res = await sheets.evaluateAll((els) =>
    els.map((s) => {
      const t = s.querySelector<HTMLElement>(".sh-thanks");
      if (!t) return { has: false };
      const body = s.querySelector<HTMLElement>(".sh-body")!.getBoundingClientRect();
      const foot = s.querySelector<HTMLElement>(".sh-foot")!.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      // ส่วนอื่นทั้งหมดในเนื้อเอกสาร (ยกเว้นแถบท้าย, ตราฉบับร่าง/ยกเลิก)
      let maxBottom = 0;
      s.querySelectorAll<HTMLElement>(".sh-body *").forEach((e) => {
        if (t.contains(e) || e.closest(".sh-mark")) return;
        const r = e.getBoundingClientRect();
        if (r.height > 0 && r.width > 0) maxBottom = Math.max(maxBottom, r.bottom);
      });
      return { has: true, gapBottom: body.bottom - tr.bottom, overlap: maxBottom - tr.top, aboveFoot: foot.top - tr.bottom, oneLine: tr.height < 40 };
    }),
  );
  expect(res.length).toBeGreaterThanOrEqual(minPages);
  expect(res.slice(0, -1).every((r) => !r.has)).toBe(true);
  const last = res[res.length - 1] as { has: boolean; gapBottom: number; overlap: number; aboveFoot: number; oneLine: boolean };
  expect(last.has).toBe(true);
  expect(Math.abs(last.gapBottom)).toBeLessThan(1.5); // ชิดล่างสุด
  expect(last.overlap).toBeLessThanOrEqual(0.5); // ไม่ทับลายเซ็น/ยอดรวม/ตาราง
  expect(last.aboveFoot).toBeGreaterThanOrEqual(0); // อยู่เหนือบรรทัดพิมพ์เมื่อ
  expect(last.oneLine).toBe(true);
}

test("ใบเสนอราคา 1 หน้า: ตัวอย่างในตัวแก้ไข · หน้าดูเอกสาร · หน้าพิมพ์ — แถบท้ายชิดล่างสุด", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto(`/admin/docs/QUOTATION/${QT}`);
  await checkSheets(page, 1);
  await page.goto(`/admin/docs/QUOTATION/${QT}/edit`);
  await checkSheets(page, 1);
  await page.goto(`/admin/print/doc/${QT}`);
  await checkSheets(page, 1);
});

test("ใบแจ้งหนี้หลายหน้า: แถบท้ายเฉพาะแผ่นสุดท้าย ชิดล่าง ไม่ทับเนื้อหา (หน้าดูเอกสาร + หน้าพิมพ์)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto(`/admin/docs/INVOICE/${IV}`);
  await checkSheets(page, 2);
  await page.goto(`/admin/print/doc/${IV}`);
  await checkSheets(page, 2);
});
