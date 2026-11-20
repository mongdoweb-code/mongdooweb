// หน้าร้าน: ธีมกลางวัน/กลางคืน — ค่าเริ่มต้นตามเครื่อง · กดสลับแล้วจำ (คุกกี้) ทุกหน้า · ปุ่มในเมนูมือถือ · หน้าชำระเงินตามด้วย
import { expect, test } from "@playwright/test";
import { V } from "./helpers";

const theme = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));

test("ยังไม่เคยเลือก = ตามเครื่อง และเปลี่ยนตามทันที", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  expect(await theme(page)).toBe("dark");
  await expect(page.locator(".header [data-theme-toggle]" + V)).toHaveAttribute("aria-checked", "true");
  // พื้นหลังมืดจริง
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).not.toBe("rgb(255, 255, 255)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => theme(page)).toBe("light");
});

test("กดสลับ → จำไว้ทุกหน้า (รวมหน้าชำระเงิน) แม้เครื่องเป็นโหมดสว่าง · กลับเป็นกลางวันได้", async ({ page, context }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/");
  expect(await theme(page)).toBe("light");
  const tg = page.locator(".header [data-theme-toggle]" + V);
  await tg.click();
  expect(await theme(page)).toBe("dark");
  await expect(tg).toHaveAttribute("aria-checked", "true");
  expect((await context.cookies()).find((c) => c.name === "mdw_theme")?.value).toBe("dark");
  await page.goto("/products");
  expect(await theme(page)).toBe("dark");
  await page.goto("/checkout");
  expect(await theme(page)).toBe("dark");
  // เครื่องเปลี่ยนโหมด → ไม่กระทบ (ผู้ใช้เลือกเองแล้ว)
  await page.goto("/");
  await page.emulateMedia({ colorScheme: "light" });
  expect(await theme(page)).toBe("dark");
  await tg.click();
  expect(await theme(page)).toBe("light");
  expect((await context.cookies()).find((c) => c.name === "mdw_theme")?.value).toBe("light");
});

test("มือถือ: ปุ่มสลับอยู่ในเมนูข้าง", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".header [data-theme-toggle]" + V)).toHaveCount(0);
  await page.locator("#menuBtn").click();
  await page.locator(".dr-theme [data-theme-toggle]").click();
  expect(await theme(page)).toBe("dark");
});
