// ใบส่งของ: สร้างจากใบเสนอราคา (ตัดค่าส่งออก) → ออกเลข DO… → พิมพ์ไม่มีราคา + ช่องเซ็นรับ → บันทึกเซ็นรับ/ยกเลิก
// · ไม่กระทบเงิน/สต็อก · แท็บรอเซ็นรับ/ส่งมอบแล้ว · ตั้งคำนำหน้าเลขที่ได้
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login, todayBkk, trackErrors } from "./helpers";

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
let doId = "";

test("ใบเสนอราคา → สร้างใบส่งของ → ออกเลข → พิมพ์ไม่มีราคา", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/docs/QUOTATION/new/edit");
  await page.getByRole("button", { name: "+ ลูกค้าใหม่" }).click();
  await page.fill("#qcName" + V, `ลูกค้าส่งของ ${TAG}`);
  await page.fill("#qcAddressLine" + V, "99 ถนนทดสอบ");
  await page.fill("#qcProvince" + V, "ชลบุรี");
  await page.getByRole("button", { name: "บันทึกลูกค้าและเลือก" }).click();
  await expect(page.locator(".de-cust" + V)).toBeVisible();
  const l1 = page.locator(".de-line" + V).first();
  await l1.locator(".ac-wrap .ln-name").fill(`โคมไฟสระ ${TAG}`);
  await l1.locator(".ln-nums input").nth(0).fill("4");
  await l1.locator(".ln-nums input").nth(2).fill("1250");
  await page.click(`button:has-text("+ ค่าส่งสินค้า")${V}`);
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/QUOTATION\/[^/?]+\?issued=1/);
  const qtId = page.url().split("/").pop()!.split("?")[0];

  await page.getByRole("button", { name: "สร้างใบส่งของ" }).click();
  await page.waitForURL(/\/admin\/docs\/DELIVERY\/[^/]+\/edit$/);
  doId = page.url().split("/").slice(-2)[0];
  await expect(page.locator(".de-do-hint" + V)).toContainText("ไม่พิมพ์ราคา");
  await expect(page.locator("#payMethod" + V)).toHaveCount(0);
  // ค่าส่งถูกตัดออก เหลือสินค้า 1 รายการ
  await expect(page.locator(".de-line" + V)).toHaveCount(1);
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/DELIVERY\/[^/?]+\?issued=1/);
  await expect(page.locator(".dv-title .num" + V)).toHaveText(/^DO\d{4}-\d{5}$/);
  await expect(page.locator(".dv-title .dst" + V)).toHaveText("รอเซ็นรับ");

  const [d] = await q<{ src: string; n: number }>(`SELECT "sourceId" src, (SELECT count(*)::int FROM "SalesDocumentItem" WHERE "documentId"=$1) n FROM "SalesDocument" WHERE id=$1`, [doId]);
  expect(d).toEqual({ src: qtId, n: 1 });
  // ใบเสนอราคายังแปลงเป็นใบแจ้งหนี้ได้ตามปกติ (ใบส่งของไม่บล็อก)
  const [qt] = await q<{ s: string }>(`SELECT status s FROM "SalesDocument" WHERE id=$1`, [qtId]);
  expect(qt.s).toBe("ISSUED");

  // เอกสารพิมพ์: หัว "ใบส่งของ" · ไม่มีคอลัมน์ราคา/ยอดเงิน · มีส่งที่ + ข้อความรับรอง + ช่องผู้รับของ
  await page.goto(`/admin/print/doc/${doId}`);
  const sheet = page.locator(".pp-sheets .sheet").first();
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".sh-title")).toContainText("ใบส่งของ");
  await expect(sheet.locator(".sh-tbl thead")).not.toContainText("ราคา");
  await expect(sheet).not.toContainText("1,250.00");
  await expect(sheet).not.toContainText("จำนวนเงิน (ตัวอักษร)");
  await expect(sheet.locator(".sh-dobox")).toContainText("99 ถนนทดสอบ");
  await expect(sheet.locator(".sh-doack")).toContainText("ได้รับสินค้าตามรายการข้างต้นครบถ้วน");
  await expect(sheet.locator(".sh-sign")).toContainText("ผู้รับของ");
  await expect(sheet.locator(".sh-tot")).toContainText("รวมจำนวน");
  expect(errors).toEqual([]);
});

test("บันทึกเซ็นรับ → ส่งมอบแล้ว · ยกเลิกการบันทึก · แท็บสถานะ · ไม่กระทบสต็อก/ยอดขาย", async ({ page }) => {
  await login(page);
  const stockBefore = await q(`SELECT count(*)::int n FROM "StockMovement" WHERE ref LIKE 'DO%'`);
  await page.goto(`/admin/docs/DELIVERY/${doId}`);
  await page.locator("#doReceive summary").click();
  await page.fill("#doWho" + V, `คุณผู้รับ ${TAG}`);
  await page.getByRole("button", { name: "บันทึกการรับของ" }).click();
  await page.waitForURL(/delivered=1/);
  await expect(page.locator(".dv-title .dst" + V)).toHaveText("ส่งมอบแล้ว");
  await expect(page.locator(".dv-kv" + V)).toContainText(`คุณผู้รับ ${TAG}`);
  const [d] = await q<{ s: string; by: string; at: Date }>(`SELECT status s, "acceptedBy" by, "acceptedAt" at FROM "SalesDocument" WHERE id=$1`, [doId]);
  expect(d.s).toBe("ACCEPTED");
  expect(d.by).toBe(`คุณผู้รับ ${TAG}`);

  await page.goto("/admin/docs/DELIVERY?tab=delivered");
  await expect(page.locator(`tr:has-text("คุณผู้รับ ${TAG}")` + V)).toBeVisible();

  await page.goto(`/admin/docs/DELIVERY/${doId}`);
  await page.getByRole("button", { name: "ยกเลิกการบันทึกเซ็นรับ" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิกการบันทึก" }).click();
  await expect(page.locator(".dv-title .dst" + V)).toHaveText("รอเซ็นรับ");
  await page.goto("/admin/docs/DELIVERY?tab=shipping");
  await expect(page.locator(`tr:has-text("ลูกค้าส่งของ ${TAG}")` + V)).toBeVisible();
  expect(await q(`SELECT count(*)::int n FROM "StockMovement" WHERE ref LIKE 'DO%'`)).toEqual(stockBefore);
  // ไม่อยู่ในปิดยอดประจำวัน (ไม่ใช่การรับเงิน)
  await page.goto(`/admin/reports/daily?day=${todayBkk()}`);
  await expect(page.locator("main")).not.toContainText(`ลูกค้าส่งของ ${TAG}`);
});
