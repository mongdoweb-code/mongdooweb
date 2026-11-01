// แปลงใบเสนอราคา → ใบเสร็จรับเงินโดยตรง (ลูกค้าจ่ายเต็มจำนวน): ออกทันที / ฉบับร่าง · กันแปลงซ้ำ · กันยกเลิกใบเสนอราคาที่แปลงแล้ว
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login, todayBkk } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const QA = `e2e-qrc-a-${TAG}`, QB = `e2e-qrc-b-${TAG}`, CUST = `e2e-qrc-c-${TAG}`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
async function quote(id: string, no: string) {
  await q(
    `INSERT INTO "SalesDocument"(id, type, "docNo", status, "issueDate", "validUntil", "customerId", "customerSnapshot", "subtotalSatang", "grandSatang", "paymentMethod", "updatedAt")
     VALUES ($1, 'QUOTATION', $2, 'ISSUED', now() - interval '1 day', now() + interval '20 days', $3, '{"name":"ลูกค้าทดสอบแปลงใบเสร็จ"}', 445000, 445000, 'โอนเงินผ่านธนาคาร', now())`,
    [id, no, CUST],
  );
  await q(`INSERT INTO "SalesDocumentItem"(id, "documentId", "sortOrder", sku, name, unit, "qtyMilli", "priceSatang") VALUES ($1,$2,1,'E2E-QRC','ไฟใต้น้ำทดสอบ','ชิ้น',6000,65000), ($3,$2,2,'Shipping','ค่าส่งสินค้า','กล่อง',1000,55000)`, [`${id}-1`, id, `${id}-2`]);
}

test.beforeAll(async () => {
  await q(`INSERT INTO "Customer" (id, code, kind, name, phone, "updatedAt") VALUES ($1, $2, 'PERSON', 'ลูกค้าทดสอบแปลงใบเสร็จ', '0822222222', now())`, [CUST, `R${TAG.slice(-7)}`]);
  await quote(QA, `QTRC-A-${TAG}`);
  await quote(QB, `QTRC-B-${TAG}`);
});
test.afterAll(async () => {
  await q(`DELETE FROM "SalesDocument" WHERE "sourceId" IN ($1,$2)`, [QA, QB]);
  await q(`DELETE FROM "SalesDocument" WHERE id IN ($1,$2)`, [QA, QB]);
  await q(`DELETE FROM "Customer" WHERE id=$1`, [CUST]);
});

test("ออกใบเสร็จทันที: คัดลอกรายการ/ยอด · ใบเสนอราคาเป็น 'ตอบรับแล้ว' · กันแปลงซ้ำ · กันยกเลิกใบเสนอราคา", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/docs/QUOTATION/${QA}`);
  await page.getByRole("button", { name: "แปลงเป็นใบเสร็จรับเงิน" }).click();
  const form = page.getByRole("form", { name: "แปลงเป็นใบเสร็จรับเงิน" });
  await expect(form.locator("#qrcDate")).toHaveValue(todayBkk());
  await form.locator("#qrcMethod").selectOption("เงินสด");
  await form.locator("#qrcRef").fill("สลิป 0099");
  await form.getByRole("button", { name: "ออกใบเสร็จทันที" }).click();
  await expect(page).toHaveURL(/\/admin\/docs\/RECEIPT\/[^/?]+\?issued=1/);
  const [rc] = await q<{ id: string; docNo: string; status: string; grandSatang: number; paymentMethod: string; note: string; n: number }>(
    `SELECT d.id, d."docNo", d.status, d."grandSatang", d."paymentMethod", d.note, (SELECT count(*)::int FROM "SalesDocumentItem" i WHERE i."documentId"=d.id) n FROM "SalesDocument" d WHERE "sourceId"=$1 AND type='RECEIPT'`,
    [QA],
  );
  expect(rc).toMatchObject({ status: "ISSUED", grandSatang: 445000, paymentMethod: "เงินสด", n: 2 });
  expect(rc.docNo).toBeTruthy();
  expect(rc.note).toContain("สลิป 0099");
  await expect(page.locator(".login-info" + V).first()).toContainText(rc.docNo);
  await expect(page.locator(".sheet .sh-paid" + V).first()).toContainText("ได้รับเงินถูกต้องแล้ว");
  expect((await q<{ s: string }>(`SELECT status s FROM "SalesDocument" WHERE id=$1`, [QA]))[0].s).toBe("ACCEPTED");

  // หน้าใบเสนอราคา: ปุ่มเปลี่ยนเป็น "ดูใบเสร็จ" และไม่มีปุ่มแปลงอีก
  await page.goto(`/admin/docs/QUOTATION/${QA}`);
  await expect(page.getByRole("link", { name: `ดูใบเสร็จรับเงิน ${rc.docNo}` })).toBeVisible();
  await expect(page.getByRole("button", { name: "แปลงเป็นใบเสร็จรับเงิน" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "แปลงเป็นใบแจ้งหนี้" })).toHaveCount(0);

  // ยกเลิกใบเสนอราคาไม่ได้ (ต้องยกเลิกใบเสร็จก่อน)
  await page.getByRole("button", { name: "ยกเลิกใบเสนอราคา" }).click();
  await page.fill("#vReason", "ทดสอบยกเลิก");
  await page.getByRole("button", { name: "ยืนยันยกเลิกใบเสนอราคา" }).click();
  await expect(page.locator(".void-form .login-err" + V)).toContainText(`ใบเสร็จรับเงิน ${rc.docNo}`);
});

test("สร้างฉบับร่าง → เปิดตัวแก้ไขใบเสร็จ · ใบเสนอราคาลิงก์ไปฉบับร่าง", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/docs/QUOTATION/${QB}`);
  await page.getByRole("button", { name: "แปลงเป็นใบเสร็จรับเงิน" }).click();
  const form = page.getByRole("form", { name: "แปลงเป็นใบเสร็จรับเงิน" });
  await form.getByRole("button", { name: "สร้างฉบับร่าง (ตรวจ/แก้ก่อนออก)" }).click();
  await expect(page).toHaveURL(/\/admin\/docs\/RECEIPT\/[^/]+\/edit$/);
  const [rc] = await q<{ status: string; docNo: string | null }>(`SELECT status, "docNo" FROM "SalesDocument" WHERE "sourceId"=$1 AND type='RECEIPT'`, [QB]);
  expect(rc).toEqual({ status: "DRAFT", docNo: null });
  // ใบเสนอราคา: ลิงก์ไปฉบับร่าง
  await page.goto(`/admin/docs/QUOTATION/${QB}`);
  await expect(page.getByRole("link", { name: "ดูใบเสร็จรับเงิน (ฉบับร่าง)" })).toHaveAttribute("href", /\/edit$/);
});
