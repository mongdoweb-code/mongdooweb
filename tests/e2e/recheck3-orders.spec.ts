// ตรวจซ้ำรอบ 3 (คำสั่งซื้อ/เงิน/งานประจำวัน):
// D1 ใบแจ้งหนี้จากคำสั่งซื้อที่ชำระครบ → คำสั่งซื้อ "ชำระแล้ว" (ตัดสต็อก, นับยอดขายครั้งเดียว, ไม่ถูกยกเลิกอัตโนมัติ) · ห้ามออกใบแจ้งหนี้ของคำสั่งซื้อที่ยกเลิก
// D2b ผูกลูกค้าเมื่อยืนยันชำระ (เบอร์เทียบเฉพาะตัวเลข) + สคริปต์ผูกย้อนหลัง · D5 ต้นทุน ณ วันขาย (คำสั่งซื้อ/ใบเสร็จ) ในรายงานกำไร
// D2 ใบปะหน้า: ยอด COD แยกทีละคำสั่งซื้อ · D3 รับที่ร้าน: ปุ่ม "ลูกค้ารับสินค้าแล้ว" และไม่มีใบปะหน้า
// D10 ราคาตั้งต้นตามจำนวน (ราคาขายส่ง) ในคำสั่งซื้อหลังร้าน/ใบเสนอราคาจากคำขอ/ตัวแก้ไขเอกสาร + ค่าส่งแบบหน้าชำระเงิน · U24 โทเคนของคำสั่งซื้อหลังร้าน
// D11 ตะกร้า: ลดจำนวนตามสต็อกแล้วคิดราคาตามจำนวนสุดท้าย · D12 เมนูหลังบ้านอยู่ใต้หัวข้อที่ถูกต้อง
// ข้อมูลทั้งหมดสร้างในเทสต์ (SKU E2E-R3A-*) และลบเมื่อจบ — ใช้ได้ทั้งฐานข้อมูลใหม่ (seed) และสำเนาข้อมูลจริง
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { parseRemoteZips, parseShippingTiers, parseWeightTiers, quoteShipping } from "../../src/lib/shipping";
import { V, login, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL!.replace(/\?schema=\w+$/, "") });
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0] as T;
const TAG = `r3a${Date.now().toString(36)}`;
const TAGU = TAG.toUpperCase();
let seq = 0;
/** เบอร์ไม่ซ้ำ 10 หลัก (ขึ้นต้น 08) */
const phone = () => `08${String(Date.now() + seq++ * 7919).slice(-8)}`;
const CRON = process.env.CRON_SECRET ?? "";

const P = {
  a: { id: `${TAG}a`, sku: `E2E-R3A-${TAGU}-A`, slug: `e2e-r3a-${TAG}-a` }, // ต้นทุน 200 ราคา 500 สต็อก 20
  t: { id: `${TAG}t`, sku: `E2E-R3A-${TAGU}-T`, slug: `e2e-r3a-${TAG}-t` }, // ราคาขายส่ง ≥3 = 400, ≥5 = 350 · หนัก 1 กก.
  q: { id: `${TAG}q`, sku: `E2E-R3A-${TAGU}-Q`, slug: `e2e-r3a-${TAG}-q` }, // ราคาขายส่งเหมือน T แต่สต็อก 3
};
const TIERS = JSON.stringify([{ minQty: 3, priceSatang: 40000 }, { minQty: 5, priceSatang: 35000 }]);
const orderIds: string[] = [];
const customerIds: string[] = [];
let settingsBefore: { autoCancelDays: number };

async function insertOrder(o: { status: string; qty?: number; productId?: string; price?: number; phone?: string; cod?: boolean; pickup?: boolean; customerId?: string | null; createdDaysAgo?: number }) {
  const id = `${TAG}o${orderIds.length}`;
  const orderNo = `MDW-R3A-${TAGU.slice(-5)}${orderIds.length}`;
  const qty = o.qty ?? 2, price = o.price ?? 50000, sub = qty * price, codFee = o.cod ? 3000 : 0;
  await db.query(
    `INSERT INTO "Order" (id, "orderNo", status, "customerName", phone, "addressLine", subdistrict, district, province, "postalCode",
       "subtotalSatang", "shippingMethod", "shippingName", "shippingSatang", "codFeeSatang", "totalSatang", "paymentMethod", "paidAt", "customerId", "createdAt", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,'บางกรวย','บางกรวย','นนทบุรี','11130',$7,$8,$9,0,$10,$11,$12,$13,$14, now() - make_interval(days => $15), now())`,
    [
      id, orderNo, o.status, `ลูกค้า ${TAG} ${orderIds.length}`, o.phone ?? phone(), o.pickup ? "รับสินค้าที่ร้าน" : "1 ถนนทดสอบ",
      sub, o.pickup ? "pickup" : "std", o.pickup ? "รับสินค้าที่ร้าน" : "ส่งธรรมดา", codFee, sub + codFee, o.cod ? "COD" : "TRANSFER",
      ["PAID", "SHIPPED"].includes(o.status) ? new Date() : null, o.customerId ?? null, o.createdDaysAgo ?? 0,
    ],
  );
  await db.query(`INSERT INTO "OrderItem" (id, "orderId", "productId", "nameSnapshot", "priceSatang", qty) VALUES ($1,$2,$3,$4,$5,$6)`, [`${id}i`, id, o.productId ?? P.a.id, `สินค้าทดสอบ ${TAG}`, price, qty]);
  orderIds.push(id);
  return { id, orderNo, total: sub + codFee };
}

const orderRow = (id: string) =>
  one<{ status: string; paidAt: Date | null; customerId: string | null; carrier: string | null; trackingNo: string | null; shippedAt: Date | null; publicToken: string | null }>(
    `SELECT status, "paidAt", "customerId", carrier, "trackingNo", "shippedAt", "publicToken" FROM "Order" WHERE id=$1`, [id]);
const stockOf = async (pid: string) => (await one<{ s: number }>(`SELECT stock s FROM "Product" WHERE id=$1`, [pid])).s;
const itemCost = async (orderId: string) => (await one<{ c: number | null }>(`SELECT "costSatang" c FROM "OrderItem" WHERE "orderId"=$1`, [orderId])).c;

async function openOrder(page: Page, orderNo: string, mode?: string) {
  await page.goto(`/admin?tab=ALL&open=${encodeURIComponent(orderNo)}${mode ? `&mode=${mode}` : ""}`);
  await expect(page.locator(".drawer-panel" + V)).toContainText(orderNo);
}

test.beforeAll(async () => {
  await db.query(`DELETE FROM "LoginThrottle"`);
  const cat = (await one<{ id: string }>(`SELECT id FROM "Category" WHERE "isActive" ORDER BY "sortOrder" LIMIT 1`)).id;
  const ins = (p: { id: string; sku: string; slug: string }, name: string, price: number, extra: { cost?: number; stock: number; tiers?: string; weight?: number }) =>
    db.query(
      `INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "costSatang", "trackStock", stock, "inStock", "tierPrices", "weightGram", "categoryId", "isActive", "updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,true,$7,true,$8::jsonb,$9,$10,true,now())`,
      [p.id, p.sku, p.slug, name, price, extra.cost ?? null, extra.stock, extra.tiers ?? null, extra.weight ?? null, cat],
    );
  await ins(P.a, `ไฟทดสอบต้นทุน ${TAG}`, 50000, { cost: 20000, stock: 20 });
  await ins(P.t, `ไฟทดสอบราคาส่ง ${TAG}`, 50000, { stock: 50, tiers: TIERS, weight: 1000 });
  await ins(P.q, `ไฟทดสอบสต็อกน้อย ${TAG}`, 50000, { stock: 3, tiers: TIERS });
  settingsBefore = await one(`SELECT "autoCancelDays" FROM "ShopSetting" WHERE id='shop'`);
});

test.afterAll(async () => {
  const docIds = (await db.query(`SELECT id FROM "SalesDocument" WHERE "orderId" = ANY($1) OR "customerId" = ANY($2)`, [orderIds, customerIds])).rows.map((r) => r.id);
  await db.query(`DELETE FROM "DocPayment" WHERE "invoiceId" = ANY($1) OR "receiptId" = ANY($1)`, [docIds]);
  await db.query(`DELETE FROM "SalesDocument" WHERE id = ANY($1)`, [docIds]);
  // ลูกค้าที่ระบบสร้าง/ผูกให้ในเทสต์นี้
  const linked = (await db.query(`SELECT DISTINCT "customerId" FROM "Order" WHERE id = ANY($1) AND "customerId" IS NOT NULL`, [orderIds])).rows.map((r) => r.customerId);
  await db.query(`DELETE FROM "Order" WHERE id = ANY($1) OR "orderNo" IN (SELECT "orderNo" FROM "Order" o JOIN "OrderItem" i ON i."orderId"=o.id WHERE i."productId" = ANY($2))`, [orderIds, Object.values(P).map((p) => p.id)]);
  await db.query(`DELETE FROM "Inquiry" WHERE name LIKE $1`, [`%${TAG}%`]);
  await db.query(`DELETE FROM "Customer" WHERE (id = ANY($1) OR id = ANY($2) OR name LIKE $3) AND id NOT IN (SELECT "customerId" FROM "Order" WHERE "customerId" IS NOT NULL) AND id NOT IN (SELECT "customerId" FROM "SalesDocument" WHERE "customerId" IS NOT NULL)`, [customerIds, linked, `%${TAG}%`]);
  await db.query(`DELETE FROM "StockMovement" WHERE "productId" = ANY($1)`, [Object.values(P).map((p) => p.id)]);
  await db.query(`DELETE FROM "Product" WHERE id = ANY($1)`, [Object.values(P).map((p) => p.id)]);
  await db.query(`UPDATE "ShopSetting" SET "autoCancelDays"=$1 WHERE id='shop'`, [settingsBefore.autoCancelDays]);
  await db.end();
});

test("D1/D2b/D5 ใบแจ้งหนี้จากคำสั่งซื้อชำระครบ → คำสั่งซื้อชำระแล้ว ตัดสต็อก ผูกลูกค้า บันทึกต้นทุน นับยอดครั้งเดียว", async ({ page }) => {
  const errors = trackErrors(page);
  // ลูกค้าเดิมที่เก็บเบอร์แบบมีขีด → ต้องจับคู่ด้วยตัวเลข ไม่สร้างลูกค้าซ้ำ
  const ph = phone();
  const cust = await one<{ id: string }>(
    `INSERT INTO "Customer" (id, code, kind, name, phone, "updatedAt") VALUES ($1,$2,'PERSON',$3,$4,now()) RETURNING id`,
    [`${TAG}c1`, `R${TAG.slice(-6)}`, `ลูกค้าเดิม ${TAG}`, `${ph.slice(0, 3)}-${ph.slice(3, 6)}-${ph.slice(6)}`],
  );
  customerIds.push(cust.id);
  const o = await insertOrder({ status: "AWAITING_SLIP", qty: 2, phone: ph });
  const stock0 = await stockOf(P.a.id);
  await login(page);
  await openOrder(page, o.orderNo);
  await page.click("#ivFromOrder" + V);
  await page.waitForURL(/\/admin\/docs\/INVOICE\/[^/]+\/edit$/);
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/INVOICE\/.+issued=1/);
  const ivNo = (await page.locator(".dv-title .num" + V).innerText()).trim();
  // ยังไม่ชำระ: คำสั่งซื้อที่มีใบแจ้งหนี้ค้างชำระไม่ถูกยกเลิกอัตโนมัติ (แม้เกินกำหนด)
  await db.query(`UPDATE "Order" SET "createdAt" = now() - interval '10 days' WHERE id=$1`, [o.id]);
  await db.query(`UPDATE "ShopSetting" SET "autoCancelDays"=3 WHERE id='shop'`);
  const cron = await page.request.get("/api/cron/daily", { headers: { Authorization: `Bearer ${CRON}` } });
  expect(cron.status()).toBe(200);
  expect((await cron.json()).cancelled).not.toContain(o.orderNo);
  expect((await orderRow(o.id)).status).toBe("AWAITING_SLIP");

  // รับชำระเต็มจำนวน (ยอดค้างเป็นค่าเริ่มต้น)
  await page.click(`button:has-text("บันทึกรับชำระ + ออกใบเสร็จ")${V}`);
  await page.waitForURL(/paid=RC/);
  await expect(page.locator(".dv-title .dst" + V)).toHaveText("ชำระแล้ว");
  const row = await orderRow(o.id);
  expect(row.status).toBe("PAID");
  expect(row.paidAt).toBeTruthy();
  expect(row.customerId).toBe(cust.id);
  expect(await stockOf(P.a.id)).toBe(stock0 - 2);
  const mv = await one<{ change: number; reason: string }>(`SELECT change, reason FROM "StockMovement" WHERE ref=$1 AND "productId"=$2`, [o.orderNo, P.a.id]);
  expect(mv).toMatchObject({ change: -2, reason: "SALE" });
  const ev = await one<{ note: string }>(`SELECT note FROM "OrderEvent" WHERE "orderId"=$1 AND type='APPROVED'`, [o.id]);
  expect(ev.note).toContain(ivNo);
  expect(await itemCost(o.id)).toBe(20000);
  const rc = await one<{ docNo: string; orderId: string; cost: number }>(
    `SELECT d."docNo", d."orderId", i."costSatang" cost FROM "SalesDocument" d JOIN "SalesDocumentItem" i ON i."documentId"=d.id
     WHERE d.type='RECEIPT' AND d."orderId"=$1 AND i."productId"=$2`, [o.id, P.a.id]);
  expect(rc.orderId).toBe(o.id);
  expect(rc.cost).toBe(20000); // D5: ใบเสร็จก็บันทึกต้นทุน ณ วันออก

  // ต้นทุนเปลี่ยนภายหลัง → รายงานกำไรยังใช้ต้นทุน ณ วันขาย (2 × 200 = 400)
  await db.query(`UPDATE "Product" SET "costSatang"=30000 WHERE id=$1`, [P.a.id]);
  const profit = await (await page.request.get("/admin/reports/profit/export?preset=d7")).text();
  expect(profit).toMatch(new RegExp(`${P.a.sku}"?,2,1000\\.00,400\\.00,600\\.00,60\\.0`));
  // ยอดขาย: นับคำสั่งซื้อครั้งเดียว ใบเสร็จที่ผูกคำสั่งซื้อไม่นับซ้ำ
  const sales = await (await page.request.get("/admin/reports/export?preset=d7&view=list")).text();
  expect(sales.split(o.orderNo).length - 1).toBe(1);
  expect(sales).not.toContain(rc.docNo);
  // ลูกค้า: ยอดซื้อรวมเห็นคำสั่งซื้อนี้
  await page.goto(`/admin/customers?q=${encodeURIComponent(`ลูกค้าเดิม ${TAG}`)}`);
  await expect(page.locator(`tr:has-text("ลูกค้าเดิม ${TAG}")` + V).first()).toContainText("1,000");
  expect(errors).toEqual([]);
});

test("D1 คำสั่งซื้อที่ยกเลิก: ไม่มีปุ่มและออกใบแจ้งหนี้ไม่ได้", async ({ page }) => {
  const o = await insertOrder({ status: "CANCELLED", qty: 1 });
  await login(page);
  await openOrder(page, o.orderNo);
  await expect(page.locator("#ivFromOrder" + V)).toHaveCount(0);
  // เรียก action ตรง (ฟอร์มเก่า/ปลอม) → ไม่สร้างเอกสาร
  const m = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as { node: Record<string, { filename: string; exportedName: string }> };
  const hit = Object.entries(m.node).find(([, v]) => v.filename === "src/app/admin/(app)/docs/actions.ts" && v.exportedName === "docFromOrder");
  expect(hit).toBeTruthy();
  const r = await page.request.post("/admin", {
    multipart: { [`$ACTION_ID_${hit![0]}`]: "", orderNo: o.orderNo, type: "INVOICE" }, maxRedirects: 0, headers: { origin: test.info().project.use.baseURL! },
  });
  expect(r.status()).toBeLessThan(500);
  expect(Number((await one<{ n: string }>(`SELECT count(*) n FROM "SalesDocument" WHERE "orderId"=$1`, [o.id])).n)).toBe(0);
});

test("D2b/D5 ยืนยัน COD และบันทึกรับชำระเอง: สร้าง/ผูกลูกค้า + ต้นทุน ณ วันขาย", async ({ page }) => {
  const errors = trackErrors(page);
  const cod = await insertOrder({ status: "PENDING_VERIFICATION", qty: 1, cod: true });
  const stock0 = await stockOf(P.a.id);
  await login(page);
  await openOrder(page, cod.orderNo);
  await page.click(`#codConfirmBox button:has-text("ยืนยันคำสั่งซื้อ COD")${V}`);
  await expect.poll(async () => (await orderRow(cod.id)).status).toBe("PAID");
  const r = await orderRow(cod.id);
  expect(r.customerId).toBeTruthy();
  const c = await one<{ phone: string; name: string }>(`SELECT phone, name FROM "Customer" WHERE id=$1`, [r.customerId]);
  expect(c.name).toContain(TAG);
  expect(await stockOf(P.a.id)).toBe(stock0 - 1);
  expect(await itemCost(cod.id)).toBe(30000); // ต้นทุนปัจจุบัน ณ วันยืนยัน (เทสต์ก่อนหน้าแก้เป็น 300)
  expect((await one<{ n: string }>(`SELECT count(*) n FROM "OrderEvent" WHERE "orderId"=$1 AND type='COD_CONFIRMED'`, [cod.id])).n).toBe("1");

  const pay = await insertOrder({ status: "AWAITING_SLIP", qty: 1 });
  await openOrder(page, pay.orderNo, "pay");
  await page.fill("#payNote" + V, "ลูกค้าส่งสลิปทาง LINE");
  await page.click("#payForm button[type=submit]" + V);
  await expect(page.locator(".drawer-panel .st-PAID" + V).first()).toBeVisible();
  const p2 = await orderRow(pay.id);
  expect(p2.customerId).toBeTruthy();
  expect(await itemCost(pay.id)).toBe(30000);
  expect(errors).toEqual([]);
});

test("D2/D3 ใบปะหน้า: ยอด COD ทีละคำสั่งซื้อ · รับที่ร้านไม่มีใบปะหน้า + ปุ่มลูกค้ารับสินค้าแล้ว", async ({ page }) => {
  const errors = trackErrors(page);
  const cod = await insertOrder({ status: "PAID", qty: 2, price: 60200, cod: true }); // 1,204 + ค่าธรรมเนียม 30 = 1,234
  const tr = await insertOrder({ status: "PAID", qty: 1 });
  const pk = await insertOrder({ status: "PAID", qty: 1, pickup: true });
  await login(page);

  // ปุ่มพิมพ์รวม: นับเฉพาะที่ต้องส่งพัสดุ
  await page.goto("/admin");
  const toShip = Number((await one<{ n: string }>(`SELECT count(*) n FROM "Order" WHERE status='PAID' AND "shippingMethod" <> 'pickup'`)).n);
  await expect(page.locator("#bulkLabels" + V)).toContainText(`(${toShip})`);

  for (const url of [`/admin/print/labels?orders=${cod.orderNo},${tr.orderNo},${pk.orderNo}&cod=99`, "/admin/print/labels?status=PAID"]) {
    await page.goto(url);
    const lc = page.locator(`.label:has(.lb-ref:text-is("${cod.orderNo}"))` + V);
    await expect(lc.locator(".lb-cod")).toHaveText("เก็บเงินปลายทาง ฿1,234.00");
    const lt = page.locator(`.label:has(.lb-ref:text-is("${tr.orderNo}"))` + V);
    await expect(lt).toHaveCount(1);
    await expect(lt.locator(".lb-cod")).toHaveCount(0); // ไม่ใช้ ?cod= ร่วม
    await expect(page.locator(`.label:has(.lb-ref:text-is("${pk.orderNo}"))`)).toHaveCount(0);
  }
  // ใบปะหน้าจากเอกสารยังใช้ ?cod= ได้ — และลิ้นชักแสดงยอด COD ของคำสั่งซื้อ (แก้ไม่ได้)
  await openOrder(page, cod.orderNo);
  await expect(page.locator(`#lb-cod-${cod.orderNo}` + V)).toHaveText("฿1,234.00");

  // รับที่ร้าน
  await openOrder(page, pk.orderNo);
  await expect(page.locator("#pickupBox" + V)).toBeVisible();
  await expect(page.locator(".drawer-panel #trackNo")).toHaveCount(0);
  await expect(page.locator(".drawer-panel .lbo")).toHaveCount(0);
  await page.fill("#pickupNote" + V, "ลูกค้ามารับเอง");
  await page.click("#pickupDone" + V);
  await expect(page.locator("#shippedBox" + V)).toContainText("รับที่ร้าน");
  const r = await orderRow(pk.id);
  expect(r).toMatchObject({ status: "SHIPPED", carrier: "รับที่ร้าน", trackingNo: null });
  expect(r.shippedAt).toBeTruthy();
  const ev = await one<{ note: string }>(`SELECT note FROM "OrderEvent" WHERE "orderId"=$1 AND type='SHIPPED'`, [pk.id]);
  expect(ev.note).toContain("ลูกค้ารับสินค้าที่ร้านแล้ว — ลูกค้ามารับเอง");
  // คำสั่งซื้อส่งพัสดุยังใช้ฟอร์มเลขพัสดุเดิม
  await openOrder(page, tr.orderNo);
  await expect(page.locator("#trackNo" + V)).toBeVisible();
  await expect(page.locator("#pickupBox")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("D10/U24 ราคาตามจำนวน + ค่าส่งแบบหน้าชำระเงินในคำสั่งซื้อหลังร้าน · ตัวแก้ไขเอกสาร · ใบเสนอราคาจากคำขอ", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto("/admin/orders/new");
  await page.fill("#pq" + V, P.t.sku);
  await page.locator(`.mo-results button:has-text("${P.t.sku}")` + V).first().click();
  await expect(page.locator("#p0" + V)).toHaveValue("500");
  await page.fill("#q0" + V, "3");
  await expect(page.locator("#p0" + V)).toHaveValue("400"); // ราคาขายส่ง ≥ 3
  await page.fill("#q0" + V, "5");
  await expect(page.locator("#p0" + V)).toHaveValue("350");
  await page.fill("#q0" + V, "3");
  const ph = phone();
  await page.fill("#a-name" + V, `ผู้รับ ${TAG}`);
  await page.fill("#a-phone" + V, ph);
  await page.fill("#a-addr" + V, "12/3 หมู่ 4");
  await page.fill("#a-sub" + V, "บางกรวย");
  await page.fill("#a-dist" + V, "บางกรวย");
  await page.fill("#a-prov" + V, "นนทบุรี");
  await page.fill("#a-zip" + V, "11130");
  await page.click("#moSubmit" + V);
  await page.waitForURL(/\/admin\?.*created=1/);
  const orderNo = new URL(page.url()).searchParams.get("open")!;
  const o = await one<{ id: string; shippingSatang: number; publicToken: string | null; customerId: string | null; price: number }>(
    `SELECT o.id, o."shippingSatang", o."publicToken", o."customerId", i."priceSatang" price FROM "Order" o JOIN "OrderItem" i ON i."orderId"=o.id WHERE o."orderNo"=$1`, [orderNo]);
  orderIds.push(o.id);
  expect(o.price).toBe(40000);
  // ค่าส่ง = สูตรเดียวกับหน้าชำระเงิน (ขั้นตามยอด + น้ำหนัก 3 กก. + พื้นที่ห่างไกล)
  const s = await one<{ shippingTiers: unknown; weightTiers: unknown; remoteZips: unknown; remoteFeeSatang: number; expressEnabled: boolean; expressExtraSatang: number }>(
    `SELECT "shippingTiers", "weightTiers", "remoteZips", "remoteFeeSatang", "expressEnabled", "expressExtraSatang" FROM "ShopSetting" WHERE id='shop'`);
  const q = quoteShipping(
    { tiers: parseShippingTiers(s.shippingTiers), weightTiers: parseWeightTiers(s.weightTiers), remoteZips: parseRemoteZips(s.remoteZips), remoteFeeSatang: s.remoteFeeSatang, expressEnabled: s.expressEnabled, expressExtraSatang: s.expressExtraSatang, pickupEnabled: true, codEnabled: false, codFeeSatang: 0, codMaxSatang: 0 },
    { method: "std", subtotalSatang: 120000, totalGram: 3000, zip: "11130" },
  );
  expect(o.shippingSatang).toBe(q.shippingSatang);
  // U24: มีโทเคน → ลิงก์ใบสั่งซื้อเปิดได้
  expect(o.publicToken).toMatch(/^[\w-]{40,}$/);
  expect(o.customerId).toBeTruthy();
  const pdf = await page.request.get(`/track/order/${encodeURIComponent(orderNo)}?t=${o.publicToken}`);
  expect(pdf.status()).toBe(200);

  // ตัวแก้ไขเอกสาร: เลือกสินค้าแล้วเปลี่ยนจำนวน → ราคาตามขั้น
  await page.goto("/admin/docs/QUOTATION/new/edit");
  const l1 = page.locator(".de-line" + V).first();
  await l1.locator(".ac-wrap input").fill(P.t.sku);
  await page.locator(`.ac-o:has-text("${P.t.sku}")` + V).first().dispatchEvent("mousedown");
  await expect(l1.locator(".ln-nums input").nth(2)).toHaveValue("500.00");
  await l1.locator(".ln-nums input").nth(0).fill("5");
  await expect(l1.locator(".ln-nums input").nth(2)).toHaveValue("350.00");
  // ราคาที่แก้เองไม่ถูกเปลี่ยนตามจำนวน
  await l1.locator(".ln-nums input").nth(2).fill("380");
  await l1.locator(".ln-nums input").nth(0).fill("3");
  await expect(l1.locator(".ln-nums input").nth(2)).toHaveValue("380");

  // คำขอใบเสนอราคา → ราคาตามจำนวน
  const inq = `${TAG}inq`;
  await db.query(
    `INSERT INTO "Inquiry" (id, kind, status, name, phone, message, items, attachments, "updatedAt") VALUES ($1,'QUOTE','NEW',$2,$3,'ขอราคา',$4,'[]',now())`,
    [inq, `ผู้ขอ ${TAG}`, phone(), JSON.stringify([{ slug: P.t.slug, name: "x", qty: 3 }])],
  );
  await page.goto(`/admin/inquiries/${inq}`);
  await page.click("#mkQuote" + V);
  await page.waitForURL(/\/admin\/docs\/QUOTATION\/[^/]+\/edit/);
  const qt = await one<{ price: number; id: string; customerId: string }>(
    `SELECT i."priceSatang" price, d.id, d."customerId" FROM "SalesDocument" d JOIN "SalesDocumentItem" i ON i."documentId"=d.id JOIN "Inquiry" q ON q."quotationId"=d.id WHERE q.id=$1`, [inq]);
  customerIds.push(qt.customerId);
  await db.query(`UPDATE "Inquiry" SET "quotationId"=NULL WHERE id=$1`, [inq]);
  await db.query(`DELETE FROM "SalesDocument" WHERE id=$1`, [qt.id]);
  expect(qt.price).toBe(40000);
  expect(errors).toEqual([]);
});

test("D11 ตะกร้า: สต็อกไม่พอ → ลดจำนวนและคิดราคาตามจำนวนสุดท้าย", async ({ request }) => {
  const r = await request.post("/api/cart/validate", { data: { items: { [P.q.slug]: 6 } } });
  expect(r.status()).toBe(200);
  const line = (await r.json()).lines[0];
  expect(line).toMatchObject({ id: P.q.slug, qty: 3, wanted: 6, status: "qty", price: 400 }); // ไม่ใช่ราคาของ 6 ชิ้น (350)
});

test("D12 เมนูหลังบ้าน: งานที่ต้องทำอยู่ก่อนหัวข้อแรก และคูปองอยู่ใต้ 'สินค้าและหน้าร้าน'", async ({ page }) => {
  await login(page);
  const seqText = await page.evaluate(() =>
    [...document.querySelectorAll("#side .nav-grp, #side .nav-i")].map((e) => (e.classList.contains("nav-grp") ? `#${e.textContent}` : e.getAttribute("href"))),
  );
  const firstGroup = seqText.findIndex((x) => x?.startsWith("#"));
  expect(seqText.indexOf("/admin/tasks")).toBeLessThan(firstGroup);
  expect(seqText[firstGroup]).toBe("#สินค้าและหน้าร้าน");
  const coupon = seqText.indexOf("/admin/coupons");
  expect(coupon).toBeGreaterThan(firstGroup);
  expect(seqText.slice(firstGroup + 1, coupon).some((x) => x?.startsWith("#"))).toBe(false);
});

test("D2b สคริปต์ผูกคำสั่งซื้อเดิมกับลูกค้า (ทดลอง → จริง → รันซ้ำไม่เปลี่ยน)", async () => {
  const ph = phone();
  const cust = await one<{ id: string; code: string }>(
    `INSERT INTO "Customer" (id, code, kind, name, phone, "updatedAt") VALUES ($1,$2,'PERSON',$3,$4,now()) RETURNING id, code`,
    [`${TAG}c2`, `S${TAG.slice(-6)}`, `ลูกค้าย้อนหลัง ${TAG}`, `${ph.slice(0, 3)} ${ph.slice(3, 6)} ${ph.slice(6)}`],
  );
  customerIds.push(cust.id);
  const old = await insertOrder({ status: "SHIPPED", qty: 1, phone: ph });
  const fresh = await insertOrder({ status: "PAID", qty: 1 }); // ไม่มีลูกค้าเดิม → สร้างใหม่
  const run = (...args: string[]) => execFileSync("npx", ["tsx", "scripts/link-order-customers.ts", ...args], { encoding: "utf8", env: process.env });
  const dry = run("--dry-run");
  expect(dry).toContain(`${old.orderNo} → ลูกค้าเดิม ${cust.code}`);
  expect(dry).toContain(`${fresh.orderNo} → สร้างลูกค้าใหม่`);
  expect((await orderRow(old.id)).customerId).toBeNull();
  run();
  expect((await orderRow(old.id)).customerId).toBe(cust.id);
  expect((await orderRow(fresh.id)).customerId).toBeTruthy();
  expect(run()).toContain("ผูกคำสั่งซื้อกับลูกค้า 0 รายการ");
});
