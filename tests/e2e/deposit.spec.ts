// ใบมัดจำ: ใบเสนอราคา 20,000 → รับมัดจำ 50% (ใบเสร็จมัดจำ) → แปลงเป็นใบแจ้งหนี้ → ออกเลข = หักมัดจำอัตโนมัติ (ค้าง 10,000)
// · ใบแจ้งหนี้พิมพ์ "หักเงินมัดจำ" · รับชำระส่วนที่เหลือ → ชำระครบ · มัดจำเกินยอดถูกปฏิเสธ · ยกเลิกใบแจ้งหนี้ = ปลดมัดจำกลับ
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login, trackErrors } from "./helpers";

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
let qtId = "", ivId = "";
const doc = async (id: string) => (await q<{ s: string; p: number; g: number }>(`SELECT status s, "paidSatang" p, "grandSatang" g FROM "SalesDocument" WHERE id=$1`, [id]))[0];

async function newQuote(page: import("@playwright/test").Page, name: string, price: string) {
  await page.goto("/admin/docs/QUOTATION/new/edit");
  await page.getByRole("button", { name: "+ ลูกค้าใหม่" }).click();
  await page.fill("#qcName" + V, name);
  await page.getByRole("button", { name: "บันทึกลูกค้าและเลือก" }).click();
  await expect(page.locator(".de-cust" + V)).toBeVisible();
  const l1 = page.locator(".de-line" + V).first();
  await l1.locator(".ac-wrap .ln-name").fill(`งานติดตั้งไฟ ${TAG}`);
  await l1.locator(".ln-nums input").nth(2).fill(price);
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/QUOTATION\/[^/?]+\?issued=1/);
  return page.url().split("/").pop()!.split("?")[0];
}

test("รับมัดจำ 50% → ใบเสร็จมัดจำ → ใบแจ้งหนี้หักมัดจำอัตโนมัติ → ชำระส่วนที่เหลือ", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  qtId = await newQuote(page, `ลูกค้ามัดจำ ${TAG}`, "20000");

  // มัดจำเกินยอด → ปุ่มกดไม่ได้ (ฝั่งหน้าจอ)
  await page.locator("#depositSec summary").click();
  await page.fill("#depAmt" + V, "25000");
  await expect(page.locator("#depositForm button[type=submit]" + V)).toBeDisabled();
  await page.getByRole("button", { name: "50%" }).click();
  await expect(page.locator("#depositForm .net" + V)).toContainText("10,000.00");
  await page.click(`button:has-text("บันทึกรับมัดจำ + ออกใบเสร็จ")${V}`);
  await page.waitForURL(/deposit=RC/);
  await expect(page.locator("#depositSec" + V)).toContainText("฿10,000");
  await expect(page.locator(".dv-title .dst" + V)).toHaveText("ตอบรับแล้ว");
  const rcId = new URL(page.url()).searchParams.get("rc")!;
  const [rc] = await q<{ d: boolean; g: number; s: string; src: string }>(`SELECT "isDeposit" d, "grandSatang" g, status s, "sourceId" src FROM "SalesDocument" WHERE id=$1`, [rcId]);
  expect(rc).toEqual({ d: true, g: 1000000, s: "ISSUED", src: qtId });
  // ใบเสร็จมัดจำพิมพ์ "ได้รับเงินมัดจำ" + รายการเงินมัดจำตามใบเสนอราคา
  await page.goto(`/admin/docs/RECEIPT/${rcId}`);
  await expect(page.locator(".sheet .sh-paid").first()).toContainText("ได้รับเงินมัดจำถูกต้องแล้ว");
  await expect(page.locator(".sheet .sh-tbl").first()).toContainText("เงินมัดจำตามใบเสนอราคา");

  // แปลงเป็นใบแจ้งหนี้ (มัดจำไม่บล็อกการแปลง) → ออกเลข → หักมัดจำ
  await page.goto(`/admin/docs/QUOTATION/${qtId}`);
  await page.click(`button:has-text("แปลงเป็นใบแจ้งหนี้")${V}`);
  await page.waitForURL(/\/admin\/docs\/INVOICE\/.+\/edit$/);
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/INVOICE\/.+issued=1/);
  ivId = page.url().split("/").pop()!.split("?")[0];
  expect(await doc(ivId)).toEqual({ s: "PARTIAL", p: 1000000, g: 2000000 });
  await expect(page.locator(".dv-amt b" + V)).toContainText("10,000");
  const tot = page.locator(".sheet .sh-tot").first();
  await expect(tot).toContainText("หักเงินมัดจำ");
  await expect(tot).toContainText("10,000.00");
  await expect(page.locator(".dv-pays" + V)).toContainText("มัดจำ RC");

  // ชำระส่วนที่เหลือ 10,000 → ชำระครบ (ใบเสร็จงวดที่ 2)
  await expect(page.locator("#amount" + V)).toHaveValue("10000.00");
  await page.click(`button:has-text("บันทึกรับชำระ + ออกใบเสร็จ")${V}`);
  await page.waitForURL(/paid=RC/);
  expect(await doc(ivId)).toEqual({ s: "PAID", p: 2000000, g: 2000000 });
  expect(errors).toEqual([]);
});

test("ยกเลิกใบแจ้งหนี้ที่มีแต่มัดจำ = ปลดมัดจำกลับใบเสนอราคา · ใบเสนอราคาที่มีมัดจำยกเลิกไม่ได้", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const qt2 = await newQuote(page, `ลูกค้ามัดจำสอง ${TAG}`, "8000");
  await page.locator("#depositSec summary").click();
  await page.fill("#depAmt" + V, "3000");
  await page.click(`button:has-text("บันทึกรับมัดจำ + ออกใบเสร็จ")${V}`);
  await page.waitForURL(/deposit=RC/);
  // แปลงเป็นใบเสร็จตรงไม่ได้เมื่อมีมัดจำ (ปุ่มซ่อน)
  await expect(page.locator(`button:has-text("แปลงเป็นใบเสร็จรับเงิน")` + V)).toHaveCount(0);
  await page.click(`button:has-text("แปลงเป็นใบแจ้งหนี้")${V}`);
  await page.waitForURL(/\/admin\/docs\/INVOICE\/.+\/edit$/);
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/INVOICE\/.+issued=1/);
  const iv2 = page.url().split("/").pop()!.split("?")[0];
  expect((await doc(iv2)).p).toBe(300000);

  await page.getByRole("button", { name: "ยกเลิกใบแจ้งหนี้", exact: true }).click();
  await page.fill("#vReason" + V, "ทดสอบปลดมัดจำ");
  await page.getByRole("button", { name: /ยืนยันยกเลิก/ }).click();
  await page.waitForURL(/voided=1/);
  expect((await doc(iv2)).s).toBe("VOID");
  expect((await q(`SELECT 1 FROM "DocPayment" WHERE "invoiceId"=$1`, [iv2])).length).toBe(0);

  // ใบเสนอราคา: มัดจำยังอยู่ · ยกเลิกใบเสนอราคาไม่ได้จนกว่าจะยกเลิกใบเสร็จมัดจำ
  await page.goto(`/admin/docs/QUOTATION/${qt2}`);
  await expect(page.locator("#depositSec" + V)).toContainText("฿3,000");
  await page.getByRole("button", { name: "ยกเลิกใบเสนอราคา", exact: true }).click();
  await page.fill("#vReason" + V, "ทดสอบ");
  await page.getByRole("button", { name: /ยืนยันยกเลิก/ }).click();
  await expect(page.locator(".void-form .login-err" + V)).toContainText("รับเงินมัดจำแล้ว");
});
