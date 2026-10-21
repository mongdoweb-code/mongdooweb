// คำสั่งซื้อครบวงจร: สร้างออเดอร์ → แนบสลิป → แอดมินอนุมัติ → ออกใบเสร็จ → พิมพ์ใบเสร็จ/ใบปะหน้า
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { V, buyableProduct, confirmClick, login, todayBkk, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });
let orderNo = "";
const phone = `08${String(Date.now()).slice(-8)}`;

test("ลูกค้าสร้างคำสั่งซื้อและแนบสลิป (ยอดคำนวณที่เซิร์ฟเวอร์)", async ({ page, request }) => {
  const p = await buyableProduct(page);
  // ส่งยอดปลอมมา server ต้องไม่เชื่อ
  const r = await request.post("/api/orders", {
    data: { items: { [p.id]: 2 }, shipping: "std", total: 1, address: { name: "ทดสอบ อีทูอี", phone, addr: "99 หมู่ 1", sub: "บางกรวย", dist: "บางกรวย", prov: "นนทบุรี", zip: "11130" } },
  });
  expect(r.status()).toBe(201);
  const o = await r.json();
  orderNo = o.orderNo;
  expect(orderNo).toMatch(/^MDW-\d{6}-\d{4}$/);
  expect(o.subtotalSatang).toBe(Math.round(p.price * 100) * 2);
  const slip = await request.post(`/api/orders/${orderNo}/slip`, {
    multipart: { phone, paidAt: `${todayBkk()}T00:00`, amount: String(o.totalSatang / 100), slip: { name: "slip.png", mimeType: "image/png", buffer: readFileSync("tests/fixtures/slip.png") } },
  });
  expect(slip.status()).toBe(201);
  // เบอร์ไม่ตรงต้องแนบไม่ได้
  const bad = await request.post(`/api/orders/${orderNo}/slip`, {
    multipart: { phone: "0899999999", paidAt: `${todayBkk()}T00:00`, amount: "1", slip: { name: "s.png", mimeType: "image/png", buffer: readFileSync("tests/fixtures/slip.png") } },
  });
  expect(bad.status()).toBeGreaterThanOrEqual(400);
});

test("แอดมินอนุมัติ → ออกใบเสร็จ → พิมพ์เอกสารและใบปะหน้า", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto(`/admin?tab=PENDING_VERIFICATION&open=${orderNo}`);
  await expect(page.locator(".drawer-panel" + V)).toContainText(orderNo);
  await page.click(`.drawer-panel button:has-text("อนุมัติ")${V}`);
  // สลิปซ้ำ/ยอดไม่ตรง → มีหน้าต่างยืนยันอีกชั้น (สลิปตัวอย่างถูกใช้ซ้ำทุกครั้งที่รันเทสต์)
  const dlg = page.locator(`.dlg button:has-text("ยืนยัน")${V}`).last();
  if (await dlg.waitFor({ timeout: 3000 }).then(() => true, () => false)) await dlg.click();
  await expect(page.locator(`.drawer-panel h3:has-text("เอกสารขาย")${V}`)).toBeVisible();
  await confirmClick(page, '.drawer-panel button:has-text("ออกใบเสร็จรับเงิน")', "ออกใบเสร็จ");
  await page.waitForURL(/\/admin\/docs\/RECEIPT\/.+issued=1/);
  await expect(page.locator(".dv-title .num" + V)).toHaveText(/^RC\d{4}-\d{5}$/);
  const rcUrl = page.url().split("?")[0];
  const rcId = rcUrl.split("/").pop()!;
  await page.goto(`/admin/print/doc/${rcId}`);
  await expect(page.locator(".pp-sheets .sheet").first()).toBeVisible();
  await expect(page).toHaveTitle(/^RC\d{4}-\d{5}$/);
  await page.goto(`/admin/print/labels?orders=${orderNo}&size=A4&boxes=2`);
  await expect(page.locator(".label")).toHaveCount(2);
  expect(errors).toEqual([]);
});
