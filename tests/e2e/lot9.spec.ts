// รอบ 3 ล็อต 9 — แคตตาล็อก: ตัวเลือกสินค้า (U1/A1), ราคาลดตามเวลา (U3/A3), เปรียบเทียบ (U5), สเปก + ตัวกรอง (U6/A5),
// รายการโปรด (U7), เครื่องคำนวณหม้อแปลง (U8), ราคาขายส่ง (U10/A6), ไฟล์ดาวน์โหลด (U11/A8), แก้หลายรายการ (A12)
// ข้อมูลทดสอบสร้างเองทั้งหมด (SKU E2E-L9-*) ในหมวด underwater-light (มีทั้งฐานข้อมูลใหม่และข้อมูลจริง) + หมวดทดสอบของตัวเอง
// แล้วลบทิ้งเมื่อจบ → ผ่านได้ทั้งฐานข้อมูลที่ seed ใหม่และสำเนาข้อมูลจริง
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import { V, confirmClick, login, trackErrors } from "./helpers";
import { refreshStorefront } from "./storefront-fixtures";

test.describe.configure({ mode: "serial" });

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL?.replace(/\?.*$/, "") });
const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows as T[];
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await q<T>(sql, args))[0];
const rid = () => randomBytes(5).toString("hex");
const CONSENT = JSON.stringify({ v: 1, necessary: true, analytics: false, marketing: false });

const S = {
  v1: "e2e-l9-white-3w",
  v2: "e2e-l9-white-6w",
  v3: "e2e-l9-rgb-3w",
  psu1: "e2e-l9-psu-37w",
  psu2: "e2e-l9-psu-123w",
  n1: "e2e-l9-set-5w",
  n2: "e2e-l9-set-10w",
  exp: "e2e-l9-expiring",
};
const ID: Record<keyof typeof S, string> = {} as Record<keyof typeof S, string>;
let uwCat = "";
let testCat = "";
const TEST_CAT_SLUG = "e2e-lot9";
let groupId = "";

async function cleanup() {
  await q(`DELETE FROM "StockMovement" WHERE "productId" IN (SELECT id FROM "Product" WHERE sku LIKE 'E2E-L9-%')`);
  const groups = await q<{ g: string }>(`SELECT DISTINCT "variantGroupId" g FROM "Product" WHERE sku LIKE 'E2E-L9-%' AND "variantGroupId" IS NOT NULL`);
  await q(`DELETE FROM "Product" WHERE sku LIKE 'E2E-L9-%'`);
  for (const g of groups) await q(`DELETE FROM "VariantGroup" WHERE id = $1`, [g.g]);
  await q(`DELETE FROM "VariantGroup" WHERE name LIKE 'E2E L9%'`);
  await q(`DELETE FROM "SpecAttribute" WHERE code LIKE 'l9%'`);
  await q(`DELETE FROM "SpecAttribute" WHERE "categoryId" IN (SELECT id FROM "Category" WHERE slug = $1)`, [TEST_CAT_SLUG]);
  await q(`DELETE FROM "Category" WHERE slug = $1`, [TEST_CAT_SLUG]);
}

type P = { key: keyof typeof S; sku: string; name: string; price: number; cat: string; extra?: Record<string, unknown> };
async function insertProduct(p: P) {
  const id = `e2e-l9-${rid()}`;
  const cols: Record<string, unknown> = {
    id, sku: p.sku, slug: S[p.key], name: p.name, priceSatang: p.price, categoryId: p.cat, images: [], sortOrder: -50, updatedAt: new Date(),
    description: `<p>${p.name} สำหรับทดสอบระบบ</p>`, ...p.extra,
  };
  const keys = Object.keys(cols);
  await q(`INSERT INTO "Product" (${keys.map((k) => `"${k}"`).join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`, keys.map((k) => cols[k]));
  ID[p.key] = id;
}

const shop = async (page: Page) => {
  await page.addInitScript((c) => {
    try {
      if (!localStorage.getItem("mdw_consent")) localStorage.setItem("mdw_consent", c);
    } catch {}
  }, CONSENT);
};

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  await cleanup();
  uwCat = (await one<{ id: string }>(`SELECT id FROM "Category" WHERE slug = 'underwater-light'`)).id;
  testCat = `e2e-l9-cat-${rid()}`;
  await q(`INSERT INTO "Category" (id, slug, "nameTh", "nameEn", popular, "sortOrder", "isActive", "showOnHome") VALUES ($1, $2, 'หมวดทดสอบล็อต 9', 'Lot 9 test', '{}', 999, true, false)`, [testCat, TEST_CAT_SLUG]);
  // สเปกของหมวดไฟใต้น้ำ (รหัสขึ้นต้น l9 ไม่ชนข้อมูลจริง)
  await q(`INSERT INTO "SpecAttribute" (id, "categoryId", code, label, type, options, filterable, "sortOrder") VALUES ($1, $2, 'l9ip', 'กันน้ำทดสอบ', 'ENUM', '{IP67,IP68}', true, 1)`, [`l9a-${rid()}`, uwCat]);
  await q(`INSERT INTO "SpecAttribute" (id, "categoryId", code, label, unit, type, filterable, "sortOrder") VALUES ($1, $2, 'l9watt', 'วัตต์ทดสอบ', 'W', 'NUMBER', true, 2)`, [`l9b-${rid()}`, uwCat]);
  const now = Date.now();
  await insertProduct({
    key: "v1", sku: "E2E-L9-V1", name: "โคมทดสอบล็อตเก้า แสงขาว 3W DC12V", price: 50000, cat: uwCat,
    extra: {
      attrs: JSON.stringify({ l9ip: "IP68", l9watt: 3 }), tierPrices: JSON.stringify([{ minQty: 10, priceSatang: 40000 }]),
      salePriceSatang: 45000, saleStartsAt: new Date(now - 3600e3), saleEndsAt: new Date(now + 2 * 86400e3),
    },
  });
  await insertProduct({ key: "v2", sku: "E2E-L9-V2", name: "โคมทดสอบล็อตเก้า แสงขาว 6W DC12V", price: 70000, cat: uwCat, extra: { attrs: JSON.stringify({ l9ip: "IP67", l9watt: 6 }) } });
  await insertProduct({ key: "v3", sku: "E2E-L9-V3", name: "โคมทดสอบล็อตเก้า RGB 3W DC12V", price: 80000, cat: uwCat, extra: { attrs: JSON.stringify({ l9ip: "IP68", l9watt: 3 }), inStock: false } });
  await insertProduct({ key: "psu1", sku: "E2E-L9-PSU1", name: "หม้อแปลงทดสอบล็อตเก้า DC12V (37W)", price: 30000, cat: uwCat, extra: { isAccessory: true } });
  await insertProduct({ key: "psu2", sku: "E2E-L9-PSU2", name: "หม้อแปลงทดสอบล็อตเก้า DC12V (123W)", price: 60000, cat: uwCat, extra: { isAccessory: true } });
  await insertProduct({ key: "n1", sku: "E2E-L9-N1", name: "ชุดไฟทดสอบแอลเก้า 5W", price: 50000, cat: testCat });
  await insertProduct({ key: "n2", sku: "E2E-L9-N2", name: "ชุดไฟทดสอบแอลเก้า 10W", price: 90000, cat: testCat });
  await insertProduct({ key: "exp", sku: "E2E-L9-EXP", name: "สินค้าทดสอบล็อตเก้า โปรหมดเวลา", price: 100000, cat: testCat });
  groupId = `e2e-l9-g-${rid()}`;
  await q(`INSERT INTO "VariantGroup" (id, name, "optionNames", "primaryId", "updatedAt") VALUES ($1, 'E2E L9 โคมทดสอบ', '{สี,วัตต์}', $2, now())`, [groupId, ID.v1]);
  for (const [k, o] of [["v1", { สี: "แสงขาว", วัตต์: "3W" }], ["v2", { สี: "แสงขาว", วัตต์: "6W" }], ["v3", { สี: "RGB", วัตต์: "3W" }]] as const)
    await q(`UPDATE "Product" SET "variantGroupId" = $1, "variantOptions" = $2 WHERE id = $3`, [groupId, JSON.stringify(o), ID[k]]);
  await refreshStorefront(browser);
});

test.afterAll(async ({ browser }: { browser: Browser }) => {
  await cleanup();
  await refreshStorefront(browser);
  await db.end();
});

// ---------------------------------------------------------------------------
// หน้าร้าน
// ---------------------------------------------------------------------------

test("U1 ตัวเลือกสินค้า: ปุ่มเลือก, URL ต่อตัวเลือก, ราคา/สต็อกตามตัวเลือก, canonical, ProductGroup JSON-LD, การ์ดเดียวในหมวด", async ({ page }) => {
  const errors = trackErrors(page);
  await shop(page);
  await page.goto(`/product/${S.v1}`);
  const rows = page.locator(".pdp-variants .var-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator("legend")).toContainText("สี: แสงขาว");
  await expect(rows.nth(1).locator("legend")).toContainText("วัตต์: 3W");
  await expect(page.locator(".pdp-variants .var-opt.on")).toHaveCount(2);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/product/${S.v1}$`));
  // JSON-LD: ProductGroup + hasVariant ทั้ง 3 ตัว
  const ld = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => JSON.parse(e.textContent || "{}")));
  const group = ld.find((x) => x["@type"] === "ProductGroup");
  expect(group, "ต้องมี ProductGroup").toBeTruthy();
  expect(group.hasVariant).toHaveLength(3);
  expect(group.variesBy).toContain("https://schema.org/color");
  expect(group.hasVariant.map((v: { sku: string }) => v.sku).sort()).toEqual(["E2E-L9-V1", "E2E-L9-V2", "E2E-L9-V3"]);

  // เปลี่ยนเป็น 6W → URL/ราคาเปลี่ยน, canonical ยังชี้ตัวหลัก
  await page.click('.pdp-variants a.var-opt:has-text("6W")');
  await expect(page).toHaveURL(new RegExp(`/product/${S.v2}$`));
  await expect(page.locator(".pdp-price")).toContainText("฿700");
  await expect(page.locator("h1")).toContainText("6W");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/product/${S.v1}$`));
  // RGB มีเฉพาะ 3W และสินค้าหมด → ปุ่ม RGB พาไปตัวที่มีจริง (ทำเครื่องหมายหมด)
  const rgb = page.locator('.pdp-variants a.var-opt:has-text("RGB")');
  await expect(rgb).toHaveClass(/out/);
  await rgb.click();
  await expect(page).toHaveURL(new RegExp(`/product/${S.v3}$`));
  await expect(page.locator(".pdp-stock.out")).toBeVisible();
  await expect(page.locator(".pdp-add")).toHaveCount(0);
  // RGB + 6W ไม่มี → ปุ่ม 6W ถูกปิด
  await expect(page.locator('.pdp-variants .var-opt.off:has-text("6W")')).toHaveAttribute("aria-disabled", "true");

  // หน้าหมวด: กลุ่มเดียวแสดงการ์ดเดียว (ตัวหลัก) + "มี 3 ตัวเลือก"
  await page.goto("/category/underwater-light");
  await expect(page.locator(`#prod-${S.v1}`)).toBeVisible();
  await expect(page.locator(`#prod-${S.v1} .prod-opts`)).toHaveText("มี 3 ตัวเลือก");
  await expect(page.locator(`#prod-${S.v2}`)).toHaveCount(0);
  await expect(page.locator(`#prod-${S.v3}`)).toHaveCount(0);
  // sitemap มีเฉพาะหน้าหลักของกลุ่ม
  const sm = await (await page.request.get("/sitemap.xml")).text();
  expect(sm).toContain(`/product/${S.v1}<`);
  expect(sm).not.toContain(`/product/${S.v2}<`);
  expect(errors).toEqual([]);
});

test("U3 ราคาลดตามเวลา: ป้าย ลด x%, ราคาเดิมขีดฆ่า, นับถอยหลัง, หมดเวลาแล้วกลับราคาปกติเอง (ทั้งหน้าและที่ server)", async ({ page, browser }) => {
  test.setTimeout(150_000);
  await shop(page);
  await page.goto(`/product/${S.v1}`);
  await expect(page.locator(".pdp-price")).toContainText("฿450");
  await expect(page.locator(".pdp-price s")).toContainText("฿500");
  await expect(page.locator(".pdp-off")).toHaveText("ลด 10%");
  await expect(page.locator(".pdp-main .prod-badge")).toHaveText("ลด 10%");
  await expect(page.locator(".pdp-countdown")).toContainText(/1 วัน \d\d:\d\d:\d\d/);
  // การ์ดในหมวดมีป้ายและราคาขีดฆ่าด้วย
  await page.goto("/category/underwater-light");
  await expect(page.locator(`#prod-${S.v1} .prod-badge`)).toHaveText("ลด 10%");
  await expect(page.locator(`#prod-${S.v1} .prod-price s`)).toContainText("฿500");

  // โปรที่จะหมดใน ~30 วินาที: หน้าเปลี่ยนเป็นราคาปกติเองโดยไม่ต้องโหลดใหม่ และไม่มีใครกดอะไรในหลังบ้าน
  const end = new Date(Date.now() + 35_000);
  await q(`UPDATE "Product" SET "salePriceSatang" = 80000, "saleStartsAt" = NULL, "saleEndsAt" = $1 WHERE id = $2`, [end, ID.exp]);
  await refreshStorefront(browser);
  await page.goto(`/product/${S.exp}`);
  await expect(page.locator(".pdp-price")).toContainText("฿800");
  await expect(page.locator(".pdp-countdown")).toBeVisible();
  const before = await page.request.post("/api/cart/validate", { data: { items: { [S.exp]: 1 } } });
  expect((await before.json()).lines[0].price).toBe(800);
  await page.waitForTimeout(Math.max(0, end.getTime() - Date.now()));
  await expect(page.locator(".pdp-price")).toHaveText("฿1,000", { timeout: 10_000 });
  await expect(page.locator(".pdp-countdown")).toHaveCount(0);
  await expect(page.locator(".pdp-main .prod-badge")).toHaveCount(0);
  // ราคาที่คิดเงินจริงที่ server
  const after = await page.request.post("/api/cart/validate", { data: { items: { [S.exp]: 1 } } });
  expect((await after.json()).lines[0].price).toBe(1000);
  // โหลดหน้าใหม่ (แคชเดิมหรือใหม่) ก็ยังเป็นราคาปกติ
  await page.goto(`/category/${TEST_CAT_SLUG}`);
  await expect(page.locator(`#prod-${S.exp} .prod-price`)).toHaveText("฿1,000");
  await page.goto(`/product/${S.exp}`);
  await expect(page.locator(".pdp-price")).toHaveText("฿1,000");
});

test("U10 ราคาขายส่ง: ตารางบนหน้าสินค้า, ราคาต่อชิ้นในตะกร้าตามจำนวน (ตรงกับ server)", async ({ page }) => {
  await shop(page);
  await page.goto(`/product/${S.v1}`);
  const t = page.locator(".tier-table");
  await expect(t).toContainText("ซื้อ 10 ชิ้นขึ้นไป");
  await expect(t).toContainText("฿400");
  await expect(t.locator("tbody tr").first()).toContainText("฿450");
  await page.fill("#pdpQty", "10");
  await page.locator("#pdpQty").blur();
  await expect(page.locator(".pdp-tier-on")).toContainText("฿400");
  await page.click(".pdp-add");
  await expect(page.locator("#cart.open")).toBeVisible();
  const line = page.locator("#cartBody .ci").filter({ hasText: "แสงขาว 3W" });
  await expect(line.locator(".ci-unit")).toContainText("฿400");
  await expect(line.locator(".ci-unit")).toContainText("ราคาขายส่ง");
  await expect(line.locator(".ci-line")).toHaveText("฿4,000");
  // ลดเหลือ 9 ชิ้น → กลับเป็นราคาลด ฿450
  await line.locator('button[data-d="-1"]').click();
  await expect(line.locator(".ci-line")).toHaveText("฿4,050");
  await expect(page.locator("#cartNotice")).toBeHidden();
  const r = await page.request.post("/api/cart/validate", { data: { items: { [S.v1]: 10 } } });
  expect((await r.json()).lines[0].price).toBe(400);
  // หน้าชำระเงินแสดงยอดตามราคาของ server
  await line.locator('button[data-d="1"]').click();
  await page.goto("/checkout");
  await expect(page.locator("#sumItems")).toContainText("฿4,000");
  await page.evaluate(() => localStorage.removeItem("mdw_cart"));
});

test("U6 สเปกแบบมีโครงสร้าง: ตารางสเปกหน้าสินค้า + ตัวกรองหลายค่า/ช่วงตัวเลขในหน้าหมวด (อยู่ใน URL)", async ({ page }) => {
  await shop(page);
  await page.goto(`/product/${S.v1}`);
  await expect(page.locator('[data-spec-table] tr[data-attr="l9ip"] td')).toHaveText("IP68");
  await expect(page.locator('[data-spec-table] tr[data-attr="l9watt"] td')).toHaveText("3 W");

  await page.goto("/category/underwater-light");
  const ip = page.locator('fieldset[data-spec="l9ip"]');
  await expect(ip.locator("legend")).toHaveText("กันน้ำทดสอบ");
  await ip.locator('a.chip:has-text("IP67")').click();
  await expect(page).toHaveURL(/f_l9ip=IP67/);
  await expect(page.locator(".lst-count")).toContainText("พบ 1 รายการ");
  // กลุ่มตัวเลือก: ตัวที่ตรงตัวกรอง (6W) แสดงแทนตัวหลัก
  await expect(page.locator(`#prod-${S.v2}`)).toBeVisible();
  // เลือกเพิ่ม IP68 = "ค่าใดค่าหนึ่ง" → ยังเป็นการ์ดเดียวของกลุ่ม
  await page.locator('fieldset[data-spec="l9ip"] a.chip:has-text("IP68")').click();
  await expect(page).toHaveURL(/f_l9ip=IP67&f_l9ip=IP68|f_l9ip=IP68&f_l9ip=IP67/);
  await expect(page.locator(".lst-count")).toContainText("พบ 1 รายการ");
  // ช่วงตัวเลข: วัตต์ ≥ 5
  await page.goto("/category/underwater-light");
  const w = page.locator('fieldset[data-spec="l9watt"]');
  await w.locator('input[name="f_l9watt_min"]').fill("5");
  await w.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/f_l9watt_min=5/);
  await expect(page.locator(`#prod-${S.v2}`)).toBeVisible();
  await expect(page.locator(`#prod-${S.v1}`)).toHaveCount(0);
  await expect(page.locator(".lst-active .chip-x")).toContainText("วัตต์ทดสอบ: 5–");
  await page.locator(".lst-clear").click();
  await expect(page).toHaveURL(/\/category\/underwater-light$/);
});

test("U5 เปรียบเทียบสินค้า: เลือกจากการ์ด, แถบด้านล่าง, ตาราง, แสดงเฉพาะที่ต่างกัน, สูงสุด 4, ลิงก์แชร์", async ({ page, browser }) => {
  await shop(page);
  await page.goto("/category/underwater-light");
  await page.locator(`#prod-${S.v1} [data-compare]`).click();
  await page.locator(`#prod-${S.psu1} [data-compare]`).click();
  await expect(page.locator(`#prod-${S.v1} [data-compare]`)).toHaveAttribute("aria-pressed", "true");
  const tray = page.locator("#cmpTray");
  await expect(tray).toBeVisible();
  await expect(tray.locator(".cmp-t")).toContainText("2/4");
  await tray.locator("a.btn").click();
  await expect(page).toHaveURL(new RegExp(`/compare\\?ids=${S.v1},${S.psu1}$`));
  const table = page.locator("#cmpTable");
  await expect(table.locator("thead th")).toHaveCount(2);
  await expect(table.locator('tr[data-row="a:l9ip"] td').first()).toHaveText("IP68");
  await expect(table.locator('tr[data-row="cat"]')).toHaveClass(/same/);
  await expect(table.locator('tr[data-row="sku"]')).toHaveClass(/diff/);
  await page.click('button:has-text("แสดงเฉพาะที่ต่างกัน")');
  await expect(table.locator('tr[data-row="cat"]')).toBeHidden();
  await expect(table.locator('tr[data-row="sku"]')).toBeVisible();
  await expect(page.locator("#cmpTray")).toBeHidden(); // ไม่แสดงแถบซ้ำในหน้าเปรียบเทียบ
  await expect(page.locator("[data-share-copy]")).toBeVisible();
  // เอาออก 1 ชิ้น
  await table.locator(`[data-cmp-remove="${S.psu1}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/compare\\?ids=${S.v1}$`));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mdw_compare") || "[]"))).toEqual([S.v1]);
  // สูงสุด 4 ชิ้น
  // (ตั้งค่าในหน้าอื่น — หน้าเปรียบเทียบเขียนรายการของตัวเองลงเครื่องตอนโหลด)
  await page.goto(`/product/${S.psu2}`);
  await page.evaluate((ids) => localStorage.setItem("mdw_compare", JSON.stringify(ids)), [S.v1, S.v2, S.v3, S.psu1]);
  await page.reload();
  await expect(page.locator("#cmpTray .cmp-t")).toContainText("4/4");
  await page.click(".pdp-tool[data-compare]");
  await expect(page.locator("#toast")).toContainText("สูงสุด 4 ชิ้น");
  await expect(page.locator(".pdp-tool[data-compare]")).toHaveAttribute("aria-pressed", "false");
  // ไม่มี ?ids= → ใช้รายการในเครื่อง
  await page.goto("/compare");
  await expect(page).toHaveURL(/\/compare\?ids=/);
  await expect(page.locator("#cmpTable thead th")).toHaveCount(4);
  // ลิงก์แชร์เปิดในเครื่องอื่น (ไม่มีรายการในเครื่อง) ได้ตารางเดียวกัน
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto(`/compare?ids=${S.v1},${S.v2}`);
  await expect(p2.locator("#cmpTable thead th")).toHaveCount(2);
  await expect(p2.locator('#cmpTable tr[data-row="opt"] td').nth(1)).toHaveText("แสงขาว · 6W");
  await ctx.close();
  await page.evaluate(() => localStorage.removeItem("mdw_compare"));
});

test("U7 รายการโปรด: กดหัวใจ, ไอคอนแถบหัว, หน้า /wishlist, ลิงก์แชร์, ขอใบเสนอราคาพร้อมรายการ", async ({ page, browser }) => {
  const errors = trackErrors(page);
  await shop(page);
  await page.goto(`/product/${S.v1}`);
  await page.click(".pdp-tool[data-wish]");
  await expect(page.locator(".pdp-tool[data-wish]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#wishCount")).toHaveText("1");
  await page.goto("/category/underwater-light");
  await page.locator(`#prod-${S.psu1} [data-wish]`).click();
  await expect(page.locator("#wishCount")).toHaveText("2");
  await page.goto("/wishlist");
  await expect(page.locator("[data-wish-item]")).toHaveCount(2);
  await expect(page.locator(`[data-wish-item="${S.v1}"] .prod-price`)).toContainText("฿450");
  await expect(page.locator("[data-wish-line]")).toHaveAttribute("href", /line\.me/);
  // ขอใบเสนอราคา: เปิด /quote พร้อมรายการและจำนวน
  await page.locator(`[data-wish-item="${S.v1}"] .wl-qty`).fill("5");
  await expect(page.locator("[data-wish-quote]")).toHaveAttribute("href", new RegExp(`items=.*${S.v1}:5`));
  await page.click("[data-wish-quote]");
  await expect(page).toHaveURL(/\/quote\?items=/);
  await expect(page.locator(".q-items")).toContainText("แสงขาว 3W");
  await expect(page.locator(".q-items")).toContainText("× 5");
  await expect(page.locator(".q-items-h")).toContainText("รายการโปรด");
  // เอาออก
  await page.goto("/wishlist");
  await page.locator(`[data-wish-item="${S.psu1}"] .rm`).click();
  await expect(page.locator("[data-wish-item]")).toHaveCount(1);
  await expect(page.locator("#wishCount")).toHaveText("1");
  // ลิงก์แชร์ในเครื่องอื่น → บันทึกเป็นรายการของตัวเอง
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.addInitScript((c) => localStorage.setItem("mdw_consent", c), CONSENT);
  await p2.goto(`/wishlist?ids=${S.v1},${S.v2}`);
  await expect(p2.locator(".wl-shared")).toBeVisible();
  await expect(p2.locator("[data-wish-item]")).toHaveCount(2);
  await p2.click('.wl-shared button:has-text("บันทึกเป็นรายการโปรดของฉัน")');
  await expect(p2.locator(".wl-shared")).toHaveCount(0);
  expect(await p2.evaluate(() => JSON.parse(localStorage.getItem("mdw_wish") || "[]"))).toEqual([S.v1, S.v2]);
  await expect(p2.locator("#wishCount")).toHaveText("2");
  await ctx.close();
  expect(errors).toEqual([]);
});

test("U8 เครื่องคำนวณหม้อแปลง: วัตต์ × จำนวน × 1.2 → หม้อแปลงที่เล็กที่สุดที่พอ + ใส่ตะกร้า, ลิงก์จากหน้าสินค้า", async ({ page }) => {
  await shop(page);
  await page.goto(`/product/${S.v1}`);
  const link = page.locator("[data-psu-link]");
  await expect(link).toContainText("DC12V");
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/tools/psu-calculator\\?light=${S.v1}`));
  await expect(page.locator('[data-psu-row="0"] select')).toHaveValue(S.v1);
  await expect(page.locator('[data-psu-row="0"] input[name="watt0"]')).toHaveValue("3");
  await page.fill('input[name="qty0"]', "10");
  // 3W × 10 × 1.2 = 36W → 37W ตัวเล็กที่สุดที่พอ
  await expect(page.locator("[data-psu-need]")).toHaveAttribute("data-psu-need", "36");
  await expect(page.locator("[data-psu-rec]").first()).toHaveAttribute("data-psu-rec", S.psu1);
  await expect(page.locator(".psu-rec.best .tag")).toHaveText("แนะนำ");
  // เพิ่มอีกแถว (ใส่วัตต์เอง) 10W × 5 → (30 + 50) × 1.2 = 96W → 37W ไม่พอแล้ว
  await page.click('button:has-text("เพิ่มโคมอีกรุ่น")');
  await page.fill('input[name="watt1"]', "10");
  await page.fill('input[name="qty1"]', "5");
  await expect(page.locator("[data-psu-need]")).toHaveAttribute("data-psu-need", "96");
  const recs = await page.locator("[data-psu-rec]").evaluateAll((els) => els.map((e) => e.getAttribute("data-psu-rec")));
  expect(recs).not.toContain(S.psu1);
  expect(recs).toContain(S.psu2);
  // มากเกินตัวเดียว → แบ่งวงจร
  await page.fill('input[name="qty0"]', "999");
  await expect(page.locator(".psu-empty")).toContainText("แบ่งโคมเป็น");
  await page.fill('input[name="qty0"]', "10");
  await page.click('[data-psu-row="1"] button.del');
  await page.locator(`[data-psu-rec="${S.psu1}"] .add-btn`).click();
  await expect(page.locator("#cart.open")).toBeVisible();
  await expect(page.locator("#cartBody")).toContainText("หม้อแปลงทดสอบล็อตเก้า DC12V (37W)");
  await page.evaluate(() => localStorage.removeItem("mdw_cart"));
});

// ---------------------------------------------------------------------------
// หลังบ้าน
// ---------------------------------------------------------------------------

async function saveProductForm(page: Page) {
  await page.click('button[type=submit]:has-text("บันทึกสินค้า")' + V);
}

test("A8 + U11 ไฟล์ดาวน์โหลด PDF: อัปโหลด (ตรวจไฟล์จริง), แสดงหน้าสินค้า, ชื่อไฟล์ภาษาไทยตอนดาวน์โหลด, ลบ", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/products/${ID.v1}`);
  // ไฟล์ปลอม (นามสกุล .pdf แต่ไม่ใช่ PDF) ถูกปฏิเสธ
  await page.setInputFiles("#dlFile", { name: "fake.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf at all") });
  await page.click("#dlUpload");
  await expect(page.locator("#downloadsBox .login-err")).toContainText("รองรับเฉพาะไฟล์ PDF");
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
  await page.setInputFiles("#dlFile", { name: "spec-sheet.pdf", mimeType: "application/pdf", buffer: pdf });
  await page.fill("#dlName", "สเปกชีต โคมทดสอบ");
  await page.click("#dlUpload");
  await expect(page.locator("#downloadsBox .login-info")).toContainText("อัปโหลด");
  await expect(page.locator("#downloadsBox tbody tr")).toHaveCount(1);

  await page.goto(`/product/${S.v1}`);
  const a = page.locator(".pdp-dl a");
  await expect(a).toContainText("สเปกชีต โคมทดสอบ");
  await expect(a).toContainText("PDF");
  const href = (await a.getAttribute("href"))!;
  const res = await page.request.get(href);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/pdf");
  expect(res.headers()["content-disposition"]).toContain(`filename*=UTF-8''${encodeURIComponent("สเปกชีต โคมทดสอบ.pdf")}`);
  expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
  // ไฟล์ที่ไม่ใช่ของสินค้านี้/รหัสผิด = 404
  expect((await page.request.get(`/download/${S.v2}/${href.split("/").pop()}`)).status()).toBe(404);

  await page.goto(`/admin/products/${ID.v1}`);
  await confirmClick(page, '#downloadsBox button:has-text("ลบ")', "ยืนยันลบ");
  await expect(page.locator("#downloadsBox tbody tr")).toHaveCount(0);
  expect((await page.request.get(href)).status()).toBe(404);
  const log = await one<{ note: string }>(`SELECT note FROM "AdminLog" WHERE note LIKE '%ไฟล์ดาวน์โหลด%E2E-L9-V1%' ORDER BY "createdAt" DESC LIMIT 1`);
  expect(log.note).toContain("ลบไฟล์ดาวน์โหลด");
});

test("A5 สเปกต่อหมวด: ชุดมาตรฐาน, เพิ่ม/แก้/ลบ, กรอกในหน้าสินค้า (ตรวจค่า), ตารางสเปก + ตัวกรองหน้าหมวด", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/specs?cat=${testCat}`);
  await page.click("#presetBtn");
  await expect(page.locator('form:has(#presetBtn) .login-info')).toContainText("เพิ่มแล้ว 6 สเปก");
  await expect(page.locator('[data-spec-form="watt"]')).toBeVisible();
  // เพิ่มสเปกเอง (ตัวเลือก)
  const add = page.locator('[data-spec-form="new"]');
  await add.locator('input[name="label"]').fill("วัสดุโคมทดสอบ");
  await add.locator('input[name="code"]').fill("l9mat");
  await add.locator('select[name="type"]').selectOption("ENUM");
  await add.locator('textarea[name="options"]').fill("แก้ว\nโลหะ");
  await add.locator('button[type="submit"]').click();
  await expect(page.locator('[data-spec-form="l9mat"]')).toBeVisible();
  // รหัสซ้ำ
  const add2 = page.locator('[data-spec-form="new"]');
  await add2.locator('input[name="label"]').fill("ซ้ำ");
  await add2.locator('input[name="code"]').fill("l9mat");
  await add2.locator('textarea[name="options"]').fill("x");
  await add2.locator('button[type="submit"]').click();
  await expect(add2.locator(".login-err")).toContainText("มีอยู่แล้ว");

  // กรอกค่าในหน้าแก้ไขสินค้า: ตัวเลขผิด → ไม่บันทึก
  await page.goto(`/admin/products/${ID.n1}`);
  await page.selectOption("#attr_l9mat", "แก้ว");
  await page.fill("#attr_watt", "abc");
  await saveProductForm(page);
  await expect(page.locator(".login-err[role=alert]" + V).first()).toContainText("ค่าสเปกไม่ถูกต้อง");
  await page.fill("#attr_watt", "5");
  await page.selectOption("#attr_ip", "IP68");
  await saveProductForm(page);
  await expect(page.locator(".login-info[role=status]" + V).first()).toContainText("บันทึกแล้ว");
  const p = await one<{ attrs: Record<string, unknown> }>(`SELECT attrs FROM "Product" WHERE id = $1`, [ID.n1]);
  expect(p.attrs).toEqual({ l9mat: "แก้ว", watt: 5, ip: "IP68" });

  await page.goto(`/product/${S.n1}`);
  await expect(page.locator('[data-spec-table] tr[data-attr="watt"] td')).toHaveText("5 W");
  await expect(page.locator('[data-spec-table] tr[data-attr="l9mat"] td')).toHaveText("แก้ว");
  await page.goto(`/category/${TEST_CAT_SLUG}`);
  await expect(page.locator('fieldset[data-spec="l9mat"] a.chip')).toContainText("แก้ว");
  await page.locator('fieldset[data-spec="ip"] a.chip:has-text("IP68")').click();
  await expect(page.locator(".lst-count")).toContainText("พบ 1 รายการ");
  await expect(page.locator(`#prod-${S.n1}`)).toBeVisible();

  // แก้ชื่อ + ลบสเปก (ค่าในสินค้าถูกลบด้วย)
  await page.goto(`/admin/specs?cat=${testCat}`);
  const f = page.locator('[data-spec-form="l9mat"]');
  await f.locator('input[name="label"]').fill("วัสดุตัวโคม");
  await f.locator('button[type="submit"]').click();
  await expect(f.locator(".login-info")).toContainText("บันทึกแล้ว");
  const wrap = page.locator('div:has(> [data-spec-form="l9mat"])');
  await confirmClick(page, `${'div:has(> [data-spec-form="l9mat"])'} button:has-text("ลบสเปกนี้")`, "ยืนยันลบ");
  await expect(wrap).toHaveCount(0);
  const p2 = await one<{ attrs: Record<string, unknown> }>(`SELECT attrs FROM "Product" WHERE id = $1`, [ID.n1]);
  expect(p2.attrs).toEqual({ watt: 5, ip: "IP68" });
});

test("A6 ราคาขายส่ง: ตั้งในหน้าแก้ไขสินค้า (ตรวจค่า) → ตารางบนหน้าสินค้า", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/products/${ID.n1}`);
  await page.fill('#tierBox input[aria-label="ขั้นที่ 1: จำนวนขั้นต่ำ"]', "5");
  await page.fill('#tierBox input[aria-label="ขั้นที่ 1: ราคาต่อชิ้น (บาท)"]', "600");
  await saveProductForm(page);
  await expect(page.locator(".login-err[role=alert]" + V).first()).toContainText("ต้องน้อยกว่าราคาขายปกติ");
  await page.fill('#tierBox input[aria-label="ขั้นที่ 1: ราคาต่อชิ้น (บาท)"]', "450");
  await page.click('#tierBox button:has-text("เพิ่มขั้นราคา")');
  await page.fill('#tierBox input[aria-label="ขั้นที่ 2: จำนวนขั้นต่ำ"]', "20");
  await page.fill('#tierBox input[aria-label="ขั้นที่ 2: ราคาต่อชิ้น (บาท)"]', "460");
  await saveProductForm(page);
  await expect(page.locator(".login-err[role=alert]" + V).first()).toContainText("ต้องถูกกว่าขั้นก่อนหน้า");
  await page.fill('#tierBox input[aria-label="ขั้นที่ 2: ราคาต่อชิ้น (บาท)"]', "400");
  await saveProductForm(page);
  await expect(page.locator(".login-info[role=status]" + V).first()).toContainText("บันทึกแล้ว");
  const p = await one<{ tierPrices: unknown }>(`SELECT "tierPrices" FROM "Product" WHERE id = $1`, [ID.n1]);
  expect(p.tierPrices).toEqual([{ minQty: 5, priceSatang: 45000 }, { minQty: 20, priceSatang: 40000 }]);
  await page.goto(`/product/${S.n1}`);
  await expect(page.locator(".tier-table tbody tr")).toHaveCount(3);
  await expect(page.locator(".tier-table")).toContainText("ซื้อ 20 ชิ้นขึ้นไป");
  await expect(page.locator(".tier-table tbody tr").first()).toContainText("1–4");
});

test("A3 ลดราคาตามเวลา: รายสินค้า (ตรวจค่า) และทั้งหมวด + ยกเลิก — หน้าร้านเปลี่ยนตาม", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/products/${ID.n1}`);
  await page.fill("#salePrice", "600");
  await saveProductForm(page);
  await expect(page.locator(".login-err[role=alert]" + V).first()).toContainText("ราคาลดต้องน้อยกว่าราคาขาย");
  await page.fill("#salePct", "20");
  await page.click('#saleBox button:has-text("คำนวณ")');
  await expect(page.locator("#salePrice")).toHaveValue("400");
  const tomorrow = new Date(Date.now() + 7 * 3600e3 + 3 * 86400e3).toISOString().slice(0, 16);
  await page.fill("#saleEndsAt", tomorrow);
  await saveProductForm(page);
  await expect(page.locator(".login-info[role=status]" + V).first()).toContainText("บันทึกแล้ว");
  await page.goto(`/product/${S.n1}`);
  await expect(page.locator(".pdp-price")).toContainText("฿400");
  await expect(page.locator(".pdp-off")).toHaveText("ลด 20%");
  await expect(page.locator(".pdp-countdown")).toContainText("2 วัน");

  // ทั้งหมวด 10%
  await page.goto("/admin/products/sale");
  await page.selectOption("#csCat", testCat);
  await page.fill("#csPct", "10");
  await page.fill("#csEnd", tomorrow);
  await page.click('#catSaleForm button:has-text("ตั้งลดราคาทั้งหมวด")');
  await expect(page.locator("#catSaleForm .login-info")).toContainText("3 รายการ");
  await expect(page.locator('#saleTable tr[data-sku="E2E-L9-N2"]')).toContainText("ลดอยู่");
  await expect(page.locator('#saleTable tr[data-sku="E2E-L9-N2"]')).toContainText("810");
  await page.goto(`/category/${TEST_CAT_SLUG}`);
  await expect(page.locator(`#prod-${S.n2} .prod-badge`)).toHaveText("ลด 10%");
  await expect(page.locator(`#prod-${S.n2} .prod-price`)).toContainText("฿810");
  // ยกเลิกทั้งหมวด
  await page.goto("/admin/products/sale");
  await page.selectOption("#csCat", testCat);
  await page.click('#catSaleForm button:has-text("ยกเลิกลดราคาทั้งหมวด")');
  await expect(page.locator("#catSaleForm .login-info")).toContainText("ยกเลิกลดราคา");
  const left = await one<{ n: number }>(`SELECT count(*)::int n FROM "Product" WHERE "categoryId" = $1 AND "salePriceSatang" IS NOT NULL`, [testCat]);
  expect(left.n).toBe(0);
  await page.goto(`/product/${S.n2}`);
  await expect(page.locator(".pdp-price")).toHaveText("฿900");
});

test("A12 แก้หลายรายการพร้อมกัน: ราคา ±%, ปิด/เปิดขาย, ย้ายหมวด, ลดราคา — transaction เดียว + บันทึก", async ({ page }) => {
  await login(page);
  const open = async () => {
    await page.goto("/admin/products?q=E2E-L9-N");
    await expect(page.locator('input[name="ids"][form="bulkForm"]')).toHaveCount(2);
    await page.check("#bulkAll");
    await expect(page.locator("#bulkCount")).toHaveText("2");
  };
  await open();
  await page.selectOption("#bulkOp", "price");
  await page.selectOption('select[name="priceMode"]', "pct");
  await page.fill('input[name="priceValue"]', "10");
  await page.click('#bulkForm button[type="submit"]');
  await expect(page.locator("#bulkForm .login-info")).toContainText("แล้ว 2 รายการ");
  let rows = await q<{ sku: string; priceSatang: number; tierPrices: unknown }>(`SELECT sku, "priceSatang", "tierPrices" FROM "Product" WHERE sku IN ('E2E-L9-N1','E2E-L9-N2') ORDER BY sku`);
  expect(rows.map((r) => r.priceSatang)).toEqual([55000, 99000]);

  await open();
  await page.selectOption("#bulkOp", "inactive");
  await page.click('#bulkForm button[type="submit"]');
  await expect(page.locator("#bulkForm .login-info")).toContainText("ปิดขาย");
  expect((await q(`SELECT 1 FROM "Product" WHERE sku IN ('E2E-L9-N1','E2E-L9-N2') AND "isActive"`)).length).toBe(0);
  expect((await page.request.get(`/product/${S.n1}`)).status()).toBe(404);
  await open();
  await page.selectOption("#bulkOp", "active");
  await page.click('#bulkForm button[type="submit"]');
  await expect(page.locator("#bulkForm .login-info")).toContainText("เปิดขาย");

  await open();
  await page.selectOption("#bulkOp", "category");
  await page.selectOption('#bulkForm select[name="categoryId"]', uwCat);
  await page.click('#bulkForm button[type="submit"]');
  await expect(page.locator("#bulkForm .login-info")).toContainText("ย้ายไปหมวด");
  rows = await q(`SELECT sku FROM "Product" WHERE sku IN ('E2E-L9-N1','E2E-L9-N2') AND "categoryId" = $1`, [uwCat]);
  expect(rows).toHaveLength(2);
  await open();
  await page.selectOption("#bulkOp", "category");
  await page.selectOption('#bulkForm select[name="categoryId"]', testCat);
  await page.click('#bulkForm button[type="submit"]');
  await expect(page.locator("#bulkForm .login-info")).toContainText("ย้ายไปหมวด");

  await open();
  await page.selectOption("#bulkOp", "sale");
  await page.fill('#bulkForm input[name="salePct"]', "50");
  await page.click('#bulkForm button[type="submit"]');
  await expect(page.locator("#bulkForm .login-info")).toContainText("ตั้งลดราคา 50%");
  const sales = await q<{ salePriceSatang: number }>(`SELECT "salePriceSatang" FROM "Product" WHERE sku IN ('E2E-L9-N1','E2E-L9-N2') ORDER BY sku`);
  expect(sales.map((r) => r.salePriceSatang)).toEqual([27500, 49500]);
  await open();
  await page.selectOption("#bulkOp", "clearSale");
  await page.click('#bulkForm button[type="submit"]');
  await expect(page.locator("#bulkForm .login-info")).toContainText("ยกเลิกราคาลด");
  const log = await q(`SELECT 1 FROM "AdminLog" WHERE note LIKE 'แก้หลายรายการ%E2E-L9-N1%'`);
  expect(log.length).toBeGreaterThanOrEqual(6);
});

test("A1 กลุ่มตัวเลือก: กลุ่มแนะนำจากชื่อ → ยืนยันสร้าง, แก้ค่าตัวเลือก/ตัวหลัก, แก้ราคาพร้อมกัน, ยกเลิกกลุ่ม", async ({ page }) => {
  await login(page);
  await page.goto("/admin/products/variants");
  const sug = page.locator("[data-suggest]").filter({ hasText: "E2E-L9-N1" });
  await expect(sug).toHaveCount(1);
  await expect(sug).toContainText("E2E-L9-N2");
  await expect(sug).toContainText("วัตต์");
  await sug.locator('input[name="key"]').check();
  await sug.locator('input[id^="sn"]').fill("E2E L9 ชุดไฟทดสอบ");
  await page.click('#suggestForm button:has-text("สร้างกลุ่มที่เลือก")');
  await expect(page.locator("#suggestForm .login-info")).toContainText("สร้างกลุ่มตัวเลือกแล้ว 1 กลุ่ม");
  const g = await one<{ id: string; optionNames: string[]; primaryId: string }>(`SELECT id, "optionNames", "primaryId" FROM "VariantGroup" WHERE name = 'E2E L9 ชุดไฟทดสอบ'`);
  expect(g.optionNames).toEqual(["วัตต์"]);
  const opts = await q<{ sku: string; variantOptions: unknown }>(`SELECT sku, "variantOptions" FROM "Product" WHERE "variantGroupId" = $1 ORDER BY sku`, [g.id]);
  expect(opts.map((o) => o.variantOptions)).toEqual([{ วัตต์: "5W" }, { วัตต์: "10W" }]);

  await page.goto(`/admin/products/variants/${g.id}`);
  // ค่าซ้ำ → แจ้ง
  await page.fill('input[aria-label="วัตต์ ของ E2E-L9-N2"]', "5W");
  await page.click('#groupForm button[type="submit"]');
  await expect(page.locator("#groupForm .login-err")).toContainText("ซ้ำ");
  await page.fill('input[aria-label="วัตต์ ของ E2E-L9-N2"]', "10 วัตต์");
  await page.check('input[aria-label="ตั้ง E2E-L9-N2 เป็นตัวหลัก"]');
  await page.click('#groupForm button[type="submit"]');
  await expect(page.locator("#groupForm .login-info")).toContainText("บันทึกกลุ่มตัวเลือกแล้ว");
  expect((await one<{ primaryId: string }>(`SELECT "primaryId" FROM "VariantGroup" WHERE id = $1`, [g.id])).primaryId).toBe(ID.n2);
  // แก้ราคาพร้อมกัน
  await page.selectOption("#gpMode", "set");
  await page.fill("#gpVal", "777");
  await page.click('#groupPriceForm button[type="submit"]');
  await expect(page.locator("#groupPriceForm .login-info")).toContainText("แก้ราคา 2 ตัวเลือกแล้ว");
  const prices = await q<{ priceSatang: number }>(`SELECT "priceSatang" FROM "Product" WHERE "variantGroupId" = $1`, [g.id]);
  expect(prices.map((p) => p.priceSatang)).toEqual([77700, 77700]);
  // หน้าร้าน: ปุ่มเลือกตัวเลือก + canonical ชี้ตัวหลักใหม่
  await page.goto(`/product/${S.n1}`);
  await expect(page.locator(".pdp-variants .var-opt")).toHaveCount(2);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/product/${S.n2}$`));
  await page.click('.pdp-variants a.var-opt:has-text("10 วัตต์")');
  await expect(page).toHaveURL(new RegExp(`/product/${S.n2}$`));
  // ยกเลิกกลุ่ม
  await page.goto(`/admin/products/variants/${g.id}`);
  await confirmClick(page, 'button:has-text("ยกเลิกกลุ่ม")', "ยกเลิกกลุ่ม");
  await expect(page).toHaveURL(/\/admin\/products\/variants\?deleted=1/);
  expect((await q(`SELECT 1 FROM "Product" WHERE "variantGroupId" = $1`, [g.id])).length).toBe(0);
  await page.goto(`/product/${S.n1}`);
  await expect(page.locator(".pdp-variants")).toHaveCount(0);
  // แก้หน้าสินค้าแสดงกลุ่มที่สินค้าอยู่
  await page.goto(`/admin/products/${ID.v1}`);
  await expect(page.locator("#variantBox")).toContainText("E2E L9 โคมทดสอบ");
  await expect(page.locator("#variantBox")).toContainText("แสงขาว · 3W");
});

test("หน้าใหม่ของล็อต 9 บนมือถือ 390px ไม่มีเลื่อนแนวนอน และไม่มี error", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await shop(page);
  await page.goto("/");
  await page.evaluate((ids) => {
    localStorage.setItem("mdw_compare", JSON.stringify(ids));
    localStorage.setItem("mdw_wish", JSON.stringify(ids));
  }, [S.v1, S.psu1]);
  for (const url of [`/product/${S.v1}`, `/compare?ids=${S.v1},${S.psu1},${S.v2}`, "/wishlist", "/tools/psu-calculator", "/category/underwater-light"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over, `${url} เลื่อนแนวนอน ${over}px`).toBeLessThanOrEqual(0);
  }
  await page.evaluate(() => {
    localStorage.removeItem("mdw_compare");
    localStorage.removeItem("mdw_wish");
  });
  expect(errors).toEqual([]);
});
