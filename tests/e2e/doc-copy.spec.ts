// ทำสำเนาเอกสารจากไอคอนในรายการ (ลูกค้าเดิมสั่งซ้ำ): ฉบับร่างใหม่ วันที่วันนี้ → แถบตรวจราคาปัจจุบัน/สินค้าปิดขาย → ใช้ราคาปัจจุบัน
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const TAG = Date.now().toString(36);
const ids = { qt: `e2e-cpq-${TAG}`, p1: `e2e-cp1-${TAG}`, p2: `e2e-cp2-${TAG}`, no: `QTE2E-${TAG}`.slice(0, 20) };

test.beforeAll(async () => {
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`);
  // สินค้า 1: ราคาปัจจุบัน 550 (ในใบเดิมขาย 500) · สินค้า 2: ปิดขายแล้ว
  await q(`INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "categoryId", "sortOrder", "isActive", "updatedAt") VALUES
    ($1, $3, $1, 'โคมทดสอบสำเนา ${TAG}', 55000, $5, 99998, true, now()),
    ($2, $4, $2, 'รุ่นเลิกขาย ${TAG}', 30000, $5, 99999, false, now())`, [ids.p1, ids.p2, `E2E-CP1-${TAG}`, `E2E-CP2-${TAG}`, cat.id]);
  await q(`INSERT INTO "SalesDocument" (id, type, status, "docNo", "customerSnapshot", "issueDate", "validUntil", "subtotalSatang", "grandSatang", "updatedAt")
    VALUES ($1, 'QUOTATION', 'ISSUED', $2, $3::jsonb, now() - interval '40 days', now() - interval '10 days', 130000, 130000, now())`,
    [ids.qt, ids.no, JSON.stringify({ name: `ลูกค้าสั่งซ้ำ ${TAG}` })]);
  await q(`INSERT INTO "SalesDocumentItem" (id, "documentId", "sortOrder", "productId", sku, name, unit, "qtyMilli", "priceSatang") VALUES
    ($1, $3, 0, $4, 'E2E-CP1', 'โคมทดสอบสำเนา ${TAG}', 'ชิ้น', 2000, 50000),
    ($2, $3, 1, $5, 'E2E-CP2', 'รุ่นเลิกขาย ${TAG}', 'ชิ้น', 1000, 30000)`, [`${ids.qt}-1`, `${ids.qt}-2`, ids.qt, ids.p1, ids.p2]);
});
test.afterAll(async () => {
  const copies = await q<{ id: string }>(`SELECT "documentId" id FROM "SalesDocumentItem" WHERE "productId" = $1`, [ids.p1]);
  const all = [...new Set([ids.qt, ...copies.map((c) => c.id)])];
  await q(`DELETE FROM "SalesDocumentEvent" WHERE "documentId" = ANY($1)`, [all]);
  await q(`DELETE FROM "SalesDocumentItem" WHERE "documentId" = ANY($1)`, [all]);
  await q(`DELETE FROM "SalesDocument" WHERE id = ANY($1)`, [all]);
  await q(`DELETE FROM "Product" WHERE id IN ($1, $2)`, [ids.p1, ids.p2]);
});

test("ไอคอนทำสำเนาในรายการ → ฉบับร่างใหม่ + ตรวจราคาปัจจุบัน", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1000 });
  await login(page);
  await page.goto(`/admin/docs/QUOTATION?q=${encodeURIComponent(ids.no)}`);
  const btn = page.getByRole("button", { name: `ทำสำเนา ใบเสนอราคา ${ids.no}` });
  await expect(btn).toBeVisible();
  await btn.click();
  await page.waitForURL(/\/edit\?copied=/);
  const bar = page.locator("[data-copied]" + V);
  await expect(bar).toContainText(`ทำสำเนาจาก ${ids.no}`);
  await expect(bar).toContainText("ราคาสินค้า 1 รายการไม่ตรงกับราคาปัจจุบัน");
  await expect(bar).toContainText("฿500.00");
  await expect(bar).toContainText("฿550.00");
  await expect(bar).toContainText(`รุ่นเลิกขาย ${TAG}`);
  // ฉบับร่างใหม่: วันที่วันนี้ ยืนราคานับใหม่ ไม่มีเลขที่ · ใบเดิมไม่เปลี่ยน
  const newId = page.url().split("/edit")[0].split("/").pop()!;
  const [d] = await q<{ st: string; no: string | null; fresh: boolean; valid: boolean }>(
    `SELECT status st, "docNo" no, "issueDate" > now() - interval '2 days' fresh, "validUntil" > now() valid FROM "SalesDocument" WHERE id=$1`, [newId]);
  expect(d).toEqual({ st: "DRAFT", no: null, fresh: true, valid: true });
  expect((await q<{ st: string }>(`SELECT status st FROM "SalesDocument" WHERE id=$1`, [ids.qt]))[0].st).toBe("ISSUED");
  // ใช้ราคาปัจจุบัน → แถบบอกว่าตรงแล้ว และช่องราคาเปลี่ยน
  await bar.locator("[data-use-prices]").click();
  await expect(bar).toContainText("ราคาทุกรายการตรงกับราคาปัจจุบัน");
  await expect(page.locator(".de-line" + V).first().locator(".ln-nums input").nth(2)).toHaveValue("550.00");
  await bar.getByRole("button", { name: "ปิดแถบแจ้งเตือน" }).click();
  await expect(bar).toHaveCount(0);
});
