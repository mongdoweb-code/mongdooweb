// เอกสารขาย: ลูกค้า (ตรวจเลขผู้เสียภาษี) → ใบเสนอราคา → แปลงเป็นใบแจ้งหนี้ → รับชำระ 2 งวด → ใบเสร็จ 2 ใบ → ยกเลิกใบเสร็จ
import { expect, test } from "@playwright/test";
import { V, login, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });

test("วงจร QT → IV → รับชำระบางส่วน/ครบ → RC และยกเลิก", async ({ page, request }) => {
  const errors = trackErrors(page);
  await login(page);

  // ลูกค้านิติบุคคล — เลขผู้เสียภาษีผิดต้องถูกปฏิเสธ
  await page.goto("/admin/customers/new");
  await page.click(`.seg button:has-text("นิติบุคคล")${V}`);
  await page.fill("#c-name" + V, `บริษัท ทดสอบอีทูอี ${Date.now() % 100000} จำกัด`);
  await page.fill("#c-taxId" + V, "0105536084041");
  await page.fill("#c-province" + V, "กรุงเทพมหานคร");
  await page.click(".cu-form button[type=submit]" + V);
  await expect(page.locator(".cu-form .login-err" + V)).toContainText("เลขประจำตัวผู้เสียภาษี");
  await page.fill("#c-taxId" + V, "0105536084045");
  await page.click(".cu-form button[type=submit]" + V);
  await page.waitForURL(/\/admin\/customers\/[^/]+\?saved=1/);
  const customerId = page.url().split("/").pop()!.split("?")[0];

  // ใบเสนอราคา 2 รายการ + ส่วนลดท้ายบิล
  await page.goto(`/admin/docs/QUOTATION/new/edit?customer=${customerId}`);
  await expect(page.locator(".de-cust" + V)).toBeVisible();
  const l1 = page.locator(".de-line" + V).first();
  await l1.locator(".ac-wrap input").fill("ค่าติดตั้งไฟสระ");
  await l1.locator(".ln-nums input").nth(0).fill("2");
  await l1.locator(".ln-nums input").nth(2).fill("1500");
  await page.click(`button:has-text("+ ค่าส่งสินค้า")${V}`);
  await page.fill("#billDisc" + V, "100");
  await expect(page.locator(".de-pv .pv-sheet" + V).first()).toBeVisible();
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/QUOTATION\/.+issued=1/);
  await expect(page.locator(".dv-title .num" + V)).toHaveText(/^QT\d{4}-\d{5}$/);

  // แปลงเป็นใบแจ้งหนี้แล้วออกเอกสาร
  await page.click(`button:has-text("แปลงเป็นใบแจ้งหนี้")${V}`);
  await page.waitForURL(/\/admin\/docs\/INVOICE\/.+\/edit$/);
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/INVOICE\/.+issued=1/);
  const ivUrl = page.url().split("?")[0];
  const grandText = (await page.locator(".dv-amt b" + V).innerText()).replace(/[฿,]/g, "");
  const grand = Number(grandText);
  expect(grand).toBeGreaterThan(1000);

  // งวดที่ 1: 1,000 บาท → ชำระบางส่วน · ยอดเกินต้องถูกปฏิเสธ
  await page.fill("#amount" + V, "1000");
  await page.click(`button:has-text("บันทึกรับชำระ + ออกใบเสร็จ")${V}`);
  await page.waitForURL(/paid=RC/);
  await expect(page.locator(".dv-title .dst" + V)).toHaveText("ชำระบางส่วน");
  await page.goto(ivUrl);
  await page.fill("#amount" + V, String(grand));
  await page.click(`button:has-text("บันทึกรับชำระ + ออกใบเสร็จ")${V}`);
  await expect(page.locator(".pay-form .login-err" + V)).toContainText("เกินยอดค้าง");

  // งวดที่ 2: ยอดคงเหลือ (ค่าเริ่มต้น) → ชำระแล้ว
  await page.goto(ivUrl);
  await page.click(`button:has-text("บันทึกรับชำระ + ออกใบเสร็จ")${V}`);
  await page.waitForURL(/paid=RC/);
  await expect(page.locator(".dv-title .dst" + V)).toHaveText("ชำระแล้ว");
  await expect(page.locator(".dv-pays li" + V)).toHaveCount(2);

  // ยกเลิกใบเสร็จงวดแรก → ใบแจ้งหนี้กลับเป็นชำระบางส่วน และใบแจ้งหนี้ยังยกเลิกไม่ได้
  const rc1 = await page.locator(".dv-pays a" + V).first().getAttribute("href");
  await page.goto(rc1!);
  await page.click(`button:has-text("ยกเลิกใบเสร็จรับเงิน")${V}`);
  await page.fill("#vReason" + V, "ทดสอบยกเลิก");
  await page.click(`button:has-text("ยืนยันยกเลิก")${V}`);
  await page.waitForURL(/voided=1/);
  await expect(page.locator(".dv-title .dst" + V)).toHaveText("ยกเลิก");
  await page.goto(ivUrl);
  await expect(page.locator(".dv-title .dst" + V)).toHaveText(/ชำระบางส่วน|เกินกำหนด/);
  await page.click(`button:has-text("ยกเลิกใบแจ้งหนี้")${V}`);
  await page.fill("#vReason" + V, "ลองยกเลิก");
  await page.click(`button:has-text("ยืนยันยกเลิก")${V}`);
  await expect(page.locator(".void-form .login-err" + V)).toContainText("ยกเลิกใบเสร็จ");

  // ส่งออก CSV
  const csv = await request.get("/admin/docs.csv?type=INVOICE", { headers: { cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") } });
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("เลขที่");
  expect(errors).toEqual([]);
});
