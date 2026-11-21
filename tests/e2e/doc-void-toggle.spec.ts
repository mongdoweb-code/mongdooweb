// ซ่อน/แสดงใบที่ยกเลิกในรายการเอกสารขาย: ค่าเริ่มต้นซ่อนในแท็บ "ทั้งหมด" · สวิตช์แสดง (จำในคุกกี้ ใช้ข้ามประเภทเอกสาร) · แท็บ "ยกเลิก" แสดงเสมอ
// · ตัวเลขแท็บ/สถานะงาน · CSV ตามค่าเดียวกัน · ช่อง "แสดง n รายการ/หน้า" มุมโค้งเข้าชุดกับปุ่มเลขหน้า
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const CUST = `e2e-vt-c-${TAG}`;
const NAME = `ลูกค้าทดสอบซ่อนยกเลิก ${TAG}`;
const LIVE = `e2e-vt-live-${TAG}`, DEAD = `e2e-vt-void-${TAG}`, RCV = `e2e-vt-rc-${TAG}`;
const LIVE_NO = `QTL${TAG.slice(-7)}`, DEAD_NO = `QTX${TAG.slice(-7)}`, RCV_NO = `RCX${TAG.slice(-7)}`;
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
  await q(`INSERT INTO "Customer" (id, code, kind, name, phone, "updatedAt") VALUES ($1, $2, 'PERSON', $3, '0845555555', now())`, [CUST, `V${TAG.slice(-7)}`, NAME]);
  for (const [id, type, no, status] of [[LIVE, "QUOTATION", LIVE_NO, "ISSUED"], [DEAD, "QUOTATION", DEAD_NO, "VOID"], [RCV, "RECEIPT", RCV_NO, "VOID"]] as const) {
    await q(
      `INSERT INTO "SalesDocument"(id, type, "docNo", status, "issueDate", "validUntil", "customerId", "customerSnapshot", "subtotalSatang", "grandSatang", "updatedAt")
       VALUES ($1, $2::"DocType", $3, $4::"DocStatus", now(), now() + interval '30 days', $5, $6::jsonb, 50000, 50000, now())`,
      [id, type, no, status, CUST, JSON.stringify({ name: NAME })],
    );
  }
});
test.afterAll(async () => {
  await q(`DELETE FROM "SalesDocument" WHERE id = ANY($1)`, [[LIVE, DEAD, RCV]]);
  await q(`DELETE FROM "Customer" WHERE id=$1`, [CUST]);
});

const rowsText = (page: import("@playwright/test").Page) => page.locator(".doc-tbl tbody" + V).innerText();

test("ซ่อนใบที่ยกเลิกเป็นค่าเริ่มต้น → สวิตช์แสดง (จำค่า) → ซ่อน · แท็บยกเลิกแสดงเสมอ · CSV", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const list = `/admin/docs/QUOTATION?q=${encodeURIComponent(TAG)}`;
  await page.goto(list);
  const tg = page.locator("[data-void-toggle]" + V);
  await expect(tg).toHaveAttribute("aria-checked", "false");
  await expect(tg).toContainText("ซ่อนใบที่ยกเลิก");
  expect(await rowsText(page)).toContain(LIVE_NO);
  expect(await rowsText(page)).not.toContain(DEAD_NO);
  await expect(page.locator(".void-note" + V)).toContainText("ซ่อนใบที่ยกเลิกไว้");
  // ตัวเลขแท็บ "ทั้งหมด" ไม่นับใบที่ยกเลิก
  const allCount = async () => Number(await page.locator(`.tabs .tab:has-text("ทั้งหมด") em${V}`).innerText());
  const voidTab = Number(await page.locator(`.tabs .tab:has-text("ยกเลิก") em${V}`).innerText());
  const hiddenAll = await allCount();
  expect(voidTab).toBeGreaterThanOrEqual(1);
  await expect(tg.locator("em")).toHaveText(String(voidTab));
  // CSV ตามค่าเดียวกัน (ซ่อน)
  const csvHref = await page.locator(`a:has-text("ส่งออก CSV")${V}`).getAttribute("href");
  expect(csvHref).toContain("void=hide");
  const csv1 = await (await page.request.get(csvHref!)).text();
  expect(csv1).toContain(LIVE_NO);
  expect(csv1).not.toContain(DEAD_NO);

  // เปิดสวิตช์ → เห็นใบที่ยกเลิก (ขีดฆ่า) + จำในคุกกี้
  await tg.click();
  await expect(page).toHaveURL(/void=show/);
  await expect(page.locator("[data-void-toggle]" + V)).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(`.doc-tbl tr.row-off:has-text("${DEAD_NO}")${V}`)).toBeVisible();
  expect(await allCount()).toBe(hiddenAll + voidTab);
  expect((await context.cookies()).find((c) => c.name === "mdw_doc_void")?.value).toBe("show");
  const csv2 = await (await page.request.get((await page.locator(`a:has-text("ส่งออก CSV")${V}`).getAttribute("href"))!)).text();
  expect(csv2).toContain(DEAD_NO);

  // ค่าที่จำไว้ใช้กับหน้าอื่น/ประเภทอื่นโดยไม่ต้องมี ?void= ใน URL
  await page.goto(`/admin/docs/RECEIPT?q=${encodeURIComponent(TAG)}`);
  await expect(page.locator("[data-void-toggle]" + V)).toHaveAttribute("aria-checked", "true");
  expect(await rowsText(page)).toContain(RCV_NO);

  // ปิดสวิตช์ → ซ่อนอีกครั้ง
  await page.goto(list);
  await page.locator("[data-void-toggle]" + V).click();
  await expect(page).toHaveURL(/void=hide/);
  await expect(page.locator("[data-void-toggle]" + V)).toHaveAttribute("aria-checked", "false");
  expect(await rowsText(page)).not.toContain(DEAD_NO);
  expect((await context.cookies()).find((c) => c.name === "mdw_doc_void")?.value).toBe("hide");

  // แท็บ "ยกเลิก" แสดงใบที่ยกเลิกเสมอ (ไม่มีสวิตช์)
  await page.goto(`${list}&tab=void`);
  expect(await rowsText(page)).toContain(DEAD_NO);
  expect(await rowsText(page)).not.toContain(LIVE_NO);
  await expect(page.locator("[data-void-toggle]" + V)).toHaveCount(0);

  // ลิงก์ "ดูเฉพาะที่ยกเลิก"
  await page.goto(list);
  await page.locator(`.void-tg-wrap .void-only${V}`).click();
  await expect(page).toHaveURL(/tab=void/);

  // แท็บอื่น (รอตอบรับ): สวิตช์จาง (ใช้กับแท็บทั้งหมด) และไม่มีใบยกเลิก
  await page.goto(`${list}&tab=open&void=show`);
  await expect(page.locator(".void-tg.idle" + V)).toBeVisible();
  expect(await rowsText(page)).not.toContain(DEAD_NO);
});

test("ช่อง แสดง n รายการ/หน้า: มุมโค้งเข้าชุดกับปุ่มเลขหน้า", async ({ page }) => {
  await login(page);
  await page.goto("/admin/docs/QUOTATION?per=10&void=show");
  const sel = page.locator(".pg-per .sel" + V);
  await expect(sel).toBeVisible();
  const st = await sel.evaluate((el) => { const s = getComputedStyle(el); return { r: parseFloat(s.borderTopLeftRadius), h: el.getBoundingClientRect().height }; });
  const box = await page.locator(".pg-per" + V).evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
  expect(st.r).toBeGreaterThanOrEqual(6);
  expect(box).toBeGreaterThanOrEqual(8);
  const btnH = await page.locator(".pg-nav .pg-btn" + V).first().evaluate((el) => el.getBoundingClientRect().height).catch(() => 32);
  expect(Math.abs(st.h - btnH)).toBeLessThanOrEqual(1);
  // ยังเปลี่ยนจำนวนต่อหน้าได้
  await sel.selectOption("20");
  await expect(page).not.toHaveURL(/per=10/);
});
