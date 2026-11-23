// Data Sheet สินค้า: หลังบ้าน (วางจาก Excel · ไฮไลต์ · หมายเหตุ · แม่แบบหมวด · คัดลอกจากสินค้าอื่น · รูปแบบ A/B)
// → หน้าสินค้า (แบบ B แผ่นข้อมูล + ไฮไลต์ + ป้ายค่าหลายตัวเลือก · แบบ A ตารางเรียบ · แบบ C เทียบรุ่น + ซ่อนค่าที่เหมือนกัน) · หน้าพิมพ์ A4 · ตั้งค่าร้าน
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const GROUP = `e2e-ds-g-${TAG}`;
const A = { id: `e2e-ds-a-${TAG}`, sku: `E2E-DS-A-${TAG}`, slug: `e2e-ds-a-${TAG}`, name: `ไฟส่องต้นไม้ทดสอบ 10W ${TAG}`, w: "10W" };
const B = { id: `e2e-ds-b-${TAG}`, sku: `E2E-DS-B-${TAG}`, slug: `e2e-ds-b-${TAG}`, name: `ไฟส่องต้นไม้ทดสอบ 24W ${TAG}`, w: "24W" };
const PASTE = ["รายการ\tSpecification", "ระบบไฟฟ้า", "กำลังไฟ\tPower\t10W", "แรงดันไฟเข้า\tInput Voltage\tAC 220V", "แสง", "สีแสง\tLight Color\tRGBW", "มุมลำแสง\tBeam Angle\t15° / 25° / 35° / 45° / 60°", "ตัวโคม", "ระดับกันน้ำ\tIP Rating\tIP65"].join("\n");
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
let cat = "", oldTpl: unknown = null, oldSet: { datasheetStyle: string; datasheetCompare: boolean } | null = null;
const ds = async (id: string) => (await q<{ datasheet: { groups: { title: string; rows: { label: string; en: string; value: string; hl: boolean }[] }[]; note: string; style: string } | null }>(`SELECT datasheet FROM "Product" WHERE id=$1`, [id]))[0].datasheet;
const save = async (page: Page) => {
  const btn = page.locator('button[type=submit]:has-text("บันทึกสินค้า")' + V).first();
  await expect(btn).toBeEnabled();
  await btn.click();
};
const ed = (page: Page) => page.locator("#sec-datasheet" + V);

test.beforeAll(async () => {
  [{ id: cat, t: oldTpl }] = (await q<{ id: string; t: unknown }>(`SELECT id, "datasheetTemplate" t FROM "Category" WHERE "isActive" ORDER BY "sortOrder" LIMIT 1`)).map((r) => ({ id: r.id, t: r.t }));
  oldSet = (await q<{ datasheetStyle: string; datasheetCompare: boolean }>(`SELECT "datasheetStyle", "datasheetCompare" FROM "ShopSetting" WHERE id='shop'`))[0];
  await q(`UPDATE "ShopSetting" SET "datasheetStyle"='B', "datasheetCompare"=true WHERE id='shop'`);
  await q(`INSERT INTO "VariantGroup"(id, name, "optionNames", "primaryId", "updatedAt") VALUES ($1,$2,ARRAY['วัตต์'],$3,now())`, [GROUP, `ไฟส่องต้นไม้ทดสอบ ${TAG}`, A.id]);
  for (const [i, p] of [A, B].entries())
    await q(
      `INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "inStock", "isActive", images, "categoryId", "sortOrder", "variantGroupId", "variantOptions", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,true,true,'{}',$6,$7,$8,$9::jsonb,now())`,
      [p.id, p.sku, p.slug, p.name, 69000 + i * 60000, cat, 970000 + i, GROUP, JSON.stringify({ วัตต์: p.w })],
    );
});
test.afterAll(async () => {
  await q(`DELETE FROM "Product" WHERE id = ANY($1)`, [[A.id, B.id]]);
  await q(`DELETE FROM "VariantGroup" WHERE id=$1`, [GROUP]);
  await q(`UPDATE "Category" SET "datasheetTemplate"=$2::jsonb WHERE id=$1`, [cat, oldTpl == null ? null : JSON.stringify(oldTpl)]);
  if (oldSet) await q(`UPDATE "ShopSetting" SET "datasheetStyle"=$1, "datasheetCompare"=$2 WHERE id='shop'`, [oldSet.datasheetStyle, oldSet.datasheetCompare]);
});

test("หลังบ้าน: วางจาก Excel (กลุ่ม + ไทย/EN) · ไฮไลต์ · หมายเหตุ · บันทึกแม่แบบหมวด · สินค้ารุ่นที่ 2 คัดลอกแล้วแก้ค่า", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto(`/admin/products/${A.id}`);
  const e = ed(page);
  await e.getByRole("button", { name: "วางจาก Excel / ตาราง" }).click();
  await e.locator("#dsPaste").fill(PASTE);
  await e.getByRole("button", { name: "แปลงเป็นตาราง (ต่อท้าย)" }).click();
  await expect(e.locator(".ds-grp")).toHaveCount(3);
  await expect(e.locator(".ds-row")).toHaveCount(5);
  await expect(e.locator(".ds-gh input").first()).toHaveValue("ระบบไฟฟ้า");
  // ไฮไลต์ กำลังไฟ + ระดับกันน้ำ · หมายเหตุ
  await e.getByRole("button", { name: "ไฮไลต์ กำลังไฟ" }).click();
  await e.getByRole("button", { name: "ไฮไลต์ ระดับกันน้ำ" }).click();
  await e.locator("#dsNote").fill("* ขนาดอาจคลาดเคลื่อนเล็กน้อย");
  await save(page);
  await expect.poll(async () => (await ds(A.id))?.groups.length).toBe(3);
  const a = (await ds(A.id))!;
  expect(a.groups[0]).toEqual({ title: "ระบบไฟฟ้า", en: "", rows: [{ label: "กำลังไฟ", en: "Power", value: "10W", hl: true }, { label: "แรงดันไฟเข้า", en: "Input Voltage", value: "AC 220V", hl: false }] });
  expect(a.note).toBe("* ขนาดอาจคลาดเคลื่อนเล็กน้อย");
  // บันทึกเป็นแม่แบบหมวด
  await e.getByRole("button", { name: "บันทึกเป็นแม่แบบหมวด" }).click();
  await expect.poll(async () => JSON.stringify((await q<{ t: unknown }>(`SELECT "datasheetTemplate" t FROM "Category" WHERE id=$1`, [cat]))[0].t)).toContain("มุมลำแสง");

  // รุ่น 24W: ใช้แม่แบบหมวด (หัวข้อพร้อม ค่าว่าง) → คัดลอกจากรุ่น 10W → แก้กำลังไฟ
  await page.goto(`/admin/products/${B.id}`);
  const e2 = ed(page);
  await e2.getByRole("button", { name: /ใช้แม่แบบหมวด/ }).click();
  await expect(e2.locator(".ds-row")).toHaveCount(5);
  await expect(e2.getByLabel("ค่า").first()).toHaveValue("");
  await e2.getByRole("button", { name: "คัดลอกจากสินค้าอื่น" }).click();
  await e2.locator("#dsCopy").fill(`${A.sku} · ${A.name}`);
  await e2.getByRole("button", { name: "คัดลอก", exact: true }).click();
  await expect(e2.locator(".ds-msg")).toContainText("คัดลอก Data Sheet");
  await e2.getByLabel("ค่า").first().fill("24W");
  await save(page);
  await expect.poll(async () => (await ds(B.id))?.groups[0].rows[0].value).toBe("24W");
});

test("หน้าสินค้า: แบบ B (ไฮไลต์ · กลุ่ม · ไทย/EN · ป้ายมุมลำแสง · หมายเหตุ) + แบบ C เทียบรุ่น (ซ่อนค่าที่เหมือนกัน · เลือกรุ่น)", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(`/product/${A.slug}`);
  const sec = page.locator(".pdp-ds");
  await expect(sec).toHaveAttribute("data-datasheet", "B");
  // อยู่ใต้รายละเอียดสินค้า (หรือแทนที่เมื่อไม่มีคำอธิบาย) — ก่อนสินค้าในหมวดเดียวกัน/รีวิว
  await expect(sec.locator(".ds-hl li")).toHaveCount(2);
  await expect(sec.locator(".ds-hl li").first()).toContainText("10W");
  await expect(sec.locator(".ds-sheet-top")).toContainText(A.sku);
  await expect(sec.locator(".ds-grp h3")).toHaveText([/ระบบไฟฟ้า/, /แสง/, /ตัวโคม/]);
  await expect(sec.locator(".ds-r dt").first()).toContainText("Power");
  await expect(sec.locator(".ds-sheet .ds-chips span")).toHaveCount(5);
  await expect(sec.locator(".ds-note")).toContainText("ขนาดอาจคลาดเคลื่อน");
  // แบบ C
  const cmp = sec.locator("[data-ds-compare] table");
  await expect(cmp.locator("thead th")).toHaveText(["รายการ", "10W", "24W"]);
  await expect(cmp.locator("thead th.cur")).toHaveText("10W");
  const power = cmp.locator("tbody tr", { hasText: "กำลังไฟ" });
  await expect(power.locator("td")).toHaveText(["10W", "24W"]);
  const same = cmp.locator("tr[data-same]");
  await expect(same.first()).toBeVisible();
  await sec.locator("label.ds-diff").click();
  await expect(same.first()).toBeHidden();
  await expect(power).toBeVisible();
  await cmp.getByRole("link", { name: "เลือกรุ่นนี้" }).click();
  await expect(page).toHaveURL(new RegExp(`/product/${B.slug}$`));
  await expect(page.locator(".pdp-ds [data-ds-compare] thead th.cur")).toHaveText("24W");
});

test("รูปแบบ A ต่อสินค้า · ปิดตารางเทียบรุ่นในตั้งค่าร้าน · หน้าพิมพ์ A4 (QR · ไฮไลต์ · ตาราง)", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await login(page);
  await page.goto(`/admin/products/${A.id}`);
  await ed(page).locator("#dsStyle").selectOption("A");
  await save(page);
  await expect.poll(async () => (await ds(A.id))?.style).toBe("A");
  await page.goto(`/product/${A.slug}`);
  const sec = page.locator(".pdp-ds");
  await expect(sec).toHaveAttribute("data-datasheet", "A");
  await expect(sec.locator("table.ds-a thead th")).toHaveText(["รายการ", "Specification"]);
  await expect(sec.locator("table.ds-a tbody tr")).toHaveCount(5);
  await expect(sec.locator(".ds-hl")).toHaveCount(0);

  // ตั้งค่าร้าน: ปิดแบบ C
  await page.goto("/admin/settings");
  await page.locator('input[name="datasheetCompare"]' + V).uncheck();
  await page.locator("button[type=submit]:has-text('บันทึกการตั้งค่า')" + V).first().click();
  await expect.poll(async () => (await q<{ c: boolean }>(`SELECT "datasheetCompare" c FROM "ShopSetting" WHERE id='shop'`))[0].c).toBe(false);
  await page.goto(`/product/${B.slug}`);
  await expect(page.locator(".pdp-ds")).toHaveAttribute("data-datasheet", "B");
  await expect(page.locator("[data-ds-compare]")).toHaveCount(0);

  // หน้าพิมพ์
  await page.goto(`/product/${A.slug}`);
  const href = await page.locator("[data-ds-print]").getAttribute("href");
  await page.goto(href!);
  await expect(page).toHaveTitle(`DataSheet-${A.sku}`);
  await expect(page.locator(".dsp-title")).toContainText("DATA SHEET");
  await expect(page.locator(".dsp-info h1")).toHaveText(A.name);
  await expect(page.locator(".dsp-qr img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(page.locator(".dsp-hl li")).toHaveCount(2);
  await expect(page.locator(".dsp-table tr.dsp-g")).toHaveCount(3);
  await expect(page.locator(".dsp-table")).toContainText("15° · 25° · 35° · 45° · 60°");
  // สินค้าที่ไม่มี Data Sheet → 404
  expect((await page.request.get(`/datasheet/no-such-${TAG}`)).status()).toBe(404);
});

test("วางข้อความ 3 คอลัมน์แบบ ' | ' (ชื่อกลุ่ม ไทย | EN) → กลุ่มถูกต้อง · ติ๊กดาว · บันทึกลงฐานข้อมูล · หน้าสินค้า/หน้าพิมพ์แสดง", async ({ page }) => {
  await q(`UPDATE "Product" SET datasheet = NULL WHERE id=$1`, [B.id]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto(`/admin/products/${B.id}`);
  const e = ed(page);
  await e.getByRole("button", { name: "วางจาก Excel / ตาราง" }).click();
  await e.locator("#dsPaste").fill([
    "ระบบไฟฟ้า | Electrical", "กำลังไฟ | Power | 48W (High Power LED)", "จำนวนหลอด | LED Quantity | 48 ดวง",
    "แสง | Lighting", "อุณหภูมิสี | Color Temperature | 6000K–6500K",
    "ตัวโคม | Housing", "ระดับกันน้ำ | IP Rating | IP65 (ใช้กลางแจ้งได้)",
    "การใช้งาน | Application", "เหมาะสำหรับ | Suitable For | ส่องต้นไม้ / ส่องต้นเสา / ส่องอาคาร",
  ].join("\n"));
  await e.getByRole("button", { name: "แปลงเป็นตาราง (ต่อท้าย)" }).click();
  await expect(e.locator(".ds-grp")).toHaveCount(4);
  await expect(e.locator(".ds-row")).toHaveCount(5);
  await e.getByRole("button", { name: "ไฮไลต์ กำลังไฟ" }).click();
  await e.getByRole("button", { name: "ไฮไลต์ ระดับกันน้ำ" }).click();
  await save(page);
  await expect.poll(async () => (await ds(B.id))?.groups.map((g) => g.title).join()).toBe("ระบบไฟฟ้า,แสง,ตัวโคม,การใช้งาน");
  await page.goto(`/product/${B.slug}`);
  await expect(page.locator(".pdp-ds .ds-hl li")).toHaveCount(2);
  await expect(page.locator(".pdp-ds .ds-grp h3").first()).toContainText("Electrical");
  expect((await page.request.get(`/datasheet/${B.slug}`)).status()).toBe(200);
});
