// หน้าพิมพ์เอกสารขาย: ลายเซ็น + ตราประทับ + ชื่อ/ตำแหน่งผู้ลงนาม (เฉพาะเอกสารที่ออกแล้ว) · ใบเสนอราคามีบัญชีธนาคาร + QR ยืนยันออนไลน์
// · กล่องข้อมูล "ยืนราคา n วัน" / "ผู้ติดต่อ" · ไม่พิมพ์แถวส่วนลด 0 · จำนวนเต็มไม่มีทศนิยม · ปิดได้ในตั้งค่า
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
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
type Saved = { signatureKey: string | null; stampKey: string | null; signerName: string; signerTitle: string; quotePayInfo: boolean; quoteOnlineQr: boolean; showSignature: boolean };
let saved: Saved;
let qtId = "";
const PNG = readFileSync("tests/fixtures/slip.png");

test.beforeAll(async () => {
  [saved] = await q<Saved>(`SELECT "signatureKey", "stampKey", "signerName", "signerTitle", "quotePayInfo", "quoteOnlineQr", "showSignature" FROM "ShopSetting" WHERE id='shop'`);
});
test.afterAll(async () => {
  await q(`UPDATE "ShopSetting" SET "signatureKey"=$1, "stampKey"=$2, "signerName"=$3, "signerTitle"=$4, "quotePayInfo"=$5, "quoteOnlineQr"=$6, "showSignature"=$7 WHERE id='shop'`, [
    saved.signatureKey, saved.stampKey, saved.signerName, saved.signerTitle, saved.quotePayInfo, saved.quoteOnlineQr, saved.showSignature,
  ]);
});

test("ตั้งค่า: อัปโหลดลายเซ็น + ตราประทับ + ชื่อผู้ลงนาม → ออกใบเสนอราคา → หน้าพิมพ์มีลายเซ็น ตรา บัญชี QR ออนไลน์", async ({ page, request }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await login(page);
  await page.goto("/admin/settings");
  await page.fill("#signerName" + V, `นายทดสอบ ลงนาม ${TAG}`);
  await page.fill("#signerTitle" + V, "ผู้จัดการฝ่ายขาย");
  await page.setInputFiles("#signature", { name: "sig.png", mimeType: "image/png", buffer: PNG });
  await page.setInputFiles("#stamp", { name: "stamp.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator(".sig-prev img" + V)).toHaveCount(2);
  await page.locator('input[name="quotePayInfo"]' + V).check();
  await page.locator('input[name="quoteOnlineQr"]' + V).check();
  await page.locator('input[name="showSignature"]' + V).check();
  await page.locator("button[type=submit]:has-text('บันทึกการตั้งค่า')" + V).first().click();
  await expect.poll(async () => (await q<{ k: string | null }>(`SELECT "signatureKey" k FROM "ShopSetting" WHERE id='shop'`))[0].k).toMatch(/^logo\/.+\.webp$/);
  const [st] = await q<{ s: string; t: string; n: string }>(`SELECT "stampKey" s, "signerTitle" t, "signerName" n FROM "ShopSetting" WHERE id='shop'`);
  expect(st.s).toMatch(/^logo\/.+\.webp$/);
  expect(st.n).toBe(`นายทดสอบ ลงนาม ${TAG}`);

  // ใบเสนอราคา: ลูกค้าใหม่ + รายการจำนวน 2 (ไม่มีส่วนลด) → ฉบับร่างยังไม่มีลายเซ็นในตัวอย่าง
  await page.goto("/admin/docs/QUOTATION/new/edit");
  await page.getByRole("button", { name: "+ ลูกค้าใหม่" }).click();
  await page.fill("#qcName" + V, `ลูกค้าทดสอบพิมพ์ ${TAG}`);
  await page.getByRole("button", { name: "บันทึกลูกค้าและเลือก" }).click();
  await expect(page.locator(".de-cust" + V)).toBeVisible();
  const l1 = page.locator(".de-line" + V).first();
  await l1.locator(".ac-wrap input").fill(`งานติดตั้งทดสอบ ${TAG}`);
  await l1.locator(".ln-nums input").nth(0).fill("2");
  await l1.locator(".ln-nums input").nth(2).fill("1500");
  await page.getByRole("button", { name: "30 วัน" }).click();
  await expect(page.locator(".de-pv .sheet" + V).first()).toBeVisible();
  await expect(page.locator(".de-pv .sg-sig")).toHaveCount(0); // ฉบับร่าง: ไม่พิมพ์ลายเซ็น
  await expect(page.locator(".de-pv .sg-name").first()).toContainText(`( นายทดสอบ ลงนาม ${TAG} )`);
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/QUOTATION\/[^/?]+\?issued=1/);
  qtId = page.url().split("/").pop()!.split("?")[0];

  await page.goto(`/admin/print/doc/${qtId}`);
  const sheet = page.locator(".pp-sheets .sheet").first();
  await expect(sheet).toBeVisible();
  // ลายเซ็น + ตรา + ชื่อ/ตำแหน่ง
  await expect(sheet.locator(".sg-sig")).toHaveCount(1);
  await expect(sheet.locator(".sg-stamp")).toHaveCount(1);
  expect(await sheet.locator(".sg-sig").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await expect(sheet.locator(".sg-name")).toHaveText(`( นายทดสอบ ลงนาม ${TAG} )`);
  await expect(sheet.locator(".sg-title")).toHaveText("ผู้จัดการฝ่ายขาย");
  // กล่องข้อมูล
  await expect(sheet.locator(".sh-info")).toContainText("ยืนราคา30 วัน");
  await expect(sheet.locator(".sh-info")).toContainText(`ผู้ติดต่อนายทดสอบ ลงนาม ${TAG}`);
  // ไม่มีแถวส่วนลด · จำนวน "2"
  await expect(sheet.locator(".sh-tot")).not.toContainText("ส่วนลด");
  await expect(sheet.locator(".sh-tbl tbody tr").first().locator("td").nth(5)).toHaveText("2");
  // บัญชีธนาคาร + QR ออนไลน์ → ลิงก์เปิดได้จริง
  await expect(sheet.locator(".sh-qpay")).toContainText("ช่องทางชำระเงิน");
  await expect(sheet.locator(".sh-oqr img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  const [tok] = await q<{ t: string | null }>(`SELECT "publicToken" t FROM "SalesDocument" WHERE id=$1`, [qtId]);
  expect(tok.t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  const pub = await request.get(`/track/doc/${qtId}?t=${tok.t}`);
  expect(pub.status()).toBe(200);
  // หน้าดูเอกสารในหลังบ้านก็มี
  await page.goto(`/admin/docs/QUOTATION/${qtId}`);
  await expect(page.locator(".sheet .sg-sig" + V).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("ปิดบัญชีธนาคาร/QR และลบลายเซ็น/ตรา ในตั้งค่า → หน้าพิมพ์ไม่แสดง", async ({ page }) => {
  await login(page);
  await page.goto("/admin/settings");
  await page.locator('input[name="quotePayInfo"]' + V).uncheck();
  await page.locator('input[name="quoteOnlineQr"]' + V).uncheck();
  await page.locator('input[name="removeSignature"]' + V).check();
  await page.locator('input[name="removeStamp"]' + V).check();
  await page.locator("button[type=submit]:has-text('บันทึกการตั้งค่า')" + V).first().click();
  await expect.poll(async () => (await q<{ k: string | null }>(`SELECT "signatureKey" k FROM "ShopSetting" WHERE id='shop'`))[0].k).toBeNull();
  await page.goto(`/admin/print/doc/${qtId}`);
  const sheet = page.locator(".pp-sheets .sheet").first();
  await expect(sheet).toBeVisible();
  await expect(sheet.locator(".sg-sig, .sg-stamp, .sh-qpay, .sh-oqr")).toHaveCount(0);
  await expect(sheet.locator(".sg-name")).toBeVisible();
});
