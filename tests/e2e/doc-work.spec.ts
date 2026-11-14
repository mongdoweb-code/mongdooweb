// สถานะงานภายในร้านของเอกสารขาย (ต้องดำเนินการ / เสร็จสิ้น): หน้ารายการ (ป้าย + เมนู + ตัวกรอง + จำนวน) · หน้าเอกสาร (ปุ่มคู่ + หมายเหตุ + ประวัติ)
// · ไม่หลุดไปบนเอกสารพิมพ์/หน้าลูกค้า · CSV · ใช้ได้กับใบเสนอราคาและใบเสร็จ
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const CUST = `e2e-wk-c-${TAG}`;
const QT = `e2e-wk-qt-${TAG}`;
const RC = `e2e-wk-rc-${TAG}`;
const QT_NO = `QTW${TAG.slice(-7)}`;
const RC_NO = `RCW${TAG.slice(-7)}`;
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
  await q(`INSERT INTO "Customer" (id, code, kind, name, phone, "updatedAt") VALUES ($1, $2, 'PERSON', $3, '0844444444', now())`, [CUST, `W${TAG.slice(-7)}`, `ลูกค้าทดสอบสถานะงาน ${TAG}`]);
  for (const [id, type, no] of [[QT, "QUOTATION", QT_NO], [RC, "RECEIPT", RC_NO]] as const) {
    await q(
      `INSERT INTO "SalesDocument"(id, type, "docNo", status, "issueDate", "validUntil", "customerId", "customerSnapshot", "subtotalSatang", "grandSatang", "paymentMethod", "updatedAt")
       VALUES ($1, $2::"DocType", $3, 'ISSUED', now(), now() + interval '30 days', $4, $5::jsonb, 50000, 50000, 'โอนเงินผ่านธนาคาร', now())`,
      [id, type, no, CUST, JSON.stringify({ name: `ลูกค้าทดสอบสถานะงาน ${TAG}` })],
    );
    await q(`INSERT INTO "SalesDocumentItem"(id, "documentId", "sortOrder", sku, name, unit, "qtyMilli", "priceSatang") VALUES ($1,$2,1,'E2E-WK','ไฟทดสอบสถานะงาน','ชิ้น',1000,50000)`, [`${id}-1`, id]);
  }
});
test.afterAll(async () => {
  await q(`DELETE FROM "SalesDocument" WHERE id = ANY($1)`, [[QT, RC]]);
  await q(`DELETE FROM "Customer" WHERE id=$1`, [CUST]);
});

test("หน้ารายการใบเสนอราคา: ป้ายว่าง → เลือก ต้องดำเนินการ + หมายเหตุ → ตัวกรอง/จำนวน → เปลี่ยนเป็นเสร็จสิ้น → ล้าง", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`/admin/docs/QUOTATION?q=${QT_NO}`);
  const row = page.locator("tr", { hasText: QT_NO });
  const tag = row.locator(".wtag");
  await expect(tag).toHaveClass(/wt-empty/);
  await row.hover();
  await tag.click();
  const pop = page.getByRole("dialog", { name: `ตั้งสถานะงาน: ใบเสนอราคา ${QT_NO}` });
  await expect(pop).toBeVisible();
  await pop.getByLabel("หมายเหตุ (ไม่บังคับ)").fill("รอลูกค้ายืนยันขนาดสระ");
  await pop.getByRole("button", { name: "ต้องดำเนินการ" }).click();
  await expect(pop).toBeHidden();
  await expect(tag).toHaveClass(/wt-todo/);
  await expect(tag).toHaveText("ต้องดำเนินการ");
  await expect(tag).toHaveAttribute("title", /รอลูกค้ายืนยันขนาดสระ/);
  const [r1] = await q<{ s: string; n: string; by: string | null }>(`SELECT "workState" s, "workNote" n, "workById" by FROM "SalesDocument" WHERE id=$1`, [QT]);
  expect(r1).toMatchObject({ s: "TODO", n: "รอลูกค้ายืนยันขนาดสระ" });
  expect(r1.by).toBeTruthy();

  // ตัวกรอง "ต้องดำเนินการ" เห็นใบนี้ · "เสร็จสิ้น" ไม่เห็น · ค้นหายังจำตัวกรองไว้
  await page.locator(".wf-todo").click();
  await expect(page).toHaveURL(/work=todo/);
  await expect(page.locator("tr", { hasText: QT_NO })).toHaveCount(1);
  await expect(page.locator(".wf-todo em")).not.toHaveText("0");
  await page.locator(".wf-done").click();
  await expect(page.locator("tr", { hasText: QT_NO })).toHaveCount(0);
  await page.goto(`/admin/docs/QUOTATION?work=todo`);
  await page.fill('input[name="q"]', QT_NO);
  await page.click('form.doc-filter button[type=submit]');
  await expect(page).toHaveURL(/work=todo/);
  await expect(page.locator("tr", { hasText: QT_NO })).toHaveCount(1);

  // เปลี่ยนเป็นเสร็จสิ้น (Esc ปิดเมนูได้ก่อน)
  const tag2 = page.locator("tr", { hasText: QT_NO }).locator(".wtag");
  await tag2.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /ตั้งสถานะงาน/ })).toHaveCount(0);
  await tag2.click();
  await page.getByRole("dialog", { name: /ตั้งสถานะงาน/ }).getByRole("button", { name: "เสร็จสิ้น" }).click();
  await page.goto(`/admin/docs/QUOTATION?q=${QT_NO}`);
  const tag3 = page.locator("tr", { hasText: QT_NO }).locator(".wtag");
  await expect(tag3).toHaveClass(/wt-done/);
  // ล้าง
  await tag3.click();
  await page.getByRole("dialog", { name: /ตั้งสถานะงาน/ }).getByRole("button", { name: "ล้างสถานะ" }).click();
  await expect(tag3).toHaveClass(/wt-empty/);
  const [r2] = await q<{ s: string | null; n: string | null }>(`SELECT "workState" s, "workNote" n FROM "SalesDocument" WHERE id=$1`, [QT]);
  expect(r2).toEqual({ s: null, n: null });
  // ประวัติเอกสารบันทึกครบ 3 ครั้ง
  const ev = await q<{ note: string }>(`SELECT note FROM "SalesDocumentEvent" WHERE "documentId"=$1 AND type='WORK' ORDER BY "createdAt"`, [QT]);
  expect(ev.map((e) => e.note)).toEqual(["ต้องดำเนินการ — รอลูกค้ายืนยันขนาดสระ", "เสร็จสิ้น — รอลูกค้ายืนยันขนาดสระ", "ล้างสถานะงาน"]);
});

test("หน้าเอกสารใบเสร็จ: ปุ่มคู่แบบ LINE + หมายเหตุ + ประวัติ · ไม่แสดงบนเอกสารพิมพ์ · CSV มีคอลัมน์ · รายการใบเสร็จเห็นป้าย", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto(`/admin/docs/RECEIPT/${RC}`);
  const panel = page.locator("#docWork");
  await expect(panel).toContainText("ไม่แสดงบนเอกสาร");
  await panel.getByRole("button", { name: "ต้องดำเนินการ" }).click();
  await expect(panel.getByRole("button", { name: "ต้องดำเนินการ" })).toHaveAttribute("aria-pressed", "true");
  await panel.getByLabel("หมายเหตุ / สิ่งที่ต้องทำ").fill("ส่งใบเสร็จตัวจริงทางไปรษณีย์");
  await panel.getByRole("button", { name: "บันทึก" }).click();
  await expect(panel).toContainText(/ตั้งเป็น ต้องดำเนินการ โดย/);
  await expect(page.locator(".timeline li").first()).toContainText("สถานะงาน — ต้องดำเนินการ — ส่งใบเสร็จตัวจริงทางไปรษณีย์");
  // เสร็จสิ้น · กดซ้ำ = ล้าง
  await panel.getByRole("button", { name: "เสร็จสิ้น" }).click();
  await expect(panel.getByRole("button", { name: "เสร็จสิ้น" })).toHaveAttribute("aria-pressed", "true");
  await expect(panel.getByRole("button", { name: "ต้องดำเนินการ" })).toHaveAttribute("aria-pressed", "false");

  // เอกสารพิมพ์ (ลูกค้าเห็น) ไม่มีสถานะงาน/หมายเหตุภายใน
  await page.goto(`/admin/print/doc/${RC}`);
  await expect(page.locator(".sheet").first()).toBeVisible();
  for (const t of ["ต้องดำเนินการ", "เสร็จสิ้น", "ส่งใบเสร็จตัวจริง"]) await expect(page.locator(".sheet").first()).not.toContainText(t);

  // รายการใบเสร็จเห็นป้าย + ตัวกรองเสร็จสิ้น
  await page.goto(`/admin/docs/RECEIPT?work=done&q=${RC_NO}`);
  await expect(page.locator("tr", { hasText: RC_NO }).locator(".wtag.wt-done")).toBeVisible();

  // CSV: คอลัมน์สถานะงาน + หมายเหตุ + ผู้ตั้ง และกรองตาม work
  const csv = await page.request.get(`/admin/docs.csv?type=RECEIPT&work=done&q=${RC_NO}`);
  const text = await csv.text();
  expect(text).toContain("สถานะงาน");
  const line = text.split("\r\n").find((l) => l.includes(RC_NO))!;
  expect(line).toContain('"เสร็จสิ้น"');
  expect(line).toContain("ส่งใบเสร็จตัวจริงทางไปรษณีย์");
  const none = await (await page.request.get(`/admin/docs.csv?type=RECEIPT&work=todo&q=${RC_NO}`)).text();
  expect(none).not.toContain(RC_NO);

  // กดปุ่มเดิมซ้ำ = ล้าง
  await page.goto(`/admin/docs/RECEIPT/${RC}`);
  await page.locator("#docWork").getByRole("button", { name: "เสร็จสิ้น" }).click();
  await expect(page.locator("#docWork").getByRole("button", { name: "เสร็จสิ้น" })).toHaveAttribute("aria-pressed", "false");
  const [r] = await q<{ s: string | null }>(`SELECT "workState" s FROM "SalesDocument" WHERE id=$1`, [RC]);
  expect(r.s).toBeNull();
});
