// ตัวเลือกสีแบบ Google Docs: สีตัวอักษร / ไฮไลต์ (ตารางสี 80 สี + สีร้าน + กำหนดเอง HEX + รีเซ็ต) · ระยะห่างบรรทัด · ตัวยก/ตัวห้อย
// + สีพื้นการ์ดหมวดยอดนิยม "สีอื่น" — บันทึกแล้วหน้าร้านแสดงตามนั้น
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const P = { id: `e2e-color-${TAG}`, sku: `E2E-COLOR-${TAG}`, slug: `e2e-color-${TAG}` };
const CAT = `e2e-colorcat-${TAG}`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
let savedPop: unknown = {};
test.beforeAll(async () => {
  savedPop = (await q<{ p: unknown }>(`SELECT "popularCats" p FROM "ShopSetting" WHERE id='shop'`))[0].p;
  await q(`INSERT INTO "Category"(id, slug, "nameTh", "nameEn", "sortOrder") VALUES ($1,$1,$2,'E2E Color',99997)`, [CAT, `หมวดสีทดสอบ ${TAG}`]);
  await q(`INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "inStock", "isActive", images, "categoryId", "sortOrder", "updatedAt", description) VALUES ($1,$2,$3,$4,9900,true,true,'{}',$5,965000,now(),'<p>ก่อน</p>')`, [
    P.id, P.sku, P.slug, `สินค้าทดสอบสี ${TAG}`, CAT,
  ]);
});
test.afterAll(async () => {
  await q(`UPDATE "ShopSetting" SET "popularCats"=$1 WHERE id='shop'`, [JSON.stringify(savedPop ?? {})]);
  await q(`DELETE FROM "Product" WHERE id=$1`, [P.id]);
  await q(`DELETE FROM "Category" WHERE id=$1`, [CAT]);
});

const editor = (page: Page) => page.locator(".rte" + V).filter({ has: page.locator('[aria-label="รายละเอียดสินค้า"]') });
async function typeAndSelect(page: Page, text: string) {
  const body = editor(page).locator(".rte-body");
  await body.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
  await page.keyboard.press("ControlOrMeta+a");
}

test("สีตัวอักษร: ตาราง 80 สี + สีร้าน · เลือกแดง → ✓ ที่สีปัจจุบัน · รีเซ็ตกลับสีปกติ · กำหนดเอง HEX ถูกจำไว้", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  const rte = editor(page);
  await typeAndSelect(page, "ข้อความสีแดง");
  await rte.getByRole("button", { name: "สีตัวอักษร" }).click();
  const pop = rte.getByRole("dialog", { name: "เลือกสีตัวอักษร" });
  await expect(pop).toBeVisible();
  await expect(pop.locator(".cp-sw")).toHaveCount(80 + 10);
  await pop.getByRole("radio", { name: "แดง", exact: true }).click();
  await expect(pop).toBeHidden();
  await expect(rte.locator(".rte-body span").first()).toHaveCSS("color", "rgb(255, 0, 0)");
  // เปิดอีกครั้ง → ✓ อยู่ที่แดง · คีย์บอร์ด: ลูกศรขวา → Enter = ส้ม
  await page.keyboard.press("ControlOrMeta+a");
  await rte.getByRole("button", { name: "สีตัวอักษร" }).click();
  await expect(pop.getByRole("radio", { name: "แดง", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(pop.getByRole("radio", { name: "แดง", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(rte.locator(".rte-body span").first()).toHaveCSS("color", "rgb(255, 153, 0)");
  // รีเซ็ต → ไม่มี style สีเหลืออยู่ (ตัวหนา/ขนาดไม่ถูกลบ)
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+b");
  await rte.getByRole("button", { name: "สีตัวอักษร" }).click();
  await pop.getByRole("button", { name: "รีเซ็ต (สีปกติ)" }).click();
  const html = await rte.locator(".rte-body").innerHTML();
  expect(html).not.toMatch(/color/i);
  expect(html).toMatch(/<b>|<strong>|font-weight/);
  // กำหนดเอง: พิมพ์ HEX ผิด → แจ้ง · ถูก → ใช้ได้และถูกจำในแถว "กำหนดเอง"
  await page.keyboard.press("ControlOrMeta+a");
  await rte.getByRole("button", { name: "สีตัวอักษร" }).click();
  await pop.getByRole("button", { name: "เพิ่มสีกำหนดเอง" }).click();
  await pop.getByLabel("รหัสสี HEX").fill("#12zz");
  await pop.getByRole("button", { name: "ใช้สีนี้" }).click();
  await expect(pop.getByRole("alert")).toContainText("รหัสสีไม่ถูกต้อง");
  await pop.getByLabel("รหัสสี HEX").fill("#1a7f5a");
  await pop.getByRole("button", { name: "ใช้สีนี้" }).click();
  await expect(rte.locator(".rte-body [style*='color']").first()).toHaveCSS("color", "rgb(26, 127, 90)");
  await page.keyboard.press("ControlOrMeta+a");
  await rte.getByRole("button", { name: "สีตัวอักษร" }).click();
  await expect(pop.getByRole("radio", { name: "สีที่กำหนดเอง #1A7F5A" })).toHaveAttribute("aria-checked", "true");
  // Esc ปิด · คลิกข้างนอกปิด
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  await rte.getByRole("button", { name: "สีตัวอักษร" }).click();
  await page.locator("h1" + V).click();
  await expect(pop).toBeHidden();
});

test("ไฮไลต์ + ไม่มีสี · ระยะห่างบรรทัด · ตัวยก → บันทึกแล้วหน้าร้านแสดงสี/ระยะบรรทัด", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  const rte = editor(page);
  await typeAndSelect(page, "ไฮไลต์เหลือง");
  await rte.getByRole("button", { name: "สีไฮไลต์" }).click();
  const pop = rte.getByRole("dialog", { name: "เลือกสีไฮไลต์" });
  await pop.getByRole("radio", { name: "เหลือง", exact: true }).click();
  await expect(rte.locator(".rte-body [style*='background']").first()).toHaveCSS("background-color", "rgb(255, 255, 0)");
  await page.keyboard.press("ControlOrMeta+a");
  await rte.getByRole("button", { name: "สีไฮไลต์" }).click();
  await pop.getByRole("button", { name: "ไม่มีสี (เอาไฮไลต์ออก)" }).click();
  expect(await rte.locator(".rte-body").innerHTML()).not.toMatch(/background/i);
  // ใส่ไฮไลต์ฟ้าอ่อน + สีตัวอักษรส้มของร้าน + ระยะบรรทัด 1.5 + ตัวยก
  await page.keyboard.press("ControlOrMeta+a");
  await rte.getByRole("button", { name: "สีไฮไลต์" }).click();
  await pop.getByRole("radio", { name: "ฟ้าอมเขียว อ่อนมาก 3" }).click();
  await page.keyboard.press("ControlOrMeta+a");
  await rte.getByRole("button", { name: "สีตัวอักษร" }).click();
  await rte.getByRole("dialog", { name: "เลือกสีตัวอักษร" }).getByRole("radio", { name: "ส้มของร้าน" }).click();
  await rte.getByRole("button", { name: "ระยะห่างบรรทัด" }).click();
  await rte.getByRole("menuitemradio", { name: "1.5" }).click();
  await expect(rte.locator(".rte-body p").first()).toHaveCSS("line-height", /px/);
  expect(await rte.locator(".rte-body p").first().evaluate((p) => (p as HTMLElement).style.lineHeight)).toBe("1.5");
  await rte.getByRole("button", { name: "ระยะห่างบรรทัด" }).click();
  await expect(rte.getByRole("menuitemradio", { name: "1.5" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await rte.locator(".rte-body").click();
  await page.keyboard.press("End");
  await rte.getByRole("button", { name: "ตัวยก เช่น m²" }).click();
  await page.keyboard.type("2");
  await expect(rte.locator(".rte-body sup")).toHaveText("2");

  await page.locator('button[type=submit]:has-text("บันทึกสินค้า")' + V).first().click();
  await expect.poll(async () => (await q<{ d: string }>(`SELECT description d FROM "Product" WHERE id=$1`, [P.id]))[0].d).toContain("line-height");
  const d = (await q<{ d: string }>(`SELECT description d FROM "Product" WHERE id=$1`, [P.id]))[0].d;
  expect(d).toMatch(/background-color/);
  expect(d).toMatch(/<sup>2<\/sup>/);

  await page.goto(`/product/${P.slug}`);
  const prose = page.locator(".prose-desc");
  await expect(prose.locator("[style*='background-color']").first()).toHaveCSS("background-color", "rgb(208, 224, 227)");
  const colors = await prose.locator("[style]").evaluateAll((els) => els.map((e) => (e as HTMLElement).style.color).filter(Boolean));
  expect(colors).toContain("rgb(242, 107, 56)");
  expect(await prose.locator("p").first().evaluate((p) => (p as HTMLElement).style.lineHeight)).toBe("1.5");
});

test("หมวดยอดนิยม: สีพื้น 'สีอื่น' จากตารางสี → เก็บเป็น HEX → หน้าแรกใช้สีนั้น", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await login(page);
  await page.goto("/admin/home/popular");
  const del = page.locator(".pce-item .pce-acts button.x" + V);
  while (await del.count()) await del.first().click();
  await page.locator(".pce-add select").selectOption(CAT);
  await page.getByRole("button", { name: "+ เพิ่มการ์ด" }).click();
  const card = page.locator(`.pce-item[data-cat="${CAT}"]`);
  await card.getByRole("button", { name: "สีอื่น" }).click();
  const pop = card.getByRole("dialog");
  await expect(pop.locator(".cp-pre .cp-sw")).toHaveCount(8);
  await pop.getByRole("radio", { name: "เขียว อ่อนมาก 3", exact: true }).click();
  await expect(card.locator(".pce-thumb")).toHaveCSS("background-color", "rgb(217, 234, 211)");
  await expect(card.getByRole("button", { name: /สีอื่น \(ใช้อยู่ #D9EAD3\)/ })).toBeVisible();
  // เลือกพาสเทลจากป๊อปอัป = เก็บเป็นชื่อพาสเทลเหมือนเดิม
  await card.getByRole("button", { name: /สีอื่น/ }).click();
  await pop.getByRole("radio", { name: "ฟ้า", exact: true }).first().click();
  await expect(card.getByRole("radio", { name: "ฟ้า" })).toHaveAttribute("aria-checked", "true");
  await card.getByRole("button", { name: "สีอื่น" }).click();
  await pop.getByRole("radio", { name: "เขียว อ่อนมาก 3", exact: true }).click();
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.locator(".ok-box" + V)).toBeVisible();
  const c = (await q<{ p: { items: { cat: string; bg: string }[] } }>(`SELECT "popularCats" p FROM "ShopSetting" WHERE id='shop'`))[0].p;
  expect(c.items[0]).toMatchObject({ cat: CAT, bg: "#D9EAD3" });
  await page.goto("/");
  await expect(page.locator(".pc-card .pc-img").first()).toHaveCSS("background-color", "rgb(217, 234, 211)");
});

test("มือถือ: ตารางสีไม่ล้นจอ", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  const rte = editor(page);
  await rte.locator(".rte-body").click();
  for (const name of ["สีตัวอักษร", "สีไฮไลต์"]) {
    await rte.getByRole("button", { name }).click();
    const box = (await rte.locator(".cp-pop").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await page.keyboard.press("Escape");
  }
});

test("หน้าสินค้า: คำอธิบายย่อข้างราคาแสดงรายการจุด/ตัวเลข หัวข้อ ตาราง เหมือนในตัวแก้ไข", async ({ page }) => {
  await q(`UPDATE "Product" SET "shortDescription"=$2 WHERE id=$1`, [
    P.id,
    "<h3>หัวข้อสั้น</h3><ul><li>ข้อหนึ่ง</li></ul><ul><li>ข้อสอง</li></ul><ol><li>ลำดับหนึ่ง</li><li>ลำดับสอง</li></ol><blockquote>ข้อความเน้น</blockquote><table><tbody><tr><td>A</td><td>B</td></tr></tbody></table>",
  ]);
  await q(`UPDATE "Product" SET "updatedAt"=now() WHERE id=$1`, [P.id]);
  // หน้าร้านแคชไว้ — ให้ admin บันทึกเพื่อรีเฟรชแคช
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  await page.locator('button[type=submit]:has-text("บันทึกสินค้า")' + V).first().click();
  await expect.poll(async () => (await q<{ s: string }>(`SELECT "shortDescription" s FROM "Product" WHERE id=$1`, [P.id]))[0].s).toContain("<li>");
  await page.goto(`/product/${P.slug}`);
  const short = page.locator(".pdp-short");
  await expect(short.locator("ul").first()).toHaveCSS("list-style-type", "disc");
  await expect(short.locator("ol")).toHaveCSS("list-style-type", "decimal");
  await expect(short.locator("li").first()).toHaveCSS("display", "list-item");
  expect(Number((await short.locator("ul").first().evaluate((e) => getComputedStyle(e).paddingLeft)).replace("px", ""))).toBeGreaterThan(15);
  await expect(short.locator("blockquote")).toHaveCSS("border-left-style", "solid");
  await expect(short.locator("td").first()).toHaveCSS("border-top-style", "solid");
});
