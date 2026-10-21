// ตรวจซ้ำหน้าร้าน (AI Recheck รอบ 2, U1–U30): สิ่งที่แก้เพิ่มหลังตรวจ
// - ใบกำกับภาษีจากหน้าชำระเงิน → หลังบ้าน → ใบเสร็จ (U20) และลิงก์ใบเสร็จลูกค้า 404 จริงเมื่อโทเคนผิด (U24)
// - 404 จริง (ไม่ใช่ soft 404) ของสินค้าที่ไม่มี/ปิดขาย และ /faq ที่ไม่มีเนื้อหา
// - สินค้าที่ดูล่าสุดในตะกร้าว่างทุกหน้า (U9), ค้นหาด่วนด้วยรหัสสินค้า (U10)
// - axe ทั้งหน้า (รวมส่วนหัว/ตะกร้า/เมนูมือถือ/ท้ายเว็บ/แบนเนอร์คุกกี้) ไม่มี serious/critical (U15)
import "dotenv/config";
import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { V, buyableProduct, confirmClick, login, todayBkk, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });

const db = new pg.Client({ connectionString: (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "") });
const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows as T[];
const fakeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const uniqPhone = () => `08${String(Date.now()).slice(-8)}`;
const ADDR = { name: "ทดสอบ ตรวจซ้ำ", addr: "99 หมู่ 1", sub: "บางกรวย", dist: "บางกรวย", prov: "นนทบุรี", zip: "11130" };
type Item = { id: string; name: string; price: number; inStock: boolean; sku?: string; img?: string };

function taxId(base12: string) {
  const s = [...base12].reduce((a, c, i) => a + Number(c) * (13 - i), 0);
  return base12 + ((11 - (s % 11)) % 10);
}
const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");

async function catalog(page: Page) {
  await page.goto("/");
  return page.evaluate(() => JSON.parse(document.getElementById("mdw-data")!.textContent!).catalog as Item[]);
}

test.beforeAll(async () => {
  await db.connect();
});
test.afterAll(async () => {
  await q(`UPDATE "Order" SET status = 'CANCELLED', "cancelReason" = 'e2e recheck' WHERE "customerName" = $1 AND status IN ('AWAITING_SLIP', 'PENDING_VERIFICATION')`, [ADDR.name]);
  await db.end();
});
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
  await page.route(/googletagmanager|google-analytics|connect\.facebook\.net|images\.unsplash|fonts\.g/, (r) => r.abort());
});

test("U20 + U24: ขอใบกำกับภาษีตอนสั่งซื้อ → หลังบ้านเห็น → ใบเสร็จมีเลขผู้เสียภาษีผู้ซื้อ → ลิงก์ลูกค้าใช้ได้ด้วยโทเคนเท่านั้น", async ({ page, request }) => {
  test.setTimeout(150_000);
  const errors = trackErrors(page);
  const p = await buyableProduct(page);
  const phone = uniqPhone();
  const tid = taxId(`0105${String(Date.now()).slice(-8)}`);
  // ลูกค้าสั่งผ่านหน้าชำระเงินจริง พร้อมขอใบกำกับภาษี
  await page.evaluate((id) => {
    localStorage.setItem("mdw_cart", JSON.stringify({ [id]: 1 }));
    localStorage.setItem("mdw_consent", JSON.stringify({ v: 1, necessary: true, analytics: false, marketing: false }));
  }, p.id);
  await page.goto("/checkout");
  await page.fill("#name", ADDR.name);
  await page.fill("#phone", phone);
  await page.fill("#addr", ADDR.addr);
  await page.fill("#sub", ADDR.sub);
  await page.fill("#dist", ADDR.dist);
  await page.selectOption("#prov", ADDR.prov);
  await page.fill("#zip", ADDR.zip);
  await page.check("#wantTax");
  await page.fill("#tiName", "บริษัท ตรวจซ้ำ จำกัด");
  await page.fill("#tiTaxId", tid);
  if (await page.locator("#tiAddr").isVisible()) await page.fill("#tiAddr", "88/8 ถนนออกบิล แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร 10110");
  await page.click("#step1 button[type=submit]");
  await expect(page.locator("#step2")).toBeVisible();
  const orderNo = (await page.locator("#orderNo").textContent())!.trim();
  const [o] = await q<{ totalSatang: number }>(`SELECT "totalSatang" FROM "Order" WHERE "orderNo" = $1`, [orderNo]);
  const slip = await request.post(`/api/orders/${orderNo}/slip`, {
    headers: { "x-forwarded-for": fakeIp() },
    multipart: { phone, paidAt: `${todayBkk()}T00:00`, amount: String(o.totalSatang / 100), slip: { name: "slip.png", mimeType: "image/png", buffer: readFileSync("tests/fixtures/slip.png") } },
  });
  expect(slip.status()).toBe(201);

  // หลังบ้าน: ลิ้นชักคำสั่งซื้อแสดงข้อมูลใบกำกับภาษี → อนุมัติ → ออกใบเสร็จ
  await login(page);
  await page.goto(`/admin?tab=PENDING_VERIFICATION&open=${orderNo}`);
  const drawer = page.locator(".drawer-panel" + V);
  await expect(drawer).toContainText("บริษัท ตรวจซ้ำ จำกัด");
  expect(digits(await drawer.textContent())).toContain(tid);
  await page.click(`.drawer-panel button:has-text("อนุมัติ")${V}`);
  const dlg = page.locator(`.dlg button:has-text("ยืนยัน")${V}`).last();
  if (await dlg.waitFor({ timeout: 3000 }).then(() => true, () => false)) await dlg.click();
  await expect(page.locator(`.drawer-panel h3:has-text("เอกสารขาย")${V}`).or(page.locator(`.drawer-panel button:has-text("อนุมัติ")${V}`)).first()).toBeVisible();
  await page.goto(`/admin?tab=PAID&open=${orderNo}`);
  await expect(page.locator(".drawer-panel" + V)).toContainText(orderNo);
  await confirmClick(page, '.drawer-panel button:has-text("ออกใบเสร็จรับเงิน")', "ออกใบเสร็จ");
  await page.waitForURL(/\/admin\/docs\/RECEIPT\/.+issued=1/);
  const rcId = page.url().split("?")[0].split("/").pop()!;
  const [doc] = await q<{ customerSnapshot: { name: string; taxId: string } }>(`SELECT "customerSnapshot" FROM "SalesDocument" WHERE id = $1`, [rcId]);
  expect(doc.customerSnapshot.name).toBe("บริษัท ตรวจซ้ำ จำกัด");
  expect(digits(doc.customerSnapshot.taxId)).toBe(tid);
  await page.context().clearCookies();

  // ลูกค้า: หน้าติดตาม (ยืนยันเบอร์) → ลิงก์ใบเสร็จลับ → ใบเสร็จ A4 มีชื่อบริษัท + เลขผู้เสียภาษี
  await page.goto(`/track?no=${orderNo}`);
  await page.fill("#phone", phone);
  await page.click(".track-form button[type=submit]");
  const link = page.locator(".order-card" + V).locator(".trk-docs a").first();
  await expect(link).toHaveAttribute("href", new RegExp(`^/track/receipt/${rcId}\\?t=[A-Za-z0-9_-]{43}$`));
  const url = (await link.getAttribute("href"))!;
  const ok = await page.goto(url);
  expect(ok!.status()).toBe(200);
  const sheet = page.locator(".pp-sheets .sheet").first();
  await expect(sheet).toContainText("บริษัท ตรวจซ้ำ จำกัด");
  expect(digits(await sheet.textContent())).toContain(tid);
  // ไม่มีโทเคน / โทเคนผิด (รูปแบบถูก) / รหัสเอกสารผิด → HTTP 404 จริง ไม่รั่วข้อมูล
  const token = new URL(url, "http://x").searchParams.get("t")!;
  const wrong = (token[0] === "A" ? "B" : "A") + token.slice(1);
  for (const bad of [`/track/receipt/${rcId}`, `/track/receipt/${rcId}?t=${wrong}`, `/track/receipt/nope${rcId}?t=${token}`, `/track/receipt/${rcId}?t=short`]) {
    const r = await request.get(bad);
    expect(r.status(), bad).toBe(404);
    const html = await r.text();
    expect(html).not.toContain(orderNo);
    expect(html).not.toContain("ตรวจซ้ำ");
  }
  expect(errors).toEqual([]);
});

test("404 จริง: สินค้าที่ไม่มี/ปิดขาย และ /faq ที่ไม่มีเนื้อหา (ไม่ใช่ soft 404)", async ({ page, request }) => {
  const r = await request.get("/product/no-such-product-recheck", { maxRedirects: 0 });
  expect(r.status()).toBe(404);
  await page.goto("/product/no-such-product-recheck");
  await expect(page.locator("h1" + V)).toHaveText("ไม่พบหน้าที่คุณต้องการ");
  await expect(page.locator("#cartBtn")).toBeVisible(); // ยังอยู่ในโครงหน้าร้าน
  // สินค้าที่ปิดขาย → 404 · เปิดกลับ → 200
  const items = await catalog(page);
  const p = items.find((x) => x.price > 0)!;
  await q(`UPDATE "Product" SET "isActive" = false WHERE slug = $1`, [p.id]);
  try {
    expect((await request.get(`/product/${encodeURIComponent(p.id)}`)).status()).toBe(404);
  } finally {
    await q(`UPDATE "Product" SET "isActive" = true WHERE slug = $1`, [p.id]);
  }
  expect((await request.get(`/product/${encodeURIComponent(p.id)}`)).status()).toBe(200);
  // URL เดิมภาษาไทยยังส่งต่อ 301 เหมือนเดิม
  const legacy = await request.get(`/product/${encodeURIComponent("ไม่มีสินค้านี้")}`, { maxRedirects: 0 });
  expect(legacy.status()).toBe(301);
  // FAQ ว่าง → 404 · มีเนื้อหา → 200
  const [s] = await q<{ faq: unknown }>(`SELECT faq FROM "ShopSetting" WHERE id = 'shop'`);
  try {
    await q(`UPDATE "ShopSetting" SET faq = '[]'::jsonb WHERE id = 'shop'`);
    expect((await request.get("/faq")).status()).toBe(404);
  } finally {
    await q(`UPDATE "ShopSetting" SET faq = $1::jsonb WHERE id = 'shop'`, [JSON.stringify(s.faq ?? [])]);
  }
});

test("U9 + U10: ตะกร้าว่างแสดงสินค้าที่ดูล่าสุดทุกหน้า (หน้าแรกด้วย) · ค้นหาด่วนด้วยรหัสสินค้า", async ({ page }) => {
  const errors = trackErrors(page);
  const items = (await catalog(page)).filter((x) => x.sku);
  const [a, b] = items;
  await page.evaluate(([x, y]) => {
    localStorage.removeItem("mdw_cart");
    localStorage.setItem("mdw_recent", JSON.stringify([{ id: x, t: 3 }, { id: "ปิดขายแล้ว-xyz", t: 2 }, { id: y, t: 1 }]));
  }, [a.id, b.id]);
  for (const url of ["/", "/contact"]) {
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { mdwShellReady?: boolean }).mdwShellReady);
    await page.click("#cartBtn");
    const box = page.locator("#cart .cart-recent");
    await expect(box).toBeVisible();
    await expect(box.locator("li")).toHaveCount(2); // สินค้าที่ไม่อยู่ในร้านแล้วไม่แสดง
    await expect(box.locator("li").first()).toContainText(a.name.slice(0, 10));
    await expect(box.locator("a").first()).toHaveAttribute("href", `/product/${encodeURIComponent(a.id)}`);
    await page.keyboard.press("Escape");
  }
  // ไม่มีคุกกี้ติดตาม
  expect((await page.context().cookies()).filter((c) => /recent|view/i.test(c.name))).toEqual([]);
  // ค้นหาด่วน (ตัวพิมพ์เล็ก) ด้วยรหัสสินค้า → รายการแรกคือสินค้านั้น
  await page.click("#searchBtn");
  await page.fill("#q", b.sku!.toLowerCase());
  const first = page.locator("#suggest .sg-opt").first();
  await expect(first).toHaveAttribute("href", `/product/${encodeURIComponent(b.id)}`);
  await expect(first).toContainText(b.sku!);
  expect(errors).toEqual([]);
});

test.describe("U15 axe ทั้งหน้า (รวมส่วนกลางของหน้าร้าน)", () => {
  async function scan(page: Page, url: string, open?: "cart" | "menu") {
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { mdwShellReady?: boolean }).mdwShellReady || !!document.getElementById("hdrCart"));
    if (open === "cart") await page.click("#cartBtn");
    if (open === "menu") await page.click("#menuBtn");
    if (open) await page.waitForTimeout(400);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    return r.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${url}${open ? `[${open}]` : ""} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
  }
  const PAGES = ["/", "/category/underwater-light", "/search?q=zzqx", "/checkout", "/track", "/quote", "/contact", "/about", "/how-to-order", "/privacy", "/no-such-page"];

  for (const [label, width] of [["เดสก์ท็อป 1366", 1366], ["มือถือ 390", 390]] as const) {
    test(label, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 860 });
      const items = await catalog(page);
      const pages = [...PAGES, `/product/${encodeURIComponent(items.find((x) => x.price > 0 && x.img)!.id)}`];
      const ask = items.find((x) => x.price === 0);
      if (ask) pages.push(`/product/${encodeURIComponent(ask.id)}`);
      const bad: string[] = [];
      for (const u of pages) bad.push(...(await scan(page, u)));
      bad.push(...(await scan(page, "/", "cart")));
      if (width < 769) bad.push(...(await scan(page, "/", "menu")));
      expect(bad).toEqual([]);
    });
  }
});
