// ล็อต 14 — ลูกหนี้ค้างชำระ (แยกอายุหนี้ · กรองช่วง · CSV · ข้อความทวง) + ปิดยอดประจำวัน (ยอดไม่ตรงต้องมีหมายเหตุ · เปิดใหม่)
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
const CUST = `e2e-l14-c-${TAG}`;
const CODE = `L${TAG.slice(-5).toUpperCase()}`;
const IV = `e2e-l14-iv-${TAG}`;
const IVNO = `IVE2E-${TAG}`;
const DAY = "2021-02-03"; // วันในอดีตที่ไม่มีข้อมูลจริง — ใช้ทดสอบปิดยอด
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5);

test.beforeAll(async () => {
  await q(`DELETE FROM "DailyClose" WHERE day=$1`, [DAY]);
  await q(`INSERT INTO "Customer"(id, code, name, phone, "updatedAt") VALUES ($1,$2,$3,'0811111111',now())`, [CUST, CODE, `ลูกค้าทดสอบล็อต14 ${TAG}`]);
  // ใบแจ้งหนี้ 1,500 บาท ครบกำหนด 45 วันก่อน · รับชำระแล้ว 500 (ใน DAY) → ค้าง 1,000 อยู่ช่วง "เกิน 31–60 วัน"
  await q(
    `INSERT INTO "SalesDocument"(id, type, status, "docNo", "customerId", "customerSnapshot", "issueDate", "dueDate", "subtotalSatang", "grandSatang", "paidSatang", "updatedAt")
     VALUES ($1,'INVOICE','PARTIAL',$2,$3,$4,$5,$6,150000,150000,50000,now())`,
    [IV, IVNO, CUST, JSON.stringify({ name: `ลูกค้าทดสอบล็อต14 ${TAG}`, code: CODE }), daysAgo(60), daysAgo(45)],
  );
  await q(`INSERT INTO "DocPayment"(id, "invoiceId", "paidAt", "amountSatang", method) VALUES ($1,$2,$3,50000,'เงินสด')`, [`p-${TAG}`, IV, `${DAY}T03:00:00Z`]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "DocPayment" WHERE id=$1`, [`p-${TAG}`]);
  await q(`DELETE FROM "SalesDocument" WHERE id=$1`, [IV]);
  await q(`DELETE FROM "Customer" WHERE id=$1`, [CUST]);
  await q(`DELETE FROM "DailyClose" WHERE day=$1`, [DAY]);
});

test("ลูกหนี้: แยกอายุหนี้ · กรองช่วง · คัดลอกข้อความทวง · CSV", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page);
  await page.getByRole("link", { name: "ลูกหนี้ค้างชำระ" }).first().click();
  await expect(page).toHaveURL(/\/admin\/reports\/receivables$/);
  const row = page.locator(`tr[data-cust="${CODE}"]` + V);
  await expect(row).toBeVisible();
  await expect(row.locator("td").nth(3)).toHaveText("฿1,000"); // คอลัมน์ "เกิน 31–60 วัน"
  await expect(row.locator("td").nth(1)).toHaveText("—");
  await row.locator("summary").click();
  await expect(row.locator(".ar-inv").getByRole("link", { name: IVNO })).toBeVisible();

  await page.goto("/admin/reports/receivables?age=d60");
  await expect(page.locator(`tr[data-cust="${CODE}"]` + V)).toBeVisible();
  await page.goto("/admin/reports/receivables?age=current");
  await expect(page.locator(`tr[data-cust="${CODE}"]` + V)).toHaveCount(0);

  await page.goto("/admin/reports/receivables");
  await page.locator(`tr[data-cust="${CODE}"]` + V).getByRole("button", { name: /คัดลอกข้อความทวงหนี้/ }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain(IVNO);
  expect(text).toContain("฿1,000");
  expect(text).toMatch(/\/track\/doc\//);

  const res = await page.request.get("/admin/reports/receivables/export");
  expect(res.ok()).toBe(true);
  const csv = await res.text();
  expect(csv).toContain(IVNO);
});

test("ปิดยอด: ยอดไม่ตรงต้องมีหมายเหตุ · ปิดแล้วบันทึกยอด · เจ้าของเปิดใหม่ได้", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/reports/daily?day=${DAY}`);
  await expect(page.getByRole("heading", { name: "ปิดยอดประจำวัน" })).toBeVisible();
  await expect(page.locator(".dc-tbl" + V)).toContainText(IVNO);
  await expect(page.locator(".dc-tbl" + V)).toContainText("เงินสด");
  const total = await page.locator(".ar-kpi.on b" + V).innerText();
  expect(total).toMatch(/฿/);

  // ยอดไม่ตรง + ไม่มีหมายเหตุ → ขึ้นข้อความเตือน
  await page.getByLabel(/ยอดที่ตรวจได้จริง/).fill("1");
  await page.getByRole("button", { name: "ปิดยอดวันนั้น" }).click();
  await expect(page.locator(".login-err" + V)).toContainText("กรุณาใส่หมายเหตุ");
  await expect.poll(async () => (await q(`SELECT 1 FROM "DailyClose" WHERE day=$1`, [DAY])).length).toBe(0);

  await page.getByLabel(/ยอดที่ตรวจได้จริง/).fill("1");
  await page.getByLabel(/หมายเหตุ/).fill("ทดสอบยอดต่าง");
  await page.getByRole("button", { name: "ปิดยอดวันนั้น" }).click();
  await expect(page.locator(".ok-box" + V)).toContainText("ปิดยอดวันที่");
  await expect(page.locator(".dc-closed" + V)).toContainText("ทดสอบยอดต่าง");
  const [row] = await q<{ c: number; t: number; n: number }>(`SELECT "countedSatang" c, "totalSatang" t, "entryCount" n FROM "DailyClose" WHERE day=$1`, [DAY]);
  expect(row.c).toBe(100);
  expect(row.t).toBeGreaterThanOrEqual(50000);
  expect(row.n).toBeGreaterThanOrEqual(1);

  await confirmClick(page, 'button:has-text("เปิดปิดยอดใหม่")', "เปิดใหม่");
  await expect(page.getByRole("button", { name: "ปิดยอดวันนั้น" })).toBeVisible();
  await expect.poll(async () => (await q(`SELECT 1 FROM "DailyClose" WHERE day=$1`, [DAY])).length).toBe(0);

  // ปิดแบบยอดตรง (เว้นว่าง) → ไม่เก็บยอดตรวจ
  await page.getByRole("button", { name: "ปิดยอดวันนั้น" }).click();
  await expect(page.locator(".dc-closed .dst-ok" + V)).toHaveText(/ปิดยอดแล้ว/);
  expect((await q<{ c: number | null }>(`SELECT "countedSatang" c FROM "DailyClose" WHERE day=$1`, [DAY]))[0].c).toBeNull();
});
