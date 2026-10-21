// รอบ 2 ล็อต 2 (U16–U30): ตะกร้า ค่าส่ง หน้าชำระเงิน ใบกำกับภาษี ย่อสลิป หน้าสำเร็จ ติดตาม ใบเสร็จลูกค้า
// ฟอร์มขอใบเสนอราคา/ติดต่อ หน้าเนื้อหา/FAQ Analytics ตามความยินยอม และแถบประกาศ
// ใช้ฐานข้อมูลจริงของแอป (DATABASE_URL จาก .env) เพื่อจัดสถานะทดสอบ และคืนค่าตั้งร้านเดิมเมื่อจบ
import "dotenv/config";
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import pg from "pg";
import sharp from "sharp";
import { V, buyableProduct, confirmClick, login, todayBkk, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });

const db = new pg.Client({ connectionString: (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "") });
const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows as T[];
// แต่ละเทสต์ใช้ IP สมมติของตัวเอง (x-forwarded-for) — ตัวจำกัดจำนวนครั้งต่อ IP จะไม่ชนกันเมื่อรันซ้ำ
const fakeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const uniqPhone = () => `08${String(Date.now()).slice(-8)}`;
const ADDR = { name: "ทดสอบ ล็อตสอง", addr: "99 หมู่ 1", sub: "บางกรวย", dist: "บางกรวย", prov: "นนทบุรี", zip: "11130" };

/** เลขผู้เสียภาษีที่ checksum ถูกต้อง */
function taxId(base12 = "010555012345") {
  const s = [...base12].reduce((a, c, i) => a + Number(c) * (13 - i), 0);
  return base12 + ((11 - (s % 11)) % 10);
}

type Saved = Record<string, unknown>;
let saved: Saved | null = null;

/** บันทึกตั้งค่าร้าน 1 ครั้งจากหลังบ้าน → ล้างแคชหน้าร้าน (updateTag storefront) ให้ค่าที่แก้ใน DB มีผล */
async function refreshStorefront(page: Page) {
  await login(page);
  await page.goto("/admin/settings");
  await page.locator("button[type=submit]:has-text('บันทึกการตั้งค่า')" + V).first().click();
  await expect(page.locator(".login-info[role=status]" + V).first()).toBeVisible();
  await page.context().clearCookies();
}

async function setShop(fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  await q(`UPDATE "ShopSetting" SET ${keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ")} WHERE id = 'shop'`, keys.map((k) => fields[k]));
}

async function seedCart(page: Page, cart: Record<string, number>, seen: Record<string, number> = {}) {
  await page.goto("/privacy");
  await page.evaluate(([c, s]) => {
    localStorage.setItem("mdw_cart", JSON.stringify(c));
    localStorage.setItem("mdw_cart_seen", JSON.stringify(s));
    localStorage.setItem("mdw_consent", JSON.stringify({ v: 1, necessary: true, analytics: false, marketing: false }));
  }, [cart, seen] as const);
}

async function createPaidOrderApi(request: APIRequestContext, slug: string, phone: string, ip: string) {
  const r = await request.post("/api/orders", { headers: { "x-forwarded-for": ip }, data: { items: { [slug]: 1 }, shipping: "std", address: { ...ADDR, phone } } });
  expect(r.status()).toBe(201);
  const o = await r.json();
  const s = await request.post(`/api/orders/${o.orderNo}/slip`, {
    headers: { "x-forwarded-for": ip },
    multipart: { phone, paidAt: `${todayBkk()}T00:00`, amount: String(o.totalSatang / 100), slip: { name: "slip.png", mimeType: "image/png", buffer: readFileSync("tests/fixtures/slip.png") } },
  });
  expect(s.status()).toBe(201);
  return o as { orderNo: string; totalSatang: number; shippingSatang: number };
}

test.beforeAll(async () => {
  await db.connect();
  [saved] = await q(`SELECT "announcementEnabled","announcementText","announcementHref","ga4Id","metaPixelId",faq FROM "ShopSetting" WHERE id='shop'`);
});

test.afterAll(async ({ browser }) => {
  // คำสั่งซื้อทดสอบที่ค้างในคิวตรวจสลิป → ยกเลิก (ไม่ให้ไปปนคิวของเทสต์อื่น)
  await q(`UPDATE "Order" SET status = 'CANCELLED', "cancelReason" = 'e2e lot2' WHERE "customerName" = $1 AND status IN ('AWAITING_SLIP', 'PENDING_VERIFICATION')`, [ADDR.name]);
  if (saved) {
    await setShop({ ...saved, faq: JSON.stringify(saved.faq ?? []) });
    const page = await browser.newPage();
    await refreshStorefront(page).catch(() => {});
    await page.close();
  }
  await db.end();
});

test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
  // ไม่ต้องโหลดสคริปต์ภายนอกจริงระหว่างทดสอบ
  await page.route(/googletagmanager|google-analytics|connect\.facebook\.net|images\.unsplash|fonts\.g/, (r) => r.abort());
});

test("U16 ตะกร้าตรวจกับเซิร์ฟเวอร์: ราคาเปลี่ยน, ปิดขาย, สต็อกไม่พอ → แจ้งและปรับให้", async ({ page }) => {
  const errors = trackErrors(page);
  const p = await buyableProduct(page);
  const [stocked] = await q<{ slug: string; stock: number; name: string }>(
    `SELECT p.slug, p.stock, p.name FROM "Product" p JOIN "Category" c ON c.id = p."categoryId"
     WHERE p."trackStock" AND p.stock BETWEEN 1 AND 50 AND p."isActive" AND NOT p."isService" AND c."isActive" AND p."priceSatang" > 0 AND p.slug <> $1 LIMIT 1`,
    [p.id],
  );
  const cart: Record<string, number> = { [p.id]: 1, "ไม่มีสินค้านี้-xyz": 2 };
  if (stocked) cart[stocked.slug] = stocked.stock + 5;
  await seedCart(page, cart, { [p.id]: p.price + 123 });
  await page.goto("/");
  await page.click("#cartBtn");
  const notice = page.locator("#cartNotice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("ปิดการขาย");
  await expect(notice).toContainText("ราคาเปลี่ยน");
  if (stocked) await expect(notice).toContainText(`เหลือ ${stocked.stock} ชิ้น`);
  const ls = await page.evaluate(() => JSON.parse(localStorage.getItem("mdw_cart")!));
  expect(ls["ไม่มีสินค้านี้-xyz"]).toBeUndefined();
  expect(ls[p.id]).toBe(1);
  if (stocked) expect(ls[stocked.slug]).toBe(stocked.stock);
  // ราคาในตะกร้า = ราคาจริงในฐานข้อมูล
  const [row] = await q<{ priceSatang: number }>(`SELECT "priceSatang" FROM "Product" WHERE slug = $1`, [p.id]);
  await expect(page.locator(".ci", { hasText: p.name.slice(0, 12) }).locator(".ci-unit")).toContainText((row.priceSatang / 100).toLocaleString("th-TH"));
  // API ตรงๆ
  const r = await page.request.post("/api/cart/validate", { data: { items: { [p.id]: 2, "x-nope": 1 } } });
  const body = await r.json();
  expect(body.lines.find((l: { id: string }) => l.id === "x-nope").status).toBe("gone");
  expect(body.subtotal).toBe((row.priceSatang * 2) / 100);
  expect(errors).toEqual([]);
});

test("U17 แถบส่งฟรี + ค่าส่งโดยประมาณ ตรงกับยอดตอนชำระเงิน", async ({ page, request }) => {
  const p = await buyableProduct(page);
  await seedCart(page, { [p.id]: 1 });
  await page.goto("/");
  await page.click("#cartBtn");
  const v = await (await request.post("/api/cart/validate", { data: { items: { [p.id]: 1 } } })).json();
  await expect(page.locator("#cartShip")).toHaveText(v.shipping === 0 ? "ส่งฟรี" : `฿${v.shipping.toLocaleString("th-TH")}`);
  if (v.freeShipFrom && v.subtotal < v.freeShipFrom) {
    await expect(page.locator("#cartShipBar")).toContainText("ซื้อเพิ่มอีก");
    await expect(page.locator("#cartShipBar")).toContainText(`฿${(v.freeShipFrom - v.subtotal).toLocaleString("th-TH")}`);
  }
  // ยอดตอนสั่งซื้อจริง (server) เท่ากับค่าส่งที่ตะกร้าแสดง
  const o = await request.post("/api/orders", { headers: { "x-forwarded-for": fakeIp() }, data: { items: { [p.id]: 1 }, shipping: "std", address: { ...ADDR, phone: uniqPhone() } } });
  expect((await o.json()).shippingSatang).toBe(Math.round(v.shipping * 100));
  await page.screenshot({ path: "test-results/lot2-cart-desktop.png" });
});

test("U18–U20 หน้าชำระเงิน: จังหวัด/รหัสไปรษณีย์/เบอร์ ผิดส่งไม่ได้, ใบกำกับภาษี, ไม่จำที่อยู่เป็นค่าเริ่มต้น", async ({ page, request }) => {
  const errors = trackErrors(page);
  const p = await buyableProduct(page);
  await seedCart(page, { [p.id]: 1 });
  await page.evaluate(() => localStorage.removeItem("mdw_ship"));
  await page.goto("/checkout");
  await expect(page.locator("#step1")).toBeVisible();
  expect(await page.locator("#prov option").count()).toBe(78); // 77 จังหวัด + ตัวเลือกว่าง
  await expect(page.locator("#remember")).not.toBeChecked();
  await page.click("#step1 button[type=submit]");
  await expect(page.locator("#err-name")).toBeVisible();
  await expect(page.locator("#name")).toHaveAttribute("aria-invalid", "true");
  await page.fill("#name", ADDR.name);
  await page.fill("#phone", "0812");
  await page.fill("#addr", ADDR.addr);
  await page.fill("#sub", ADDR.sub);
  await page.fill("#dist", ADDR.dist);
  await page.selectOption("#prov", "นนทบุรี");
  await page.fill("#zip", "10110");
  await page.click("#step1 button[type=submit]");
  await expect(page.locator("#err-phone")).toContainText("เบอร์โทรไม่ถูกต้อง");
  await expect(page.locator("#err-zip")).toContainText("ไม่ตรงกับจังหวัด");
  await expect(page.locator("#step2")).toBeHidden();
  await page.fill("#phone", "02-123-4567"); // เบอร์บ้าน 9 หลักใช้ได้
  await page.fill("#zip", "11130");
  // ใบกำกับภาษี: เลขผิด checksum ไม่ผ่าน
  await page.check("#wantTax");
  await page.fill("#tiName", "บริษัท ทดสอบ จำกัด");
  await page.fill("#tiTaxId", "0105550123450");
  await page.click("#step1 button[type=submit]");
  const good = taxId();
  if (good !== "0105550123450") await expect(page.locator("#err-tiTaxId")).toBeVisible();
  await page.fill("#tiTaxId", good);
  await page.click("#step1 button[type=submit]");
  await expect(page.locator("#step2")).toBeVisible();
  const orderNo = (await page.locator("#orderNo").textContent())!.trim();
  // ไม่ได้ติ๊ก "จำที่อยู่" → ไม่มีข้อมูลในเครื่อง (PDPA)
  expect(await page.evaluate(() => localStorage.getItem("mdw_ship"))).toBeNull();
  const [o] = await q<{ taxInvoice: { name: string; taxId: string; branch: string; address: string; kind: string } }>(`SELECT "taxInvoice" FROM "Order" WHERE "orderNo" = $1`, [orderNo]);
  expect(o.taxInvoice).toMatchObject({ kind: "COMPANY", name: "บริษัท ทดสอบ จำกัด", taxId: good, branch: "สำนักงานใหญ่" });
  expect(o.taxInvoice.address).toContain("11130");
  // server ตรวจซ้ำ (ไม่เชื่อเบราว์เซอร์)
  const h = { "x-forwarded-for": fakeIp() };
  const bad1 = await request.post("/api/orders", { headers: h, data: { items: { [p.id]: 1 }, address: { ...ADDR, phone: uniqPhone(), zip: "10110" } } });
  expect(bad1.status()).toBe(400);
  expect((await bad1.json()).fields).toContain("zip");
  const bad2 = await request.post("/api/orders", { headers: h, data: { items: { [p.id]: 1 }, address: { ...ADDR, phone: uniqPhone(), prov: "เมืองสมมติ" } } });
  expect((await bad2.json()).fields).toContain("prov");
  const bad3 = await request.post("/api/orders", { headers: h, data: { items: { [p.id]: 1 }, address: { ...ADDR, phone: "0123" } } });
  expect((await bad3.json()).fields).toContain("phone");
  const bad4 = await request.post("/api/orders", {
    headers: h,
    data: { items: { [p.id]: 1 }, address: { ...ADDR, phone: uniqPhone() }, taxInvoice: { kind: "COMPANY", name: "บริษัท ก", taxId: "1234567890123", address: "1 ถนนทดสอบ แขวงทดสอบ" } },
  });
  expect((await bad4.json()).fields).toContain("tiTaxId");
  expect(errors).toEqual([]);
});

test("U19 จำที่อยู่เมื่อติ๊กเท่านั้น และลบได้", async ({ page }) => {
  const p = await buyableProduct(page);
  await seedCart(page, { [p.id]: 1 });
  await page.goto("/checkout");
  for (const [k, v] of Object.entries({ ...ADDR, phone: "0812345678" })) {
    if (k === "prov") await page.selectOption("#prov", v);
    else await page.fill(`#${k}`, v);
  }
  await page.check("#remember");
  await page.click("#step1 button[type=submit]");
  await expect(page.locator("#step2")).toBeVisible();
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem("mdw_ship")!));
  expect(s).toMatchObject({ v: 2, name: ADDR.name, zip: "11130" });
  await page.goto("/checkout");
  await expect(page.locator("#savedAddr")).toBeVisible();
  await expect(page.locator("#name")).toHaveValue(ADDR.name);
  await page.click("#forgetAddr");
  expect(await page.evaluate(() => localStorage.getItem("mdw_ship"))).toBeNull();
  await expect(page.locator("#remember")).not.toBeChecked();
});

test("U21–U22 สลิปใหญ่ถูกย่อก่อนอัปโหลด → หน้าสั่งซื้อสำเร็จ (คัดลอก/บันทึกรูป/พิมพ์/ลิงก์ติดตาม)", async ({ page }, info) => {
  const errors = trackErrors(page);
  const p = await buyableProduct(page);
  await seedCart(page, { [p.id]: 1 });
  await page.goto("/checkout");
  const phone = uniqPhone();
  for (const [k, v] of Object.entries({ ...ADDR, phone })) {
    if (k === "prov") await page.selectOption("#prov", v);
    else await page.fill(`#${k}`, v);
  }
  await page.click("#step1 button[type=submit]");
  await expect(page.locator("#step2")).toBeVisible();
  const orderNo = (await page.locator("#orderNo").textContent())!.trim();
  await page.click("[data-goto='3']" + V);
  // รูปจากกล้องมือถือจำลอง: JPEG 4000×3000 ขนาด 8 MB ขึ้นไป
  const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 40 } } }).jpeg({ quality: 95 }).toBuffer();
  expect(big.length).toBeGreaterThan(8 * 1024 * 1024);
  await page.setInputFiles("#slip", { name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: big });
  await expect(page.locator("#previewSize")).toContainText("ย่อจาก", { timeout: 30_000 });
  await page.fill("#paidTime", "00:00");
  await page.click("#submitBtn");
  await expect(page.locator("#doneView")).toBeVisible({ timeout: 30_000 });
  const [slip] = await q<{ sizeBytes: number }>(`SELECT s."sizeBytes" FROM "PaymentSlip" s JOIN "Order" o ON o.id = s."orderId" WHERE o."orderNo" = $1`, [orderNo]);
  expect(slip.sizeBytes).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  // หน้าสำเร็จ
  await expect(page.locator("#doneNo")).toHaveText(orderNo);
  await expect(page.locator("#doneItems")).toContainText(p.name.slice(0, 10));
  await expect(page.locator("#doneBanks .bank-card").first()).toBeVisible();
  await expect(page.locator("#doneTrack")).toHaveAttribute("href", `/track?no=${orderNo}`);
  expect(await page.evaluate(() => localStorage.getItem("mdw_cart"))).toBeNull();
  const dl = page.waitForEvent("download");
  await page.click("#doneImage");
  expect((await dl).suggestedFilename()).toBe(`${orderNo}.png`);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#doneImage")).toBeHidden();
  await page.screenshot({ path: info.outputPath("done-print.png"), fullPage: true });
  await page.emulateMedia({ media: "screen" });
  await page.screenshot({ path: "test-results/lot2-done-desktop.png", fullPage: true });
  // ลิงก์ติดตาม: แท็บเดียวกันค้นหาให้อัตโนมัติ
  await page.click("#doneTrack");
  await expect(page.locator(".order-card" + V)).toContainText(orderNo);
  await expect(page.locator(".trk-steps li.now" + V)).toContainText("ตรวจสลิป");
  expect(errors).toEqual([]);
});

test("U22 โอนทีหลัง → หน้าสำเร็จแบบรอชำระ พร้อมช่องทางโอน (มือถือ)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const p = await buyableProduct(page);
  await seedCart(page, { [p.id]: 1 });
  await page.goto("/checkout");
  for (const [k, v] of Object.entries({ ...ADDR, phone: uniqPhone() })) {
    if (k === "prov") await page.selectOption("#prov", v);
    else await page.fill(`#${k}`, v);
  }
  await page.click("#step1 button[type=submit]");
  await page.click("#payLater");
  await expect(page.locator("#doneTitle")).toContainText("รอการชำระเงิน");
  await expect(page.locator("#doneUpload")).toBeVisible();
  await expect(page.locator("#donePayNote")).toContainText("โอนยอด");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/lot2-done-mobile.png", fullPage: true });
});

test("U23–U24 ติดตาม: ต้องใช้เบอร์, ไทม์ไลน์, ลิงก์ขนส่ง, ใบเสร็จผ่านลิงก์ลับ (ไม่มีโทเคน = 404)", async ({ page, request }) => {
  test.setTimeout(120_000);
  const errors = trackErrors(page);
  const p = await buyableProduct(page);
  const phone = uniqPhone();
  const o = await createPaidOrderApi(request, p.id, phone, fakeIp());
  // เบอร์ไม่ตรง = ไม่พบ
  await page.goto(`/track?no=${o.orderNo}`);
  await expect(page.locator("#orderNo")).toHaveValue(o.orderNo);
  await page.fill("#phone", "0899999999");
  await page.click(".track-form button[type=submit]");
  await expect(page.locator(".form-error")).toContainText("ไม่พบคำสั่งซื้อ");
  // แอดมินอนุมัติ + ออกใบเสร็จ
  await login(page);
  await page.goto(`/admin?tab=PENDING_VERIFICATION&open=${o.orderNo}`);
  await page.click(`.drawer-panel button:has-text("อนุมัติ")${V}`);
  const dlg = page.locator(`.dlg button:has-text("ยืนยัน")${V}`).last();
  if (await dlg.waitFor({ timeout: 3000 }).then(() => true, () => false)) await dlg.click();
  await expect(page.locator(`.drawer-panel h3:has-text("เอกสารขาย")${V}`).or(page.locator(`.drawer-panel button:has-text("อนุมัติ")${V}`)).first()).toBeVisible();
  // หลังอนุมัติ หน้าต่างอาจเลื่อนไปคิวถัดไป → เปิดคำสั่งซื้อนี้อีกครั้งในแท็บ "ชำระแล้ว"
  await page.goto(`/admin?tab=PAID&open=${o.orderNo}`);
  await expect(page.locator(".drawer-panel" + V)).toContainText(o.orderNo);
  await confirmClick(page, '.drawer-panel button:has-text("ออกใบเสร็จรับเงิน")', "ออกใบเสร็จ");
  await page.waitForURL(/\/admin\/docs\/RECEIPT\/.+issued=1/);
  const rcId = page.url().split("?")[0].split("/").pop()!;
  await page.context().clearCookies();
  // จัดส่งด้วย Kerry
  await q(`UPDATE "Order" SET status = 'SHIPPED', carrier = 'Kerry Express', "trackingNo" = 'KEX123456789', "shippedAt" = now() WHERE "orderNo" = $1`, [o.orderNo]);
  await page.goto(`/track?no=${o.orderNo}`);
  await page.fill("#phone", phone);
  await page.click(".track-form button[type=submit]");
  const card = page.locator(".order-card" + V);
  await expect(card).toContainText("จัดส่งแล้ว");
  expect(await page.locator(".trk-steps li.done" + V).count()).toBe(4);
  await expect(card.locator(".trk-ship a")).toHaveAttribute("href", /kerryexpress\.com.*KEX123456789/);
  const link = card.locator(".trk-docs a").first();
  await expect(link).toHaveAttribute("href", new RegExp(`^/track/receipt/${rcId}\\?t=[A-Za-z0-9_-]{43}$`));
  const url = (await link.getAttribute("href"))!;
  // เปิดใบเสร็จ (หน้าพิมพ์ A4 เดียวกับหลังบ้าน)
  await page.goto(url);
  await expect(page.locator(".pp-sheets .sheet").first()).toBeVisible();
  await expect(page).toHaveTitle(/^RC\d{4}-\d{5}$/);
  await page.screenshot({ path: "test-results/lot2-receipt.png" });
  // ไม่มีโทเคน / โทเคนผิด = ไม่พบเอกสาร
  for (const bad of [`/track/receipt/${rcId}`, `/track/receipt/${rcId}?t=${"x".repeat(43)}`, `/track/receipt/${rcId}?t=short`]) {
    await page.goto(bad);
    await expect(page.locator("[data-testid=receipt-404]")).toBeVisible();
    await expect(page.locator(".sheet")).toHaveCount(0);
    const html = await (await request.get(bad)).text();
    expect(html).not.toContain(o.orderNo);
    expect(html).toContain("noindex");
  }
  // โทเคนเดิมใช้ซ้ำได้ (ไม่สุ่มใหม่ทุกครั้ง)
  const [d] = await q<{ publicToken: string }>(`SELECT "publicToken" FROM "SalesDocument" WHERE id = $1`, [rcId]);
  expect(url).toContain(d.publicToken);
  expect(errors).toEqual([]);
});

test("U25 ขอใบเสนอราคา: สินค้าจากตะกร้า + รูปแนบ → Inquiry, รูปไม่เปิดสาธารณะ, honeypot, จำกัดครั้ง", async ({ page, request }) => {
  const errors = trackErrors(page);
  const p = await buyableProduct(page);
  await seedCart(page, { [p.id]: 3 });
  await page.goto("/quote");
  await expect(page.locator(".q-items")).toContainText(p.name.slice(0, 10));
  const form = page.locator("form.l2-form");
  await form.locator("button[type=submit]").click();
  await expect(page.locator(".l2-err")).toBeVisible();
  const phone = uniqPhone();
  await form.locator("input[name=name]").fill("คุณทดสอบ ใบเสนอราคา");
  await form.locator("input[name=phone]").fill(phone);
  await form.locator("input[name=company]").fill("บริษัท สระสวย จำกัด");
  await form.locator("textarea[name=message]").fill("สระขนาด 4x8 เมตร ต้องการไฟใต้น้ำ RGB 6 ดวง");
  await page.waitForTimeout(2600); // กันบอท: ส่งเร็วเกินไปจะไม่ถูกบันทึก
  const photo = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#4a90d9" } }).jpeg().toBuffer();
  await form.locator("input[type=file]").setInputFiles({ name: "pool.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.locator(".att-list img")).toHaveCount(1);
  await page.screenshot({ path: "test-results/lot2-quote-desktop.png", fullPage: true });
  await form.locator("button[type=submit]").click();
  await expect(page.locator(".l2-ok")).toContainText("ได้รับคำขอใบเสนอราคาแล้ว");
  const [inq] = await q<{ id: string; kind: string; items: { slug: string; qty: number }[]; attachments: string[]; company: string; ipHash: string }>(
    `SELECT id, kind, items, attachments, company, "ipHash" FROM "Inquiry" WHERE phone = $1`,
    [phone],
  );
  expect(inq.kind).toBe("QUOTE");
  expect(inq.company).toBe("บริษัท สระสวย จำกัด");
  expect(inq.items).toEqual([expect.objectContaining({ slug: p.id, qty: 3 })]);
  expect(inq.attachments).toHaveLength(1);
  expect(inq.attachments[0]).toMatch(/^inquiries\/\d{4}\/\d{2}\/.+\.webp$/);
  expect(inq.ipHash).toMatch(/^[a-f0-9]{32}$/);
  // รูปลูกค้าไม่เปิดผ่าน /media และ route แอดมินต้องเข้าสู่ระบบ
  expect((await request.get(`/media/${inq.attachments[0]}`)).status()).toBe(404);
  const file = await request.get(`/admin/inquiries/${inq.id}/file/0`, { maxRedirects: 0 });
  expect(file.status(), "ไม่ได้เข้าสู่ระบบ → ส่งไปหน้าเข้าสู่ระบบ").toBe(307);
  expect(file.headers()["location"]).toMatch(/\/admin\/login$/);
  expect((await request.get(`/api/inquiries/${inq.id}/attachments/0`)).status()).toBe(404); // route เดิมถูกลบแล้ว
  // honeypot: ตอบเหมือนสำเร็จ แต่ไม่บันทึก
  const botPhone = uniqPhone().replace(/^08/, "09");
  const bot = await request.post("/api/inquiries", {
    headers: { "x-forwarded-for": fakeIp() },
    multipart: { kind: "CONTACT", name: "Bot", phone: botPhone, message: "buy cheap stuff now now now", website: "http://spam.example" },
  });
  expect(bot.status()).toBe(201);
  expect(await q(`SELECT id FROM "Inquiry" WHERE phone = $1`, [botPhone])).toHaveLength(0);
  // จำกัดจำนวนครั้งต่อ IP
  const ip = fakeIp();
  const statuses: number[] = [];
  for (let i = 0; i < 7; i++) {
    const r = await request.post("/api/inquiries", { headers: { "x-forwarded-for": ip }, multipart: { kind: "CONTACT", name: "ทดสอบจำกัด", phone: `08${String(Date.now() + i).slice(-8)}`, message: "ทดสอบการจำกัดจำนวนครั้ง" } });
    statuses.push(r.status());
  }
  expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
  expect(statuses.at(-1)).toBe(429);
  expect(errors).toEqual([]);
});

test("U26 ติดต่อเรา: ข้อมูลจากตั้งค่าร้าน + ฟอร์ม CONTACT (มือถือ)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/contact");
  const [s] = await q<{ phone: string; email: string | null; addressText: string; businessHours: string | null }>(`SELECT phone, email, "addressText", "businessHours" FROM "ShopSetting" WHERE id='shop'`);
  const aside = page.locator(".l2-aside").first();
  await expect(aside).toContainText(s.addressText);
  if (s.businessHours) await expect(aside).toContainText(s.businessHours);
  if (s.email) await expect(aside.locator(`a[href="mailto:${s.email}"]`)).toBeVisible();
  await expect(aside.locator("a[href^='https://www.google.com/maps/search/']")).toBeVisible();
  await expect(aside.locator("a[href^='tel:']")).toBeVisible();
  const form = page.locator("form.l2-form");
  const phone = uniqPhone();
  await form.locator("input[name=name]").fill("คุณติดต่อ");
  await form.locator("input[name=phone]").fill(phone);
  await form.locator("textarea[name=message]").fill("อยากทราบว่ามีหน้าร้านให้เข้าไปดูสินค้าไหมครับ");
  await page.waitForTimeout(2600);
  await form.locator("button[type=submit]").click();
  await expect(page.locator(".l2-ok")).toBeVisible();
  const [inq] = await q<{ kind: string }>(`SELECT kind FROM "Inquiry" WHERE phone = $1`, [phone]);
  expect(inq.kind).toBe("CONTACT");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/lot2-contact-mobile.png", fullPage: true });
});

test("U28 วิธีสั่งซื้อ / เกี่ยวกับเรา / นโยบาย / รับประกัน แสดงเนื้อหาพร้อมข้อมูลร้าน และลิงก์เมนูถูกต้อง", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto("/how-to-order");
  await expect(page.locator("h1")).toHaveText("วิธีสั่งซื้อและชำระเงิน");
  await expect(page.locator(".prose")).toContainText("แนบสลิป");
  await expect(page.locator(".prose")).not.toContainText("{{");
  await page.goto("/about");
  await expect(page.locator("h1")).toHaveText("เกี่ยวกับเรา");
  await expect(page.locator(".prose a[href^='tel:']")).toBeVisible();
  await page.goto("/privacy");
  await expect(page.locator(".prose h2").first()).toContainText("ผู้ควบคุมข้อมูล");
  await page.goto("/warranty");
  await expect(page.locator(".prose")).toContainText("รับประกัน");
  // เมนูหัวเว็บ + ท้ายเว็บ
  await expect(page.locator("nav.nav a[href='/how-to-order']")).toBeVisible();
  await expect(page.locator("nav.nav a[href='/contact']")).toBeVisible();
  for (const href of ["/how-to-order", "/about", "/quote", "/contact", "/privacy", "/warranty", "/track"]) {
    await expect(page.locator(`footer a[href='${href}']`).first()).toBeAttached();
    expect((await page.request.get(href)).status()).toBe(200);
  }
  expect(errors).toEqual([]);
});

test("U27 + U29 + U30 FAQ, Analytics ตามความยินยอม และแถบประกาศ จากตั้งค่าร้าน", async ({ page }) => {
  test.setTimeout(120_000);
  // ค่าเริ่มต้น: ไม่มี FAQ → ซ่อนเมนู และ /faq ไม่พบ
  await setShop({ faq: "[]", ga4Id: null, metaPixelId: null, announcementEnabled: true, announcementText: "โปรทดสอบ ลด 10% ทั้งร้าน", announcementHref: "/products" });
  await refreshStorefront(page);
  await page.goto("/");
  await expect(page.locator("footer a[href='/faq']")).toHaveCount(0);
  const faq404 = await page.goto("/faq");
  expect(faq404?.status()).toBe(404);
  // แถบประกาศจากตั้งค่า (ลิงก์ได้)
  await page.goto("/");
  await expect(page.locator("#topbar a[href='/products']")).toHaveText("โปรทดสอบ ลด 10% ทั้งร้าน");

  // เปิด FAQ + รหัส Analytics
  await setShop({
    faq: JSON.stringify([
      { q: "ไฟใต้น้ำต้องใช้หม้อแปลงไหม?", a: "ต้องใช้หม้อแปลง DC12V\n- เลือกวัตต์มากกว่าโคม 20%" },
      { q: "ส่งกี่วัน?", a: "2–3 วันทำการ" },
    ]),
    ga4Id: "G-TEST12345",
    metaPixelId: "123456789012345",
  });
  await refreshStorefront(page);
  await page.goto("/faq");
  await expect(page.locator(".faq-list details")).toHaveCount(2);
  await expect(page.locator(".faq-list .faq-a li").first()).toContainText("วัตต์");
  const ld = await page.evaluate(() =>
    [...document.querySelectorAll("script[type='application/ld+json']")].map((s) => JSON.parse(s.textContent || "{}")).find((j) => j["@type"] === "FAQPage"),
  );
  expect(ld["@type"]).toBe("FAQPage");
  expect(ld.mainEntity[0].acceptedAnswer.text).toContain("DC12V");
  await expect(page.locator("footer a[href='/faq']")).toBeAttached();

  // ยังไม่ยินยอม → ไม่มีสคริปต์ภายนอก
  await page.evaluate(() => localStorage.removeItem("mdw_consent"));
  await page.goto("/");
  await expect(page.locator("#consent")).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator("script[src*='googletagmanager']")).toHaveCount(0);
  await expect(page.locator("script[src*='fbevents']")).toHaveCount(0);
  // ยอมรับเฉพาะวิเคราะห์ → GA4 อย่างเดียว
  await page.click("#consentSettings");
  await page.check("#ckAnalytics");
  await page.click("#consentSave");
  await expect(page.locator("script[src*='googletagmanager.com/gtag/js?id=G-TEST12345']")).toHaveCount(1);
  await expect(page.locator("script[src*='fbevents']")).toHaveCount(0);
  // event ใส่ตะกร้าไปที่ GA4 (dataLayer) เมื่อยินยอมแล้ว
  await page.locator("[data-add]").filter({ visible: true }).first().click();
  const events = await page.evaluate(() => ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((a) => Array.from(a)[1]));
  expect(events).toContain("add_to_cart");
  // ยอมรับทั้งหมด → Meta Pixel ด้วย
  await page.goto("/");
  await page.click("#openConsent");
  await page.check("#ckMarketing");
  await page.click("#consentSave");
  await expect(page.locator("script[src*='connect.facebook.net/en_US/fbevents.js']")).toHaveCount(1);
  // หน้าชำระเงินก็เคารพความยินยอมเหมือนกัน
  await page.evaluate(() => localStorage.setItem("mdw_consent", JSON.stringify({ v: 1, necessary: true, analytics: false, marketing: false })));
  await page.goto("/checkout");
  await page.waitForTimeout(800);
  await expect(page.locator("script[src*='googletagmanager'], script[src*='fbevents']")).toHaveCount(0);

  // ปิดแถบประกาศ → ไม่แสดง
  await setShop({ announcementEnabled: false });
  await refreshStorefront(page);
  await page.goto("/");
  await expect(page.locator("#topbar")).toHaveCount(0);
  await page.screenshot({ path: "test-results/lot2-home-no-topbar.png" });
});
