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
