// รอบ 3 ล็อต 11 — ชำระเงินและหลังการขาย:
// U2/A2 คูปอง · U16/U17/A16 เคลม/คืนสินค้า · U18 ลูกค้ายกเลิกเอง · U19 แนบสลิปเพิ่ม · U20/A17 COD · U21/U22/A18 ค่าส่งห่างไกล/น้ำหนัก/รับที่ร้าน
// U23/A19 อีเมล · U24 ใบสั่งซื้อ PDF · U25 ยืนยันใบเสนอราคาออนไลน์ · U26/A20 ชำระใบแจ้งหนี้ออนไลน์ + อนุมัติสลิป → ใบเสร็จ
// สร้างข้อมูลทดสอบเอง (สินค้า E2E-L11-*, คูปอง, เอกสาร) แล้วลบ/คืนค่าตั้งร้านเมื่อจบ — ผ่านทั้งฐานข้อมูลใหม่และสำเนาข้อมูลจริง
import "dotenv/config";
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import pg from "pg";
import sharp from "sharp";
import { parseShippingTiers, tierFee } from "../../src/lib/shipping";
import { V, confirmClick, login, todayBkk, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });

const TAG = `l11${Date.now().toString(36)}`;
const SLIP = readFileSync("tests/fixtures/slip.png");
// SMTP จริง (ไม่ใช่ค่าตัวอย่างจาก .env.example) — ไม่มี = อีเมลถูกบันทึกเป็น SKIPPED
const SMTP_REAL = !!process.env.SMTP_HOST && !/example\.(com|org|net)$/i.test(process.env.SMTP_HOST) && !/^change-?me$/i.test(process.env.SMTP_PASSWORD ?? "");
const db = new pg.Client({ connectionString: (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "") });
const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows as T[];
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await q<T>(sql, args))[0];
const phone = (n: number) => `08${String(Date.now() + n).slice(-8)}`;
const ip = (n: number) => ({ "x-forwarded-for": `10.11.${(Date.now() >> 8) % 250}.${n}` });
const uniqPng = async (seed: number) =>
  sharp({ create: { width: 40, height: 60, channels: 3, background: { r: seed % 255, g: (seed * 7) % 255, b: (seed * 13) % 255 } } }).png().toBuffer();

let catA = "", catB = "", prodA = "", prodB = "";
const SLUG_A = `e2e-${TAG}-a`, SLUG_B = `e2e-${TAG}-b`;
let settingsBackup: Record<string, unknown> = {};
let tiers: ReturnType<typeof parseShippingTiers> = [];
let couponId = "", couponCode = "";
const orders: string[] = [];
const docs: string[] = [];
let customerId = "";
let codOrder = "", codPhone = "";
const lineRecipient = `e2e-${TAG}`;

const addr = (p: string, zip = "11130", prov = "นนทบุรี") => ({ name: "ทดสอบ ล็อตสิบเอ็ด", phone: p, email: "", addr: "99 หมู่ 1", sub: "บางกรวย", dist: "บางกรวย", prov, zip });

async function postOrder(request: APIRequestContext, body: Record<string, unknown>, n: number) {
  const r = await request.post("/api/orders", { data: body, headers: ip(n) });
  const j = await r.json();
  if (r.status() === 201) orders.push(j.orderNo);
  return { status: r.status(), body: j };
}

test.beforeAll(async ({ browser }) => {
  await db.connect();
  const cats = await q<{ id: string }>(`SELECT id FROM "Category" WHERE "isActive" ORDER BY "sortOrder", id LIMIT 2`);
  [catA, catB] = [cats[0].id, cats[1].id];
  prodA = `e2e-${TAG}-pa`;
  prodB = `e2e-${TAG}-pb`;
  await q(
    `INSERT INTO "Product"(id, sku, slug, name, "priceSatang", "trackStock", stock, "inStock", "weightGram", images, "lightColor", "categoryId", "updatedAt")
     VALUES ($1, $2, $3, 'โคมไฟทดสอบ ล็อต 11 ตัวหนัก (ทดสอบ)', 50000, true, 50, true, 6000, '{}', 'WHITE', $4, now()),
            ($5, $6, $7, 'อุปกรณ์ทดสอบ ล็อต 11 (ทดสอบ)', 20000, false, 0, true, NULL, '{}', 'WHITE', $8, now())`,
    [prodA, `E2E-L11-A-${TAG}`, SLUG_A, catA, prodB, `E2E-L11-B-${TAG}`, SLUG_B, catB],
  );
  const s = await one<Record<string, unknown>>(
    `SELECT "codEnabled","codFeeSatang","codMaxSatang","remoteZips","remoteFeeSatang","weightTiers","pickupEnabled","pickupNote","emailEnabled","emailTemplates","shippingTiers" FROM "ShopSetting" WHERE id='shop'`,
  );
  settingsBackup = s;
  tiers = parseShippingTiers(s.shippingTiers);
  await q(
    `UPDATE "ShopSetting" SET "codEnabled"=true, "codFeeSatang"=3000, "codMaxSatang"=0, "remoteZips"='{95}', "remoteFeeSatang"=5000,
       "weightTiers"='[{"maxGram":5000,"extraSatang":0},{"maxGram":20000,"extraSatang":8000}]', "pickupEnabled"=true, "pickupNote"='จ.–ส. 9:00–17:00 (ทดสอบ)', "emailEnabled"=true WHERE id='shop'`,
  );
  if (process.env.LINE_MOCK_LOG)
    await q(`INSERT INTO "LineRecipient"(id,kind,"lineId",name,enabled,"updatedAt") VALUES ($1,'GROUP',$2,'e2e lot11',true,now())`, [lineRecipient, `C${TAG}`]);
  void browser;
});

test.afterAll(async () => {
  try {
    const ids = (await q<{ id: string }>(`SELECT id FROM "Order" WHERE "orderNo" = ANY($1) OR id IN (SELECT "orderId" FROM "OrderItem" WHERE "productId" = ANY($2))`, [orders, [prodA, prodB]])).map((r) => r.id);
    await q(`DELETE FROM "Claim" WHERE "orderId" = ANY($1)`, [ids]);
    await q(`DELETE FROM "EmailLog" WHERE "orderId" = ANY($1) OR "to" LIKE $2`, [ids, `%${TAG}%`]);
    // เอกสารที่ออกจากคำสั่งซื้อ/สร้างในเทสต์ (ใบเสร็จก่อน แล้วใบแจ้งหนี้/ใบเสนอราคา)
    const docIds = (await q<{ id: string }>(`SELECT id FROM "SalesDocument" WHERE id = ANY($1) OR "sourceId" = ANY($1) OR "orderId" = ANY($2)`, [docs, ids])).map((r) => r.id);
    await q(`DELETE FROM "SalesDocument" WHERE id = ANY($1) AND type='RECEIPT'`, [docIds]);
    await q(`DELETE FROM "SalesDocument" WHERE id = ANY($1)`, [docIds]);
    await q(`DELETE FROM "Order" WHERE id = ANY($1)`, [ids]);
    if (couponId) await q(`DELETE FROM "Coupon" WHERE id=$1 OR code LIKE $2`, [couponId, `%${TAG.toUpperCase()}%`]);
    if (customerId) await q(`DELETE FROM "Customer" WHERE id=$1`, [customerId]);
    await q(`DELETE FROM "Customer" WHERE name LIKE 'ทดสอบ ล็อตสิบเอ็ด%' AND id NOT IN (SELECT "customerId" FROM "SalesDocument" WHERE "customerId" IS NOT NULL) AND id NOT IN (SELECT "customerId" FROM "Order" WHERE "customerId" IS NOT NULL)`);
    await q(`DELETE FROM "StockMovement" WHERE "productId" = ANY($1)`, [[prodA, prodB]]);
    await q(`DELETE FROM "Product" WHERE id = ANY($1)`, [[prodA, prodB]]);
    await q(`DELETE FROM "LineRecipient" WHERE id=$1`, [lineRecipient]);
    const s = settingsBackup;
    if (Object.keys(s).length)
      await q(
        `UPDATE "ShopSetting" SET "codEnabled"=$1,"codFeeSatang"=$2,"codMaxSatang"=$3,"remoteZips"=$4,"remoteFeeSatang"=$5,"weightTiers"=$6,"pickupEnabled"=$7,"pickupNote"=$8,"emailEnabled"=$9,"emailTemplates"=$10 WHERE id='shop'`,
        [s.codEnabled, s.codFeeSatang, s.codMaxSatang, s.remoteZips, s.remoteFeeSatang, JSON.stringify(s.weightTiers), s.pickupEnabled, s.pickupNote, s.emailEnabled, JSON.stringify(s.emailTemplates)],
      );
  } finally {
    await db.end();
  }
});

async function admin(page: Page) {
  await login(page);
}

// ---------------------------------------------------------------------------
test("A2 แอดมินสร้างคูปอง (% + เพดาน + เฉพาะหมวด + จำกัดจำนวน/ต่อเบอร์)", async ({ page }) => {
  const errors = trackErrors(page);
  await admin(page);
  await page.goto("/admin/coupons");
  couponCode = `E2E-${TAG.toUpperCase()}`;
  await page.fill("#cpCode" + V, couponCode.toLowerCase());
  await page.selectOption("#cpKind" + V, "PERCENT");
  await page.fill("#cpValue" + V, "10");
  await page.fill("#cpMax" + V, "100");
  await page.fill("#cpLimit" + V, "2");
  await page.fill("#cpPhone" + V, "1");
  await page.check(`input[name=categoryIds][value="${catA}"]` + V);
  await page.click("#couponForm button[type=submit]" + V);
  await page.waitForURL(/\/admin\/coupons\/[^/?]+\?saved=1/);
  couponId = page.url().split("/").pop()!.split("?")[0];
  const c = await one<{ code: string; value: number; categoryIds: string[]; usageLimit: number; perPhoneLimit: number; maxDiscountSatang: number }>(`SELECT * FROM "Coupon" WHERE id=$1`, [couponId]);
  expect(c).toMatchObject({ code: couponCode, value: 1000, categoryIds: [catA], usageLimit: 2, perPhoneLimit: 1, maxDiscountSatang: 10000 });
  await expect(page.locator("#couponKpis" + V)).toContainText("0 / 2");
  await page.goto("/admin/coupons");
  await expect(page.locator("#couponTable" + V)).toContainText(couponCode);
  expect(errors).toEqual([]);
});

test("U2/U21 คิดส่วนลดเฉพาะหมวด + ค่าส่งตามน้ำหนัก/พื้นที่ห่างไกล + COD ที่เซิร์ฟเวอร์ · จำกัดต่อเบอร์ · กันใช้เกินพร้อมกัน · แก้คำสั่งซื้อคิดใหม่", async ({ request }) => {
  const items = { [SLUG_A]: 1, [SLUG_B]: 1 };
  const p1 = phone(1);
  // แสดงผล: ส่วนลด 10% เฉพาะหมวดของสินค้า A (500) = 50, น้ำหนัก 6 กก. = +80, รหัส 95xxx = +50, COD +30
  const pv = await (await request.post("/api/orders/preview", { data: { items, shipping: "std", zip: "95120", payment: "COD", coupon: couponCode.toLowerCase(), phone: p1 }, headers: ip(1) })).json();
  const base = tierFee(tiers, 70000);
  expect(pv).toMatchObject({ subtotalSatang: 70000, discountSatang: 5000, couponCode, weightFeeSatang: 8000, remoteFeeSatang: 5000, codFeeSatang: 3000, paymentMethod: "COD" });
  expect(pv.shippingSatang).toBe(base + 8000 + 5000);
  expect(pv.totalSatang).toBe(70000 - 5000 + base + 13000 + 3000);
  const bad = await (await request.post("/api/orders/preview", { data: { items, shipping: "std", coupon: "NOPE-XYZ" }, headers: ip(1) })).json();
  expect(bad.couponError).toContain("ไม่พบโค้ด");
  expect(bad.discountSatang).toBe(0);
  // รับที่ร้าน: ไม่มีค่าส่ง (ไม่คิดน้ำหนัก/ห่างไกล) และไม่ใช้ COD
  const pk = await (await request.post("/api/orders/preview", { data: { items, shipping: "pickup", zip: "95120", payment: "COD" }, headers: ip(1) })).json();
  expect(pk).toMatchObject({ shippingMethod: "pickup", shippingSatang: 0, paymentMethod: "TRANSFER" });
  expect(pk.codError).toBeTruthy();

  // บันทึกจริง — ส่งยอดปลอมมา server ต้องไม่เชื่อ
  const o1 = await postOrder(request, { items, shipping: "std", address: addr(p1), coupon: couponCode, total: 1 }, 2);
  expect(o1.status).toBe(201);
  expect(o1.body).toMatchObject({ discountSatang: 5000, couponCode, subtotalSatang: 70000 });
  expect(o1.body.printUrl).toMatch(/^\/track\/order\/MDW-\d{6}-\d{4}\?t=[A-Za-z0-9_-]{43}$/);
  // เบอร์เดิมใช้ซ้ำไม่ได้ (จำกัด 1 ครั้งต่อเบอร์)
  const o2 = await postOrder(request, { items, shipping: "std", address: addr(p1), coupon: couponCode }, 3);
  expect(o2.status).toBe(409);
  expect(o2.body.fields).toContain("coupon");
  expect(o2.body.error).toContain("เบอร์โทรนี้ใช้โค้ด");
  // ใช้ได้รวม 2 ครั้ง: ยิงพร้อมกัน 3 คำสั่งซื้อ (คนละเบอร์) → ผ่านได้แค่ 1
  const rs = await Promise.all([4, 5, 6].map((n) => postOrder(request, { items: { [SLUG_A]: 1 }, shipping: "std", address: addr(phone(n)), coupon: couponCode }, n)));
  expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
  expect(rs.filter((r) => r.status === 409)).toHaveLength(2);
  expect((await one<{ n: number }>(`SELECT "usedCount" n FROM "Coupon" WHERE id=$1`, [couponId])).n).toBe(2);
  expect((await one<{ n: string }>(`SELECT count(*) n FROM "CouponRedemption" WHERE "couponId"=$1`, [couponId])).n).toBe("2");
  // ย้อนกลับไปแก้คำสั่งซื้อเดิม (ไม่ใช้คูปองแล้ว) → คิดยอดใหม่ + คืนสิทธิ์
  const e1 = await postOrder(request, { items, shipping: "std", address: addr(p1), orderNo: o1.body.orderNo }, 7);
  expect(e1.status).toBe(201);
  expect(e1.body.orderNo).toBe(o1.body.orderNo);
  expect(e1.body.discountSatang).toBe(0);
  expect((await one<{ n: number }>(`SELECT "usedCount" n FROM "Coupon" WHERE id=$1`, [couponId])).n).toBe(1);
  // ใส่คูปองกลับ → ใช้ได้อีกครั้ง
  const e2 = await postOrder(request, { items, shipping: "std", address: addr(p1), orderNo: o1.body.orderNo, coupon: couponCode }, 8);
  expect(e2.body.discountSatang).toBe(5000);
  expect((await one<{ n: number }>(`SELECT "usedCount" n FROM "Coupon" WHERE id=$1`, [couponId])).n).toBe(2);
  const row = await one<{ totalSatang: number; discountSatang: number; couponCode: string }>(`SELECT "totalSatang","discountSatang","couponCode" FROM "Order" WHERE "orderNo"=$1`, [o1.body.orderNo]);
  expect(row).toEqual({ totalSatang: 70000 - 5000 + base + 8000, discountSatang: 5000, couponCode });
});

test("U2/U20/U21/U22 หน้าชำระเงิน: คูปอง · รับที่ร้าน · ค่าส่งห่างไกล · เก็บเงินปลายทาง → หน้าสำเร็จ + ใบสั่งซื้อ PDF (U24)", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setExtraHTTPHeaders(ip(20));
  // คูปองเดิมใช้ครบแล้ว → ยกเพดานจำนวนครั้งให้ทดสอบหน้าเว็บ
  await q(`UPDATE "Coupon" SET "usageLimit"=10 WHERE id=$1`, [couponId]);
  await page.goto("/how-to-order");
  await page.evaluate((slug) => localStorage.setItem("mdw_cart", JSON.stringify({ [slug]: 1 })), SLUG_A);
  await page.goto("/checkout");
  await expect(page.locator("#step1")).toBeVisible();
  await expect(page.locator("#sumItems")).toContainText("ล็อต 11");
  // คูปอง
  await page.fill("#coupon", couponCode.toLowerCase());
  await page.click("#couponApply");
  await expect(page.locator("#err-coupon")).toContainText(`ใช้โค้ด ${couponCode}`);
  await expect(page.locator("#sDiscRow")).toBeVisible();
  await expect(page.locator("#sDisc")).toContainText("50");
  // รับที่ร้าน: ซ่อนที่อยู่ ไม่มีค่าส่ง และใช้ COD ไม่ได้
  await page.check("input[name=ship][value=pickup]");
  await expect(page.locator("#addrBox")).toBeHidden();
  await expect(page.locator("#pickupBox")).toContainText("ทดสอบ");
  await expect(page.locator("input[name=pay][value=COD]")).toBeDisabled();
  await expect(page.locator("#sShip")).toContainText("รับที่ร้าน");
  // ส่งธรรมดาไปพื้นที่ห่างไกล + เก็บเงินปลายทาง
  await page.check("input[name=ship][value=std]");
  await expect(page.locator("#addrBox")).toBeVisible();
  codPhone = phone(21);
  await page.fill("#name", "ทดสอบ ล็อตสิบเอ็ด COD");
  await page.fill("#phone", codPhone);
  await page.fill("#email", `e2e-${TAG}@example.com`);
  await page.fill("#addr", "1 ถนนทดสอบ");
  await page.fill("#sub", "สะเตง");
  await page.fill("#dist", "เมืองยะลา");
  await page.selectOption("#prov", "ยะลา");
  await page.fill("#zip", "95000");
  await expect(page.locator("#sShipNote")).toContainText("พื้นที่ห่างไกล");
  await expect(page.locator("#sShipNote")).toContainText("น้ำหนัก");
  await page.check("input[name=pay][value=COD]");
  await expect(page.locator("#sCodRow")).toBeVisible();
  await page.click("#step1 button[type=submit]");
  await expect(page.locator("#codPane")).toBeVisible();
  await expect(page.locator("#payTabs")).toBeHidden();
  codOrder = (await page.locator("#orderNo").textContent())!.trim();
  orders.push(codOrder);
  const before = await one<{ status: string; paymentMethod: string; codFeeSatang: number; remoteFeeSatang: number; discountSatang: number; shippingSatang: number; totalSatang: number }>(
    `SELECT status, "paymentMethod", "codFeeSatang", "remoteFeeSatang", "discountSatang", "shippingSatang", "totalSatang" FROM "Order" WHERE "orderNo"=$1`, [codOrder]);
  expect(before).toMatchObject({ status: "AWAITING_SLIP", paymentMethod: "COD", codFeeSatang: 3000, remoteFeeSatang: 5000, discountSatang: 5000 });
  expect(before.shippingSatang).toBe(tierFee(tiers, 50000) + 8000 + 5000);
  expect(before.totalSatang).toBe(50000 - 5000 + before.shippingSatang + 3000);
  await page.click("#codConfirm");
  await expect(page.locator("#doneView")).toBeVisible();
  await expect(page.locator("#doneTitle")).toContainText("ร้านจะโทรยืนยัน");
  await expect(page.locator("#doneRows")).toContainText("ส่วนลด");
  await expect(page.locator("#doneRows")).toContainText("เก็บเงินปลายทาง");
  expect((await one<{ status: string }>(`SELECT status FROM "Order" WHERE "orderNo"=$1`, [codOrder])).status).toBe("PENDING_VERIFICATION");
  // U24 ใบสั่งซื้อ
  const pdf = await page.locator("#donePdf").getAttribute("href");
  expect(pdf).toMatch(/^\/track\/order\//);
  await page.goto(pdf!);
  await expect(page).toHaveTitle(codOrder);
  await expect(page.locator(".osheet")).toContainText(codOrder);
  await expect(page.locator("#osDiscount")).toContainText("50.00");
  await expect(page.locator("#osTotal")).toContainText((before.totalSatang / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }));
  await expect(page.locator("#printOrder")).toBeVisible();
  // โทเคนผิด = ไม่พบ
  await page.goto(pdf!.replace(/t=.{5}/, "t=xxxxx"));
  await expect(page.getByTestId("order-404")).toBeVisible();
  // U23: อีเมล "ได้รับคำสั่งซื้อ" ถูกบันทึก (ไม่มี SMTP = SKIPPED ไม่ทำให้สั่งซื้อล้ม)
  await expect.poll(async () => (await q(`SELECT status FROM "EmailLog" WHERE template='ORDER_RECEIVED' AND "orderId"=(SELECT id FROM "Order" WHERE "orderNo"=$1)`, [codOrder])).length).toBeGreaterThan(0);
  const em = await one<{ status: string }>(`SELECT status FROM "EmailLog" WHERE template='ORDER_RECEIVED' AND "orderId"=(SELECT id FROM "Order" WHERE "orderNo"=$1)`, [codOrder]);
  expect(SMTP_REAL ? ["SENT", "FAILED"] : ["SKIPPED"]).toContain(em.status);
  expect(errors).toEqual([]);
});

test("A17 แอดมินยืนยัน COD → ตัดสต็อก → จัดส่ง → กระทบยอดรับเงินจากขนส่ง + CSV · ส่วนลด/ค่าธรรมเนียมแสดงในหลังบ้าน", async ({ page }) => {
  const errors = trackErrors(page);
  await admin(page);
  await page.goto(`/admin?tab=COD&open=${codOrder}`);
  await expect(page.locator(".tab.on" + V)).toContainText("รอยืนยัน COD");
  await expect(page.locator("#codChip" + V)).toBeVisible();
  await expect(page.locator("#drawerDiscount" + V)).toContainText(couponCode);
  await page.click('#codConfirmBox button:has-text("ยืนยันคำสั่งซื้อ COD")' + V);
  await expect.poll(async () => (await one<{ status: string }>(`SELECT status FROM "Order" WHERE "orderNo"=$1`, [codOrder])).status).toBe("PAID");
  expect((await one<{ stock: number }>(`SELECT stock FROM "Product" WHERE id=$1`, [prodA])).stock).toBe(49);
  expect((await q(`SELECT 1 FROM "OrderEvent" WHERE type='COD_CONFIRMED' AND "orderId"=(SELECT id FROM "Order" WHERE "orderNo"=$1)`, [codOrder])).length).toBe(1);
  await page.goto(`/admin?tab=PAID&open=${codOrder}`);
  await page.fill("#trackNo" + V, "KEX11" + Date.now().toString().slice(-7));
  await page.click('button:has-text("บันทึกและแจ้งจัดส่ง")' + V);
  await expect.poll(async () => (await one<{ status: string }>(`SELECT status FROM "Order" WHERE "orderNo"=$1`, [codOrder])).status).toBe("SHIPPED");
  // อีเมลจัดส่ง (U23)
  await expect.poll(async () => (await q(`SELECT 1 FROM "EmailLog" WHERE template='SHIPPED' AND "orderId"=(SELECT id FROM "Order" WHERE "orderNo"=$1)`, [codOrder])).length).toBeGreaterThan(0);
  // กระทบยอด
  await page.goto("/admin/orders/cod");
  await expect(page.locator("#codTable" + V)).toContainText(codOrder);
  await page.check(`#codTable input[value="${codOrder}"]` + V);
  await page.fill("#codRef" + V, "รอบโอนทดสอบ");
  await page.click("#codSettleBtn" + V);
  await expect(page.locator(".login-info" + V)).toContainText("1 รายการ");
  expect((await one<{ s: Date | null }>(`SELECT "codSettledAt" s FROM "Order" WHERE "orderNo"=$1`, [codOrder])).s).not.toBeNull();
  const csv = await page.request.get("/admin/orders/cod/export?view=settled");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(codOrder);
  const ocsv = await page.request.get(`/admin/orders.csv?tab=ALL&q=${codOrder}`);
  expect(await ocsv.text()).toContain("เก็บเงินปลายทาง");
  expect(errors).toEqual([]);
});

test("U18 ลูกค้ายกเลิกคำสั่งซื้อเองจากหน้าติดตาม (คืนสิทธิ์คูปอง) · ห้ามยกเลิกหลังชำระ", async ({ page, request }) => {
  const errors = trackErrors(page);
  await page.setExtraHTTPHeaders(ip(30));
  const p = phone(31);
  const o = await postOrder(request, { items: { [SLUG_A]: 1 }, shipping: "std", address: addr(p), coupon: couponCode }, 31);
  expect(o.status).toBe(201);
  const used = (await one<{ n: number }>(`SELECT "usedCount" n FROM "Coupon" WHERE id=$1`, [couponId])).n;
  await page.goto(`/track?no=${o.body.orderNo}`);
  await page.fill("#phone", p);
  await page.click(".track-form button[type=submit]");
  await expect(page.locator(".order-card")).toBeVisible();
  await expect(page.locator("#trkDiscount")).toContainText(couponCode);
  await page.click("#cancelBox summary");
  await page.selectOption("#cancelReason", { index: 1 });
  await page.check("#cancelBox input[name=sure]");
  await page.click('#cancelBox button:has-text("ยกเลิกคำสั่งซื้อ")');
  await expect(page.locator(".order-card .st").last()).toHaveText("ยกเลิกแล้ว");
  const row = await one<{ status: string; cancelReason: string }>(`SELECT status, "cancelReason" FROM "Order" WHERE "orderNo"=$1`, [o.body.orderNo]);
  expect(row.status).toBe("CANCELLED");
  expect(row.cancelReason).toContain("ลูกค้ายกเลิกเอง");
  expect((await q(`SELECT 1 FROM "OrderEvent" WHERE type='CUSTOMER_CANCELLED' AND "orderId"=(SELECT id FROM "Order" WHERE "orderNo"=$1)`, [o.body.orderNo])).length).toBe(1);
  expect((await one<{ n: number }>(`SELECT "usedCount" n FROM "Coupon" WHERE id=$1`, [couponId])).n).toBe(used - 1);
  // คำสั่งซื้อที่ร้านยืนยัน/จัดส่งแล้วยกเลิกเองไม่ได้ (ไม่มีปุ่ม)
  await page.goto(`/track?no=${codOrder}`);
  await page.fill("#phone", codPhone);
  await page.click(".track-form button[type=submit]");
  await expect(page.locator(".order-card")).toBeVisible();
  await expect(page.locator("#cancelBox")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("U19 แนบสลิปเพิ่มระหว่างรอตรวจ → แอดมินเห็นทุกสลิปและยอดรวม → อนุมัติทุกสลิป", async ({ page, request }) => {
  const errors = trackErrors(page);
  await page.setExtraHTTPHeaders(ip(40));
  const p = phone(41);
  const o = await postOrder(request, { items: { [SLUG_B]: 2 }, shipping: "std", address: addr(p) }, 41);
  const total = o.body.totalSatang as number;
  const half = Math.floor(total / 2);
  const s1 = await request.post(`/api/orders/${o.body.orderNo}/slip`, {
    headers: ip(41), multipart: { phone: p, paidAt: `${todayBkk()}T00:00`, amount: String(half / 100), slip: { name: "s1.png", mimeType: "image/png", buffer: await uniqPng(41) } },
  });
  expect(s1.status()).toBe(201);
  await page.goto(`/track?no=${o.body.orderNo}`);
  await page.fill("#phone", p);
  await page.click(".track-form button[type=submit]");
  await page.click("#moreSlip summary");
  await expect(page.locator("#moreSlip")).toContainText("ส่งแล้ว 1 สลิป");
  await page.setInputFiles("#moreSlip #slipFile", { name: "s2.png", mimeType: "image/png", buffer: await uniqPng(42) });
  await page.fill("#moreSlip #slipTime", "00:00");
  await page.fill("#moreSlip #slipAmt", ((total - half) / 100).toFixed(2));
  await page.click('#moreSlip button:has-text("ส่งสลิปเพิ่ม")');
  await expect(page.locator("#moreSlip")).toContainText("ส่งแล้ว 2 สลิป", { timeout: 20_000 });
  expect((await one<{ n: string; s: string }>(`SELECT count(*) n, sum("declaredAmountSatang") s FROM "PaymentSlip" WHERE "orderId"=(SELECT id FROM "Order" WHERE "orderNo"=$1)`, [o.body.orderNo]))).toEqual({ n: "2", s: String(total) });
  await admin(page);
  await page.goto(`/admin?tab=PENDING_VERIFICATION&open=${o.body.orderNo}`);
  await expect(page.locator("#slipSum" + V)).toContainText("2 สลิป");
  await expect(page.locator(".l3-slips" + V)).toContainText("สลิปครั้งที่ 2");
  await expect(page.locator(".checks" + V)).toContainText("ยอดในสลิปตรงกับยอดสั่งซื้อ");
  await page.click(`.drawer-panel button:has-text("อนุมัติ")${V}`);
  const dlg = page.locator(`.dlg button:has-text("ยืนยัน")${V}`).last();
  if (await dlg.waitFor({ timeout: 3000 }).then(() => true, () => false)) await dlg.click();
  await expect.poll(async () => (await one<{ status: string }>(`SELECT status FROM "Order" WHERE "orderNo"=$1`, [o.body.orderNo])).status).toBe("PAID");
  expect((await q(`SELECT 1 FROM "PaymentSlip" WHERE status='ACCEPTED' AND "orderId"=(SELECT id FROM "Order" WHERE "orderNo"=$1)`, [o.body.orderNo])).length).toBe(2);
  // หลังยืนยันแล้วแนบสลิปเพิ่มไม่ได้
  const late = await request.post(`/api/orders/${o.body.orderNo}/slip`, {
    headers: ip(42), multipart: { phone: p, paidAt: `${todayBkk()}T00:00`, amount: "1", slip: { name: "s.png", mimeType: "image/png", buffer: SLIP } },
  });
  expect(late.status()).toBe(409);
  expect(errors).toEqual([]);
});

test("U16/U17/A16 แจ้งคืนสินค้า (7 วัน) จากหน้าติดตาม → คิวเคลม → ร้านตอบ → ลูกค้าเห็นในหน้าติดตาม · หมดประกันแสดงสถานะ", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setExtraHTTPHeaders(ip(50));
  await page.goto(`/track?no=${codOrder}`);
  await page.fill("#phone", codPhone);
  await page.click(".track-form button[type=submit]");
  await page.click("#trkClaim");
  await page.waitForURL(/\/claim\?no=/);
  // เบอร์ถูกจำไว้ในแท็บนี้ → ค้นหาอัตโนมัติ
  await expect(page.locator("#claimInfo")).toContainText("อยู่ในระยะประกัน");
  await expect(page.locator("#claimInfo")).toContainText("ยังอยู่ในกำหนด");
  await page.check("input[name=kind][value=RETURN]");
  await page.click('#claimForm button[type=submit]');
  await expect(page.locator(".l2-err")).toContainText("อย่างน้อย"); // ต้องเลือก/กรอก/แนบรูป
  await page.fill("#clIssue", "กล่องบุบ โคมแตกตอนได้รับสินค้า (ทดสอบ)");
  await page.setInputFiles('#claimForm input[type=file]', { name: "broken.png", mimeType: "image/png", buffer: await uniqPng(51) });
  await expect(page.locator(".att-list figure")).toHaveCount(1);
  await page.click('#claimForm button[type=submit]');
  await expect(page.locator("#claimDone")).toContainText(/CL\d{4}-\d{5}/);
  const claimNo = (await page.locator("#claimDone b").textContent())!.match(/CL\d{4}-\d{5}/)![0];
  const c = await one<{ id: string; kind: string; inWarranty: boolean; images: string[]; items: { qty: number }[] }>(`SELECT id, kind, "inWarranty", images, items FROM "Claim" WHERE "claimNo"=$1`, [claimNo]);
  expect(c).toMatchObject({ kind: "RETURN", inWarranty: true });
  expect(c.images[0]).toMatch(/^claims\//);
  // แอดมิน: คิว → รายละเอียด (รูปเปิดได้เฉพาะแอดมิน) → อนุมัติพร้อมข้อความถึงลูกค้า
  const anon = await page.request.get(`/admin/claims/${c.id}/photo/0`, { maxRedirects: 0 });
  expect([302, 307, 401]).toContain(anon.status());
  await admin(page);
  await page.goto("/admin/claims");
  await expect(page.locator("#claimTable" + V)).toContainText(claimNo);
  await page.click(`#claimTable a:has-text("${claimNo}")` + V);
  await expect(page.locator("#claimRight" + V)).toContainText("อยู่ในกำหนด 7 วัน");
  const photo = await page.request.get(`/admin/claims/${c.id}/photo/0`);
  expect(photo.headers()["content-type"]).toBe("image/webp");
  // เปลี่ยนเป็นอนุมัติโดยไม่มีข้อความถึงลูกค้า → ต้องเตือน
  await page.selectOption("#clStatus" + V, "APPROVED");
  await page.click("#claimUpdate button[type=submit]" + V);
  await page.waitForURL(/err=resolution/);
  await expect(page.locator(".login-err" + V)).toContainText("ข้อความถึงลูกค้า");
  await page.selectOption("#clStatus" + V, "APPROVED");
  await page.fill("#clResolution" + V, "อนุมัติเปลี่ยนสินค้าใหม่ จัดส่งภายใน 3 วัน (ทดสอบ)");
  await page.click("#claimUpdate button[type=submit]" + V);
  await expect(page.locator(".login-info" + V)).toContainText("บันทึกแล้ว");
  // ลูกค้าเห็นผลในหน้าติดตาม
  await page.goto(`/track?no=${codOrder}`);
  await page.fill("#phone", codPhone);
  await page.click(".track-form button[type=submit]");
  await expect(page.locator("#trkClaims")).toContainText(claimNo);
  await expect(page.locator("#trkClaims")).toContainText("อนุมัติเปลี่ยนสินค้าใหม่");
  // ประกัน 1 ปี: ชำระเมื่อ 400 วันก่อน → หมดประกัน + คืนสินค้าไม่ได้ (ยังแจ้งเคลมได้ ร้านเห็นว่าหมดประกัน)
  await q(`UPDATE "Order" SET "paidAt"=now()-interval '400 days', "shippedAt"=now()-interval '399 days' WHERE "orderNo"=$1`, [codOrder]);
  await page.goto("/claim");
  await page.fill("#clOrderNo", codOrder);
  await page.fill("#clPhone", codPhone);
  await page.click('#claimLookup button[type=submit]');
  await expect(page.locator("#claimInfo")).toContainText("หมดระยะประกันแล้ว");
  await expect(page.locator("input[name=kind][value=RETURN]")).toBeDisabled();
  // เลขที่/เบอร์ผิด
  await page.goto("/claim");
  await page.fill("#clOrderNo", codOrder);
  await page.fill("#clPhone", "0899999999");
  await page.click('#claimLookup button[type=submit]');
  await expect(page.locator(".form-error")).toContainText("ไม่พบคำสั่งซื้อ");
  if (process.env.LINE_MOCK_LOG) await expect.poll(() => readFileSync(process.env.LINE_MOCK_LOG!, "utf8")).toContain(claimNo);
  expect(errors).toEqual([]);
});

async function makeDoc(type: "QUOTATION" | "INVOICE", grand: number) {
  if (!customerId) {
    customerId = `e2e-${TAG}-cu`;
    await q(`INSERT INTO "Customer"(id, code, kind, name, phone, "updatedAt") VALUES ($1, $2, 'COMPANY', 'ทดสอบ ล็อตสิบเอ็ด บริษัท', '0812345678', now())`, [customerId, `E${TAG.slice(-6)}`]);
  }
  const id = `e2e-${TAG}-${type === "QUOTATION" ? "qt" : "iv"}`;
  const no = `${type === "QUOTATION" ? "QT" : "IV"}9911-${String(Date.now()).slice(-5)}`;
  await q(
    `INSERT INTO "SalesDocument"(id, type, "docNo", status, "issueDate", "validUntil", "dueDate", "customerId", "customerSnapshot", "subtotalSatang", "grandSatang", "updatedAt")
     VALUES ($1, $2::"DocType", $3, 'ISSUED', now() - interval '1 day', now() + interval '20 days', now() + interval '7 days', $4, '{"name":"ทดสอบ ล็อตสิบเอ็ด บริษัท"}', $5, $5, now())`,
    [id, type, no, customerId, grand],
  );
  await q(`INSERT INTO "SalesDocumentItem"(id, "documentId", "sortOrder", name, unit, "qtyMilli", "priceSatang") VALUES ($1, $2, 1, 'งานติดตั้งไฟทดสอบ', 'งาน', 1000, $3)`, [`${id}-i1`, id, grand]);
  docs.push(id);
  return { id, no };
}

async function customerLink(page: Page, type: string, id: string) {
  await page.goto(`/admin/docs/${type}/${id}`);
  const url = await page.locator("#docLink input" + V).inputValue();
  expect(url).toMatch(/\/track\/doc\/.+\?t=[A-Za-z0-9_-]{43}$/);
  return new URL(url).pathname + new URL(url).search;
}

test("U25 ลูกค้ายืนยันใบเสนอราคาผ่านลิงก์ลับ → ร้านเห็นผู้ยืนยัน + แปลงเป็นใบแจ้งหนี้ได้", async ({ page }) => {
  const errors = trackErrors(page);
  const qt = await makeDoc("QUOTATION", 150000);
  await admin(page);
  const link = await customerLink(page, "QUOTATION", qt.id);
  await page.goto(link);
  await expect(page.locator(".pp-bar h1")).toContainText(qt.no);
  await page.click('#qtAccept button[type=submit]');
  await page.fill("#qtName", "คุณทดสอบ ยืนยัน");
  await page.check("#qtAccept input[name=agree]");
  await page.click('#qtAccept button[type=submit]');
  await expect(page.locator("#qtAccepted")).toContainText(`ยืนยันใบเสนอราคา ${qt.no}`);
  const d = await one<{ status: string; acceptedBy: string; acceptedAt: Date }>(`SELECT status, "acceptedBy", "acceptedAt" FROM "SalesDocument" WHERE id=$1`, [qt.id]);
  expect(d.status).toBe("ACCEPTED");
  expect(d.acceptedBy).toBe("คุณทดสอบ ยืนยัน");
  expect((await q(`SELECT 1 FROM "SalesDocumentEvent" WHERE type='CUSTOMER_ACCEPTED' AND "documentId"=$1`, [qt.id])).length).toBe(1);
  // เปิดซ้ำ = แสดงว่ายืนยันแล้ว · โทเคนผิด = 404
  await page.reload();
  await expect(page.locator("#qtAccepted")).toContainText("คุณทดสอบ ยืนยัน");
  await page.goto(link.replace(/t=.{6}/, "t=AAAAAA"));
  await expect(page.getByTestId("doc-404")).toBeVisible();
  await page.goto(`/admin/docs/QUOTATION/${qt.id}`);
  await expect(page.locator("#qtOnlineAccepted" + V)).toContainText("คุณทดสอบ ยืนยัน");
  await expect(page.locator('button:has-text("แปลงเป็นใบแจ้งหนี้")' + V)).toBeVisible();
  if (process.env.LINE_MOCK_LOG) await expect.poll(() => readFileSync(process.env.LINE_MOCK_LOG!, "utf8")).toContain(qt.no);
  expect(errors).toEqual([]);
});

test("U26/A20 ชำระใบแจ้งหนี้ผ่านลิงก์: แนบสลิป → คิวตรวจ → อนุมัติออกใบเสร็จอัตโนมัติ · ปฏิเสธพร้อมเหตุผลที่ลูกค้าเห็น", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setExtraHTTPHeaders(ip(60));
  const iv = await makeDoc("INVOICE", 100000);
  await admin(page);
  const link = await customerLink(page, "INVOICE", iv.id);
  await page.goto(link);
  await expect(page.locator("#ivOutstanding")).toContainText("1,000.00");
  const pay = async (amount: string, seed: number) => {
    await page.setInputFiles("#ivSlipFile", { name: "iv.png", mimeType: "image/png", buffer: await uniqPng(seed) });
    await page.fill("#ivTime", "00:00");
    await page.fill("#ivAmount", amount);
    await page.click('#ivSlipForm button[type=submit]');
    await expect(page.locator("#ivSlipOk")).toBeVisible();
    await page.waitForLoadState("load");
  };
  // ยอดเกินค้างชำระไม่รับ
  await page.setInputFiles("#ivSlipFile", { name: "iv.png", mimeType: "image/png", buffer: await uniqPng(60) });
  await page.fill("#ivTime", "00:00");
  await page.fill("#ivAmount", "2000");
  await page.click('#ivSlipForm button[type=submit]');
  await expect(page.locator(".do-err")).toContainText("มากกว่ายอดค้างชำระ");
  await pay("400", 61);
  await expect(page.locator("#ivSlips")).toContainText("รอร้านตรวจ", { timeout: 15_000 });
  const s1 = await one<{ id: string; status: string; amountSatang: number; sha256: string }>(`SELECT id, status, "amountSatang", sha256 FROM "DocSlip" WHERE "documentId"=$1`, [iv.id]);
  expect(s1).toMatchObject({ status: "PENDING", amountSatang: 40000 });
  expect(s1.sha256).toMatch(/^[0-9a-f]{64}$/);
  // คิวตรวจในหลังบ้าน → อนุมัติ = รับชำระ + ใบเสร็จ
  await page.goto("/admin/docs/slips");
  await expect(page.locator("#docSlipQueue" + V)).toContainText(iv.no);
  await page.goto(`/admin/docs/INVOICE/${iv.id}`);
  const img = await page.request.get(`/admin/doc-slips/${s1.id}`);
  expect(img.headers()["content-type"]).toBe("image/png");
  await confirmClick(page, '#docSlips button:has-text("อนุมัติ + ออกใบเสร็จ")', "อนุมัติและออกใบเสร็จ");
  await page.waitForURL(/paid=RC/);
  const ivRow = await one<{ status: string; paidSatang: number }>(`SELECT status, "paidSatang" FROM "SalesDocument" WHERE id=$1`, [iv.id]);
  expect(ivRow).toEqual({ status: "PARTIAL", paidSatang: 40000 });
  const s1b = await one<{ status: string; paymentId: string }>(`SELECT status, "paymentId" FROM "DocSlip" WHERE id=$1`, [s1.id]);
  expect(s1b.status).toBe("ACCEPTED");
  const rc = await one<{ docNo: string; grandSatang: number; status: string }>(`SELECT r."docNo", r."grandSatang", r.status FROM "DocPayment" p JOIN "SalesDocument" r ON r.id = p."receiptId" WHERE p.id=$1`, [s1b.paymentId]);
  expect(rc).toMatchObject({ grandSatang: 40000, status: "ISSUED" });
  expect(rc.docNo).toMatch(/^RC\d{4}-\d{5}$/);
  // สลิปที่ 2 → ปฏิเสธพร้อมเหตุผล
  await page.goto(link);
  await expect(page.locator("#ivOutstanding")).toContainText("600.00");
  await pay("600", 62);
  await page.goto(`/admin/docs/INVOICE/${iv.id}`);
  const form = page.locator('#docSlips form:has(button:has-text("ปฏิเสธ"))' + V).first();
  await form.locator("select").selectOption("ไม่พบยอดเงินเข้าบัญชี");
  await form.locator("input[name=note]").fill("กรุณาโอนใหม่ (ทดสอบ)");
  await form.locator('button:has-text("ปฏิเสธ")').click();
  await expect.poll(async () => (await one<{ n: string }>(`SELECT count(*) n FROM "DocSlip" WHERE "documentId"=$1 AND status='REJECTED'`, [iv.id])).n).toBe("1");
  await page.goto(link);
  await expect(page.locator("#ivSlips")).toContainText("ไม่พบยอดเงินเข้าบัญชี — กรุณาโอนใหม่ (ทดสอบ)");
  await expect(page.locator("#ivSlips")).toContainText("ผ่าน · ออกใบเสร็จแล้ว");
  if (process.env.LINE_MOCK_LOG) await expect.poll(() => readFileSync(process.env.LINE_MOCK_LOG!, "utf8")).toContain(`สลิปชำระใบแจ้งหนี้`);
  expect(errors).toEqual([]);
});

test("A18/A19 ตั้งค่า COD/พื้นที่ห่างไกล/น้ำหนัก/รับที่ร้าน/อีเมล + ส่งอีเมลทดสอบ (ไม่มี SMTP = ข้าม ไม่ล่ม)", async ({ page }) => {
  const errors = trackErrors(page);
  await admin(page);
  await page.goto("/admin/settings");
  await expect(page.locator("#codBox" + V)).toBeVisible();
  await page.fill("#remoteFee" + V, "70");
  await page.fill("#remoteZips" + V, "95 96 63170");
  await page.click("#addWeightTier" + V);
  await page.locator("#weightBox tbody tr" + V).last().locator("input").first().fill("50");
  await page.locator("#weightBox tbody tr" + V).last().locator("input").last().fill("200");
  await page.click('#emailBox summary:has-text("จัดส่งแล้ว")' + V);
  await page.fill("#tpl_SHIPPED_subject" + V, "ส่งแล้ว {orderNo} ทดสอบ");
  await page.click('#checkoutSettings button[type=submit]' + V);
  await expect(page.locator("#checkoutSettings .login-info" + V)).toContainText("บันทึกแล้ว");
  const s = await one<{ remoteFeeSatang: number; remoteZips: string[]; weightTiers: { maxGram: number; extraSatang: number }[]; emailTemplates: Record<string, { subject: string }> }>(
    `SELECT "remoteFeeSatang","remoteZips","weightTiers","emailTemplates" FROM "ShopSetting" WHERE id='shop'`);
  expect(s.remoteFeeSatang).toBe(7000);
  expect(s.remoteZips).toEqual(["95", "96", "63170"]);
  expect(s.weightTiers.at(-1)).toEqual({ maxGram: 50000, extraSatang: 20000 });
  expect(s.emailTemplates.SHIPPED.subject).toBe("ส่งแล้ว {orderNo} ทดสอบ");
  // รหัสไปรษณีย์ผิดรูปแบบ → ไม่บันทึก
  await page.fill("#remoteZips" + V, "95 abc");
  await page.click('#checkoutSettings button[type=submit]' + V);
  await expect(page.locator("#checkoutSettings .login-err" + V)).toContainText("abc");
  // ส่งทดสอบ
  await page.fill("#testTo" + V, `test-${TAG}@example.com`);
  await page.click('#emailTest button[type=submit]' + V);
  if (!SMTP_REAL) {
    await expect(page.locator("#smtpStatus" + V)).toContainText("ยังไม่ได้ตั้งค่า SMTP");
    await expect(page.locator("#emailTest .login-err" + V)).toContainText("SMTP");
  } else await expect(page.locator("#emailTest [role]" + V).first()).toBeVisible();
  const log = await one<{ status: string }>(`SELECT status FROM "EmailLog" WHERE "to"=$1`, [`test-${TAG}@example.com`]);
  expect(SMTP_REAL ? ["SENT", "FAILED"] : ["SKIPPED"]).toContain(log.status);
  await page.reload();
  await expect(page.locator("#emailLog" + V)).toContainText(`test-${TAG}@example.com`);
  expect(errors).toEqual([]);
});
