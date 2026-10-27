// ตรวจซ้ำรอบ 3 (ความเป็นส่วนตัว / หน้าร้าน / บันทึกหลังบ้าน):
// D4 แจ้งของเข้าสำหรับสินค้าไม่นับสต็อก + ศูนย์แจ้งเตือน · D6 สคริปต์มีรุ่น + service worker เน็ตก่อน + แนบสลิปหน้าติดตามลองใหม่เอง
// D7 ลบข้อมูล PDPA ครบทุกตาราง + ส่งออกข้อมูลของบุคคล · D8 คัดค้านการตลาด → ไม่อยู่ในไฟล์บรอดแคสต์ · D9 ส่งออกทั้งร้านครบทุกตาราง
// D13 พนักงานไม่เห็นบันทึกของเจ้าของร้าน · A29 ก่อน/หลังของแก้หลายรายการ/ลดราคาทั้งหมวด/ตั้งค่าชำระเงิน · D14 หน้าแรก
// ข้อมูลทั้งหมดสร้างในเทสต์ (SKU E2E-R3B-*) และลบทิ้งตอนจบ — รันได้ทั้งฐานข้อมูลใหม่ (seed) และฐานข้อมูลจริง
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import bcrypt from "bcryptjs";
import { expect, test, type Browser } from "@playwright/test";
import pg from "pg";
import { readZip } from "../../src/lib/zip";
import { V, confirmClick, login } from "./helpers";
import { refreshStorefront } from "./storefront-fixtures";

test.describe.configure({ mode: "serial" });

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL!.replace(/\?schema=\w+$/, "") });
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0] as T;
const all = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows as T[];
const rid = () => randomBytes(4).toString("hex");
const TAG = `r3b${Date.now().toString(36)}`;
const fakeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const phoneN = (n: number) => `08${String(Date.now() + n * 7919).slice(-8)}`;
const fmtPhone = (p: string) => `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`;
const PW = `R3b-${rid()}-Pass`;
const staff = { id: `${TAG}s`, username: `${TAG}-staff` };
const lineLog = process.env.LINE_MOCK_LOG;
const local = (process.env.STORAGE_DRIVER ?? "local") === "local";
const uploadDir = process.env.UPLOAD_DIR ?? "uploads";

const cat = { id: `${TAG}-cat`, slug: `e2e-r3b-${TAG}` };
const U = { id: `${TAG}-u`, sku: `E2E-R3B-U-${TAG}`, slug: `e2e-r3b-u-${TAG}`, name: `โคมทดสอบรอบสาม ไม่นับสต็อก ${TAG}` };
const W = { id: `${TAG}-w`, sku: `E2E-R3B-W-${TAG}`, slug: `e2e-r3b-w-${TAG}`, name: `โคมทดสอบรอบสาม พร้อมขาย ${TAG}` };
const orders: string[] = [];
const customers: string[] = [];
const requests: string[] = [];
let lineRecipient = "";
let settingsBefore: { pickupEnabled: boolean; codEnabled: boolean } | null = null;

async function newCtx(browser: Browser, opts: { serviceWorkers?: "allow" | "block" } = {}) {
  return browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok", extraHTTPHeaders: { "x-forwarded-for": fakeIp() }, ...opts });
}
async function owner(browser: Browser) {
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  await login(page);
  return page;
}
async function asStaff(browser: Browser) {
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  await page.goto("/admin/login");
  await page.fill("#u" + V, staff.username);
  await page.fill("#pw" + V, PW);
  await page.click(".login-card button[type=submit]" + V);
  await page.waitForURL(/\/admin(\?|$)/);
  return page;
}
const lineText = (from: number) => (lineLog && existsSync(lineLog) ? readFileSync(lineLog, "utf8").slice(from) : "");
const lineLen = () => (lineLog && existsSync(lineLog) ? readFileSync(lineLog, "utf8").length : 0);

async function insertOrder(o: { id: string; no: string; phone: string; email?: string | null; name: string; status?: string; total?: number }) {
  await db.query(
    `INSERT INTO "Order" (id, "orderNo", status, "customerName", phone, email, "addressLine", subdistrict, district, province, "postalCode", "subtotalSatang", "shippingMethod", "shippingName", "shippingSatang", "totalSatang", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,'77/1 ซอยทดสอบรอบสาม','บางกรวย','บางกรวย','นนทบุรี','11130',$7,'std','ส่งธรรมดา',0,$7,now())`,
    [o.id, o.no, o.status ?? "AWAITING_SLIP", o.name, o.phone, o.email ?? null, o.total ?? 100000],
  );
  orders.push(o.id);
}
function putFile(key: string) {
  if (!local) return;
  const p = join(uploadDir, key);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, readFileSync("tests/fixtures/slip.png"));
}
const fileExists = (key: string) => existsSync(join(uploadDir, key));

test.beforeAll(async () => {
  await db.query(`DELETE FROM "LoginThrottle"`);
  await db.query(`INSERT INTO "Admin"(id, username, "passwordHash", "displayName", role, "updatedAt") VALUES ($1,$2,$3,$4,'STAFF',now())`, [staff.id, staff.username, await bcrypt.hash(PW, 10), `พนักงาน ${TAG}`]);
  await db.query(`INSERT INTO "Category" (id, slug, "nameTh", "nameEn", popular, "sortOrder", "isActive", "showOnHome") VALUES ($1,$2,$3,'R3B test','{}',998,true,false)`, [cat.id, cat.slug, `หมวดทดสอบรอบสาม ${TAG}`]);
  await db.query(
    `INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "trackStock", stock, "inStock", "categoryId", "sortOrder", "updatedAt", keywords)
     VALUES ($1,$2,$3,$4,50000,false,0,false,$9,-9,now(),'e2e'), ($5,$6,$7,$8,100000,false,0,true,$9,-9,now(),'e2e')`,
    [U.id, U.sku, U.slug, U.name, W.id, W.sku, W.slug, W.name, cat.id],
  );
  if (lineLog) {
    lineRecipient = `${TAG}-line`;
    await db.query(`INSERT INTO "LineRecipient" (id, kind, "lineId", name, enabled, "updatedAt") VALUES ($1,'USER',$2,'E2E r3b',true,now())`, [lineRecipient, `U${TAG}`]);
  }
});

test.afterAll(async () => {
  if (settingsBefore) await db.query(`UPDATE "ShopSetting" SET "pickupEnabled"=$1, "codEnabled"=$2 WHERE id='shop'`, [settingsBefore.pickupEnabled, settingsBefore.codEnabled]);
  await db.query(`DELETE FROM "StockAlert" WHERE "productId" IN ($1,$2) OR email LIKE $3`, [U.id, W.id, `%${TAG}%`]);
  await db.query(`DELETE FROM "Claim" WHERE "claimNo" LIKE $1`, [`${TAG}%`]);
  await db.query(`DELETE FROM "Review" WHERE "productId" IN ($1,$2)`, [U.id, W.id]);
  await db.query(`DELETE FROM "EmailLog" WHERE template LIKE $1 OR "orderId" = ANY($2)`, [`${TAG}%`, orders]);
  await db.query(`DELETE FROM "AdminTask" WHERE "orderId" = ANY($1) OR "customerId" = ANY($2) OR id LIKE $3`, [orders, customers, `${TAG}%`]);
  await db.query(`DELETE FROM "InternalNote" WHERE id LIKE $1`, [`${TAG}%`]);
  await db.query(`DELETE FROM "SalesDocument" WHERE "customerId" = ANY($1) OR "docNo" LIKE $2`, [customers, `R3B${TAG}%`]);
  await db.query(`DELETE FROM "Order" WHERE id = ANY($1)`, [orders]);
  await db.query(`DELETE FROM "Customer" WHERE id = ANY($1) OR name LIKE $2`, [customers, `%${TAG}%`]);
  await db.query(`DELETE FROM "DataRequest" WHERE id = ANY($1) OR name LIKE $2`, [requests, `%${TAG}%`]);
  await db.query(`DELETE FROM "AdminLog" WHERE note LIKE $1 OR entity IN ($2,$3) OR entity LIKE 'DataRequest:${TAG}%'`, [`%${TAG}%`, `Product:${U.id}`, `Product:${W.id}`]);
  await db.query(`DELETE FROM "StockMovement" WHERE "productId" IN ($1,$2)`, [U.id, W.id]);
  await db.query(`DELETE FROM "OrderItem" WHERE "productId" IN ($1,$2)`, [U.id, W.id]);
  await db.query(`DELETE FROM "Product" WHERE id IN ($1,$2)`, [U.id, W.id]);
  await db.query(`DELETE FROM "Category" WHERE id = $1`, [cat.id]);
  if (lineRecipient) await db.query(`DELETE FROM "LineRecipient" WHERE id = $1`, [lineRecipient]);
  await db.query(`DELETE FROM "AdminSession" WHERE "adminId" = $1`, [staff.id]);
  await db.query(`UPDATE "AdminLog" SET "adminId" = NULL WHERE "adminId" = $1`, [staff.id]);
  await db.query(`DELETE FROM "Admin" WHERE id = $1`, [staff.id]);
  await db.query(`DELETE FROM "LoginThrottle"`);
  await db.end();
});

test("D4/A28 สินค้าไม่นับสต็อกกลับมามีของ → LINE แจ้งร้าน + อยู่ในศูนย์แจ้งเตือนจนกด “แจ้งแล้ว”", async ({ browser }) => {
  await db.query(`INSERT INTO "StockAlert" (id, "productId", name, phone) VALUES ($1,$2,'ลูกค้ารอของ','0811110000')`, [`${TAG}-sa1`, U.id]);
  const ad = await owner(browser);
  // ยังหมด → ยังไม่อยู่ในศูนย์แจ้งเตือน
  await ad.goto("/admin/notifications");
  await expect(ad.locator(`#notifList li[data-kind=RESTOCK]:has-text("${U.name}")`)).toHaveCount(0);
  const from = lineLen();
  await ad.goto(`/admin/products/${U.id}`);
  await ad.check("input[name=inStock]" + V);
  await ad.click('button[type=submit]:has-text("บันทึกสินค้า")' + V);
  await expect(ad.locator(".login-info[role=status]" + V).first()).toContainText("บันทึกแล้ว");
  expect((await one<{ inStock: boolean }>(`SELECT "inStock" FROM "Product" WHERE id=$1`, [U.id])).inStock).toBe(true);
  if (lineLog) await expect.poll(() => lineText(from), { timeout: 15_000 }).toMatch(new RegExp(`กลับมามีของ[^\\n]*${U.sku}[^\\n]*มีของแล้ว · ลูกค้ารอ 1 คน`));
  // ศูนย์แจ้งเตือน: สินค้ากลับมามีของ + ลูกค้ารอ
  await ad.goto("/admin/notifications");
  const item = ad.locator(`#notifList li[data-kind=RESTOCK]:has-text("${U.name}")`);
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("ลูกค้ารอ 1 คน");
  await expect(item.locator("a")).toHaveAttribute("href", "/admin/stock-alerts");
  // ปิดขายแล้วเปิดขายใหม่ (หน้ารายการ) → แจ้งอีกครั้ง
  await db.query(`UPDATE "Product" SET "isActive"=false WHERE id=$1`, [U.id]);
  const from2 = lineLen();
  await ad.goto(`/admin/products?q=${U.sku}`);
  await ad.locator(`tr:has-text("${U.sku}") button:has-text("เปิดขาย")` + V).first().click();
  await expect.poll(async () => (await one<{ a: boolean }>(`SELECT "isActive" a FROM "Product" WHERE id=$1`, [U.id])).a).toBe(true);
  if (lineLog) await expect.poll(() => lineText(from2), { timeout: 15_000 }).toContain(U.sku);
  // ร้านแจ้งลูกค้าแล้ว → หายจากศูนย์แจ้งเตือน
  await db.query(`UPDATE "StockAlert" SET "notifiedAt"=now() WHERE "productId"=$1`, [U.id]);
  await ad.goto("/admin/notifications");
  await expect(ad.locator(`#notifList li[data-kind=RESTOCK]:has-text("${U.name}")`)).toHaveCount(0);
  await ad.context().close();
});

test("A29 แก้หลายรายการ / ลดราคาทั้งหมวด / ตั้งค่าชำระเงิน บันทึกค่าก่อน-หลังรายสินค้า · D14 ชิปรับที่ร้าน/COD บนหน้าแรกตามตั้งค่า", async ({ browser }) => {
  const ad = await owner(browser);
  // แก้ราคาหลายรายการ +10%
  await ad.goto(`/admin/products?q=E2E-R3B-`);
  await ad.locator(`input[name="ids"][form="bulkForm"]`).first().waitFor();
  for (const p of [U, W]) await ad.locator(`tr:has-text("${p.sku}") input[name="ids"][form="bulkForm"]`).check();
  await ad.selectOption("#bulkOp", "price");
  await ad.selectOption('select[name="priceMode"]', "pct");
  await ad.fill('input[name="priceValue"]', "10");
  await ad.click('#bulkForm button[type="submit"]');
  await expect(ad.locator("#bulkForm .login-info")).toContainText("แล้ว 2 รายการ");
  const d = await one<{ diff: Record<string, [number, number]> }>(`SELECT diff FROM "AdminLog" WHERE entity=$1 AND note LIKE 'แก้หลายรายการ%' ORDER BY "createdAt" DESC LIMIT 1`, [`Product:${W.id}`]);
  expect(d.diff.priceSatang).toEqual([100000, 110000]);
  await ad.goto(`/admin/log?entity=Product:${W.id}`);
  await expect(ad.locator(".lg-diff").first()).toContainText("ดูการเปลี่ยนแปลง");

  // ลดราคาทั้งหมวด (หมวดทดสอบมีแค่ 2 รายการนี้)
  const end = new Date(Date.now() + 7 * 3600e3 + 3 * 86400e3).toISOString().slice(0, 16);
  await ad.goto("/admin/products/sale");
  await ad.selectOption("#csCat", cat.id);
  await ad.fill("#csPct", "10");
  await ad.fill("#csEnd", end);
  await ad.click('#catSaleForm button:has-text("ตั้งลดราคาทั้งหมวด")');
  await expect(ad.locator("#catSaleForm .login-info")).toContainText("2 รายการ");
  const s = await one<{ diff: Record<string, [unknown, unknown]> }>(`SELECT diff FROM "AdminLog" WHERE entity=$1 AND note LIKE 'ตั้งลดราคาทั้งหมวด%' ORDER BY "createdAt" DESC LIMIT 1`, [`Product:${W.id}`]);
  expect(s.diff.salePriceSatang).toEqual([null, 99000]);
  expect(s.diff.saleEndsAt?.[1]).toBeTruthy();

  // ตั้งค่าชำระเงิน: เปิด "รับที่ร้าน" ปิด COD → diff ของ ShopSetting · หน้าแรกแสดงเฉพาะชิปที่เปิด
  settingsBefore = await one(`SELECT "pickupEnabled", "codEnabled" FROM "ShopSetting" WHERE id='shop'`);
  const setPay = async (pickup: boolean, cod: boolean) => {
    await ad.goto("/admin/settings");
    const f = ad.locator("#checkoutSettings");
    await f.locator("input[name=pickupEnabled]").setChecked(pickup);
    await f.locator("input[name=codEnabled]").setChecked(cod);
    await f.locator("button[type=submit]").click();
    await expect(f.locator(".login-info")).toContainText("บันทึกแล้ว");
  };
  await setPay(!settingsBefore!.pickupEnabled, false);
  const sd = await one<{ diff: Record<string, [unknown, unknown]> }>(`SELECT diff FROM "AdminLog" WHERE entity='ShopSetting' AND note LIKE 'บันทึกตั้งค่าการชำระเงิน%' ORDER BY "createdAt" DESC LIMIT 1`);
  expect(sd.diff.pickupEnabled).toEqual([settingsBefore!.pickupEnabled, !settingsBefore!.pickupEnabled]);
  await setPay(true, false);
  const home = await (await newCtx(browser, { serviceWorkers: "block" })).newPage();
  await expect.poll(async () => { await home.goto("/"); return home.locator('.pay-row [data-pay="pickup"]').count(); }, { timeout: 20_000 }).toBe(1);
  await expect(home.locator('.pay-row [data-pay="cod"]')).toHaveCount(0);
  await expect(home.locator(".pay-row")).toContainText("QR PromptPay");
  await setPay(false, true);
  await expect.poll(async () => { await home.goto("/"); return home.locator('.pay-row [data-pay="cod"]').count(); }, { timeout: 20_000 }).toBe(1);
  await expect(home.locator('.pay-row [data-pay="pickup"]')).toHaveCount(0);
  await setPay(settingsBefore!.pickupEnabled, settingsBefore!.codEnabled);
  // D14: ไม่มี TODO ค้างในหน้าแรก · มีผลงานติดตั้งที่มีรูป → กล่องภาพลิงก์ไป /projects ด้วยรูปจริง
  expect(await home.content()).not.toContain("TODO");
  const proj = await one<{ n: number }>(`SELECT count(*)::int n FROM "Project" WHERE "isPublished" AND cardinality(images) > 0`);
  if (proj.n > 0) {
    await expect(home.locator('a.feature-visual.has-img[href="/projects"] img')).toHaveCount(1);
  } else {
    await expect(home.locator(".feature-visual")).toContainText("แสงที่ทำงานได้จริงใต้น้ำ");
  }
  await home.context().close();
  await ad.context().close();
});

test("D6 สคริปต์หน้าร้านมีรุ่น · service worker แคชตามรุ่น + เน็ตก่อนสำหรับ /js · หน้าติดตามแนบสลิปลองใหม่เอง", async ({ browser }) => {
  const ctx = await newCtx(browser);
  const page = await ctx.newPage();
  await page.goto("/");
  const src = await page.locator('script[src*="/js/shell.js"]').getAttribute("src");
  const v = new URL(src!, "http://x").searchParams.get("v");
  expect(v, "shell.js ต้องมี ?v=").toMatch(/^[0-9a-f]{10}$/);
  expect(await page.locator('script[src*="/js/home.js"]').getAttribute("src")).toContain(`?v=${v}`);
  expect(await page.locator('script[src*="/js/analytics.js"]').getAttribute("src")).toContain(`?v=${v}`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? "")).toContain(`/sw.js?v=${v}`);
  // ชื่อแคชตามรุ่นนี้เท่านั้น (รุ่นเก่าถูกลบ)
  expect(await page.evaluate(() => caches.keys())).toEqual([`mdw-shell-${v}`]);
  // เน็ตก่อน: ของเก่าในแคชไม่ถูกใช้เมื่อเน็ตยังดี — ใช้เฉพาะตอนออฟไลน์
  const url = `/js/shell.js?v=${v}`;
  await page.evaluate(async ([u, name]) => (await caches.open(name)).put(u, new Response("/* STALE */", { headers: { "content-type": "text/javascript" } })), [url, `mdw-shell-${v}`] as const);
  const online = await page.evaluate(async (u) => (await fetch(u)).text(), url);
  expect(online).not.toContain("STALE");
  expect(online.length).toBeGreaterThan(1000);
  await ctx.setOffline(true);
  const offline = await page.evaluate(async (u) => (await fetch(u)).text(), url);
  expect(offline).toBe(online); // ได้ไฟล์ล่าสุดที่โหลดผ่านเน็ต (เขียนทับของเก่าแล้ว)
  await ctx.setOffline(false);
  // HTML/หลังบ้าน/API ไม่ถูกเก็บ
  const keys = await page.evaluate(async () => {
    const out: string[] = [];
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(keys.every((k) => k === "/offline.html" || /^\/(_next\/static|js|img|icons)\//.test(k)), keys.join(",")).toBe(true);
  await ctx.close();

  // หน้าติดตาม: แนบสลิปครั้งแรกเน็ตหลุด / คำตอบหาย → ลองใหม่เอง สำเร็จ ไม่ซ้ำ
  const ctx2 = await newCtx(browser, { serviceWorkers: "block" });
  const pg2 = await ctx2.newPage();
  for (const mode of ["abort", "lost"] as const) {
    const phone = phoneN(mode === "abort" ? 1 : 2);
    const id = `${TAG}-t-${mode}`;
    const no = `MDW-R3B-${rid().toUpperCase()}`;
    await insertOrder({ id, no, phone, name: `ผู้ทดสอบติดตาม ${TAG}` });
    let calls = 0;
    await pg2.route(`**/api/orders/${no}/slip`, async (route) => {
      calls++;
      if (calls > 1) return route.continue();
      if (mode === "abort") return route.abort("internetdisconnected");
      await route.fetch(); // ถึงเซิร์ฟเวอร์แล้ว แต่เบราว์เซอร์ไม่ได้คำตอบ
      return route.abort("connectionreset");
    });
    await pg2.goto(`/track?no=${no}`);
    await pg2.fill("#phone", phone);
    await pg2.click(".track-form button[type=submit]");
    await expect(pg2.locator("#slip")).toBeVisible();
    await pg2.setInputFiles("#slipFile", "tests/fixtures/slip.png");
    await pg2.fill("#slipTime", "10:30");
    await pg2.fill("#slipAmt", "1000");
    await pg2.click('#slip button[type=submit]');
    await expect(pg2.locator("#slip .trk-retry")).toContainText("ลองส่งใหม่");
    await expect(pg2.locator('#slip p[role=status]:has-text("ได้รับสลิปแล้ว")')).toBeVisible({ timeout: 20_000 });
    expect(calls, mode).toBe(2);
    expect((await one<{ status: string }>(`SELECT status FROM "Order" WHERE id=$1`, [id])).status).toBe("PENDING_VERIFICATION");
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "PaymentSlip" WHERE "orderId"=$1`, [id])).n).toBe(1);
    await pg2.unroute(`**/api/orders/${no}/slip`);
  }
  await ctx2.close();
});

test("D7 ลบข้อมูลตามคำขอ PDPA: ประวัติ/บันทึก/สลิปใบแจ้งหนี้/งาน/โน้ต/เคลม/รีวิว/คูปอง/อีเมล — และส่งออกข้อมูลของบุคคลครบตาราง", async ({ browser }) => {
  const P = phoneN(3), OLD = phoneN(4), E = `p-${TAG}@example.com`, NAME = `สมปอง ลบได้ ${TAG}`;
  const oUnpaid = `${TAG}-o1`, oPaid = `${TAG}-o2`;
  const noUnpaid = `MDW-R3B-${rid().toUpperCase()}`, noPaid = `MDW-R3B-${rid().toUpperCase()}`;
  await insertOrder({ id: oUnpaid, no: noUnpaid, phone: P, email: E, name: NAME });
  await insertOrder({ id: oPaid, no: noPaid, phone: P, email: E, name: NAME, status: "PAID" });
  await db.query(`UPDATE "Order" SET "cancelReason"='ลูกค้าขอยกเลิก โทร ' || $2 WHERE id=$1`, [oUnpaid, OLD]);
  const slipKey = `slips/e2e-r3b-${TAG}.png`;
  putFile(slipKey);
  await db.query(`INSERT INTO "PaymentSlip" (id, "orderId", "storageKey", "mimeType", "sizeBytes", sha256, "declaredAmountSatang", "transferredAt") VALUES ($1,$2,$3,'image/png',100,$4,100000,now())`, [`${TAG}-ps`, oUnpaid, slipKey, `${TAG}sha`]);
  await db.query(
    `INSERT INTO "OrderEvent" (id, "orderId", type, note) VALUES ($1,$3,'EDITED',$4), ($2,$3,'NOTE','ลูกค้าบอกว่าอยู่บ้านหลังเที่ยง'), ($5,$3,'APPROVED',$6)`,
    [`${TAG}-e1`, `${TAG}-e2`, oPaid, `แก้ไขข้อมูล — เบอร์โทร: ${OLD} → ${P} · ที่อยู่: 9 ถนนเก่า → 77/1 ซอยทดสอบรอบสาม`, `${TAG}-e3`, `ยอดตรง โทรยืนยัน ${fmtPhone(P)} แล้ว`],
  );
  await db.query(`INSERT INTO "InternalNote" (id, body, "orderId") VALUES ($1,'ลูกค้าชอบโทรตอนเย็น',$2)`, [`${TAG}-n1`, oPaid]);
  await db.query(`INSERT INTO "AdminTask" (id, title, body, "orderId") VALUES ($1,$2,'ส่งไปที่ 77/1 ซอยทดสอบรอบสาม',$3)`, [`${TAG}-k1`, `โทรหา ${NAME}`, oPaid]);
  await db.query(
    `INSERT INTO "AdminLog" (id, type, note, entity, diff) VALUES ($1,'ORDER',$2,$3,$4), ($5,'ORDER',$6,NULL,NULL)`,
    [`${TAG}-l1`, `${noPaid}: แก้ไขข้อมูล — เบอร์โทร: ${OLD} → ${P}`, `Order:${noPaid}`, JSON.stringify({ phone: [OLD, P], addressLine: ["9 ถนนเก่า", "77/1 ซอยทดสอบรอบสาม"], shippingSatang: [0, 5000] }),
      `${TAG}-l2`, `ส่งออกรายการติดต่อ ${fmtPhone(P)} (${TAG})`],
  );
  await db.query(`INSERT INTO "EmailLog" (id, "to", template, "orderId", status) VALUES ($1,$2,$3,$4,'SENT')`, [`${TAG}-m1`, E, `${TAG}-PAID`, oPaid]);
  // เคลม/รีวิวที่ผูกกับคำสั่งซื้อของบุคคล แม้กรอกเบอร์อื่น
  await db.query(`INSERT INTO "Claim" (id, "claimNo", kind, "orderId", name, phone, issue, images, note, "updatedAt") VALUES ($1,$2,'WARRANTY',$3,$4,$5,'ไฟไม่ติด','{}','ลูกค้าเสียงดัง',now())`, [`${TAG}-c1`, `${TAG}-CL1`, oPaid, NAME, OLD]);
  await db.query(`INSERT INTO "Review" (id, "productId", "orderId", name, phone, rating, body, "updatedAt") VALUES ($1,$2,$3,'สมปอง',$4,5,'ดีมาก',now())`, [`${TAG}-r1`, W.id, oPaid, OLD]);
  await db.query(`INSERT INTO "StockAlert" (id, "productId", email) VALUES ($1,$2,$3)`, [`${TAG}-sa2`, U.id, E]);
  // ลูกค้าที่มีใบแจ้งหนี้ออกแล้ว + สลิปใบแจ้งหนี้ (รอตรวจ = ลบ, ยอมรับแล้ว = เก็บ)
  const cust = `${TAG}-cu1`;
  customers.push(cust);
  await db.query(`INSERT INTO "Customer" (id, code, kind, name, phone, email, "addressLine", note, tags, "updatedAt") VALUES ($1,$2,'PERSON',$3,$4,$5,'77/1 ซอยทดสอบรอบสาม','VIP ลูกค้าเก่า','{VIP}',now())`, [cust, `R${rid().slice(0, 6)}`, NAME, P, E]);
  await db.query(`INSERT INTO "InternalNote" (id, body, "customerId") VALUES ($1,'ชอบสีวอร์ม',$2)`, [`${TAG}-n2`, cust]);
  const doc = `${TAG}-d1`;
  await db.query(
    `INSERT INTO "SalesDocument" (id, type, status, "docNo", "customerId", "customerSnapshot", "internalNote", "issueDate", "updatedAt") VALUES ($1,'INVOICE','ISSUED',$2,$3,$4,'ภายใน',now(),now())`,
    [doc, `R3B${TAG}-IV`, cust, JSON.stringify({ name: NAME, phone: fmtPhone(P), email: E, address: "77/1 ซอยทดสอบรอบสาม", taxId: "" })],
  );
  const [dsPend, dsOk] = [`docslips/e2e-r3b-${TAG}-p.png`, `docslips/e2e-r3b-${TAG}-a.png`];
  putFile(dsPend);
  putFile(dsOk);
  await db.query(
    `INSERT INTO "DocSlip" (id, "documentId", "storageKey", "mimeType", "sizeBytes", sha256, "amountSatang", "transferredAt", status) VALUES ($1,$3,$4,'image/png',100,'a',1000,now(),'PENDING'), ($2,$3,$5,'image/png',100,'b',1000,now(),'ACCEPTED')`,
    [`${TAG}-ds1`, `${TAG}-ds2`, doc, dsPend, dsOk],
  );
  const req = `${TAG}-dr1`;
  requests.push(req);
  await db.query(`INSERT INTO "DataRequest" (id, kind, name, phone, email, detail) VALUES ($1,'DELETE',$2,$3,$4,'ขอลบข้อมูลทั้งหมด')`, [req, NAME, P, E]);

  const ad = await owner(browser);
  await ad.goto(`/admin/data-requests/${req}`);
  for (const [k, n] of [["orders", 2], ["docSlips", 2], ["emailLogs", 1], ["internalNotes", 2], ["adminTasks", 1], ["claims", 1], ["reviews", 1], ["stockAlerts", 1]] as const)
    await expect(ad.locator(`#drFound li[data-k=${k}] b`), k).toHaveText(String(n));
  // ส่งออก ZIP ของบุคคล: มีตารางใหม่ครบ
  const zip = readZip(Buffer.from(await (await ad.request.get(`/admin/data-requests/${req}/export`)).body()));
  const data = JSON.parse(zip.get("data.json")!.toString("utf8"));
  for (const k of ["emailLogs", "docSlips", "internalNotes", "adminTasks", "claims", "reviews", "stockAlerts", "couponRedemptions"]) expect(Array.isArray(data[k]), k).toBe(true);
  expect(data.emailLogs[0].to).toBe(E);
  expect(data.adminTasks[0].title).toContain(NAME);
  expect(JSON.stringify(data)).not.toContain("publicToken");

  await confirmClick(ad, 'button:has-text("ลบข้อมูลตามคำขอ")', "ลบข้อมูล");
  await expect(ad.locator("#drErased")).toBeVisible();

  const ev = await all<{ type: string; note: string }>(`SELECT type, note FROM "OrderEvent" WHERE "orderId"=$1 ORDER BY id`, [oPaid]);
  expect(ev.find((e) => e.type === "EDITED")!.note).toBe("ลบตามคำขอ PDPA");
  expect(ev.find((e) => e.type === "NOTE")!.note).toBe("ลบตามคำขอ PDPA");
  expect(ev.find((e) => e.type === "APPROVED")!.note).toBe("ยอดตรง โทรยืนยัน [ลบแล้ว] แล้ว");
  expect((await one<{ c: string }>(`SELECT "cancelReason" c FROM "Order" WHERE id=$1`, [oUnpaid])).c).toBe("ลบตามคำขอ PDPA");
  const l1 = await one<{ note: string; diff: Record<string, unknown[]> }>(`SELECT note, diff FROM "AdminLog" WHERE id=$1`, [`${TAG}-l1`]);
  expect(l1.note).toBe(`${noPaid}: ลบตามคำขอ PDPA`);
  expect(l1.diff).toEqual({ phone: ["ลบตามคำขอ PDPA", "ลบตามคำขอ PDPA"], addressLine: ["ลบตามคำขอ PDPA", "ลบตามคำขอ PDPA"], shippingSatang: [0, 5000] });
  expect((await one<{ note: string }>(`SELECT note FROM "AdminLog" WHERE id=$1`, [`${TAG}-l2`])).note).toBe(`ส่งออกรายการติดต่อ [ลบแล้ว] (${TAG})`);
  expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "InternalNote" WHERE id IN ($1,$2)`, [`${TAG}-n1`, `${TAG}-n2`])).n).toBe(0);
  const task = await one<{ title: string; body: string | null }>(`SELECT title, body FROM "AdminTask" WHERE id=$1`, [`${TAG}-k1`]);
  expect(task.title).not.toContain(NAME);
  expect(task.body).toBeNull();
  const claim = await one<{ name: string; phone: string; note: string; issue: string }>(`SELECT name, phone, note, issue FROM "Claim" WHERE id=$1`, [`${TAG}-c1`]);
  expect(claim).toEqual({ name: "ลบตามคำขอ PDPA", phone: "", note: "ลบตามคำขอ PDPA", issue: "ไฟไม่ติด" });
  expect(await one(`SELECT id FROM "Review" WHERE id=$1`, [`${TAG}-r1`])).toBeUndefined();
  expect(await one(`SELECT id FROM "StockAlert" WHERE id=$1`, [`${TAG}-sa2`])).toBeUndefined();
  expect((await one<{ to: string }>(`SELECT "to" FROM "EmailLog" WHERE id=$1`, [`${TAG}-m1`])).to).toBe("(ลบแล้ว)");
  // ใบแจ้งหนี้: คงชื่อ/ที่อยู่ ลบเบอร์/อีเมล/โน้ตภายใน · สลิปรอตรวจถูกลบ (ทั้งแถวและไฟล์) สลิปที่ยอมรับแล้วเก็บไว้
  const d = await one<{ s: Record<string, unknown>; i: string | null }>(`SELECT "customerSnapshot" s, "internalNote" i FROM "SalesDocument" WHERE id=$1`, [doc]);
  expect(d.s.name).toBe(NAME);
  expect(d.s.phone).toBeUndefined();
  expect(d.s.email).toBeUndefined();
  expect(d.i).toBeNull();
  expect((await all<{ id: string }>(`SELECT id FROM "DocSlip" WHERE "documentId"=$1`, [doc])).map((r) => r.id)).toEqual([`${TAG}-ds2`]);
  if (local) {
    expect(fileExists(dsPend)).toBe(false);
    expect(fileExists(dsOk)).toBe(true);
    expect(fileExists(slipKey)).toBe(false);
  }
  const c = await one<{ phone: string | null; email: string | null; note: string | null; tags: string[]; name: string }>(`SELECT phone, email, note, tags, name FROM "Customer" WHERE id=$1`, [cust]);
  expect(c).toEqual({ phone: null, email: null, note: null, tags: [], name: NAME });
  const o = await one<{ customerName: string; phone: string; email: string | null }>(`SELECT "customerName", phone, email FROM "Order" WHERE id=$1`, [oPaid]);
  expect(o).toEqual({ customerName: "ลบตามคำขอ PDPA", phone: "", email: null });
  await ad.context().close();
});

test("D8 คำขอคัดค้านการตลาด → ลูกค้า “ไม่รับข่าวสาร” และไม่อยู่ในไฟล์บรอดแคสต์ · สลับได้ที่หน้าลูกค้า", async ({ browser }) => {
  const P1 = phoneN(5), P2 = phoneN(6), P3 = phoneN(7), E3 = `obj-${TAG}@example.com`;
  const [c1, c2, c3] = [`${TAG}-oc1`, `${TAG}-oc2`, `${TAG}-oc3`];
  customers.push(c1, c2, c3);
  await db.query(
    `INSERT INTO "Customer" (id, code, kind, name, phone, email, "updatedAt") VALUES ($1,$2,'PERSON',$3,$4,NULL,now()), ($5,$6,'PERSON',$7,$8,NULL,now())`,
    [c1, `R${rid().slice(0, 6)}`, `คัดค้าน หนึ่ง ${TAG}`, P1, c2, `R${rid().slice(0, 6)}`, `รับข่าว สอง ${TAG}`, P2],
  );
  const req = `${TAG}-dr2`, req2 = `${TAG}-dr3`;
  requests.push(req, req2);
  await db.query(`INSERT INTO "DataRequest" (id, kind, name, phone, detail) VALUES ($1,'OBJECT',$2,$3,'ไม่ต้องการรับโปรโมชัน')`, [req, `คัดค้าน หนึ่ง ${TAG}`, P1]);
  // คำขอคัดค้านจากอีเมลนี้ไว้ก่อน แล้วร้านเพิ่มลูกค้าที่ใช้อีเมลเดียวกันภายหลัง → ไม่อยู่ในไฟล์เช่นกัน
  await db.query(`INSERT INTO "DataRequest" (id, kind, name, phone, email, detail) VALUES ($1,'OBJECT',$2,$3,$4,'ถอนความยินยอม')`, [req2, `คัดค้าน สาม ${TAG}`, P3, E3]);
  await db.query(`INSERT INTO "Customer" (id, code, kind, name, email, "updatedAt") VALUES ($1,$2,'PERSON',$3,$4,now())`, [c3, `R${rid().slice(0, 6)}`, `อีเมลคัดค้าน สาม ${TAG}`, E3]);

  const ad = await owner(browser);
  const broadcast = async () => (await (await ad.request.get(`/admin/customers/broadcast.csv?q=${encodeURIComponent(TAG)}`)).text());
  // มีคำขอคัดค้านที่ยังไม่ถูกปฏิเสธ → ถูกกันออกจากไฟล์ตั้งแต่ยื่นคำขอ
  let csv = await broadcast();
  expect(csv).not.toContain(`คัดค้าน หนึ่ง ${TAG}`);
  expect(csv).toContain(`รับข่าว สอง ${TAG}`);
  await ad.goto(`/admin/data-requests/${req}`);
  await ad.click('#drObject button:has-text("บันทึกการคัดค้านการตลาด")');
  await expect(ad.locator("#drOptOut")).toContainText("ลูกค้า 1 ราย");
  await expect(ad.locator("#drResult")).toContainText("บันทึกการคัดค้านการตลาดแล้ว");
  expect((await one<{ o: boolean }>(`SELECT "marketingOptOut" o FROM "Customer" WHERE id=$1`, [c1])).o).toBe(true);
  // แม้คำขอถูกปิด/ปฏิเสธภายหลัง ค่า "ไม่รับข่าวสาร" ของลูกค้ายังมีผล
  await db.query(`UPDATE "DataRequest" SET status='REJECTED' WHERE id=$1`, [req]);
  csv = await broadcast();
  expect(csv).not.toContain(`คัดค้าน หนึ่ง ${TAG}`);
  expect(csv).not.toContain(`อีเมลคัดค้าน สาม ${TAG}`);
  expect(csv).toContain(`รับข่าว สอง ${TAG}`);
  // หน้ารายชื่อ/หน้าลูกค้า: ป้าย + สลับเองได้
  await ad.goto(`/admin/customers?q=${encodeURIComponent(TAG)}`);
  await expect(ad.locator(`tr:has-text("คัดค้าน หนึ่ง ${TAG}") .cu-optout`)).toHaveText("ไม่รับข่าวสาร");
  await ad.goto(`/admin/customers/${c2}`);
  await ad.click('#optOutBox button:has-text("ตั้งเป็น “ไม่รับข่าวสาร”")');
  await expect(ad.locator("#cuOptOutBadge")).toBeVisible();
  expect(await broadcast()).not.toContain(`รับข่าว สอง ${TAG}`);
  await ad.click('#optOutBox button:has-text("ยกเลิก “ไม่รับข่าวสาร”")');
  await expect(ad.locator("#cuOptOutBadge")).toHaveCount(0);
  expect(await broadcast()).toContain(`รับข่าว สอง ${TAG}`);
  const log = await one<{ diff: Record<string, unknown[]> }>(`SELECT diff FROM "AdminLog" WHERE entity=$1 ORDER BY "createdAt" DESC LIMIT 1`, [`Customer:${c2}`]);
  expect(log.diff.marketingOptOut).toEqual([true, false]);
  // คำขอชนิดอื่นไม่มีปุ่มนี้
  await ad.goto(`/admin/data-requests/${requests[0]}`);
  await expect(ad.locator("#drObject")).toHaveCount(0);
  await ad.context().close();
});

test("D9 ส่งออกทั้งร้านครบทุกตาราง (รวมรอบ 3) ไม่มีความลับ · D13 พนักงานไม่เห็นบันทึก PDPA/ต้นทุน/สำรองข้อมูล", async ({ browser }) => {
  await db.query(
    `INSERT INTO "AdminLog" (id, type, note) VALUES ($1,'PDPA',$4), ($2,'PURCHASE',$5), ($3,'BACKUP',$6), ($7,'PRODUCT',$8)`,
    [`${TAG}-g1`, `${TAG}-g2`, `${TAG}-g3`, `pdpa ${TAG}`, `purchase ${TAG}`, `backup ${TAG}`, `${TAG}-g4`, `product ${TAG}`],
  );
  const ad = await owner(browser);
  const files = readZip(Buffer.from(await (await ad.request.get("/admin/export.zip")).body()));
  const names = [...files.keys()];
  for (const f of ["orders.csv", "customers.csv", "admin_users.csv", "claims.csv", "reviews.csv", "stock_alerts.csv", "coupons.csv", "coupon_redemptions.csv", "doc_slips.csv", "email_logs.csv", "internal_notes.csv", "admin_tasks.csv", "data_requests.csv", "purchase_orders.csv", "purchase_order_items.csv", "projects.csv", "posts.csv", "backup_runs.csv", "redirects.csv", "variant_groups.csv"])
    expect(names, f).toContain(f);
  for (const f of ["admin_sessions.csv", "login_throttles.csv", "line_recipients.csv"]) expect(names, f).not.toContain(f);
  const admins = files.get("admin_users.csv")!.toString("utf8");
  for (const s of ["passwordHash", "totpSecret", "backupCodes"]) expect(admins).not.toContain(s);
  expect(admins).toContain("totpEnabled");
  expect(files.get("orders.csv")!.toString("utf8").split("\n")[0]).not.toContain("publicToken");
  expect(files.get("README.txt")!.toString("utf8")).toContain("doc_slips.csv");

  // บันทึกการใช้งาน: เจ้าของร้านเห็นทุกชนิด · พนักงานไม่เห็น PDPA/PURCHASE/BACKUP
  await ad.goto(`/admin/log?q=${TAG}`);
  for (const t of ["pdpa", "purchase", "backup", "product"]) await expect(ad.locator(`.log-tbl td:has-text("${t} ${TAG}")`)).toHaveCount(1);
  await ad.context().close();
  const s = await asStaff(browser);
  await s.goto(`/admin/log?q=${TAG}`);
  await expect(s.locator(`.log-tbl td:has-text("product ${TAG}")`)).toHaveCount(1);
  for (const t of ["pdpa", "purchase", "backup"]) await expect(s.locator(`.log-tbl td:has-text("${t} ${TAG}")`)).toHaveCount(0);
  await s.goto(`/admin/log?tab=settings&q=${TAG}`);
  await expect(s.locator(".log-tbl tbody tr")).toHaveCount(0);
  expect((await s.request.get(`/admin/log.csv?q=${TAG}`)).status()).toBe(403);
  await s.context().close();
});

// ใช้ refreshStorefront เพื่อให้แน่ใจว่าหน้าร้านเห็นค่าตั้งเดิมหลังคืนค่า (แคช tag storefront)
test("คืนค่าตั้งหน้าร้าน", async ({ browser }) => {
  if (settingsBefore) await db.query(`UPDATE "ShopSetting" SET "pickupEnabled"=$1, "codEnabled"=$2 WHERE id='shop'`, [settingsBefore.pickupEnabled, settingsBefore.codEnabled]);
  await refreshStorefront(browser);
  settingsBefore = null;
});

