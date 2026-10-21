// ล็อต 3 (A1–A15): แดชบอร์ด รายงาน คำสั่งซื้อจากหลังร้าน แก้ไข/ยกเลิก/คืนเงิน สต็อก CSV สินค้า จัดส่งหลายรายการ ตัวดูสลิป งานตั้งเวลา ใบกำกับภาษี
// ต้องมีฐานข้อมูลเดียวกับเซิร์ฟเวอร์ (DATABASE_URL ใน .env) และ CRON_SECRET (ค่าเริ่มต้นในเทสต์: test-cron-secret)
import "dotenv/config";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { V, login, todayBkk, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });
const CRON = process.env.CRON_SECRET || "test-cron-secret";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL!.replace(/\?schema=\w+$/, "") });
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0] as T;
const stockOf = async (id: string) => Number((await one<{ stock: number }>(`SELECT stock FROM "Product" WHERE id=$1`, [id])).stock);
const ledgerSum = async (id: string) => Number((await one<{ s: number }>(`SELECT COALESCE(SUM(change),0)::int AS s FROM "StockMovement" WHERE "productId"=$1`, [id])).s);
const uniqPhone = () => `08${String(Date.now()).slice(-8)}`;
/** เลขผู้เสียภาษีที่ checksum ถูกต้อง */
function taxId(base12: string) {
  const sum = [...base12].reduce((s, c, i) => s + Number(c) * (13 - i), 0);
  return base12 + String((11 - (sum % 11)) % 10);
}

let P: { id: string; sku: string; name: string; price: number; cmp: number | null } = { id: "", sku: "", name: "", price: 0, cmp: null };
let paidOrder = "";
let paidTotal = 0;

test.afterAll(async () => {
  await db.query(`UPDATE "ShopSetting" SET "autoCancelDays"=0 WHERE id='shop'`);
  await db.end();
});

async function dashToday(page: Page) {
  await page.goto("/admin/dashboard");
  return Number(await page.locator(".l3-kpi b[data-satang]" + V).first().getAttribute("data-satang"));
}

/** สร้างคำสั่งซื้อจากหน้า /admin/orders/new */
async function manualOrder(page: Page, opts: { qty: number; paid: boolean; tax?: { name: string; id: string } }) {
  await page.goto("/admin/orders/new");
  await page.fill("#pq" + V, P.sku);
  await page.locator(`.mo-results button:has-text("${P.sku}")` + V).first().click();
  await page.fill("#q0" + V, String(opts.qty));
  await page.fill("#a-name" + V, "ทดสอบ หลังร้าน");
  await page.fill("#a-phone" + V, uniqPhone());
  await page.fill("#a-addr" + V, "12/3 หมู่ 4");
  await page.fill("#a-sub" + V, "บางกรวย");
  await page.fill("#a-dist" + V, "บางกรวย");
  await page.fill("#a-prov" + V, "นนทบุรี");
  await page.fill("#a-zip" + V, "11130");
  if (opts.tax) {
    await page.locator('label:has-text("ลูกค้าขอใบกำกับภาษี") input' + V).check();
    await page.fill("#t-name" + V, opts.tax.name);
    await page.fill("#t-id" + V, opts.tax.id);
    await page.fill("#t-addr" + V, "99 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพฯ 10100");
  }
  if (opts.paid) await page.locator('.mo-radio label:has-text("ชำระแล้ว") input' + V).check();
  await page.click("#moSubmit" + V);
  await page.waitForURL(/\/admin\?.*created=1/);
  const orderNo = new URL(page.url()).searchParams.get("open")!;
  expect(orderNo).toMatch(/^MDW-\d{6}-\d{4}$/);
  await expect(page.locator(".drawer-panel" + V)).toContainText(orderNo);
  return orderNo;
}

test("เตรียมสินค้า + ปรับสต็อกเอง (A7): ยอดคงเหลือ = ผลรวมการเคลื่อนไหว", async ({ page }) => {
  const errors = trackErrors(page);
  P = await one(`SELECT p.id, p.sku, p.name, p."priceSatang" AS price, p."compareAtSatang" AS cmp FROM "Product" p JOIN "Category" c ON c.id=p."categoryId"
    WHERE p."isActive" AND NOT p."isService" AND c."isActive" AND p."priceSatang" > 0 AND p.sku NOT LIKE 'E2E-%' ORDER BY p."trackStock" DESC, p.sku LIMIT 1`);
  expect(P?.id).toBeTruthy();
  await login(page);
  await page.goto(`/admin/stock/${P.id}`);
  if (await page.locator("#startQty" + V).count()) {
    await page.fill("#startQty" + V, "50");
    await page.click('button:has-text("เริ่มนับสต็อก")' + V);
  } else {
    await page.locator('.mo-radio label:has-text("นับสต็อก") input' + V).check();
    await page.fill("#adjQty" + V, "50");
    await page.click('#adjustForm button[type=submit]' + V);
  }
  await expect(page.locator(".login-info" + V)).toContainText("50");
  await page.goto(`/admin/stock/${P.id}`);
  await expect(page.locator("#stockNow" + V)).toHaveText("50");
  // รับของเข้า +5
  await page.fill("#adjQty" + V, "5");
  await page.fill("#adjNote" + V, "รับจากซัพพลายเออร์ (e2e)");
  await page.click('#adjustForm button[type=submit]' + V);
  await expect(page.locator(".login-info" + V)).toContainText("55");
  // ปรับปรุงต้องมีเหตุผล
  await page.locator('.mo-radio label:has-text("ปรับปรุง") input' + V).check();
  await page.fill("#adjQty" + V, "-1");
  await page.fill("#adjNote" + V, "");
  await page.click('#adjustForm button[type=submit]' + V);
  await expect(page.locator(".login-err" + V)).toContainText("เหตุผล");
  await page.reload();
  await expect(page.locator("#ledgerOk" + V)).toBeVisible();
  expect(await stockOf(P.id)).toBe(55);
  expect(await ledgerSum(P.id)).toBe(55);
  await page.goto("/admin/stock?tab=moves&q=" + encodeURIComponent(P.sku));
  await expect(page.locator("#moveTbl" + V)).toContainText("รับของเข้า");
  expect(errors).toEqual([]);
});

test("สร้างคำสั่งซื้อจากหลังร้านแบบชำระแล้ว (A4) → ตัดสต็อก + แดชบอร์ดตรงกับข้อมูลจริง (A1)", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  const before = await dashToday(page);
  paidOrder = await manualOrder(page, { qty: 2, paid: true });
  const o = await one<{ status: string; channel: string; total: number; cid: string | null }>(
    `SELECT status, channel, "totalSatang" AS total, "customerId" AS cid FROM "Order" WHERE "orderNo"=$1`, [paidOrder]);
  expect(o.status).toBe("PAID");
  expect(o.channel).toBe("ADMIN");
  expect(o.cid).toBeTruthy();
  paidTotal = Number(o.total);
  expect(await stockOf(P.id)).toBe(53);
  const mv = await one<{ change: number; reason: string; balance: number }>(`SELECT change, reason, balance FROM "StockMovement" WHERE ref=$1`, [paidOrder]);
  expect(mv).toMatchObject({ change: -2, reason: "SALE", balance: 53 });
  expect(await ledgerSum(P.id)).toBe(53);
  // แดชบอร์ด: ยอดวันนี้เพิ่มขึ้นเท่ายอดคำสั่งซื้อพอดี
  expect(await dashToday(page)).toBe(before + paidTotal);
  const exp = await one<{ s: number }>(`SELECT COALESCE(SUM("totalSatang"),0)::int AS s FROM "Order" WHERE status IN ('PAID','SHIPPED') AND "paidAt" >= $1::timestamptz`, [`${todayBkk()}T00:00:00+07:00`]);
  const docs = await one<{ s: number }>(`SELECT COALESCE(SUM("grandSatang"),0)::int AS s FROM "SalesDocument" WHERE type='RECEIPT' AND status NOT IN ('VOID','DRAFT') AND "docNo" IS NOT NULL AND "orderId" IS NULL AND "issueDate" >= $1::timestamptz`, [`${todayBkk()}T00:00:00+07:00`]);
  expect(await dashToday(page)).toBe(Number(exp.s) + Number(docs.s));
  await expect(page.locator(".l3-tasks" + V)).toContainText("สินค้าใกล้หมด");
  expect(errors).toEqual([]);
});

test("รายงานยอดขาย + ส่งออก CSV (A2) และรายงานภาษีขาย (A3)", async ({ page }) => {
  await login(page);
  await page.goto("/admin/reports?preset=d7&view=list");
  await expect(page.locator("h1" + V)).toContainText("รายงานยอดขาย");
  await expect(page.locator(".l3-tbl" + V)).toContainText(paidOrder);
  for (const view of ["period", "product", "category", "channel"]) {
    const r = await page.goto(`/admin/reports?preset=d30&view=${view}`);
    expect(r?.status()).toBe(200);
  }
  await expect(page.locator(".l3-tbl" + V)).toContainText("หลังร้าน");
  const csv = await page.request.get("/admin/reports/export?preset=d7&view=list");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain(paidOrder);
  expect(text).toContain((paidTotal / 100).toFixed(2));
  // ยกเลิกแล้วไม่นับ: คำสั่งซื้อที่ยกเลิกไม่อยู่ในรายงาน (ตรวจในเทสต์คืนเงิน)
  await page.goto("/admin/reports/vat");
  await expect(page.locator("h1" + V)).toContainText("รายงานภาษีขาย");
  const vat = await page.request.get(`/admin/reports/vat/export?month=${todayBkk().slice(0, 7)}`);
  expect(vat.status()).toBe(200);
  expect(await vat.text()).toContain("เลขที่ใบกำกับภาษี");
});

test("แก้ไขคำสั่งซื้อก่อนจัดส่ง (A5) → บันทึกประวัติ · จัดส่งแล้วแก้ไม่ได้", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto(`/admin?tab=ALL&open=${paidOrder}&mode=edit`);
  await page.fill("#a-addr" + V, "88/8 หมู่ 9 (แก้ไข)");
  await page.fill("#a-phone" + V, "0812345678");
  await page.click('#editOrderForm button[type=submit]' + V);
  await page.waitForURL(/edited=1/);
  await expect(page.locator(".timeline" + V)).toContainText("ที่อยู่: 12/3 หมู่ 4 → 88/8 หมู่ 9 (แก้ไข)");
  const o = await one<{ phone: string; addressLine: string }>(`SELECT phone, "addressLine" FROM "Order" WHERE "orderNo"=$1`, [paidOrder]);
  expect(o).toEqual({ phone: "0812345678", addressLine: "88/8 หมู่ 9 (แก้ไข)" });
  expect((await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "OrderEvent" e JOIN "Order" o ON o.id=e."orderId" WHERE o."orderNo"=$1 AND e.type='EDITED'`, [paidOrder])).n).toBe(1);
  // ส่งของ
  await page.goto(`/admin?tab=ALL&open=${paidOrder}`);
  await page.fill("#trackNo" + V, "KEX1234567890");
  await page.click('.ship-form button[type=submit]' + V);
  await expect(page.locator("#editLocked" + V)).toContainText("จัดส่งแล้ว");
  await page.goto(`/admin?tab=ALL&open=${paidOrder}&mode=edit`);
  await expect(page.locator("#editOrderForm")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("ยกเลิก + คืนเงินคำสั่งซื้อที่ชำระแล้ว (A6) → คืนสต็อกถูกต้อง, แจ้งให้ยกเลิกใบเสร็จ", async ({ page }) => {
  await login(page);
  const orderNo = await manualOrder(page, { qty: 3, paid: true });
  expect(await stockOf(P.id)).toBe(50);
  // ออกใบเสร็จก่อน เพื่อดูคำเตือนให้ยกเลิกเอกสาร
  await page.click('.drawer-panel button:has-text("ออกใบเสร็จรับเงิน")' + V);
  await page.click('.dlg button:has-text("ออกใบเสร็จ")' + V);
  await page.waitForURL(/\/admin\/docs\/RECEIPT\//);
  await page.goto(`/admin?tab=ALL&open=${orderNo}&mode=refund`);
  await page.selectOption("#rfReason" + V, "สินค้าหมด / ส่งไม่ได้");
  await page.click('#refundForm button:has-text("ยืนยันยกเลิกและคืนเงิน")' + V);
  await page.click('.dlg button:has-text("ยืนยันคืนเงิน")' + V);
  await page.waitForURL(/refunded=1/);
  await expect(page.locator("#voidDocsWarn" + V)).toContainText("RC");
  await expect(page.locator("#cancelledBox" + V)).toContainText("สินค้าหมด");
  expect(await stockOf(P.id)).toBe(53);
  expect(await ledgerSum(P.id)).toBe(53);
  const ev = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "OrderEvent" e JOIN "Order" o ON o.id=e."orderId" WHERE o."orderNo"=$1 AND e.type='REFUNDED'`, [orderNo]);
  expect(ev.n).toBe(1);
  const mv = await one<{ change: number; reason: string }>(`SELECT change, reason FROM "StockMovement" WHERE ref=$1 AND reason='CANCEL'`, [orderNo]);
  expect(mv).toMatchObject({ change: 3, reason: "CANCEL" });
  // ยกเลิกแล้วไม่อยู่ในรายงาน
  const csv = await (await page.request.get("/admin/reports/export?preset=d7&view=list")).text();
  expect(csv).not.toContain(orderNo);
});

test("ส่งออกสินค้า CSV → แก้ → ตรวจ (preview + ผิดพลาด) → ยืนยันนำเข้า (A9)", async ({ page }) => {
  await login(page);
  const res = await page.request.get("/admin/products/export");
  expect(res.status()).toBe(200);
  const lines = (await res.text()).replace(/^﻿/, "").trim().split(/\r\n/);
  expect(lines[0]).toBe("sku,name,category,price,compare_at,stock,track_stock,in_stock,active,unit");
  const row = lines.find((l) => l.startsWith(P.sku + ","));
  expect(row).toBeTruthy();
  const newPrice = (P.price / 100 + 1).toFixed(2);
  // แก้ราคา + สต็อก ของสินค้าทดสอบ, ใส่แถวผิด 1 แถว
  const csv = [lines[0], `${P.sku},,,${newPrice},0,60,1,,,`, "NO-SUCH-SKU-XYZ,,,10,,,,,,"].join("\n");
  await page.goto("/admin/products/import");
  await page.setInputFiles("#impFile" + V, { name: "products.csv", mimeType: "text/csv", buffer: Buffer.from("﻿" + csv) });
  await page.click('#importPick button[type=submit]' + V);
  await expect(page.locator("#importPreview" + V)).toBeVisible();
  await expect(page.locator("#importErrors" + V)).toContainText("NO-SUCH-SKU-XYZ");
  await expect(page.locator("#importTbl" + V)).toContainText(P.sku);
  await expect(page.locator("#importTbl" + V)).toContainText(newPrice.replace(/\.00$/, ""));
  // ยังไม่บันทึกจนกว่าจะยืนยัน
  expect(Number((await one<{ p: number }>(`SELECT "priceSatang" AS p FROM "Product" WHERE id=$1`, [P.id])).p)).toBe(P.price);
  await page.click("#importConfirm" + V);
  await expect(page.locator("#importDone" + V)).toContainText("บันทึกแล้ว 1 รายการ");
  const p = await one<{ p: number; stock: number }>(`SELECT "priceSatang" AS p, stock FROM "Product" WHERE id=$1`, [P.id]);
  expect(Number(p.p)).toBe(P.price + 100);
  expect(Number(p.stock)).toBe(60);
  expect(await ledgerSum(P.id)).toBe(60);
  // คืนราคาเดิม
  await db.query(`UPDATE "Product" SET "priceSatang"=$2, "compareAtSatang"=$3 WHERE id=$1`, [P.id, P.price, P.cmp]);
});

test("ทำสำเนาสินค้า + ตัวอย่าง Google + จัดลำดับรูป (A10)", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  await expect(page.locator("#seoPreview" + V)).toContainText("มองดูเว็บ");
  await page.fill("#seoTitle" + V, "หัวข้อทดสอบ SEO");
  await expect(page.locator("#seoPreview .t" + V)).toHaveText("หัวข้อทดสอบ SEO — มองดูเว็บ");
  await page.click("#dupBtn" + V);
  await page.waitForURL(/copied=1/);
  const copyId = page.url().split("/").pop()!.split("?")[0];
  expect(copyId).not.toBe(P.id);
  const c = await one<{ sku: string; isActive: boolean; stock: number; name: string }>(`SELECT sku, "isActive", stock, name FROM "Product" WHERE id=$1`, [copyId]);
  expect(c.sku).toMatch(new RegExp(`^${P.sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-copy`));
  expect(c.isActive).toBe(false);
  expect(Number(c.stock)).toBe(0);
  await expect(page.locator(".login-info" + V)).toContainText("ทำสำเนาแล้ว");
  await db.query(`DELETE FROM "Product" WHERE id=$1`, [copyId]);
});

test("จัดส่งหลายรายการ: เลือกพิมพ์ใบปะหน้า + CSV เลขพัสดุ ตรวจก่อนบันทึก (A11)", async ({ page, context }) => {
  await login(page);
  const a = await manualOrder(page, { qty: 1, paid: true });
  await page.goto("/admin?tab=PAID");
  await page.check(`input[name=pick][value="${a}"]` + V);
  await expect(page.locator("#bulkBar" + V)).toContainText("เลือก 1 รายการ");
  const [popup] = await Promise.all([context.waitForEvent("page"), page.click("#bulkPrint" + V)]);
  await popup.waitForLoadState();
  expect(popup.url()).toContain(encodeURIComponent(a));
  await expect(popup.locator(".label").first()).toBeVisible();
  await popup.close();

  await page.goto("/admin/orders/shipping");
  const tmpl = await page.request.get("/admin/orders/shipping/template");
  expect(await tmpl.text()).toContain(a);
  await page.fill("#shipText" + V, `orderNo,carrier,trackingNo\n${a},Flash,TH0123456789A\n${paidOrder},Kerry,KEX999\nMDW-000000-0000,EMS,EF123456789TH`);
  await page.click('#shipPick button[type=submit]' + V);
  await expect(page.locator("#shipTbl" + V)).toContainText("พร้อมบันทึก");
  await expect(page.locator("#shipTbl" + V)).toContainText("ไม่พบคำสั่งซื้อนี้");
  await expect(page.locator("#shipTbl" + V)).toContainText("รอจัดส่ง"); // paidOrder จัดส่งไปแล้ว
  await page.click("#shipApply" + V);
  await expect(page.locator("#shipDone" + V)).toContainText("บันทึกเลขพัสดุแล้ว 1 รายการ");
  const o = await one<{ status: string; carrier: string; trackingNo: string }>(`SELECT status, carrier, "trackingNo" FROM "Order" WHERE "orderNo"=$1`, [a]);
  expect(o).toEqual({ status: "SHIPPED", carrier: "Flash Express", trackingNo: "TH0123456789A" });
});

test("ตัวดูสลิป: ขยาย ซูม หมุน เทียบยอด (A12)", async ({ page, request }) => {
  const errors = trackErrors(page);
  const phone = uniqPhone();
  const r = await request.post("/api/orders", {
    data: { items: { [(await one<{ slug: string }>(`SELECT slug FROM "Product" WHERE id=$1`, [P.id])).slug]: 1 }, shipping: "std", address: { name: "ทดสอบ สลิป", phone, addr: "1 หมู่ 1", sub: "บางกรวย", dist: "บางกรวย", prov: "นนทบุรี", zip: "11130" } },
  });
  expect(r.status()).toBe(201);
  const o = await r.json();
  const slip = await request.post(`/api/orders/${o.orderNo}/slip`, {
    multipart: { phone, paidAt: `${todayBkk()}T00:00`, amount: String(o.totalSatang / 100 - 1), slip: { name: "slip.png", mimeType: "image/png", buffer: readFileSync("tests/fixtures/slip.png") } },
  });
  expect(slip.status()).toBe(201);
  await login(page);
  await page.goto(`/admin?tab=PENDING_VERIFICATION&open=${o.orderNo}`);
  await expect(page.locator("#slipAmounts .bad" + V)).toBeVisible();
  await page.click("#slipZoom" + V);
  await expect(page.locator("#slipViewer" + V)).toBeVisible();
  await expect(page.locator("#slipViewer" + V)).toContainText("ขาด ฿1");
  await page.click("#svZoomIn" + V);
  await expect(page.locator("#svZoomLabel" + V)).toHaveText("125%");
  await page.click("#svRotate" + V);
  await expect(page.locator("#slipViewer img")).toHaveAttribute("style", /rotate\(90deg\)/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#slipViewer")).toHaveCount(0);
  // Esc ปิดตัวดูสลิปเท่านั้น ลิ้นชักยังเปิดอยู่
  await expect(page.locator(".drawer-panel" + V)).toContainText(o.orderNo);
  // ยกเลิกพร้อมเหตุผล (ไม่ทิ้งคิวรอตรวจไว้ให้เทสต์อื่น)
  await page.goto(`/admin?tab=ALL&open=${o.orderNo}&mode=cancel`);
  await page.selectOption("#cReason" + V, "ลูกค้าขอยกเลิก");
  await page.click('#cancelForm button:has-text("ยืนยันยกเลิก")' + V);
  await page.click('.dlg button:has-text("ยกเลิกคำสั่งซื้อ")' + V);
  await expect(page.locator("#cancelledBox" + V)).toContainText("ลูกค้าขอยกเลิก");
  expect(errors).toEqual([]);
});

test("งานตั้งเวลา /api/cron/daily: ต้องมีรหัสลับ + ยกเลิกคำสั่งซื้อค้างอัตโนมัติ (A13/A14)", async ({ page, request }) => {
  expect((await request.get("/api/cron/daily")).status()).toBe(401);
  expect((await request.get("/api/cron/daily?key=wrong")).status()).toBe(401);
  await login(page);
  const stale = await manualOrder(page, { qty: 1, paid: false });
  const fresh = await manualOrder(page, { qty: 1, paid: false });
  await db.query(`UPDATE "Order" SET "createdAt" = now() - interval '5 days' WHERE "orderNo"=$1`, [stale]);
  await db.query(`UPDATE "ShopSetting" SET "autoCancelDays"=3 WHERE id='shop'`);
  const res = await request.get("/api/cron/daily", { headers: { Authorization: `Bearer ${CRON}` } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.cancelled).toContain(stale);
  expect(body.cancelled).not.toContain(fresh);
  const o = await one<{ status: string; cancelReason: string }>(`SELECT status, "cancelReason" FROM "Order" WHERE "orderNo"=$1`, [stale]);
  expect(o.status).toBe("CANCELLED");
  expect(o.cancelReason).toContain("3 วัน");
  const ev = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM "OrderEvent" e JOIN "Order" x ON x.id=e."orderId" WHERE x."orderNo"=$1 AND e.type='CANCELLED'`, [stale]);
  expect(ev.n).toBe(1);
  // เรียกซ้ำวันเดียวกัน: ไม่ยกเลิกซ้ำ ไม่ส่งสรุปซ้ำ
  const again = await (await request.get(`/api/cron/daily?key=${CRON}`)).json();
  expect(again.cancelled).toEqual([]);
  expect(again.summary).toBe("already-sent-today");
  expect((await one<{ s: string }>(`SELECT status AS s FROM "Order" WHERE "orderNo"=$1`, [fresh])).s).toBe("AWAITING_SLIP");
  // บันทึกรับชำระเอง (ไม่มีสลิป) → ตัดสต็อก
  const before = await stockOf(P.id);
  await page.goto(`/admin?tab=ALL&open=${fresh}&mode=pay`);
  await page.fill("#payNote" + V, "ลูกค้าโอนแล้ว ส่งสลิปทาง LINE");
  await page.click('#payForm button[type=submit]' + V);
  await expect(page.locator(`.drawer-panel .st-PAID` + V).first()).toBeVisible();
  expect(await stockOf(P.id)).toBe(before - 1);
});

test("ใบกำกับภาษีจากคำสั่งซื้อ (A15): แสดงในลิ้นชัก และใบเสร็จมีเลขผู้เสียภาษี", async ({ page }) => {
  await login(page);
  const tid = taxId("010555" + String(Date.now()).slice(-6));
  const orderNo = await manualOrder(page, { qty: 1, paid: true, tax: { name: "บริษัท ทดสอบภาษี จำกัด", id: tid } });
  await expect(page.locator("#taxBox" + V)).toContainText("บริษัท ทดสอบภาษี จำกัด");
  await expect(page.locator("#taxBox" + V)).toContainText("ตรวจแล้ว");
  await page.click('.drawer-panel button:has-text("ออกใบเสร็จรับเงิน")' + V);
  await page.click('.dlg button:has-text("ออกใบเสร็จ")' + V);
  await page.waitForURL(/\/admin\/docs\/RECEIPT\/.+issued=1/);
  const fmt = `${tid[0]}-${tid.slice(1, 5)}-${tid.slice(5, 10)}-${tid.slice(10, 12)}-${tid[12]}`;
  await expect(page.locator("body")).toContainText(fmt);
  await expect(page.locator("body")).toContainText("บริษัท ทดสอบภาษี จำกัด");
  const snap = await one<{ s: { taxId: string; branch: string } }>(`SELECT "customerSnapshot" AS s FROM "SalesDocument" d JOIN "Order" o ON o.id=d."orderId" WHERE o."orderNo"=$1 AND d.type='RECEIPT'`, [orderNo]);
  expect(snap.s.taxId).toBe(tid);
  expect(snap.s.branch).toBe("สำนักงานใหญ่");
});

// ต้องรันเซิร์ฟเวอร์ด้วย LINE_API_BASE=<mock> LINE_CHANNEL_ACCESS_TOKEN=test และตั้ง LINE_MOCK_LOG = ไฟล์ที่ mock บันทึก body ของทุก POST
test("แจ้ง LINE สินค้าใกล้หมดครั้งเดียวเมื่อสต็อกลดถึงเกณฑ์หลังขาย (A8) + สรุปประจำวัน (A14)", async ({ page, request }) => {
  const log = process.env.LINE_MOCK_LOG;
  test.skip(!log, "ต้องมี LINE mock (LINE_MOCK_LOG)");
  const { writeFileSync, existsSync } = await import("node:fs");
  const texts = () => (existsSync(log!) ? readFileSync(log!, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).messages[0].text as string) : []);
  await db.query(`INSERT INTO "LineRecipient"(id,kind,"lineId",name,enabled,"updatedAt") VALUES ('e2e-mock','GROUP','Ce2e','e2e',true,now()) ON CONFLICT ("lineId") DO UPDATE SET enabled=true`);
  await db.query(`UPDATE "ShopSetting" SET "lineLowStock"=true, "lowStockThreshold"=5, "lineDailySummary"=true WHERE id='shop'`);
  writeFileSync(log!, "");
  await login(page);
  await page.goto(`/admin/stock/${P.id}`);
  await page.locator('.mo-radio label:has-text("นับสต็อก") input' + V).check();
  await page.fill("#adjQty" + V, "7");
  await page.click('#adjustForm button[type=submit]' + V);
  await expect(page.locator(".login-info" + V)).toContainText("→ 7");
  await manualOrder(page, { qty: 1, paid: true }); // 7 → 6 ยังเกินเกณฑ์
  await manualOrder(page, { qty: 2, paid: true }); // 6 → 4 ข้ามเกณฑ์ → แจ้ง
  await manualOrder(page, { qty: 1, paid: true }); // 4 → 3 ต่ำอยู่แล้ว → ไม่แจ้งซ้ำ
  await expect.poll(() => texts().filter((t) => t.includes("สินค้าใกล้หมด")).length).toBe(1);
  expect(texts()[0]).toContain(P.sku);
  // สรุปประจำวัน (ล้างเครื่องหมายของวันนี้ก่อน)
  await db.query(`DELETE FROM "AdminLog" WHERE type='CRON_DAILY'`);
  const r = await (await request.get(`/api/cron/daily?key=${CRON}`)).json();
  expect(r.summary).toBe("sent");
  expect(texts().some((t) => t.startsWith("📊 สรุปประจำวัน") && t.includes(P.sku))).toBe(true);
  await db.query(`UPDATE "ShopSetting" SET "lineDailySummary"=false WHERE id='shop'`);
  await db.query(`DELETE FROM "LineRecipient" WHERE id='e2e-mock'`);
});

test("หน้าใหม่ของล็อต 3 ใช้งานบนมือถือ 390px ได้ (ไม่มีเลื่อนแนวนอน)", async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  for (const path of ["/admin/dashboard", "/admin/reports", "/admin/reports?view=product", "/admin/reports/vat", "/admin/stock", "/admin/stock?tab=low", "/admin/stock?tab=moves", `/admin/stock/${P.id}`, "/admin/orders/new", "/admin/orders/shipping", "/admin/products/import", `/admin?tab=ALL&open=${paidOrder}`]) {
    const r = await page.goto(path);
    expect(r?.status(), path).toBe(200);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw, path).toBeLessThanOrEqual(390);
  }
  expect(errors).toEqual([]);
});
