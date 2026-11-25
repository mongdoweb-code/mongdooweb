// ช่วงวันที่แบบ A: 2 ช่องแคปซูล "ตั้งแต่วันที่" → "ถึงวันที่" · วันที่แบบไทย วว/ดด/ปปปป + วันในสัปดาห์ · จำนวนวัน
// · เลือกแล้วกรองทันที · วันเริ่มหลังวันสิ้นสุด → ปรับวันสิ้นสุดให้ · × ล้างทีละช่อง · ใช้ทุกหน้าที่มีช่วงวันที่
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

async function era() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return ((await c.query(`SELECT "dateEra" e FROM "ShopSetting" WHERE id='shop'`)).rows[0]?.e ?? "AD") as "AD" | "BE";
  } finally {
    await c.end();
  }
}
const th = (ymd: string, e: "AD" | "BE") => { const [y, m, d] = ymd.split("-"); return `${d}/${m}/${e === "BE" ? Number(y) + 543 : y}`; };

test("เอกสารขาย: เลือกวันแล้วกรองทันที · แสดงวันที่ไทย + จำนวนวัน · ปรับวันสิ้นสุด · ล้างทีละช่อง", async ({ page }) => {
  const e = await era();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/docs/RECEIPT?void=hide");
  const from = page.locator("#dFrom" + V), to = page.locator("#dTo" + V);
  // ช่องค้นหา/ช่องวันที่/ปุ่ม เป็นแคปซูลสูงเท่ากัน
  const box = page.locator('[data-date-box="from"]' + V);
  expect(parseFloat(await box.evaluate((x) => getComputedStyle(x).borderTopLeftRadius))).toBeGreaterThan(20);
  const hs = await page.locator(".doc-filter").evaluate((f) => [".df-search", '[data-date-box="from"]', ".df-go"].map((s) => Math.round(f.querySelector(s)!.getBoundingClientRect().height)));
  expect(new Set(hs).size).toBe(1);

  await expect(async () => { await from.fill("2026-11-10"); await page.waitForURL(/from=2026-11-10/, { timeout: 2000 }); }).toPass({ timeout: 15_000 });
  await expect(page.locator('[data-date-box="from"] [data-date-text]' + V)).toHaveText(th("2026-11-10", e));
  await expect(page.locator('[data-date-box="from"]' + V)).toContainText("อ."); // 10 พ.ย. 2026 = วันอังคาร
  await expect(async () => { await to.fill("2026-11-16"); await page.waitForURL(/to=2026-11-16/, { timeout: 2000 }); }).toPass({ timeout: 15_000 });
  await expect(page.locator("[data-range-days]" + V)).toHaveText("7 วัน");
  // วันเริ่มหลังวันสิ้นสุด → วันสิ้นสุดเลื่อนตาม
  await expect(async () => { await from.fill("2026-11-20"); await page.waitForURL(/from=2026-11-20&to=2026-11-20/, { timeout: 2000 }); }).toPass({ timeout: 15_000 });
  await expect(page.locator("[data-range-days]" + V)).toHaveText("1 วัน");
  // × ล้างวันสิ้นสุด
  await page.getByRole("button", { name: "ล้างถึงวันที่" }).click();
  await page.waitForURL((u) => u.searchParams.get("from") === "2026-11-20" && !u.searchParams.get("to"));
  await expect(page.locator('[data-date-box="to"]' + V)).toContainText("เลือกวันที่");
});

test("หน้าอื่นที่มีช่วงวันที่ใช้ช่องแบบเดียวกัน", async ({ page }) => {
  await login(page);
  for (const [url, id] of [["/admin?range=custom", "dFrom"], ["/admin/log", "lf"], ["/admin/reports", "rFrom"], ["/admin/reports/profit", "pFrom"], ["/admin/stock?tab=moves", "mf"]] as const) {
    await page.goto(url);
    await expect(page.locator(`[data-date-box] #${id}` + V), url).toHaveCount(1);
  }
  // รายงาน: ต้องมีทั้งสองวัน → ไม่มีปุ่ม ×
  await page.goto("/admin/reports");
  await expect(page.locator(".dr-x" + V)).toHaveCount(0);
});
