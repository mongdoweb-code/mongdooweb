// ตรวจซ้ำหลังบ้าน (AI Recheck A1–A30): สิทธิ์ฝั่งเซิร์ฟเวอร์ของ action/route, บัญชีที่ต้องเปลี่ยนรหัสผ่าน,
// เมนูของ STAFF, คำขอจากลูกค้าครบเส้นทาง (ฟอร์ม → LINE → หลังบ้าน → ใบเสนอราคา), กติกาที่อยู่เดียวกับหน้าร้าน,
// ป้ายบันทึกการใช้งาน และเกณฑ์สินค้าใกล้หมดที่ตั้งได้สองที่
// ทุกข้อมูลที่ใช้ถูกสร้างในเทสต์เอง (รันได้บนฐานข้อมูลใหม่ที่มีแค่ seed) และลบทิ้งตอนจบ
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import { V, confirmClick, login } from "./helpers";

test.describe.configure({ mode: "serial" });

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL!.replace(/\?schema=\w+$/, "") });
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0] as T;
const rid = () => randomBytes(5).toString("hex");
const TAG = `rck${Date.now().toString(36)}`;
const PW = `Recheck-${rid()}-Pass`;
const staff = { id: `${TAG}s`, username: `${TAG}-staff` };
const fresh = { id: `${TAG}m`, username: `${TAG}-mustchange` };
const uniqPhone = () => `08${String(Date.now()).slice(-8)}`;

/** id ของ server action จาก manifest ของ build (ไฟล์ + ชื่อฟังก์ชัน) */
function actionId(file: string, name: string) {
  const m = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8")) as { node: Record<string, { filename: string; exportedName: string }> };
  const hit = Object.entries(m.node).find(([, v]) => v.filename === file && v.exportedName === name);
  expect(hit, `${file}#${name}`).toBeTruthy();
  return hit![0];
}

/** เรียก server action ตรงๆ แบบฟอร์มที่ไม่ใช้ JavaScript (multipart + $ACTION_ID_) ด้วย cookie ของ request นั้น */
async function postAction(req: APIRequestContext, page: string, file: string, name: string, fields: Record<string, string>) {
  const multipart: Record<string, string> = { [`$ACTION_ID_${actionId(file, name)}`]: "", ...fields };
  return req.post(page, { multipart, maxRedirects: 0, headers: { origin: test.info().project.use.baseURL! } });
}

async function loginAs(page: Page, username: string) {
  await page.goto("/admin/login");
  await page.fill("#u" + V, username);
  await page.fill("#pw" + V, PW);
  await page.click(".login-card button[type=submit]" + V);
}

async function ctxAs(browser: Browser, username: string) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok" });
  const page = await ctx.newPage();
  await loginAs(page, username);
  return { ctx, page };
}

const deniedCount = async (adminId: string) => Number((await one<{ n: string }>(`SELECT count(*) n FROM "AdminLog" WHERE type='DENIED' AND "adminId"=$1`, [adminId])).n);

let product: { id: string; slug: string; sku: string; name: string; price: number };

test.beforeAll(async () => {
  await db.query(`DELETE FROM "LoginThrottle"`);
  const hash = await bcrypt.hash(PW, 10);
  for (const [u, must] of [[staff, false], [fresh, true]] as const)
    await db.query(`INSERT INTO "Admin"(id, username, "passwordHash", "displayName", role, "mustChangePassword", "updatedAt") VALUES ($1,$2,$3,$4,'STAFF',$5,now())`, [u.id, u.username, hash, `ตรวจซ้ำ ${u.username}`, must]);
  product = await one(`SELECT p.id, p.slug, p.sku, p.name, p."priceSatang" AS price FROM "Product" p JOIN "Category" c ON c.id=p."categoryId"
    WHERE p."isActive" AND NOT p."isService" AND c."isActive" AND p."priceSatang" > 0 AND (NOT p."trackStock" OR p.stock > 20) ORDER BY p.sku LIMIT 1`);
  expect(product?.id, "ต้องมีสินค้าเปิดขายที่มีราคา (จาก seed)").toBeTruthy();
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "Inquiry" WHERE name LIKE $1`, [`${TAG}%`]);
  await db.query(`DELETE FROM "LineRecipient" WHERE name LIKE $1`, [`${TAG}%`]);
  await db.query(`DELETE FROM "Customer" WHERE name LIKE $1`, [`${TAG}%`]);
  await db.query(`DELETE FROM "AdminSession" WHERE "adminId" IN ($1,$2)`, [staff.id, fresh.id]);
  await db.query(`UPDATE "AdminLog" SET "adminId"=NULL WHERE "adminId" IN ($1,$2)`, [staff.id, fresh.id]);
  await db.query(`UPDATE "OrderEvent" SET "adminId"=NULL WHERE "adminId" IN ($1,$2)`, [staff.id, fresh.id]);
  await db.query(`DELETE FROM "Admin" WHERE id IN ($1,$2)`, [staff.id, fresh.id]);
  await db.query(`DELETE FROM "LoginThrottle"`);
  await db.end();
});

test("A17 STAFF เรียก action ของเจ้าของร้านตรงๆ ถูกปฏิเสธทุกตัว (และวิธีเรียกนี้ใช้ได้จริงกับ OWNER)", async ({ page, browser }) => {
  const inq = (n: string) => db.query(`INSERT INTO "Inquiry"(id, kind, status, name, phone, message, items, attachments, "updatedAt") VALUES ($1,'CONTACT','NEW',$2,'0812345678','ทดสอบสิทธิ์ของพนักงาน','[]','[]',now())`, [n, `${TAG} ${n}`]);
  const [inqA, inqB] = [`${TAG}ia`, `${TAG}ib`];
  await inq(inqA);
  await inq(inqB);
  const [cA, cB] = [`${TAG}ca`, `${TAG}cb`];
  await db.query(`INSERT INTO "Customer"(id, code, kind, name, "updatedAt") VALUES ($1,$2,'PERSON',$3,now()), ($4,$5,'PERSON',$6,now())`, [cA, `R${rid().slice(0, 7)}`, `${TAG} ลูกค้า A`, cB, `R${rid().slice(0, 7)}`, `${TAG} ลูกค้า B`]);
  const cBcode = (await one<{ code: string }>(`SELECT code FROM "Customer" WHERE id=$1`, [cB])).code;
  const line = `${TAG}ln`;
  await db.query(`INSERT INTO "LineRecipient"(id, kind, "lineId", name, enabled, "updatedAt") VALUES ($1,'USER',$2,$3,false,now())`, [line, `U${TAG}`, `${TAG} line`]);
  const thr = (await one<{ t: number }>(`SELECT "lowStockThreshold" t FROM "ShopSetting" WHERE id='shop'`)).t;
  const admins = Number((await one<{ n: string }>(`SELECT count(*) n FROM "Admin"`)).n);

  const { ctx, page: s } = await ctxAs(browser, staff.username);
  await s.waitForURL(/\/admin(\?|$)/);
  const before = await deniedCount(staff.id);
  const A = "src/app/admin/(app)";
  const calls: [string, string, string, Record<string, string>][] = [
    [`/admin/inquiries/${inqA}`, `${A}/inquiries/actions.ts`, "deleteInquiry", { id: inqA }],
    [`/admin/customers/${cA}`, `${A}/customers/actions.ts`, "deleteCustomer", { id: cA }],
    [`/admin/customers/${cA}`, `${A}/customers/actions.ts`, "mergeCustomer", { id: cA, target: cBcode }],
    ["/admin/line", `${A}/line/actions.ts`, "toggleRecipient", { id: line }],
    ["/admin/line", `${A}/line/actions.ts`, "deleteRecipient", { id: line }],
    ["/admin/stock?tab=low", `${A}/stock/actions.ts`, "saveLowStock", { threshold: String(thr + 7), lineLowStock: "on" }],
    ["/admin/users", `${A}/users/actions.ts`, "createUser", { username: `${TAG}-hack`, displayName: "hack", role: "OWNER" }],
    ["/admin/system", `${A}/system/actions.ts`, "testStorageWrite", {}],
  ];
  for (const [path, file, name, fields] of calls) {
    const r = await postAction(s.request, path, file, name, fields);
    expect(r.status(), name).toBeLessThan(500);
  }
  expect(await one(`SELECT id FROM "Inquiry" WHERE id=$1`, [inqA])).toBeTruthy();
  expect(Number((await one<{ n: string }>(`SELECT count(*) n FROM "Customer" WHERE id IN ($1,$2)`, [cA, cB])).n)).toBe(2);
  expect((await one<{ e: boolean }>(`SELECT enabled e FROM "LineRecipient" WHERE id=$1`, [line])).e).toBe(false);
  expect((await one<{ t: number }>(`SELECT "lowStockThreshold" t FROM "ShopSetting" WHERE id='shop'`)).t).toBe(thr);
  expect(Number((await one<{ n: string }>(`SELECT count(*) n FROM "Admin"`)).n)).toBe(admins);
  expect(await deniedCount(staff.id)).toBeGreaterThanOrEqual(before + calls.length);
  // route ของเจ้าของร้าน
  for (const path of ["/admin/export.zip", "/admin/log.csv"]) expect((await s.request.get(path)).status(), path).toBe(403);
  // งานที่ STAFF ทำได้ก็ยังทำได้ (ไม่ได้ปิดเกินไป): เปลี่ยนสถานะคำขอ
  await postAction(s.request, `/admin/inquiries/${inqB}`, `${A}/inquiries/actions.ts`, "setInquiryStatus", { id: inqB, status: "DONE" });
  expect((await one<{ s: string }>(`SELECT status s FROM "Inquiry" WHERE id=$1`, [inqB])).s).toBe("DONE");
  await ctx.close();

  // ตัวควบคุม: OWNER ใช้วิธีเรียกเดียวกันแล้วลบได้จริง → การปฏิเสธข้างบนมาจากการตรวจสิทธิ์ ไม่ใช่เพราะเรียกผิด
  await login(page);
  await postAction(page.request, `/admin/inquiries/${inqA}`, `${A}/inquiries/actions.ts`, "deleteInquiry", { id: inqA });
  expect(await one(`SELECT id FROM "Inquiry" WHERE id=$1`, [inqA])).toBeUndefined();
});

test("A18 บัญชีที่ต้องเปลี่ยนรหัสผ่าน: ทุกหน้า/route/action ถูกกันไว้ ยกเว้นบัญชีของฉัน", async ({ browser }) => {
  const inq = `${TAG}im`;
  await db.query(`INSERT INTO "Inquiry"(id, kind, status, name, phone, message, items, attachments, "updatedAt") VALUES ($1,'CONTACT','NEW',$2,'0812345678','ทดสอบบัญชีที่ต้องเปลี่ยนรหัส','[]','[]',now())`, [inq, `${TAG} must`]);
  const { ctx, page } = await ctxAs(browser, fresh.username);
  await page.waitForURL(/\/admin\/account\?force=1/);
  for (const path of ["/admin", "/admin/dashboard", "/admin/reports", "/admin/stock", "/admin/inquiries", `/admin/inquiries/${inq}`, "/admin/orders/new", "/admin/print/labels?status=PAID"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/admin\/account\?force=1/);
  }
  for (const path of ["/admin/orders.csv", "/admin/docs.csv?type=INVOICE", "/admin/reports/export?preset=d7", "/admin/reports/vat/export", "/admin/products/export", "/admin/orders/shipping/template", "/admin/customers/export.csv", `/admin/inquiries/${inq}/file/0`, "/admin/export.zip", "/admin/log.csv"])
    expect((await page.request.get(path)).status(), path).toBe(403);
  await postAction(page.request, `/admin/inquiries/${inq}`, "src/app/admin/(app)/inquiries/actions.ts", "setInquiryStatus", { id: inq, status: "SPAM" });
  expect((await one<{ s: string }>(`SELECT status s FROM "Inquiry" WHERE id=$1`, [inq])).s).toBe("NEW");
  await ctx.close();
});

test("A17/เมนู: STAFF เห็นเฉพาะเมนูที่ใช้ได้ ทุกลิงก์เปิดได้ และหน้าเจ้าของร้านแจ้งอย่างสุภาพ · ปุ่มลบ/นำเข้าถูกซ่อน", async ({ browser }) => {
  const { ctx, page } = await ctxAs(browser, staff.username);
  await page.waitForURL(/\/admin(\?|$)/);
  const links = await page.locator("#side .nav-i:not([target])").evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
  for (const owner of ["/admin/settings", "/admin/users", "/admin/line", "/admin/system"]) expect(links).not.toContain(owner);
  for (const href of links) {
    const r = await page.goto(href);
    expect(r?.status(), href).toBe(200);
    await expect(page, href).not.toHaveURL(/denied=1|\/login|force=1/);
    expect(await page.locator("h1" + V).count(), href).toBeGreaterThan(0);
  }
  for (const path of ["/admin/settings", "/admin/users", "/admin/line", "/admin/system", "/admin/products/import"]) {
    const r = await page.goto(path);
    expect(r?.status(), path).toBe(200);
    await expect(page, path).toHaveURL(/\/admin\?denied=1/);
    await expect(page.locator(".toast-denied"), path).toContainText("เจ้าของร้าน");
  }
  const cat = await one<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`);
  await page.goto(`/admin/categories?edit=${cat.id}`);
  await expect(page.locator("form" + V).first()).toBeVisible();
  await expect(page.locator('button:has-text("ลบหมวด")')).toHaveCount(0);
  await page.goto("/admin/slides");
  await expect(page.locator('.sl-acts button:has-text("ลบ")')).toHaveCount(0);
  await page.goto("/admin/products");
  await expect(page.locator('a[href="/admin/products/import"]')).toHaveCount(0);
  await page.goto("/admin/stock?tab=low");
  await expect(page.locator('button:has-text("บันทึกเกณฑ์")')).toHaveCount(0);
  await ctx.close();
});

test("A16 คำขอครบเส้นทาง: ฟอร์ม /api/inquiries (สินค้า + รูป) → LINE ลิงก์ไปหลังบ้าน → เห็นสินค้าและรูป → ใบเสนอราคาร่างรายการถูก", async ({ page, request, playwright }) => {
  const log = process.env.LINE_MOCK_LOG;
  const recipient = `${TAG}lr`;
  if (log) {
    writeFileSync(log, "");
    await db.query(`INSERT INTO "LineRecipient"(id, kind, "lineId", name, enabled, "updatedAt") VALUES ($1,'GROUP',$2,$3,true,now())`, [recipient, `C${TAG}`, `${TAG} group`]);
  }
  const phone = uniqPhone();
  const res = await request.post("/api/inquiries", {
    headers: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
    multipart: {
      kind: "QUOTE", name: `${TAG} คุณขอราคา`, phone, company: "", email: "", message: "ขอราคาไฟสระว่ายน้ำ 2 ชุด พร้อมติดตั้ง", t: String(Date.now() - 10_000),
      items: JSON.stringify({ [product.slug]: 2 }),
      files: { name: "site.png", mimeType: "image/png", buffer: readFileSync("tests/fixtures/slip.png") },
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  const { id } = await res.json();
  expect(id).toBeTruthy();
  if (log) {
    await expect.poll(() => (existsSync(log) ? readFileSync(log, "utf8") : "")).toContain(`/admin/inquiries/${id}`);
    await db.query(`DELETE FROM "LineRecipient" WHERE id=$1`, [recipient]);
  }
  // รูปแนบมีเส้นทางเดียว: /admin/inquiries/:id/file/:n — คนนอกเปิดไม่ได้ และเส้นทางเก่าใต้ /api ไม่มีแล้ว
  const anon = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  expect([307, 401]).toContain((await anon.get(`/admin/inquiries/${id}/file/0`, { maxRedirects: 0 })).status());
  expect((await anon.get(`/admin/inquiries/${id}/file/0`, { headers: { cookie: "mdw_admin=forged-token" }, maxRedirects: 0 })).status()).toBe(401);
  expect((await anon.get(`/api/inquiries/${id}/attachments/0`, { maxRedirects: 0 })).status()).toBe(404);
  await anon.dispose();

  await login(page);
  await page.goto(`/admin/inquiries/${id}`);
  await expect(page.locator(".inq-items" + V)).toContainText(product.name);
  const img = page.locator(`img[src="/admin/inquiries/${id}/file/0"]` + V);
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  const file = await page.request.get(`/admin/inquiries/${id}/file/0`);
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toBe("image/webp");
  expect(file.headers()["cache-control"]).toContain("no-store");
  expect((await page.request.get(`/admin/inquiries/${id}/file/7`)).status()).toBe(404);

  // ใบเสนอราคา: กดสองครั้งพร้อมกันก็ได้ใบเดียว
  await page.click("#mkQuote" + V);
  await page.waitForURL(/\/admin\/docs\/QUOTATION\/[^/]+\/edit/);
  const qt = page.url().split("/QUOTATION/")[1].split("/")[0];
  const items = (await db.query(`SELECT name, "qtyMilli", "priceSatang", "productId" FROM "SalesDocumentItem" WHERE "documentId"=$1 ORDER BY "sortOrder"`, [qt])).rows;
  expect(items).toEqual([{ name: product.name, qtyMilli: 2000, priceSatang: product.price, productId: product.id }]);
  const doc = await one<{ status: string; sub: number; cust: string }>(`SELECT status, "subtotalSatang" sub, "customerId" cust FROM "SalesDocument" WHERE id=$1`, [qt]);
  expect(doc.status).toBe("DRAFT");
  expect(Number(doc.sub)).toBe(product.price * 2);
  expect((await one<{ phone: string }>(`SELECT phone FROM "Customer" WHERE id=$1`, [doc.cust])).phone).toBe(phone);
  const n = Number((await one<{ n: string }>(`SELECT count(*) n FROM "SalesDocument" WHERE id IN (SELECT "quotationId" FROM "Inquiry" WHERE id=$1)`, [id])).n);
  expect(n).toBe(1);
  await db.query(`UPDATE "Inquiry" SET "quotationId"=NULL WHERE id=$1`, [id]);
  await db.query(`DELETE FROM "SalesDocument" WHERE id=$1`, [qt]);
  await db.query(`UPDATE "Customer" SET name=$2 WHERE id=$1`, [doc.cust, `${TAG} คุณขอราคา`]);
});

test("A4/A5 คำสั่งซื้อจากหลังร้านใช้กติกาที่อยู่เดียวกับหน้าร้าน + รับที่ร้านไม่ต้องกรอกที่อยู่ + ป้ายบันทึก", async ({ page }) => {
  await login(page);
  const open = async () => {
    await page.goto("/admin/orders/new");
    await page.fill("#pq" + V, product.sku);
    await page.locator(`.mo-results button:has-text("${product.sku}")` + V).first().click();
    await page.fill("#a-name" + V, `${TAG} ผู้รับ`);
  };
  // รหัสไปรษณีย์ไม่ตรงจังหวัด + เบอร์ผิด → ข้อความไทยตรงช่อง
  await open();
  await page.fill("#a-phone" + V, "0123");
  await page.fill("#a-addr" + V, "12/3 หมู่ 4");
  await page.fill("#a-sub" + V, "บางกรวย");
  await page.fill("#a-dist" + V, "บางกรวย");
  await page.fill("#a-prov" + V, "นนทบุรี");
  await page.fill("#a-zip" + V, "50000");
  await page.click("#moSubmit" + V);
  await expect(page.locator(".login-err" + V)).toContainText("รหัสไปรษณีย์ไม่ตรงกับจังหวัด");
  await expect(page.locator(".login-err" + V)).toContainText("เบอร์โทรไม่ถูกต้อง");
  await expect(page.locator("#a-zip" + V)).toHaveClass(/bad/);
  // จังหวัดที่ไม่มีจริง
  await page.fill("#a-phone" + V, uniqPhone());
  await page.fill("#a-prov" + V, "เมืองสมมติ");
  await page.fill("#a-zip" + V, "11130");
  await page.click("#moSubmit" + V);
  await expect(page.locator(".login-err" + V)).toContainText("จังหวัด");
  await expect(page.locator("#a-prov" + V)).toHaveClass(/bad/);
  // ใบกำกับภาษี: ที่อยู่สั้นเกินไปไม่ผ่าน (กติกาเดียวกับหน้าชำระเงิน)
  await page.fill("#a-prov" + V, "จ.นนทบุรี");
  await page.locator('label:has-text("ลูกค้าขอใบกำกับภาษี") input' + V).check();
  await page.fill("#t-name" + V, "บริษัท ตรวจซ้ำ จำกัด");
  await page.fill("#t-id" + V, "0105555000013".slice(0, 12) + "0");
  await page.fill("#t-addr" + V, "กทม.");
  await page.click("#moSubmit" + V);
  await expect(page.locator(".login-err" + V)).toContainText("ที่อยู่สำหรับออกใบกำกับภาษี");
  await page.locator('label:has-text("ลูกค้าขอใบกำกับภาษี") input' + V).uncheck();
  await page.click("#moSubmit" + V);
  await page.waitForURL(/created=1/);
  const normal = new URL(page.url()).searchParams.get("open")!;
  expect((await one<{ p: string }>(`SELECT province p FROM "Order" WHERE "orderNo"=$1`, [normal])).p).toBe("นนทบุรี");

  // รับที่ร้าน: กรอกแค่ชื่อ + เบอร์
  await open();
  await page.fill("#a-phone" + V, uniqPhone());
  await page.locator('label:has-text("รับเองที่ร้าน") input' + V).check();
  await page.click("#moSubmit" + V);
  await page.waitForURL(/created=1/);
  const pickup = new URL(page.url()).searchParams.get("open")!;
  const o = await one<{ m: string; ship: number; addr: string; prov: string; zip: string }>(`SELECT "shippingMethod" m, "shippingSatang" ship, "addressLine" addr, province prov, "postalCode" zip FROM "Order" WHERE "orderNo"=$1`, [pickup]);
  expect(o).toEqual({ m: "pickup", ship: 0, addr: "รับสินค้าที่ร้าน", prov: "", zip: "" });
  // แก้ไขเบอร์ของออเดอร์รับที่ร้านได้โดยไม่ต้องกรอกที่อยู่
  await page.goto(`/admin?tab=ALL&open=${pickup}&mode=edit`);
  const newPhone = uniqPhone().replace(/^08/, "09");
  await page.fill("#a-phone" + V, newPhone);
  await page.click("#editOrderForm button[type=submit]" + V);
  await page.waitForURL(/edited=1/);
  expect((await one<{ p: string }>(`SELECT phone p FROM "Order" WHERE "orderNo"=$1`, [pickup])).p).toBe(newPhone);
  // แก้ไขด้วยรหัสไปรษณีย์ผิดจังหวัดไม่ได้
  await page.goto(`/admin?tab=ALL&open=${normal}&mode=edit`);
  await page.fill("#a-zip" + V, "10100");
  await page.click("#editOrderForm button[type=submit]" + V);
  await expect(page.locator("#editOrderForm .login-err" + V)).toContainText("รหัสไปรษณีย์ไม่ตรงกับจังหวัด");

  // บันทึกการใช้งาน: เหตุการณ์ "แก้ไข" มีป้ายภาษาไทย
  await page.goto(`/admin/log?tab=orders&q=${pickup}`);
  await expect(page.locator(".log-tbl" + V)).toContainText("แก้ไขข้อมูลผู้รับ");
  await expect(page.locator(".log-tbl" + V)).not.toContainText("EDITED");
  // ยกเลิกทั้งสองรายการ (ไม่ทิ้งงานค้างไว้)
  for (const no of [normal, pickup]) {
    await page.goto(`/admin?tab=ALL&open=${no}&mode=cancel`);
    await page.selectOption("#cReason" + V, "ลูกค้าขอยกเลิก");
    await page.click('#cancelForm button:has-text("ยืนยันยกเลิก")' + V);
    await page.click('.dlg button:has-text("ยกเลิกคำสั่งซื้อ")' + V);
    await expect(page.locator("#cancelledBox" + V)).toBeVisible();
  }
});

test("A7/A21 ปรับสต็อกถูกบันทึกเป็นชนิด 'สต็อก' และ A8/A26 เกณฑ์ใกล้หมดตั้งได้สองที่โดยค่าตรงกัน", async ({ page }) => {
  await login(page);
  const orig = await one<{ t: number; l: boolean }>(`SELECT "lowStockThreshold" t, "lineLowStock" l FROM "ShopSetting" WHERE id='shop'`);
  try {
    await page.goto("/admin/stock?tab=low");
    await page.fill("#thr" + V, "9");
    await page.click('button:has-text("บันทึกเกณฑ์")' + V);
    await page.waitForURL(/saved=1/);
    await page.goto("/admin/settings");
    await expect(page.locator("#lowStockThreshold" + V)).toHaveValue("9");
    await page.fill("#lowStockThreshold" + V, "4");
    await page.click(`.set-foot button[type=submit]${V}`);
    await expect(page.locator(".login-info" + V)).toContainText("บันทึกการตั้งค่าแล้ว");
    await page.goto("/admin/stock?tab=low");
    await expect(page.locator("#thr" + V)).toHaveValue("4");
    await expect(page.locator("h1 + p" + V)).toContainText("≤ 4");
  } finally {
    await db.query(`UPDATE "ShopSetting" SET "lowStockThreshold"=$1, "lineLowStock"=$2 WHERE id='shop'`, [orig.t, orig.l]);
  }
  // ปรับสต็อก → บันทึกการใช้งานชนิด STOCK อยู่ในแท็บงานร้าน/สต็อก
  const tracked = await one<{ id: string; sku: string }>(`SELECT id, sku FROM "Product" WHERE "trackStock" AND NOT "isService" ORDER BY sku LIMIT 1`);
  if (tracked) {
    await page.goto(`/admin/stock/${tracked.id}`);
    await page.fill("#adjQty" + V, "1");
    await page.fill("#adjNote" + V, `${TAG} รับเข้า`);
    await page.click("#adjustForm button[type=submit]" + V);
    await expect(page.locator(".login-info" + V)).toBeVisible();
    const row = await one<{ type: string }>(`SELECT type FROM "AdminLog" WHERE note LIKE $1 ORDER BY "createdAt" DESC LIMIT 1`, [`%${tracked.sku}%${TAG}%`]);
    expect(row?.type).toBe("STOCK");
    await page.goto(`/admin/log?tab=ops&q=${TAG}`);
    await expect(page.locator(".log-tbl" + V)).toContainText("สต็อก");
  }
});

test("หน้าหลังบ้านที่แก้ในรอบตรวจซ้ำ ใช้บนมือถือ 390px ได้ (ไม่มีเลื่อนแนวนอน)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const inq = await one<{ id: string }>(`SELECT id FROM "Inquiry" WHERE name LIKE $1 LIMIT 1`, [`${TAG}%`]);
  const order = await one<{ orderNo: string }>(`SELECT "orderNo" FROM "Order" ORDER BY "createdAt" DESC LIMIT 1`);
  const paths = ["/admin/orders/new", "/admin/categories", "/admin/slides", "/admin/stock?tab=low", "/admin/log?tab=orders", inq && `/admin/inquiries/${inq.id}`, order && `/admin?tab=ALL&open=${order.orderNo}&mode=edit`].filter(Boolean) as string[];
  for (const path of paths) {
    expect((await page.goto(path))?.status(), path).toBe(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
  }
});

test("เจ้าของร้านลบคำขอได้ (ปุ่มแสดงเฉพาะ OWNER)", async ({ page }) => {
  const id = `${TAG}del`;
  await db.query(`INSERT INTO "Inquiry"(id, kind, status, name, phone, message, items, attachments, "updatedAt") VALUES ($1,'CONTACT','SPAM',$2,'0812345678','สแปมทดสอบการลบ','[]','[]',now())`, [id, `${TAG} spam`]);
  await login(page);
  await page.goto(`/admin/inquiries/${id}`);
  await confirmClick(page, '.box button:has-text("ลบคำขอ")', "ลบคำขอ");
  await page.waitForURL(/deleted=1/);
  expect(await one(`SELECT id FROM "Inquiry" WHERE id=$1`, [id])).toBeUndefined();
});
