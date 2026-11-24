// ยอดรวมตามตัวกรองในหน้ารายการเอกสารขาย: การ์ดมุมขวาบน + แถวรวมท้ายตาราง ตรงกับฐานข้อมูล · เปลี่ยนตามแท็บ/สถานะงาน/คำค้น · ไม่นับใบยกเลิก
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const baht = (s: number) => `฿${(s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n = (s: string | number) => Number(s);

test("ใบเสร็จ: ทั้งหมด (ไม่รวมยกเลิก) · แท็บยกเลิก · ค้นหาเลขที่ → การ์ดและแถวท้ายตารางตรงกับฐานข้อมูล", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const [all] = await q<{ c: string; s: string }>(`SELECT count(*) c, coalesce(sum("grandSatang"),0) s FROM "SalesDocument" WHERE type='RECEIPT' AND status <> 'VOID'`);
  await page.goto("/admin/docs/RECEIPT?void=hide");
  const card = page.locator("[data-doc-sum]" + V), row = page.locator("[data-doc-sum-row]" + V);
  await expect(card.locator(".dsum-amt")).toHaveText(baht(n(all.s)));
  await expect(card).toContainText(`${n(all.c).toLocaleString("th-TH")} ฉบับ`);
  await expect(card.locator(".dsum-chips")).toHaveText("ทั้งหมด");
  if (n(all.c) > 0) await expect(row.locator(".dsum-row-amt")).toHaveText(baht(n(all.s)));

  const [vd] = await q<{ c: string; s: string }>(`SELECT count(*) c, coalesce(sum("grandSatang"),0) s FROM "SalesDocument" WHERE type='RECEIPT' AND status = 'VOID'`);
  await page.goto("/admin/docs/RECEIPT?tab=void");
  await expect(card.locator(".dsum-amt")).toHaveText(baht(n(vd.s)));
  await expect(card).toHaveClass(/dsum-gray/);
  await expect(card).toContainText("ไม่นับเป็นยอดขาย");

  const one = (await q<{ docNo: string; grandSatang: number }>(`SELECT "docNo", "grandSatang" FROM "SalesDocument" WHERE type='RECEIPT' AND status='ISSUED' AND "docNo" IS NOT NULL ORDER BY "issueDate" DESC LIMIT 1`))[0];
  test.skip(!one, "ไม่มีใบเสร็จที่ออกแล้วในฐานข้อมูล");
  await page.goto(`/admin/docs/RECEIPT?q=${one.docNo}`);
  await expect(card.locator(".dsum-amt")).toHaveText(baht(one.grandSatang));
  await expect(card.locator(".dsum-chips")).toContainText(`ค้นหา`);
  await expect(row.locator(".dsum-row-amt")).toHaveText(baht(one.grandSatang));
});

test("ใบแจ้งหนี้: ชำระแล้ว / ค้างชำระ · สถานะงาน 'เสร็จสิ้น' เปลี่ยนเป็นสีเขียว · หลายหน้ามีแถวรวมหน้านี้", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const [iv] = await q<{ c: string; s: string; p: string }>(`SELECT count(*) c, coalesce(sum("grandSatang"),0) s, coalesce(sum("paidSatang"),0) p FROM "SalesDocument" WHERE type='INVOICE' AND status <> 'VOID'`);
  await page.goto("/admin/docs/INVOICE?void=hide&per=10");
  const card = page.locator("[data-doc-sum]" + V);
  await expect(card).toHaveClass(/dsum-violet/);
  await expect(card.locator(".dsum-amt")).toHaveText(baht(n(iv.s)));
  await expect(card.locator(".dsum-stats")).toContainText(`ชำระแล้ว${baht(n(iv.p))}`);
  await expect(card.locator(".dsum-stats")).toContainText(`ค้างชำระ${baht(Math.max(0, n(iv.s) - n(iv.p)))}`);
  if (n(iv.c) > 10) await expect(page.locator(".dsum-page" + V)).toContainText("รวมหน้านี้");

  const [done] = await q<{ s: string }>(`SELECT coalesce(sum("grandSatang"),0) s FROM "SalesDocument" WHERE type='INVOICE' AND status <> 'VOID' AND "workState"='DONE'`);
  await page.goto("/admin/docs/INVOICE?void=hide&work=done");
  await expect(card).toHaveClass(/dsum-green/);
  await expect(card.locator(".dsum-chips")).toHaveText("เสร็จสิ้น");
  await expect(card.locator(".dsum-amt")).toHaveText(baht(n(done.s)));
});
