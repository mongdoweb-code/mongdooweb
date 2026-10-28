// ท้ายเว็บ: QR เพิ่มเพื่อน LINE (สร้างจากลิงก์ LINE ในหน้าตั้งค่าร้าน) · ช่องทางชำระเงินอยู่ใต้หมวดยอดนิยม · ไม่ล้นจอมือถือ
import { expect, test } from "@playwright/test";

for (const width of [1440, 390])
  test(`QR LINE ท้ายเว็บ (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const qr = page.locator("footer .f-qr");
    await expect(qr.locator(".f-qr-img svg")).toBeVisible();
    await expect(qr).toHaveAttribute("href", /^https:\/\/line\.me\//);
    await expect(qr).toContainText("สแกนเพิ่มเพื่อน");
    // ไอคอน LINE เดิมในแถวโซเชียลถูกแทนด้วย QR
    await expect(page.locator('footer .social a[data-line]')).toHaveCount(0);
    // ช่องทางชำระเงินอยู่คอลัมน์เดียวกับหมวดยอดนิยม
    await expect(page.locator("footer div:has(> #footerCats) .f-pay")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
