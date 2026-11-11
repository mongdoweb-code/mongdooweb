// เมนู "สินค้าทั้งหมด" มีป้ายจำนวนสินค้าจริง = จำนวน "พบ … รายการ" ในหน้าสินค้าทั้งหมด (เดสก์ท็อป + เมนูมือถือ)
import { expect, test } from "@playwright/test";

test("ป้ายจำนวนสินค้าบนเมนูตรงกับหน้าสินค้าทั้งหมด · ไม่ทับเมนูอื่น · มือถืออยู่ท้ายเมนู", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/products");
  const total = (await page.locator(".lst-count b").first().textContent())!.trim();
  const link = page.locator(".nav > a.nav-all");
  await expect(link).toHaveAttribute("href", "/products");
  await expect(link.locator(".nav-count")).toHaveText(total);
  await expect(link).toHaveAccessibleName(`สินค้าทั้งหมด (${total} รายการ)`);
  // ป้ายอยู่เหนือคำ ไม่ล้นออกนอกหัวเว็บ และไม่บังเมนูถัดไป
  const [b, l, next, header] = await Promise.all([
    link.locator(".nav-count").boundingBox(), link.boundingBox(),
    page.locator(".nav > a[href='/#products']").boundingBox(), page.locator("#header").boundingBox(),
  ]);
  expect(b!.y + b!.height).toBeLessThanOrEqual(l!.y + 6);
  expect(b!.y).toBeGreaterThanOrEqual(header!.y);
  expect(b!.x + b!.width).toBeLessThan(next!.x + 4);
  // หน้าอื่นก็มีป้าย (อยู่ในส่วนหัวของทุกหน้า)
  await page.goto("/");
  await expect(page.locator(".nav-count")).toHaveText(total);
  // มือถือ: ตัวเลขอยู่ท้ายเมนูในลิ้นชัก
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#menuBtn");
  await expect(page.locator(".dr-all .dr-count")).toHaveText(total);
  await expect(page.locator(".dr-all")).toBeVisible();
});
