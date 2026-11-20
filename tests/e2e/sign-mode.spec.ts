// ช่องลงนามผู้รับเงิน (ใบเสร็จ): เลือก "ลายเซ็นเจ้าของร้าน พร้อมชื่อ" หรือ "เว้นว่างไว้เซ็นภายหลัง" — หน้าพิมพ์ตามที่เลือก
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

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

test("ใบเสร็จ: เว้นว่างช่องผู้รับเงิน ↔ กลับมาใช้ลายเซ็น/ชื่อ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/docs/RECEIPT/new/edit");
  await page.getByRole("button", { name: "+ ลูกค้าใหม่" }).click();
  await page.fill("#qcName" + V, `ลูกค้าช่องลงนาม ${TAG}`);
  await page.getByRole("button", { name: "บันทึกลูกค้าและเลือก" }).click();
  const l1 = page.locator(".de-line" + V).first();
  await l1.locator(".ac-wrap .ln-name").fill(`สินค้าทดสอบ ${TAG}`);
  await l1.locator(".ln-nums input").nth(2).fill("300");
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/RECEIPT\/[^/?]+\?issued=1/);
  const id = page.url().split("/").pop()!.split("?")[0];
  const slot = () => page.locator(".sheet .sh-sign .sg-slot" + V).first();
  await expect(slot()).toContainText("ผู้รับเงิน");
  await expect(slot().locator(".sg-date")).toHaveCount(1);

  // เว้นว่าง → ไม่มีลายเซ็น ชื่อ วันที่
  const form = page.locator("#signForm" + V);
  await form.getByLabel("เว้นว่างไว้ — เซ็นชื่อ + วันที่ภายหลัง").check();
  await form.getByRole("button", { name: "บันทึก" }).click();
  await expect.poll(async () => (await q<{ b: boolean }>(`SELECT "signBlank" b FROM "SalesDocument" WHERE id=$1`, [id]))[0].b).toBe(true);
  await page.goto(`/admin/print/doc/${id}`);
  let first = page.locator(".pp-sheets .sheet .sh-sign .sg-slot").first();
  await expect(first).toContainText("ผู้รับเงิน");
  await expect(first.locator(".sg-sig, .sg-stamp, .sg-name, .sg-date")).toHaveCount(0);
  await expect(first).toContainText("______/______/__________");

  // กลับเป็นลายเซ็น/ชื่อ + วันที่
  await page.goto(`/admin/docs/RECEIPT/${id}`);
  await page.locator("#signForm" + V).getByLabel("ลายเซ็นเจ้าของร้าน พร้อมชื่อและวันที่").check();
  await page.locator("#signForm" + V).getByRole("button", { name: "บันทึก" }).click();
  await expect.poll(async () => (await q<{ b: boolean; i: boolean }>(`SELECT "signBlank" b, "signImage" i FROM "SalesDocument" WHERE id=$1`, [id]))[0]).toEqual({ b: false, i: true });
  await page.goto(`/admin/print/doc/${id}`);
  first = page.locator(".pp-sheets .sheet .sh-sign .sg-slot").first();
  await expect(first.locator(".sg-date")).toHaveCount(1);
});
