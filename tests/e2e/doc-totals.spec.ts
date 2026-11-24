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

test("ใบแจ้งหนี้: ชำระแล้ว / ค้างชำระ · สถานะงาน 'เสร็จสิ้น' เปลี่ยนเป็นสีคราม · หลายหน้ามีแถวรวมหน้านี้", async ({ page }) => {
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
  await expect(card).toHaveClass(/dsum-indigo/);
  await expect(card.locator(".dsum-chips")).toHaveText("เสร็จสิ้น");
  await expect(card.locator(".dsum-amt")).toHaveText(baht(n(done.s)));
});

// วันนี้ตามเวลาไทย
const todayBkk = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const pctText = (cur: number, prev: number, label: string) =>
  prev === 0 ? (cur === 0 ? `เท่ากับ${label}` : `${cur > 0 ? "▲" : "▼"} ${label}ไม่มียอด`) : (() => { const p = Math.round(((cur - prev) / Math.abs(prev)) * 100); return p === 0 ? `เท่ากับ${label}` : `${p > 0 ? "▲" : "▼"} ${Math.abs(p)}% จาก${label}`; })();

test("ปุ่มช่วงเวลาด่วน (เอกสารขาย): เดือนนี้ → ใส่วันที่ · ยอดตรงฐานข้อมูล · ลูกศรเทียบเดือนก่อน · ทั้งหมด = ล้างช่วง", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/docs/INVOICE?void=hide");
  await page.locator('.rgq-bar [data-range="month"]' + V).click();
  const t = todayBkk(), m0 = `${t.slice(0, 8)}01`;
  await expect(page).toHaveURL(new RegExp(`from=${m0}&to=${t}`));
  await expect(page.locator('.rgq-bar [data-range="month"]' + V)).toHaveAttribute("aria-current", "true");
  const sumIn = async (from: string, to: string) =>
    n((await q<{ s: string }>(`SELECT coalesce(sum("grandSatang"),0) s FROM "SalesDocument" WHERE type='INVOICE' AND status <> 'VOID'
      AND coalesce("issueDate", "createdAt") >= ($1::date::timestamp - interval '7 hours') AND coalesce("issueDate", "createdAt") < ($2::date::timestamp + interval '17 hours')`, [from, to]))[0].s);
  const cur = await sumIn(m0, t);
  const d = new Date(`${m0}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1);
  const pm = d.toISOString().slice(0, 10);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  const pt = `${pm.slice(0, 8)}${String(Math.min(Number(t.slice(8)), lastDay)).padStart(2, "0")}`;
  const prev = await sumIn(pm, pt);
  const card = page.locator("[data-doc-sum]" + V);
  await expect(card.locator(".dsum-chips")).toContainText("เดือนนี้");
  await expect(card.locator(".dsum-amt")).toHaveText(baht(cur));
  await expect(card.locator(".dsum-cmp")).toHaveText(pctText(cur, prev, "เดือนก่อน"));
  await page.locator('.rgq-bar [data-range="all"]' + V).click();
  await expect(page).not.toHaveURL(/from=/);
  await expect(card.locator(".dsum-cmp")).toHaveCount(0);
});

test("หน้าคำสั่งซื้อ: การ์ด + แถวรวม (ไม่นับที่ยกเลิก) · ช่วงเวลาด่วน · CSV มีหัวตัวกรองและแถวยอดรวม", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const [all] = await q<{ c: string; s: string; x: string }>(`SELECT count(*) FILTER (WHERE status <> 'CANCELLED') c, coalesce(sum("totalSatang") FILTER (WHERE status <> 'CANCELLED'),0) s, count(*) FILTER (WHERE status = 'CANCELLED') x FROM "Order"`);
  await page.goto("/admin?tab=ALL");
  const card = page.locator("[data-doc-sum]" + V);
  await expect(card).toHaveClass(/dsum-violet/);
  const thb = (s: number) => "฿" + (s / 100).toLocaleString("th-TH", { minimumFractionDigits: s % 100 ? 2 : 0, maximumFractionDigits: 2 });
  await expect(card.locator(".dsum-amt")).toHaveText(thb(n(all.s)));
  await expect(card).toContainText(`${n(all.c).toLocaleString("th-TH")} คำสั่งซื้อ`);
  if (n(all.x)) await expect(card).toContainText(`ไม่รวมที่ยกเลิก ${n(all.x).toLocaleString("th-TH")} รายการ`);
  if (n(all.c) + n(all.x) > 0) await expect(page.locator("[data-doc-sum-row] .dsum-row-amt" + V)).toHaveText(thb(n(all.s)));

  await page.locator('.rgq-bar [data-range="today"]' + V).click();
  await expect(page).toHaveURL(/range=today/);
  await expect(card.locator(".dsum-chips")).toContainText("วันนี้");
  await expect(card.locator(".dsum-cmp")).toContainText("เมื่อวาน");
  await page.locator('.rgq-bar [data-range="custom"]' + V).click();
  await expect(page.locator("#dFrom" + V)).toBeVisible();

  const csv = await (await page.request.get("/admin/orders.csv?tab=ALL")).text();
  const lines = csv.replace(/^﻿/, "").split("\r\n");
  expect(lines[0]).toContain("คำสั่งซื้อหน้าเว็บ");
  expect(lines[1]).toContain("ตัวกรอง: ทั้งหมด");
  expect(lines[2]).toContain('"เลขที่"');
  expect(lines.at(-2)).toContain(`"ยอดรวม (${n(all.c)} คำสั่งซื้อ)"`);
  expect(lines.at(-2)).toContain(`"${(n(all.s) / 100).toFixed(2)}"`);
  expect(lines.at(-1)).toContain("เฉลี่ยต่อคำสั่งซื้อ");

  const [iv] = await q<{ c: string; s: string }>(`SELECT count(*) c, coalesce(sum("grandSatang"),0) s FROM "SalesDocument" WHERE type='INVOICE' AND status <> 'VOID'`);
  const dcsv = (await (await page.request.get("/admin/docs.csv?type=INVOICE&void=hide")).text()).replace(/^﻿/, "").split("\r\n");
  expect(dcsv[1]).toContain("ไม่รวมใบที่ยกเลิก");
  expect(dcsv.at(-2)).toContain(`"ยอดรวม (${n(iv.c)} ฉบับ)"`);
  expect(dcsv.at(-2)).toContain(`"${baht(n(iv.s)).slice(1)}"`);
});
