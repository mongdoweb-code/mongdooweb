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
      expect(bg, bg).toMatch(/^rgba\((168, 60, 18, 0\.85|176, 40, 30, 0\.9)\)$/);
    }
  }
  await shop.context().close();
});

// หลายป้ายต่อสินค้า + การจัดวาง 1/2/3 + ความทึบ (ตั้งค่าร้าน) — สินค้าทดสอบชั่วคราว ลบทิ้งตอนจบ
test("หลายป้าย + การจัดวาง + ความทึบ", async ({ page, browser }) => {
  const id = "e2e-badges-" + Date.now();
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" WHERE "isActive" ORDER BY "sortOrder" LIMIT 1`);
  const [prev] = await q<{ l: string; o: number }>(`SELECT "cardBadgeLayout" l, "cardBadgeOpacity" o FROM "ShopSetting" WHERE id='shop'`);
  await q(
    `INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "categoryId", "sortOrder", badges, badge, "updatedAt")
     VALUES ($1, 'E2E-BADGES', $1, 'ทดสอบหลายป้าย E2E', 10000, $2, 99999, $3::jsonb, '3000K', now())`,
    [id, cat.id, JSON.stringify([{ t: "3000K", c: "orange" }, { t: "12-24V", c: "blue" }, { t: "IP68", c: "green" }])],
  );
  try {
    await page.setViewportSize({ width: 1300, height: 900 });
    await login(page);
    const shop = await (await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1300, height: 900 } })).newPage();
    for (const [layout, op] of [["2", 100], ["3", 70], ["1", 85]] as const) {
      await page.goto("/admin/settings#cardBadge");
      await page.locator(`#cardBadge input[name=cardBadgeLayout][value="${layout}"]` + V).check({ force: true });
      await page.locator("#cardBadgeOpacity" + V).fill(String(op));
      await page.locator('button[type=submit]:has-text("บันทึก")' + V).first().click();
      await expect.poll(async () => (await q<{ l: string; o: number }>(`SELECT "cardBadgeLayout" l, "cardBadgeOpacity" o FROM "ShopSetting" WHERE id='shop'`))[0]).toEqual({ l: layout, o: op });
      await shop.goto("/search?q=E2E-BADGES");
      await expect(shop.locator("html"), `layout ${layout}`).toHaveAttribute("data-badge-layout", layout);
      const box = shop.locator(`.prod-card:has-text("ทดสอบหลายป้าย E2E") .prod-badges`).first();
      await expect(box).toHaveAttribute("data-n", "3");
      await expect(box.locator(".prod-badge")).toHaveText(["3000K", "12-24V", "IP68"]);
      await expect(async () => {
        const [a, b] = await box.locator(".prod-badge").evaluateAll((els) => els.slice(0, 2).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, bg: getComputedStyle(e).backgroundColor }; }));
        if (layout === "1") expect(b.y).toBeGreaterThan(a.y + 5); // เรียงลง
        else expect(Math.abs(b.y - a.y) < 3 || layout === "3").toBe(true);
        if (layout !== "1") expect(b.x).toBeGreaterThan(a.x + 20); // แนวนอน / แยกมุมขวา
        expect(b.bg).toMatch(op === 100 ? /^rgb\(29, 78, 150\)$/ : new RegExp(`^rgba\\(29, 78, 150, 0\\.${String(op).replace(/0$/, "")}\\)$`));
      }).toPass({ timeout: 10_000 });
    }
    await shop.context().close();
  } finally {
    await q(`DELETE FROM "Product" WHERE id=$1`, [id]);
    await q(`UPDATE "ShopSetting" SET "cardBadgeLayout"=$1, "cardBadgeOpacity"=$2 WHERE id='shop'`, [prev?.l ?? "1", prev?.o ?? 85]);
  }
});
