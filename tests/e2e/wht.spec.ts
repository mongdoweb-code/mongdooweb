// ภาษีหัก ณ ที่จ่าย: ใบแจ้งหนี้ 10,000 → รับชำระ 2 งวด (งวดแรกหัก 3%) → ใบแจ้งหนี้ชำระครบ · ใบเสร็จแสดงรับเงินสุทธิ
// · ปิดยอดประจำวันนับเงินที่ได้รับจริง · รายงานภาษีถูกหัก + บันทึกหนังสือรับรอง 50 ทวิ · CSV
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login, todayBkk, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const NAME = `บริษัท ทดสอบหัก ณ ที่จ่าย ${TAG} จำกัด`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
let ivId = "";

test("รับชำระแบบหักภาษี ณ ที่จ่าย 3% → ใบเสร็จ + ยอดใบแจ้งหนี้ถูกต้อง", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/docs/INVOICE/new/edit");
  await page.getByRole("button", { name: "+ ลูกค้าใหม่" }).click();
  await page.getByRole("button", { name: "นิติบุคคล / บริษัท" }).click();
  await page.fill("#qcName" + V, NAME);
  await page.fill("#qcTaxId" + V, "0105536084045");
  await page.getByRole("button", { name: "บันทึกลูกค้าและเลือก" }).click();
  await expect(page.locator(".de-cust" + V)).toContainText(NAME);
  const l1 = page.locator(".de-line" + V).first();
  await l1.locator(".ac-wrap .ln-name").fill(`ค่าติดตั้งไฟสระ ${TAG}`);
  await l1.locator(".ln-nums input").nth(2).fill("10000");
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/INVOICE\/[^/?]+\?issued=1/);
  ivId = page.url().split("/").pop()!.split("?")[0];

  // งวด 1: ตัดหนี้ 6,000 · หัก 3% (ฐาน 6,000 → 180) · รับจริง 5,820
  await page.fill("#amount" + V, "6000");
  await page.getByText("ลูกค้าหักภาษี ณ ที่จ่าย").click();
  await expect(page.locator("#whtRate" + V)).toHaveValue("300");
  await expect(page.locator("#whtAmount" + V)).toHaveValue("180.00");
  await expect(page.locator(".wht-sum .net" + V)).toContainText("5,820.00");
  await page.fill("#whtCertNo" + V, `WHT-${TAG}`);
  await page.click(`button:has-text("บันทึกรับชำระ + ออกใบเสร็จ")${V}`);
  await page.waitForURL(/paid=RC/);
  await expect(page.locator(".dv-title .dst" + V)).toHaveText("ชำระบางส่วน");
  await expect(page.locator(".dv-pays" + V)).toContainText("หัก ณ ที่จ่าย 3% ฿180.00 (รับจริง ฿5,820.00)");
  const [p1] = await q<{ a: number; w: number; r: number; c: string }>(`SELECT "amountSatang" a, "whtSatang" w, "whtRateBp" r, "whtCertNo" c FROM "DocPayment" WHERE "invoiceId"=$1`, [ivId]);
  expect(p1).toEqual({ a: 600000, w: 18000, r: 300, c: `WHT-${TAG}` });
  const [iv] = await q<{ p: number; s: string }>(`SELECT "paidSatang" p, status s FROM "SalesDocument" WHERE id=$1`, [ivId]);
  expect(iv).toEqual({ p: 600000, s: "PARTIAL" });

  // ใบเสร็จ: ยอดเต็ม 6,000 + แถวหัก ณ ที่จ่าย + รับเงินสุทธิ
  const rcId = new URL(page.url()).searchParams.get("rc")!;
  await page.goto(`/admin/docs/RECEIPT/${rcId}`);
  const wht = page.locator(".sheet .sh-wht").first();
  await expect(wht).toContainText("หักภาษี ณ ที่จ่าย 3%");
  await expect(wht).toContainText(`หนังสือรับรองเลขที่ WHT-${TAG}`);
  await expect(wht).toContainText("5,820.00");

  // งวด 2: ไม่หัก · ยอดที่เหลือ 4,000 → ชำระครบ
  await page.goto(`/admin/docs/INVOICE/${ivId}`);
  await expect(page.locator("#amount" + V)).toHaveValue("4000.00");
  await page.click(`button:has-text("บันทึกรับชำระ + ออกใบเสร็จ")${V}`);
  await page.waitForURL(/paid=RC/);
  await expect(page.locator(".dv-title .dst" + V)).toHaveText("ชำระแล้ว");
  expect(errors).toEqual([]);
});

test("ยอดภาษีผิดปกติถูกปฏิเสธ", async ({ page }) => {
  await login(page);
  // ใบแจ้งหนี้ใหม่ของลูกค้าเดิม (คัดลอกจากใบเดิม)
  const [c] = await q<{ id: string }>(`SELECT id FROM "Customer" WHERE name=$1`, [NAME]);
  await page.goto(`/admin/docs/INVOICE/new/edit?customer=${c.id}`);
  const l1 = page.locator(".de-line" + V).first();
  await l1.locator(".ac-wrap .ln-name").fill(`งานทดสอบ ${TAG}`);
  await l1.locator(".ln-nums input").nth(2).fill("1000");
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/INVOICE\/[^/?]+\?issued=1/);
  await page.getByText("ลูกค้าหักภาษี ณ ที่จ่าย").click();
  await page.fill("#whtAmount" + V, "500");
  await page.click(`button:has-text("บันทึกรับชำระ + ออกใบเสร็จ")${V}`);
  await expect(page.locator(".pay-form .login-err" + V)).toContainText("สูงเกินไป");
  const id = page.url().split("/").pop()!.split("?")[0];
  expect((await q(`SELECT 1 FROM "DocPayment" WHERE "invoiceId"=$1`, [id])).length).toBe(0);
});

test("รายงานภาษีถูกหัก ณ ที่จ่าย + บันทึกได้รับหนังสือรับรอง + CSV + ปิดยอดนับเงินรับจริง", async ({ page }) => {
  await login(page);
  const month = todayBkk().slice(0, 7);
  await page.goto(`/admin/reports/wht?month=${month}`);
  const row = page.locator(`#whtTbl tr:has-text("${NAME}")` + V);
  await expect(row).toContainText("฿6,000");
  await expect(row).toContainText("฿180");
  await expect(row.locator(".chip.warn")).toHaveText("ยังไม่ได้รับ");
  await row.getByLabel("ได้รับแล้ว").check();
  await row.getByRole("button", { name: "บันทึก" }).click();
  await expect(row.locator(".chip.ok")).toContainText("รับ");
  const [p] = await q<{ at: Date | null }>(`SELECT "whtCertAt" at FROM "DocPayment" WHERE "invoiceId"=$1 AND "whtSatang">0`, [ivId]);
  expect(p.at).not.toBeNull();

  const csv = await page.request.get(`/admin/reports/wht/export?month=${month}`);
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text).toContain(NAME);
  expect(text).toContain(`WHT-${TAG}`);

  // ปิดยอดประจำวัน: งวดที่หักภาษีนับเงินที่ได้รับจริง 5,820
  await page.goto(`/admin/reports/daily?day=${todayBkk()}`);
  await expect(page.locator(`tr:has-text("หัก ณ ที่จ่าย 3%")` + V).first()).toContainText("5,820");
});
