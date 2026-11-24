// ปักหมุดเอกสารในหน้ารายการ: ใบที่ปักขึ้นบนสุด (แถบส้ม) · ปักหลายใบ = ปักล่าสุดก่อน · เลิกปักแล้วกลับที่เดิม · ใช้ได้ทุกแท็บ/ตัวกรอง
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
let picked: string[] = [];
test.afterAll(async () => {
  if (picked.length) await q(`UPDATE "SalesDocument" SET "pinnedAt" = NULL WHERE "docNo" = ANY($1)`, [picked]);
});

test("ปักหมุดใบเก่า 2 ใบ → อยู่บนสุดตามลำดับที่ปักล่าสุด · ยอดรวมไม่เปลี่ยน · เลิกปักแล้วกลับที่เดิม", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const docs = await q<{ docNo: string }>(`SELECT "docNo" FROM "SalesDocument" WHERE type='QUOTATION' AND status <> 'VOID' AND "docNo" IS NOT NULL AND "pinnedAt" IS NULL ORDER BY "issueDate" ASC, "docNo" ASC LIMIT 2`);
  test.skip(docs.length < 2, "ต้องมีใบเสนอราคาอย่างน้อย 2 ใบ");
  picked = docs.map((d) => d.docNo);
  const [a, b] = picked;
  const rows = page.locator(".doc-tbl tbody tr" + V);
  const row = (no: string) => page.locator(".doc-tbl tbody tr" + V, { hasText: no });
  const amount = async () => page.locator("[data-doc-sum] .dsum-amt" + V).innerText();

  await page.goto(`/admin/docs/QUOTATION?void=hide&q=${a}`);
  const before = await amount();
  await row(a).locator(".pin-btn").click();
  await expect(row(a).locator(".pin-btn")).toHaveAttribute("aria-pressed", "true");
  await expect(row(a)).toHaveClass(/is-pinned/);
  await expect(row(a).locator(".pinned-tag")).toHaveText("★ ปักไว้");
  expect(await amount()).toBe(before);

  await page.goto(`/admin/docs/QUOTATION?void=hide&q=${b}`);
  await row(b).locator(".pin-btn").click();
  await expect(row(b)).toHaveClass(/is-pinned/);

  // รายการทั้งหมด: ปักล่าสุด (b) อยู่แถวแรก แล้ว a
  await page.goto("/admin/docs/QUOTATION?void=hide");
  await expect(rows.nth(0)).toContainText(b);
  await expect(rows.nth(1)).toContainText(a);
  expect((await q<{ n: string }>(`SELECT count(*) n FROM "SalesDocument" WHERE "docNo" = ANY($1) AND "pinnedAt" IS NOT NULL`, [picked]))[0].n).toBe("2");

  // เลิกปัก b → a ขึ้นแถวแรก · b ไม่อยู่บนสุดแล้ว
  await rows.nth(0).locator(".pin-btn").click();
  await expect(rows.nth(0)).toContainText(a);
  await expect(rows.nth(1)).not.toContainText(b);
  await rows.nth(0).locator(".pin-btn").click();
  await expect(page.locator(".doc-tbl tbody tr.is-pinned" + V, { hasText: a })).toHaveCount(0);
  expect((await q<{ n: string }>(`SELECT count(*) n FROM "SalesDocument" WHERE "docNo" = ANY($1) AND "pinnedAt" IS NOT NULL`, [picked]))[0].n).toBe("0");
});

test("สีสถานะ: ป้ายและพื้นแถวตามสถานะเอกสาร · สถานะงานคนละชุดสี · ช่องค้นหา/วันที่/ดูเฉพาะที่ยกเลิก เป็นแคปซูล", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/docs/QUOTATION?void=hide");
  const first = page.locator(".doc-tbl tbody tr[data-st]" + V).first();
  const st = await first.getAttribute("data-st");
  await expect(first).toHaveClass(new RegExp(`ds-${st}`));
  await expect(first.locator(`.dst.ds-${st}`)).toBeVisible();
  // พื้นแถวไม่ใช่สีขาว + แถบสีซ้าย
  const bg = await first.locator("td").nth(1).evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).not.toBe("rgb(255, 255, 255)");
  expect(await first.locator("td").first().evaluate((e) => getComputedStyle(e).boxShadow)).toContain("inset");
  // สีของแต่ละสถานะไม่ซ้ำกัน: รอตอบรับ (เหลือง) ≠ ต้องดำเนินการ (ชมพู) · ตอบรับแล้ว (เขียว) ≠ เสร็จสิ้น (คราม)
  const color = async (sel: string) => page.evaluate((s) => { const el = document.createElement("span"); el.className = s; document.querySelector(".doc-tbl")!.appendChild(el); const c = getComputedStyle(el).backgroundColor; el.remove(); return c; }, sel);
  const [open, todo, acc, done] = await Promise.all([color("dst ds-open"), color("wtag wt-todo"), color("dst ds-accepted"), color("wtag wt-done")]);
  expect(new Set([open, todo, acc, done]).size).toBe(4);
  // แคปซูล
  for (const sel of [".df-search", ".df-dates", ".df-go"]) expect(await page.locator(sel + V).evaluate((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius))).toBeGreaterThan(15);
  await page.goto("/admin/docs/QUOTATION?void=hide");
  const only = page.locator(".void-only" + V);
  if (await only.count()) expect(await only.evaluate((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius))).toBeGreaterThan(10);
  // หัวคอลัมน์ดาว
  await expect(page.locator(".doc-tbl th.c-pin .pin-th svg" + V)).toBeVisible();
});
