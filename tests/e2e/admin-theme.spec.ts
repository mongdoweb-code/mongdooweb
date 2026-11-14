// ธีมหลังบ้าน สว่าง / มืด / ตามเครื่อง: ค่าเริ่มต้นตามเครื่อง · ปุ่มสลับ (จำในคุกกี้ ไม่ต้องโหลดหน้า) · ไม่กะพริบหลังโหลดใหม่
// · พื้น/ตัวอักษรเปลี่ยนจริง · สวิตช์เปิดยังเขียว · แผ่นเอกสาร A4 ขาวเสมอ · หน้าพิมพ์สว่างเสมอ · หน้าเข้าสู่ระบบมีปุ่มสลับ
import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const lum = (rgb: string) => {
  const [r, g, b] = (rgb.match(/\d+/g) ?? ["0", "0", "0"]).map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};
const bodyBg = (p: Page) => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const theme = (p: Page) => p.evaluate(() => document.documentElement.dataset.admTheme);

test("ตามเครื่อง: เครื่องโหมดมืด → หลังบ้านมืด · เครื่องโหมดสว่าง → สว่าง (ยังไม่เคยเลือก)", async ({ browser }) => {
  for (const scheme of ["dark", "light"] as const) {
    const ctx = await browser.newContext({ colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto("/admin/login");
    expect(await theme(p)).toBe(scheme);
    await expect(p.locator(".lg-thm .thm-btn")).toBeVisible();
    await ctx.close();
  }
});

test("สลับเป็นมืด → เปลี่ยนทันที + จำไว้ · หน้าต่างๆ มืดจริง · สวิตช์เขียว · A4 ขาว · หน้าพิมพ์สว่าง · กลับเป็นสว่าง", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "light", viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page);
  await page.goto("/admin/dashboard");
  expect(await theme(page)).toBe("light");
  expect(lum(await bodyBg(page))).toBeGreaterThan(0.85);

  await page.locator(".gtools .thm-btn").click();
  const menu = page.getByRole("menu", { name: "เลือกธีม" });
  await expect(menu.getByRole("menuitemradio")).toHaveText(["สว่าง", "มืด", "ตามเครื่องตามระบบ"]);
  await menu.getByRole("menuitemradio", { name: "มืด" }).click();
  expect(await theme(page)).toBe("dark");
  await expect.poll(async () => lum(await bodyBg(page))).toBeLessThan(0.15);
  expect((await ctx.cookies()).find((c) => c.name === "mdw_admin_theme")?.value).toBe("dark");
  // ตัวอักษรหัวข้อสว่าง · การ์ดมืดแต่ยกจากพื้น
  expect(lum(await page.locator("h1").first().evaluate((e) => getComputedStyle(e).color))).toBeGreaterThan(0.75);

  // โหลดใหม่: มืดตั้งแต่ก่อน React ทำงาน (ไม่กะพริบ)
  await page.reload({ waitUntil: "commit" });
  await page.waitForSelector("body");
  expect(await theme(page)).toBe("dark");

  // สวิตช์ "เปิด" ยังเป็นสีเขียว (กฎสถานะไม่ถูกกฎธีมมืดทับ)
  await page.goto("/admin/categories");
  const on = page.locator('.switch[aria-checked="true"]').first();
  if (await on.count()) {
    const bg = await on.evaluate((e) => getComputedStyle(e).backgroundColor);
    const [r, g] = (bg.match(/\d+/g) ?? []).map(Number);
    expect(g).toBeGreaterThan(r + 40);
  }

  // แผ่นเอกสาร A4 ในหน้าดูเอกสาร = กระดาษขาว
  await page.goto("/admin/docs/QUOTATION");
  const href = await page.locator("tbody a.row-link").first().getAttribute("href");
  if (href) {
    await page.goto(href);
    const sheet = page.locator(".sheet").first();
    await expect(sheet).toBeVisible();
    expect(lum(await sheet.evaluate((e) => getComputedStyle(e).backgroundColor))).toBeGreaterThan(0.97);
    expect(lum(await sheet.evaluate((e) => getComputedStyle(e).color))).toBeLessThan(0.2);
    // หน้าพิมพ์สว่างเสมอ
    const id = href.split("/").pop();
    await page.goto(`/admin/print/doc/${id}`);
    expect(await theme(page)).toBeUndefined();
  }

  // กลับเป็นสว่าง
  await page.goto("/admin/dashboard");
  await page.locator(".gtools .thm-btn").click();
  await page.getByRole("menuitemradio", { name: "สว่าง" }).click();
  expect(await theme(page)).toBe("light");
  await expect.poll(async () => lum(await bodyBg(page))).toBeGreaterThan(0.85);
  expect((await ctx.cookies()).find((c) => c.name === "mdw_admin_theme")?.value).toBe("light");
  await ctx.close();
});

test("ตั้งเป็นตามเครื่องแล้วเครื่องเปลี่ยนโหมด → หลังบ้านเปลี่ยนตามทันที", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "light" });
  const page = await ctx.newPage();
  await login(page);
  await page.goto("/admin/dashboard");
  await page.locator(".gtools .thm-btn").click();
  await page.getByRole("menuitemradio", { name: /ตามเครื่อง/ }).click();
  expect(await theme(page)).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => theme(page)).toBe("dark");
  await ctx.close();
});
