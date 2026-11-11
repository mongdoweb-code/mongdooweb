// ตัวแก้ไขใบเสนอราคา: หน้าต่างเลือกสินค้า (ค้นหา/หลายรายการ/จำนวน/รวมรายการเดิม) · เตือนสต็อก · ส่วนลด % · ต้นทุน-กำไร (เจ้าของร้าน)
// · ขายต่ำกว่าทุน · ยืนราคาด่วน · เงื่อนไขสำเร็จรูป · ทำสำเนา/แทรกรายการ · แถบยอดรวม · Ctrl+S บันทึกร่าง
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const A = { id: `e2e-qe-a-${TAG}`, sku: `E2E-QE-A-${TAG}`, name: `โคมทดสอบใบเสนอราคา A ${TAG}` };
const B = { id: `e2e-qe-b-${TAG}`, sku: `E2E-QE-B-${TAG}`, name: `โคมทดสอบใบเสนอราคา B ${TAG}` };
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const addDays = (ymd: string, n: number) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);

test.beforeAll(async () => {
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`);
  // A: นับสต็อก 3 ชิ้น ต้นทุน 50 ราคา 100 · B: ไม่นับสต็อก ไม่มีต้นทุน ราคา 200
  await q(`INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "inStock", "trackStock", stock, "costSatang", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,10000,true,true,3,5000,'{}',$5,970000,now())`, [A.id, A.sku, A.id, A.name, cat.id]);
  await q(`INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "inStock", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,20000,true,'{}',$5,970001,now())`, [B.id, B.sku, B.id, B.name, cat.id]);
});
test.afterAll(async () => {
  const docs = await q<{ id: string }>(`SELECT DISTINCT "documentId" id FROM "SalesDocumentItem" WHERE "productId" IN ($1,$2)`, [A.id, B.id]);
  for (const d of docs) await q(`DELETE FROM "SalesDocument" WHERE id=$1 AND status='DRAFT'`, [d.id]);
  await q(`UPDATE "SalesDocumentItem" SET "productId"=NULL WHERE "productId" IN ($1,$2)`, [A.id, B.id]);
  await q(`DELETE FROM "Product" WHERE id IN ($1,$2)`, [A.id, B.id]);
});

test("สร้างใบเสนอราคาด้วยหน้าต่างเลือกสินค้า + ส่วนลด % + กำไร + วันที่ด่วน + เงื่อนไขสำเร็จรูป → Ctrl+S บันทึกร่าง", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/docs/QUOTATION/new/edit");
  // ลูกค้าใหม่จากในหน้า
  await page.getByRole("button", { name: "+ ลูกค้าใหม่" }).click();
  await page.fill("#qcName" + V, `ลูกค้าทดสอบใบเสนอราคา ${TAG}`);
  await page.fill("#qcPhone" + V, "0812345678");
  await page.getByRole("button", { name: "บันทึกลูกค้าและเลือก" }).click();
  await expect(page.locator(".de-cust" + V)).toContainText(`ลูกค้าทดสอบใบเสนอราคา ${TAG}`);

  // หน้าต่างเลือกสินค้า: ค้นหาหลายคำ · ติ๊ก 2 รายการ · A จำนวน 4 (เกินสต็อก 3)
  await page.getByRole("button", { name: "+ เลือกสินค้า", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "เลือกสินค้า" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("searchbox", { name: "ค้นหาสินค้า" }).fill(`ใบเสนอราคา ${TAG}`);
  await expect(dlg.locator(".pp-row")).toHaveCount(2);
  await expect(dlg.locator(".pp-row").first()).toContainText("คงเหลือ 3");
  await dlg.getByRole("checkbox", { name: `เลือก ${A.sku} ${A.name}` }).check();
  await dlg.getByRole("checkbox", { name: `เลือก ${B.sku} ${B.name}` }).check();
  await dlg.getByRole("textbox", { name: `จำนวน ${A.sku}` }).fill("4");
  await expect(dlg).toContainText("เกินสต็อก (3)");
  await expect(dlg.getByRole("button", { name: "เพิ่ม 2 รายการ" })).toBeEnabled();
  await dlg.getByRole("button", { name: "เพิ่ม 2 รายการ" }).click();
  await expect(dlg).toBeHidden();
  const lines = page.locator(".de-line" + V);
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText("เกินสต็อก (คงเหลือ 3)");

  // เลือก A อีก 1 → รวมกับบรรทัดเดิม (จำนวน 5) ไม่เพิ่มบรรทัด · ป้าย "มีในเอกสารแล้ว"
  await page.getByRole("button", { name: "+ เลือกสินค้า", exact: true }).click();
  await dlg.getByRole("searchbox", { name: "ค้นหาสินค้า" }).fill(A.sku);
  await expect(dlg.locator(".pp-row").first()).toContainText("มีในเอกสารแล้ว ×4");
  await dlg.locator(".pp-row").first().getByRole("checkbox").check();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0).locator(".ln-nums input").nth(0)).toHaveValue("5");

  // ส่วนลด 10% ที่ B (200 → 20) · ส่วนลดท้ายบิล 5% ของ 680 = 34
  await lines.nth(1).locator(".ln-nums input").nth(3).fill("10%");
  await expect(lines.nth(1)).toContainText("ส่วนลด 10% = ฿20.00");
  await page.fill("#billDisc" + V, "5%");
  await expect(page.locator(".de-sum" + V)).toContainText("5% = ฿34.00");
  await expect(page.locator(".de-foot-sum" + V)).toContainText("ยอดสุทธิ ฿646.00");
  // กำไร: รายได้ 646 − ทุน 5×50 = 396 (61.3%)
  const m = page.locator(".de-margin" + V);
  await expect(m).toContainText("฿250.00");
  await expect(m).toContainText("฿396.00");
  await expect(m).toContainText("61.3%");
  await expect(m).toContainText("ยังไม่มีต้นทุน 1 รายการ");
  // ขายต่ำกว่าทุน
  await lines.nth(0).locator(".ln-nums input").nth(2).fill("40");
  await expect(lines.nth(0)).toContainText("ขายต่ำกว่าทุน (ทุน ฿50.00/ชิ้น)");
  await lines.nth(0).locator(".ln-nums input").nth(2).fill("100.00");
  await expect(lines.nth(0)).not.toContainText("ขายต่ำกว่าทุน");
  // ส่วนลด % ผิด
  await page.fill("#billDisc" + V, "150%");
  await expect(page.locator(".de-sum" + V)).toContainText("ส่วนลดไม่ถูกต้อง");
  await page.fill("#billDisc" + V, "5%");

  // ทำสำเนา → 3 บรรทัด → ลบสำเนา · แทรกรายการใต้บรรทัดแรก → ลบ
  await page.getByRole("button", { name: "ทำสำเนารายการที่ 2" }).click();
  await expect(lines).toHaveCount(3);
  await page.getByRole("button", { name: "ลบรายการที่ 3" }).click();
  await page.getByRole("button", { name: "แทรกรายการใหม่ใต้รายการที่ 1" }).click();
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(1).locator(".ac-wrap input")).toHaveValue("");
  await page.getByRole("button", { name: "ลบรายการที่ 2" }).click();
  await expect(lines).toHaveCount(2);

  // ยืนราคาด่วน 15 วัน · เงื่อนไขสำเร็จรูป (กดเพิ่ม / กดซ้ำเอาออก)
  const issue = await page.inputValue("#issueDate" + V);
  await page.getByRole("button", { name: "15 วัน" }).click();
  await expect(page.locator("#validUntil" + V)).toHaveValue(addDays(issue, 15));
  await expect(page.getByRole("button", { name: "15 วัน" })).toHaveAttribute("aria-pressed", "true");
  const snip = page.getByRole("button", { name: /ชำระเต็มจำนวนก่อนจัดส่ง/ });
  await snip.click();
  await expect(page.locator("#terms" + V)).toHaveValue(/- ชำระเต็มจำนวนก่อนจัดส่ง/);
  await expect(snip).toHaveAttribute("aria-pressed", "true");
  await snip.click();
  await expect(page.locator("#terms" + V)).not.toHaveValue(/ชำระเต็มจำนวนก่อนจัดส่ง/);
  await snip.click();

  // Ctrl+S = บันทึกฉบับร่าง → ฐานข้อมูลเก็บส่วนลดเป็นบาท
  await page.locator("#note" + V).click();
  await page.keyboard.press("ControlOrMeta+s");
  await page.waitForURL(/\/admin\/docs\/QUOTATION\/[^/?]+\?saved=1/);
  const id = page.url().split("/").pop()!.split("?")[0];
  const [doc] = await q<{ d: number; g: number; v: string; t: string }>(`SELECT "discountSatang" d, "grandSatang" g, to_char(("validUntil" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') v, "paymentTerms" t FROM "SalesDocument" WHERE id=$1`, [id]);
  expect(doc.d).toBe(3400);
  expect(doc.g).toBe(64600);
  expect(doc.v).toBe(addDays(issue, 15));
  expect(doc.t).toContain("- ชำระเต็มจำนวนก่อนจัดส่ง");
  const its = await q<{ q: number; p: number; d: number }>(`SELECT "qtyMilli" q, "priceSatang" p, "discountSatang" d FROM "SalesDocumentItem" WHERE "documentId"=$1 ORDER BY "sortOrder"`, [id]);
  expect(its).toEqual([{ q: 5000, p: 10000, d: 0 }, { q: 1000, p: 20000, d: 2000 }]);
  expect(errors).toEqual([]);
});

test("มือถือ: หน้าต่างเลือกสินค้าเต็มจอ ใช้ได้ ไม่ล้น", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/admin/docs/QUOTATION/new/edit");
  await page.getByRole("button", { name: "+ เลือกสินค้า", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "เลือกสินค้า" });
  await dlg.getByRole("searchbox", { name: "ค้นหาสินค้า" }).fill(B.sku);
  await dlg.getByRole("checkbox", { name: `เลือก ${B.sku} ${B.name}` }).check();
  const box = (await dlg.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  await dlg.getByRole("button", { name: "เพิ่ม 1 รายการ" }).click();
  await expect(page.locator(".de-line" + V)).toHaveCount(1);
  await expect(page.locator(".de-line" + V).first().locator(".ac-wrap input")).toHaveValue(B.name);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
});
