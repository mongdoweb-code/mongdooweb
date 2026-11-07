// แถบเรียงสินค้า (หน้าร้าน + หลังบ้าน): เรียงตาม ▾ · สลับทิศ ↑↓ · จำนวนต่อหน้า · มุมมอง (จำไว้ในคุกกี้)
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
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
const P = ["A", "B"].map((k, i) => ({ id: `e2e-stb-${k}-${TAG}`, sku: `E2E-STB-${k}-${TAG}`, slug: `e2e-stb-${k.toLowerCase()}-${TAG}`, price: (i + 1) * 10000, order: 950000 + i * 10 }));
const priceOf = (page: import("@playwright/test").Page) =>
  page.locator(".prod-price").evaluateAll((els) => els.map((e) => Number((e.childNodes[0]?.textContent ?? "").replace(/[^\d.]/g, "")) || Infinity));

test.beforeAll(async () => {
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`);
  for (const p of P)
    await q(`INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "inStock", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,$5,true,'{}',$6,$7,now())`, [
      p.id, p.sku, p.slug, `สินค้าแถบเรียง ${p.sku}`, p.price, cat.id, p.order,
    ]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "Product" WHERE id = ANY($1)`, [P.map((p) => p.id)]);
});

test("หน้าร้าน: 6 แบบเรียง · ลิงก์เดิม ?sort=price-desc · สอบถามราคาอยู่ท้าย · ต่อหน้า 12/24/36 · มุมมองจำไว้", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  // ลิงก์เดิมที่เคยแชร์ยังใช้ได้: ราคาสูง → ต่ำ
  await page.goto("/products?sort=price-desc");
  await expect(page.locator(".stb-sel .stb-v")).toHaveText("ราคา");
  await expect(page.locator("a.stb-dir")).toHaveAttribute("data-dir", "desc");
  const desc = await priceOf(page);
  const firstAsk = desc.indexOf(Infinity);
  if (firstAsk >= 0) expect(desc.slice(firstAsk).every((x) => x === Infinity)).toBe(true); // สอบถามราคาอยู่ท้ายเสมอ
  const priced = desc.filter((x) => x !== Infinity);
  expect(priced).toEqual([...priced].sort((a, b) => b - a));

  // เมนูเรียงตาม: 6 แบบ · แนะนำ = ปุ่มสลับทิศใช้ไม่ได้
  await page.click(".stb-sel");
  await expect(page.locator(".stb-menu a")).toHaveText([/แนะนำ/, /ชื่อสินค้า/, /ราคา/, /มาใหม่/, /ขายดี/, /คะแนนรีวิว/]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".stb-menu")).toHaveCount(0);
  await page.goto("/products");
  await expect(page.locator(".stb-dir.stb-off")).toHaveCount(1);

  // ต่อหน้า 12
  await page.click('.stb-per a:has-text("12")');
  await page.waitForURL(/per=12/);
  expect(await page.locator(".prod-grid .prod-card").count()).toBeLessThanOrEqual(12);
  await expect(page.locator('.stb-per a[aria-current="true"]')).toHaveText("12");
  // เปลี่ยนหน้าแล้วยังคง 12 ต่อหน้า
  const next = page.locator('.pager-shop a[rel="next"]');
  if (await next.count()) {
    await next.click();
    await page.waitForURL(/page=2/);
    expect(new URL(page.url()).searchParams.get("per")).toBe("12");
  }

  // มุมมองแบบรายการ → เปลี่ยนทันที + จำไว้หลังเปิดใหม่
  await page.goto("/products");
  await page.getByRole("button", { name: "มุมมองแบบรายการ" }).click();
  await expect(page.locator(".prod-grid[data-listing]")).toHaveAttribute("data-view", "list");
  expect((await context.cookies()).find((c) => c.name === "mdw_shop_view")?.value).toBe("list");
  await page.goto("/category/underwater-light");
  await expect(page.locator(".prod-grid[data-listing]")).toHaveAttribute("data-view", "list");
  await expect(page.getByRole("button", { name: "มุมมองแบบรายการ" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "มุมมองการ์ด 3 คอลัมน์" }).click();
  await expect(page.locator(".prod-grid[data-listing]")).toHaveAttribute("data-view", "g3");
  const cols = await page.locator(".prod-grid[data-listing]").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(cols).toBe(3);

  // มือถือ: เหลือ 2 คอลัมน์ / รายการ
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "มุมมองการ์ด 3 คอลัมน์" })).toBeHidden();
  await expect(page.getByRole("button", { name: "มุมมองการ์ด 2 คอลัมน์" })).toBeVisible();
  await expect(page.getByRole("button", { name: "มุมมองแบบรายการ" })).toBeVisible();
  const mcols = await page.locator(".prod-grid[data-listing]").evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
  expect(mcols).toBe(2);
});

test("หลังบ้าน: วันที่เพิ่ม · 20/50/100 · ตาราง ↔ การ์ด (แก้ราคา ปักหมุด ⤒⤓ ในการ์ด · ลากได้เฉพาะตาราง)", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await login(page);
  await page.goto(`/admin/products?q=E2E-STB-`);
  await page.click(".stb-sel");
  await expect(page.locator(".stb-menu a", { hasText: "วันที่เพิ่ม" })).toHaveCount(1);
  await page.click('.stb-menu a:has-text("วันที่เพิ่ม")');
  await page.waitForURL(/sort=created/);
  await expect(page.locator("a.stb-dir")).toHaveAttribute("data-dir", "desc");
  await expect(page.locator(".stb-per a")).toHaveText(["20", "50", "100"]);
  await page.click('.stb-per a:has-text("50")');
  await page.waitForURL(/per=50/);

  // มุมมองการ์ด
  await page.goto(`/admin/products?q=E2E-STB-`);
  await expect(page.locator("[data-drag-handle]" + V).first()).toBeVisible();
  await page.getByRole("button", { name: "มุมมองการ์ด", exact: true }).click();
  await expect(page.locator(".pcards-cards" + V)).toBeVisible();
  await expect(page.locator(".sort-hint" + V)).toContainText("ลากจัดลำดับทีละตำแหน่งทำได้เฉพาะมุมมองตาราง");
  await expect(page.locator("[data-drag-handle]" + V)).toHaveCount(0);
  const card = page.locator(`.pcard[data-id="${P[1].id}"]` + V);
  // แก้ราคาในการ์ด
  await card.getByRole("button", { name: `ราคาขาย ${P[1].sku} (กดเพื่อแก้)` }).click();
  await card.getByRole("textbox", { name: `ราคาขาย ${P[1].sku}` }).fill("333");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await q<{ p: number }>(`SELECT "priceSatang" p FROM "Product" WHERE id=$1`, [P[1].id]))[0].p).toBe(33300);
  // ปักหมุด
  await card.getByRole("button", { name: `ปักหมุด ${P[1].sku}` }).click();
  await expect.poll(async () => (await q<{ x: boolean }>(`SELECT "isPinned" x FROM "Product" WHERE id=$1`, [P[1].id]))[0].x).toBe(true);
  await page.locator(`.pcard[data-id="${P[1].id}"]` + V).getByRole("button", { name: `เลิกปักหมุด ${P[1].sku}` }).click();
  await expect.poll(async () => (await q<{ x: boolean }>(`SELECT "isPinned" x FROM "Product" WHERE id=$1`, [P[1].id]))[0].x).toBe(false);
  // ⤓ ไปล่างสุดของร้าน แล้ว ⤒ กลับบนสุด
  const maxOrder = async () => (await q<{ m: number }>(`SELECT max("sortOrder") m FROM "Product" WHERE "isPinned"=false`))[0].m;
  const minOrder = async () => (await q<{ m: number }>(`SELECT min("sortOrder") m FROM "Product" WHERE "isPinned"=false`))[0].m;
  const orderOf = async () => (await q<{ o: number }>(`SELECT "sortOrder" o FROM "Product" WHERE id=$1`, [P[0].id]))[0].o;
  await page.locator(`.pcard[data-id="${P[0].id}"]` + V).getByRole("button", { name: `ไปล่างสุด ${P[0].sku}` }).click();
  await expect.poll(async () => (await orderOf()) === (await maxOrder())).toBe(true);
  await page.locator(`.pcard[data-id="${P[0].id}"]` + V).getByRole("button", { name: `ไปบนสุด ${P[0].sku}` }).click();
  await expect.poll(async () => (await orderOf()) === (await minOrder())).toBe(true);

  // จำมุมมองไว้ → การ์ดเล็ก → กลับเป็นตาราง
  await page.reload();
  await expect(page.locator(".pcards-cards" + V)).toBeVisible();
  await page.getByRole("button", { name: "มุมมองการ์ดเล็ก" }).click();
  await expect(page.locator(".pcards-small" + V)).toBeVisible();
  await page.getByRole("button", { name: "มุมมองตาราง" }).click();
  await expect(page.locator("table.prod-tbl" + V)).toBeVisible();
  await expect(page.locator("[data-drag-handle]" + V).first()).toBeVisible();
});

test("เมนูบน: หมวดสินค้า → สินค้า → สินค้าขายดี → ช่วยเลือกไฟ · เมนู สินค้า เปิดหน้าสินค้าทั้งหมด", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const labels = (await page.locator("nav.nav > a, nav.nav .t").allTextContents()).map((t) => t.trim());
  const at = (t: string) => labels.indexOf(t);
  expect(at("สินค้า")).toBe(at("หมวดสินค้า") + 1);
  expect(at("ช่วยเลือกไฟ")).toBe(at("สินค้าขายดี") + 1);
  await page.locator("nav.nav > a", { hasText: /^สินค้า$/ }).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole("heading", { name: "สินค้าทั้งหมด", level: 1 })).toBeVisible();
  // มือถือ: ลิ้นชักเมนูมี "สินค้าทั้งหมด"
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator('.dr-other a[href="/products"]')).toHaveCount(1);
});
