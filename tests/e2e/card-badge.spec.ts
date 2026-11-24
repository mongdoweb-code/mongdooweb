// ป้ายบนการ์ดสินค้า: ตั้งค่าร้านเลือกแบบ A/B/C → หน้าร้านเปลี่ยนรูปทรงป้ายทันที (ส้มโปร่งแสง · ลดราคาคงสีแดง)
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
let old = "A";
test.beforeAll(async () => { old = (await q<{ s: string }>(`SELECT "cardBadgeStyle" s FROM "ShopSetting" WHERE id='shop'`))[0]?.s ?? "A"; });
test.afterAll(async () => { await q(`UPDATE "ShopSetting" SET "cardBadgeStyle"=$1 WHERE id='shop'`, [old]); });

test("ตั้งค่าร้าน → แบบ A/B/C → หน้าร้าน", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1300, height: 900 });
  await login(page);
  const shop = await (await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1300, height: 900 } })).newPage();
  const expectRadius: Record<string, (r: string) => boolean> = { A: (r) => parseFloat(r) > 50, B: (r) => r === "4px", C: (r) => r.startsWith("0px 0px 8px") };
  for (const k of ["B", "C", "A"]) {
    await page.goto("/admin/settings#cardBadge");
    await page.locator(`#cardBadge input[name=cardBadgeStyle][value=${k}]` + V).check({ force: true });
    await page.locator('button[type=submit]:has-text("บันทึก")' + V).first().click();
    await expect.poll(async () => (await q<{ s: string }>(`SELECT "cardBadgeStyle" s FROM "ShopSetting" WHERE id='shop'`))[0].s).toBe(k);
    await shop.goto("/products");
    await expect(shop.locator("html")).toHaveAttribute("data-badge", k.toLowerCase());
    const badge = shop.locator(".prod-card .prod-badge").first();
    if (await badge.count()) {
      const [radius, size] = await badge.evaluate((e) => [getComputedStyle(e).borderRadius, getComputedStyle(e).fontSize]);
      const info = await badge.evaluate((e) => [...document.querySelectorAll("[data-badge]")].map((x) => x.getAttribute("data-badge")).join(",") + " / own=" + e.closest("[data-badge]")?.getAttribute("data-badge"));
      expect(expectRadius[k](radius), `${k}: ${radius} ${info}`).toBe(true);
      expect(parseFloat(size)).toBeLessThanOrEqual(10.5);
      // สีพื้น: ส้มโปร่งแสง (ป้ายทั่วไป) หรือแดงโปร่งแสง (ลดราคา) — ไม่ใช่ส้มทึบแบบเดิม
      const bg = await badge.evaluate((e) => getComputedStyle(e).backgroundColor);
      expect(bg, bg).toMatch(/^rgba\((242, 107, 56, 0\.8|192, 57, 43, 0\.88)\)$/);
    }
  }
  await shop.context().close();
});
