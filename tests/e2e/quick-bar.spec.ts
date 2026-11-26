// แถบเมนูด่วนด้านบนหลังบ้าน: ค่าเริ่มต้น 7 เมนู (ไอคอน + ข้อความ) · กดแล้วไปหน้าจริง + ไฮไลต์หน้าปัจจุบัน
// · ตั้งค่า: เลือก/เอาออก/เรียงลำดับ/สูงสุด 10/คืนค่าเริ่มต้น (บันทึกต่อบัญชี) · จอแคบเหลือไอคอน ไม่ล้นจอ
import { expect, test } from "@playwright/test";
import pg from "pg";
import { ADMIN_USER, V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
let orig: unknown = null;
test.beforeAll(async () => {
  [{ m: orig }] = await q<{ m: unknown }>(`SELECT "quickMenu" m FROM "Admin" WHERE username=$1`, [ADMIN_USER]);
  await q(`UPDATE "Admin" SET "quickMenu" = NULL WHERE username=$1`, [ADMIN_USER]);
});
test.afterAll(async () => {
  await q(`UPDATE "Admin" SET "quickMenu" = $2::jsonb WHERE username=$1`, [ADMIN_USER, orig == null ? null : JSON.stringify(orig)]);
});

const DEFAULT = ["ออกใบเสนอราคา", "ออกใบแจ้งหนี้", "เพิ่มสินค้า", "สินค้า", "หมวดหมู่สินค้า", "สต็อก", "นับสต็อกทั้งร้าน"];

test("ค่าเริ่มต้น: 7 เมนูอยู่ซ้ายของช่องค้นหา · กดแล้วไปหน้าจริง + ไฮไลต์", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  await page.goto("/admin/dashboard");
  const bar = page.getByRole("navigation", { name: "เมนูด่วน" });
  await expect(bar.locator(".qb-a")).toHaveText(DEFAULT);
  // ไอคอนทุกปุ่ม · ปุ่มสร้างมีเครื่องหมาย +
  await expect(bar.locator(".qb-a svg")).toHaveCount(DEFAULT.length);
  await expect(bar.locator(".qb-a.qb-new .qb-plus")).toHaveCount(3);
  // อยู่แถวเดียวกับช่องค้นหา และอยู่ทางซ้าย
  const [b, s] = await Promise.all([bar.boundingBox(), page.locator("#gsOpen").boundingBox()]);
  expect(Math.abs(b!.y + b!.height / 2 - (s!.y + s!.height / 2))).toBeLessThan(6);
  expect(b!.x + b!.width).toBeLessThanOrEqual(s!.x + 1);
  // ทุกเมนูเปิดหน้าได้จริง (ไม่ใช่ 404/500)
  for (const href of await bar.locator(".qb-a").evaluateAll((els) => els.map((e) => e.getAttribute("href")!))) {
    const r = await page.request.get(href);
    expect(r.status(), href).toBe(200);
  }
  // กด "สต็อก" → ไปหน้าสต็อก + ไฮไลต์เฉพาะปุ่มนั้น (ไม่ไฮไลต์ "นับสต็อกทั้งร้าน")
  await bar.getByRole("link", { name: "สต็อก", exact: true }).click();
  await page.waitForURL(/\/admin\/stock$/);
  await expect(bar.locator(".qb-a.on")).toHaveText(["สต็อก"]);
  await page.goto("/admin/stock/count");
  await expect(bar.locator(".qb-a.on")).toHaveText(["นับสต็อกทั้งร้าน"]);
  await page.goto("/admin/products/new");
  await expect(bar.locator(".qb-a.on")).toHaveText(["เพิ่มสินค้า"]);
  await expect(bar.locator('.qb-a[aria-current="page"]')).toHaveCount(1);
});

test("ตั้งค่า: เลือก/เอาออก/เรียงลำดับ → บันทึกแล้วแถบเปลี่ยนทันที · สูงสุด 10 · Esc ปิด · คืนค่าเริ่มต้น", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await login(page);
  await page.goto("/admin/dashboard");
  const bar = page.getByRole("navigation", { name: "เมนูด่วน" });
  await bar.getByRole("button", { name: "ตั้งค่าเมนูด่วน" }).click();
  const dlg = page.getByRole("dialog", { name: "ตั้งค่าเมนูด่วน" });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator(".qb-n")).toHaveText("7/10");
  // เอา "หมวดหมู่สินค้า" ออก · เพิ่ม "ลูกค้า" · เลื่อน "ลูกค้า" ขึ้นบนสุด
  await dlg.locator(".qb-opt", { hasText: "หมวดหมู่สินค้า" }).locator("input").uncheck();
  await dlg.locator(".qb-opt", { hasText: /^ลูกค้า$/ }).locator("input").check();
  for (let i = 0; i < 6; i++) await dlg.getByRole("button", { name: "เลื่อนขึ้น: ลูกค้า" }).click();
  await expect(dlg.getByRole("button", { name: "เลื่อนขึ้น: ลูกค้า" })).toBeDisabled();
  await dlg.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dlg).toBeHidden();
  const after = ["ลูกค้า", "ออกใบเสนอราคา", "ออกใบแจ้งหนี้", "เพิ่มสินค้า", "สินค้า", "สต็อก", "นับสต็อกทั้งร้าน"];
  await expect(bar.locator(".qb-a")).toHaveText(after);
  const [{ m }] = await q<{ m: string[] }>(`SELECT "quickMenu" m FROM "Admin" WHERE username=$1`, [ADMIN_USER]);
  expect(m).toEqual(["customers", "qt-new", "iv-new", "product-new", "products", "stock", "stock-count"]);
  // คงอยู่หลังโหลดใหม่ และหน้าอื่นก็เห็น
  await page.goto("/admin/products");
  await expect(bar.locator(".qb-a")).toHaveText(after);

  // สูงสุด 10: เลือกเพิ่มจนครบแล้วช่องที่เหลือกดไม่ได้ · Esc ปิดโดยไม่บันทึก
  await bar.getByRole("button", { name: "ตั้งค่าเมนูด่วน" }).click();
  const free = dlg.locator(".qb-opt:not(.on) input");
  for (let i = 0; i < 3; i++) await free.first().check();
  await expect(dlg.locator(".qb-n")).toHaveText("10/10");
  await expect(dlg.locator(".qb-opt:not(.on) input").first()).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  await expect(bar.locator(".qb-a")).toHaveText(after);

  // คืนค่าเริ่มต้น
  await bar.getByRole("button", { name: "ตั้งค่าเมนูด่วน" }).click();
  await dlg.getByRole("button", { name: "คืนค่าเริ่มต้น" }).click();
  await expect(dlg).toBeHidden();
  await expect(bar.locator(".qb-a")).toHaveText(DEFAULT);
  const [{ m: m2 }] = await q<{ m: unknown }>(`SELECT "quickMenu" m FROM "Admin" WHERE username=$1`, [ADMIN_USER]);
  expect(m2).toBeNull();

  // ไม่เลือกเลย → เหลือปุ่ม "เมนูด่วน" ไว้เปิดตั้งค่าใหม่
  await q(`UPDATE "Admin" SET "quickMenu" = '[]'::jsonb WHERE username=$1`, [ADMIN_USER]);
  await page.reload();
  await expect(bar.locator(".qb-a")).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "ตั้งค่าเมนูด่วน" })).toContainText("เมนูด่วน");
  await q(`UPDATE "Admin" SET "quickMenu" = NULL WHERE username=$1`, [ADMIN_USER]);
});

test("จอแคบ: เหลือไอคอน (ชื่อยังอ่านได้ด้วยโปรแกรมอ่านหน้าจอ) · แถบเต็มแถวบนมือถือ · ไม่ล้นจอ", async ({ page }) => {
  await login(page);
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/dashboard");
    const bar = page.getByRole("navigation", { name: "เมนูด่วน" });
    await expect(bar.getByRole("link", { name: "ออกใบเสนอราคา" })).toBeVisible();
    await expect(bar.locator(".qb-t").first()).toHaveCSS("width", "1px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `width ${width}`).toBe(true);
  }
  // มือถือ: แถบอยู่เหนือช่องค้นหา (เต็มแถว)
  const [b, s] = await Promise.all([page.locator(".qbar").boundingBox(), page.locator("#gsOpen").boundingBox()]);
  expect(b!.y + b!.height).toBeLessThanOrEqual(s!.y + 1);
  await expect(page.locator(".qbar" + V)).toBeVisible();
});

test("ทุกเมนูด้านซ้ายมีให้เลือกในตั้งค่าเมนูด่วน (รวมเมนูที่เพิ่มใหม่) · ค้นหาเมนู · เลือกแล้วใช้ได้จริง", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await page.goto("/admin/dashboard");
  // รายการเมนูซ้ายที่เห็นจริง (ไม่รวมลิงก์ออกจากระบบ)
  const side = (await page.locator("#side nav a").evaluateAll((as) => as.map((a) => a.textContent!.replace(/\d+$/, "").trim()))).filter(Boolean);
  expect(side.length).toBeGreaterThan(40);
  const bar = page.getByRole("navigation", { name: "เมนูด่วน" });
  await bar.getByRole("button", { name: "ตั้งค่าเมนูด่วน" }).click();
  const dlg = page.getByRole("dialog", { name: "ตั้งค่าเมนูด่วน" });
  const opts = (await dlg.locator(".qb-pick .qb-opt span:last-child").allTextContents()).map((t) => t.trim());
  for (const label of side) expect(opts, `เมนู "${label}"`).toContain(label);
  expect(opts).toContain("จัดเรียงสินค้าหน้าร้าน");
  expect(opts).toContain("ค่าใช้จ่ายร้าน");
  // ค้นหา
  await dlg.getByPlaceholder(/ค้นหาเมนู/).fill("ค่าใช้จ่าย");
  await expect(dlg.locator(".qb-pick .qb-opt")).toHaveCount(1);
  await dlg.locator(".qb-pick .qb-opt", { hasText: "ค่าใช้จ่ายร้าน" }).click();
  await dlg.getByPlaceholder(/ค้นหาเมนู/).fill("zzz");
  await expect(dlg.locator(".qb-none")).toContainText("ไม่พบเมนู");
  await dlg.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dlg).toHaveCount(0);
  await bar.getByRole("link", { name: "ค่าใช้จ่ายร้าน" }).click();
  await expect(page).toHaveURL(/\/admin\/expenses$/);
  await expect(bar.getByRole("link", { name: "ค่าใช้จ่ายร้าน" })).toHaveAttribute("aria-current", "page");
  const [{ m }] = await q<{ m: string[] }>(`SELECT "quickMenu" m FROM "Admin" WHERE username=$1`, [ADMIN_USER]);
  expect(m).toContain("expenses");
  await q(`UPDATE "Admin" SET "quickMenu" = NULL WHERE username=$1`, [ADMIN_USER]);
});

test("จัดลำดับ: เลขลำดับ · พิมพ์เลขย้าย · ลากวางด้วยเมาส์ · คีย์บอร์ด · เรียงด่วน · Esc ยกเลิกการลาก", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await q(`UPDATE "Admin" SET "quickMenu" = NULL WHERE username=$1`, [ADMIN_USER]);
  await login(page);
  await page.goto("/admin/dashboard");
  const bar = page.getByRole("navigation", { name: "เมนูด่วน" });
  await bar.getByRole("button", { name: "ตั้งค่าเมนูด่วน" }).click();
  const dlg = page.getByRole("dialog", { name: "ตั้งค่าเมนูด่วน" });
  const rows = dlg.locator(".qb-order li[data-qb-key]");
  const names = () => rows.locator(".qb-ol-t").allInnerTexts();
  const start = await names();
  expect(start.length).toBeGreaterThan(3);
  expect(await rows.locator(".qb-num").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toEqual(start.map((_, i) => String(i + 1)));
  await expect(dlg.locator(".qb-free")).toContainText(`ช่องว่าง ${10 - start.length} ช่อง`);
  // แถวสูงเท่ากัน
  const hs = await rows.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(new Set(hs).size).toBe(1);

  // พิมพ์เลข: แถวสุดท้าย → ลำดับ 1
  const last = start.at(-1)!;
  await expect(async () => {
    const num = dlg.getByRole("textbox", { name: `ลำดับของ ${last}` });
    await num.click();
    await num.fill("1");
    await num.press("Enter");
    expect((await names())[0]).toBe(last);
  }).toPass({ timeout: 10_000 });
  let cur = await names();
  expect(cur).toEqual([last, ...start.slice(0, -1)]);
  // Esc ในช่องเลข = ไม่ย้าย และหน้าต่างยังเปิด
  const n3 = dlg.getByRole("textbox", { name: `ลำดับของ ${cur[2]}` });
  await n3.click();
  await n3.fill("1");
  await n3.press("Escape");
  await expect(dlg).toBeVisible();
  expect(await names()).toEqual(cur);

  // ลากวางด้วยเมาส์: แถว 1 → ลงไปตำแหน่งที่ 3
  const box = async (i: number) => (await rows.nth(i).boundingBox())!;
  const a = await box(0), c = await box(2);
  await page.mouse.move(a.x + 120, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 120, a.y + a.height / 2 + 10, { steps: 3 });
  await page.mouse.move(a.x + 120, c.y + c.height / 2 + 4, { steps: 8 });
  await expect(dlg.locator(".qb-drop-tip")).toHaveText("วางที่ลำดับ 3");
  await page.mouse.up();
  await expect.poll(names).toEqual([cur[1], cur[2], cur[0], ...cur.slice(3)]);
  cur = await names();

  // Esc ระหว่างลาก = ยกเลิก (หน้าต่างยังเปิด ลำดับไม่เปลี่ยน)
  const b0 = await box(0);
  await page.mouse.move(b0.x + 120, b0.y + b0.height / 2);
  await page.mouse.down();
  await page.mouse.move(b0.x + 120, b0.y + b0.height * 2.5, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(dlg).toBeVisible();
  expect(await names()).toEqual(cur);

  // คีย์บอร์ด: โฟกัส ⠿ ของแถวแรก → End = ไปท้ายสุด · Home = กลับบนสุด
  await dlg.getByRole("button", { name: new RegExp(`^ลากเพื่อจัดลำดับ: ${cur[0]}`) }).focus();
  await page.keyboard.press("End");
  expect((await names()).at(-1)).toBe(cur[0]);
  await expect(dlg.getByRole("button", { name: new RegExp(`^ลากเพื่อจัดลำดับ: ${cur[0]}`) })).toBeFocused();
  await page.keyboard.press("Home");
  expect((await names())[0]).toBe(cur[0]);

  // เรียงด่วน ก–ฮ
  await dlg.getByRole("button", { name: "ก–ฮ" }).click();
  const az = await names();
  expect(az).toEqual([...az].sort((x, y) => x.localeCompare(y, "th")));

  // บันทึก → แถบเรียงตามนั้น
  await dlg.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dlg).toBeHidden();
  await expect(bar.locator(".qb-a")).toHaveText(az);
});
