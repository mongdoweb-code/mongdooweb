// รอบ 3 ล็อต 12: ใบสั่งซื้อ + รับของ (A21), ต้นทุน/กำไร (A22), กลุ่มลูกค้า (A23), คำขอ PDPA (A24/U28), โน้ต/งาน (A25),
// สำรองข้อมูล + กู้คืน (A26), ค้นหาทั้งระบบ (A27), ศูนย์แจ้งเตือน (A28), บันทึกก่อน/หลัง (A29), รูปหลายขนาด + ตรวจรูป (U14/A15)
// ข้อมูลทดสอบสร้างเองในเทสต์ (SKU E2E-L12-*, ลูกค้า/พนักงาน/คำขอที่มีแท็กของรอบนี้) และลบเมื่อจบ — ใช้ได้ทั้งฐานข้อมูลใหม่และสำเนาข้อมูลจริง
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import pg from "pg";
import sharp from "sharp";
import { V, login, trackErrors } from "./helpers";
import { refreshStorefront } from "./storefront-fixtures";

test.describe.configure({ mode: "serial" });

const DB_URL = (process.env.DATABASE_URL ?? "").replace(/\?.*$/, "");
const db = new pg.Pool({ connectionString: DB_URL });
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0] as T;
const all = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows as T[];
const TAG = `l12${Date.now().toString(36)}`;
const UP = process.env.UPLOAD_DIR ?? "uploads";
const CRON = process.env.CRON_SECRET || "test-cron-secret";
const bkkDay = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
/** IP สุ่มต่อคำขอ — ตัวจำกัดจำนวนครั้งของฟอร์มสาธารณะนับต่อ IP (รันซ้ำบนเซิร์ฟเวอร์เดิมได้) */
const ipHdr = () => ({ "x-forwarded-for": `10.12.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });

function unzip(buf: Buffer) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const files: Record<string, Buffer> = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    const s = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(s, s + csize);
    files[name] = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    p += 46 + nlen + elen + clen;
  }
  return files;
}

const ids = { cat: "", a: "", b: "", c: "", staff: "", owner: "", customer: "", order: "", orderNo: "", po: "", dr: "" };
const STAFF_PW = `Staff-${TAG}-pw`;
const PHONE = `08${String(Date.now()).slice(-8)}`;
const CUST_CODE = `L${String(Date.now()).slice(-5)}`;
const IMG_KEY = `products/e2e/${TAG}-a.webp`;
const MISSING_KEY = `products/e2e/${TAG}-missing.webp`;

async function writeImage(key: string, color: string, size = 1400) {
  const buf = await sharp({ create: { width: size, height: Math.round(size * 0.75), channels: 3, background: color } }).webp({ quality: 70 }).toBuffer();
  for (const k of [key, key.replace(/\.webp$/, "-sm.webp")]) {
    const p = join(UP, k);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, buf);
  }
}

async function loginAs(page: Page, username: string, password: string) {
  await page.goto("/admin/login");
  await page.fill("#u" + V, username);
  await page.fill("#pw" + V, password);
  await page.click(".login-card button[type=submit]" + V);
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
}
async function staffPage(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok" });
  const page = await ctx.newPage();
  await loginAs(page, `${TAG}-staff`, STAFF_PW);
  return { ctx, page };
}

async function insertProduct(sku: string, slug: string, price: number, opts: { track?: boolean; stock?: number; images?: string[] } = {}) {
  const r = await one<{ id: string }>(
    `INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "trackStock", stock, "inStock", images, "categoryId", "isActive", "updatedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,false,now()) RETURNING id`,
    [`${TAG}${sku.slice(-1)}`, sku, slug, `สินค้าทดสอบล็อต 12 ${sku}`, price, !!opts.track, opts.stock ?? 0, opts.images ?? [], ids.cat],
  );
  return r.id;
}

test.beforeAll(async () => {
  await db.query(`DELETE FROM "LoginThrottle"`);
  ids.cat = (await one<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`)).id;
  await writeImage(IMG_KEY, "#2c7bd2");
  ids.a = await insertProduct(`E2E-L12-${TAG}-A`, `e2e-l12-${TAG}-a`, 50000, { track: true, stock: 2, images: [IMG_KEY] });
  ids.b = await insertProduct(`E2E-L12-${TAG}-B`, `e2e-l12-${TAG}-b`, 30000);
  ids.c = await insertProduct(`E2E-L12-${TAG}-C`, `e2e-l12-${TAG}-c`, 30000, { images: [MISSING_KEY] });
  ids.owner = (await one<{ id: string }>(`SELECT id FROM "Admin" WHERE username=$1`, [process.env.E2E_ADMIN_USER ?? "admin"])).id;
  ids.staff = (await one<{ id: string }>(
    `INSERT INTO "Admin" (id, username, "passwordHash", "displayName", role, "updatedAt") VALUES ($1,$2,$3,$4,'STAFF',now()) RETURNING id`,
    [`${TAG}staff`, `${TAG}-staff`, bcrypt.hashSync(STAFF_PW, 8), `พนักงาน ${TAG}`],
  )).id;
  ids.customer = (await one<{ id: string }>(
    `INSERT INTO "Customer" (id, code, kind, name, phone, email, "taxId", "updatedAt") VALUES ($1,$2,'COMPANY',$3,$4,$5,'0105556110718',now()) RETURNING id`,
    [`${TAG}cust`, CUST_CODE, `บริษัท ทดสอบ ${TAG} จำกัด`, PHONE, `${TAG}@example.com`],
  )).id;
});

test.afterAll(async () => {
  const pids = [ids.a, ids.b, ids.c];
  await db.query(`DELETE FROM "AdminTask" WHERE title LIKE $1`, [`%${TAG}%`]);
  await db.query(`DELETE FROM "InternalNote" WHERE body LIKE $1`, [`%${TAG}%`]);
  await db.query(`DELETE FROM "PurchaseOrder" WHERE "supplierName" LIKE $1`, [`%${TAG}%`]);
  await db.query(`DELETE FROM "Order" WHERE id LIKE $1`, [`${TAG}%`]);
  await db.query(`DELETE FROM "Inquiry" WHERE name LIKE $1`, [`%${TAG}%`]);
  await db.query(`DELETE FROM "DataRequest" WHERE name LIKE $1`, [`%${TAG}%`]);
  await db.query(`DELETE FROM "Customer" WHERE id=$1`, [ids.customer]);
  await db.query(`DELETE FROM "Product" WHERE id = ANY($1)`, [pids]);
  await db.query(`DELETE FROM "AdminSession" WHERE "adminId"=$1`, [ids.staff]);
  await db.query(`UPDATE "AdminLog" SET "adminId"=NULL WHERE "adminId"=$1`, [ids.staff]);
  await db.query(`DELETE FROM "Admin" WHERE id=$1`, [ids.staff]);
  await db.end();
});

/** คำสั่งซื้อที่ชำระแล้ว (A 2 ชิ้น + C 1 ชิ้น) ผูกกับลูกค้าทดสอบ */
async function insertPaidOrder() {
  const id = `${TAG}o${Math.random().toString(36).slice(2, 8)}`;
  const orderNo = `MDW-L12-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  await db.query(
    `INSERT INTO "Order" (id, "orderNo", status, "customerName", phone, email, "addressLine", subdistrict, district, province, "postalCode",
       "subtotalSatang", "shippingMethod", "shippingName", "shippingSatang", "totalSatang", "paidAt", "customerId", "updatedAt")
     VALUES ($1,$2,'PAID',$3,$4,$5,'1 ถนนทดสอบ','บางกรวย','บางกรวย','นนทบุรี','11130',130000,'std','ส่งธรรมดา',0,130000,now(),$6,now())`,
    [id, orderNo, `ลูกค้า ${TAG}`, PHONE, `${TAG}@example.com`, ids.customer],
  );
  await db.query(`INSERT INTO "OrderItem" (id, "orderId", "productId", "nameSnapshot", "priceSatang", qty) VALUES ($1,$2,$3,'สินค้า A',50000,2), ($4,$2,$5,'สินค้า C',30000,1)`, [`${id}i1`, id, ids.a, `${id}i2`, ids.c]);
  return { id, orderNo };
}

// ---------------------------------------------------------------------------

test("A21 ใบสั่งซื้อ: ร่าง → ออกเลข PO → รับบางส่วน → รับครบ (สต็อก RESTOCK + ต้นทุนล่าสุด) + พิมพ์", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto("/admin/purchase-orders/new");
  await page.fill("#poSup" + V, `ผู้ขาย ${TAG}`);
  await page.fill("#poCon" + V, "คุณสมชาย 081-234-5678");
  for (const sku of [`E2E-L12-${TAG}-A`, `E2E-L12-${TAG}-B`]) {
    await page.fill("#poPq" + V, sku);
    await page.click(`.mo-results button:has-text("${sku}")` + V);
  }
  await page.fill("#poq0" + V, "5");
  await page.fill("#poc0" + V, "120");
  await page.fill("#poq1" + V, "2");
  await page.fill("#poc1" + V, "80.50");
  await expect(page.locator("#poTotal" + V)).toContainText("761");
  await page.click('button:has-text("บันทึกและออกใบสั่งซื้อ")' + V);
  await expect(page.locator("#poStatus" + V)).toHaveText("สั่งซื้อแล้ว รอรับของ");
  const po = await one<{ id: string; poNo: string; totalSatang: number }>(`SELECT id, "poNo", "totalSatang" FROM "PurchaseOrder" WHERE "supplierName"=$1`, [`ผู้ขาย ${TAG}`]);
  ids.po = po.id;
  expect(po.poNo).toMatch(/^PO\d{4}-\d{5}$/);
  expect(po.totalSatang).toBe(5 * 12000 + 2 * 8050);
  await expect(page.locator("h1" + V)).toHaveText(po.poNo);

  // รับบางส่วน: A 3 จาก 5, B 2 จาก 2
  const items = await all<{ id: string; productId: string }>(`SELECT id, "productId" FROM "PurchaseOrderItem" WHERE "poId"=$1`, [po.id]);
  const itA = items.find((i) => i.productId === ids.a)!, itB = items.find((i) => i.productId === ids.b)!;
  await page.fill(`#rq_${itA.id}` + V, "3");
  await page.click('#poReceiveForm button:has-text("บันทึกการรับของ")' + V);
  await expect(page.locator("#poReceived" + V)).toBeVisible();
  await expect(page.locator("#poStatus" + V)).toHaveText("รับของบางส่วน");
  let a = await one<{ stock: number; costSatang: number }>(`SELECT stock, "costSatang" FROM "Product" WHERE id=$1`, [ids.a]);
  expect(a.stock).toBe(5);
  expect(a.costSatang).toBe(12000);
  expect((await one<{ costSatang: number; stock: number }>(`SELECT "costSatang", stock FROM "Product" WHERE id=$1`, [ids.b]))).toEqual({ costSatang: 8050, stock: 0 });
  const mv = await one<{ change: number; ref: string; reason: string }>(`SELECT change, ref, reason FROM "StockMovement" WHERE "productId"=$1 AND reason='RESTOCK'`, [ids.a]);
  expect(mv).toEqual({ change: 3, ref: po.poNo, reason: "RESTOCK" });
  await expect(page.locator("#poMoves" + V)).toContainText("+3");

  // รับเกินจำนวนที่สั่ง → ปฏิเสธที่ server
  const r = await page.request.get(`/admin/purchase-orders/${po.id}`);
  expect(r.ok()).toBeTruthy();
  await page.locator(`#rq_${itA.id}` + V).evaluate((el) => el.removeAttribute("max"));
  await page.fill(`#rq_${itA.id}` + V, "9");
  await page.click('#poReceiveForm button:has-text("บันทึกการรับของ")' + V);
  await expect(page.locator(".login-err" + V)).toContainText("รับเกินจำนวนที่สั่ง");
  expect((await one<{ stock: number }>(`SELECT stock FROM "Product" WHERE id=$1`, [ids.a])).stock).toBe(5);

  // รับส่วนที่เหลือ → รับครบ
  await page.fill(`#rq_${itA.id}` + V, "2");
  await page.click('#poReceiveForm button:has-text("บันทึกการรับของ")' + V);
  await expect(page.locator("#poStatus" + V)).toHaveText("รับครบแล้ว");
  a = await one(`SELECT stock, "costSatang" FROM "Product" WHERE id=$1`, [ids.a]);
  expect(a.stock).toBe(7);
  expect(itB).toBeTruthy();

  // พิมพ์ใบสั่งซื้อ A4
  await page.goto(`/admin/print/po/${po.id}`);
  await expect(page.locator("#poSheet" + V)).toContainText(po.poNo);
  await expect(page.locator("#poSheet" + V)).toContainText(`ผู้ขาย ${TAG}`);
  await expect(page.locator("#poSheet" + V)).toContainText("761.00");
  await expect(page).toHaveTitle(po.poNo);
  expect(errors).toEqual([]);
});

test("A22 ต้นทุน + รายงานกำไร (สินค้า/หมวด/เดือน, ไม่ทราบต้นทุน, CSV) — พนักงานไม่เห็นต้นทุน", async ({ page, browser }) => {
  const o = await insertPaidOrder();
  ids.order = o.id;
  ids.orderNo = o.orderNo;
  await login(page);
  // แก้ต้นทุนเองที่หน้า "ต้นทุนสินค้า"
  await page.goto(`/admin/purchase-orders/costs?q=${encodeURIComponent(`E2E-L12-${TAG}-A`)}`);
  await page.fill(`#c_${ids.a}` + V, "150");
  await page.click(`tr[data-sku="E2E-L12-${TAG}-A"] button:has-text("บันทึก")` + V);
  await expect.poll(async () => (await one<{ c: number }>(`SELECT "costSatang" c FROM "Product" WHERE id=$1`, [ids.a])).c).toBe(15000);

  await page.goto("/admin/reports/profit?preset=d7");
  const row = page.locator(`#profitTbl tr:has-text("E2E-L12-${TAG}-A")` + V);
  await expect(row).toContainText("฿1,000"); // รายได้ 2 × 500
  await expect(row).toContainText("฿300"); // ต้นทุน 2 × 150
  await expect(row).toContainText("฿700");
  await expect(row).toContainText("70%");
  const rowC = page.locator(`#profitTbl tr:has-text("E2E-L12-${TAG}-C")` + V);
  await expect(rowC.locator(".pf-flag")).toHaveText("ไม่ทราบต้นทุน");
  await expect(rowC).toContainText("฿300 (1)");
  for (const by of ["category", "month"]) {
    await page.goto(`/admin/reports/profit?preset=d7&by=${by}`);
    await expect(page.locator("#profitTbl" + V)).toBeVisible();
  }
  const csv = await page.request.get("/admin/reports/profit/export?preset=d7");
  expect(csv.status()).toBe(200);
  const text = await csv.text();
  expect(text).toContain("อัตรากำไร (%)");
  expect(text).toMatch(new RegExp(`E2E-L12-${TAG}-A"?,2,1000\\.00,300\\.00,700\\.00,70\\.0`));

  // พนักงาน: ไม่มีต้นทุนที่ไหนเลย
  const { ctx, page: s } = await staffPage(browser);
  for (const url of ["/admin/reports/profit", "/admin/purchase-orders/costs", `/admin/print/po/${ids.po}`]) {
    await s.goto(url);
    await expect(s).toHaveURL(/\/admin\?denied=1/);
  }
  expect((await s.request.get("/admin/reports/profit/export")).status()).toBe(403);
  await s.goto(`/admin/purchase-orders/${ids.po}`);
  await expect(s.locator("#poDetail" + V)).toBeVisible();
  await expect(s.locator("#poDetail" + V)).not.toContainText("ต้นทุน/หน่วย");
  await expect(s.locator("#poDetail" + V)).not.toContainText("฿120");
  await s.goto("/admin/purchase-orders");
  await expect(s.locator("#poTable" + V)).not.toContainText("ยอดรวม");
  await s.goto(`/admin/products/${ids.a}`);
  await expect(s.locator("main" + V)).not.toContainText("ต้นทุน");
  const exp = await s.request.get("/admin/products/export");
  if (exp.status() === 200) expect(await exp.text()).not.toMatch(/cost|ต้นทุน/i);
  await s.goto(`/admin/log?entity=Product:${ids.a}`);
  await expect(s.locator("main" + V)).toContainText("แก้ต้นทุนสินค้า"); // เห็นว่ามีการแก้ แต่ไม่เห็นตัวเลข
  await expect(s.locator(".lg-diff" + V)).toHaveCount(0);
  await s.goto("/admin/reports");
  await expect(s.locator('a:has-text("รายงานกำไร")' + V)).toHaveCount(0);
  await ctx.close();
  // เจ้าของร้านเห็นค่าก่อน/หลังของต้นทุน
  await page.goto(`/admin/log?entity=Product:${ids.a}`);
  const d = page.locator(".lg-diff" + V).first();
  await d.locator("summary").click();
  await expect(d).toContainText("ต้นทุน (สตางค์)");
  await expect(d).toContainText("15000");
});

test("A23 กลุ่มลูกค้า: แท็ก, ยอดซื้อรวม, ตัวกรอง, ส่งออกสำหรับบรอดแคสต์", async ({ page }) => {
  await login(page);
  await page.goto(`/admin/customers/${ids.customer}`);
  await expect(page.locator("#cuSpend" + V)).toHaveText("฿1,300.00");
  await page.fill("#cuTags" + V, `VIP-${TAG}, ผู้รับเหมา-${TAG}, vip-${TAG}`);
  await page.click('#tagForm button:has-text("บันทึกแท็ก")' + V);
  await expect.poll(async () => (await one<{ tags: string[] }>(`SELECT tags FROM "Customer" WHERE id=$1`, [ids.customer])).tags).toEqual([`VIP-${TAG}`, `ผู้รับเหมา-${TAG}`]);

  await page.goto(`/admin/customers?tag=${encodeURIComponent(`VIP-${TAG}`)}`);
  await expect(page.locator("#cuTotal" + V)).toHaveText("1");
  await expect(page.locator(`#cuTable tr[data-code="${CUST_CODE}"]` + V)).toContainText("1,300.00");
  // ยอดซื้อขั้นต่ำเกิน → ไม่พบ · ช่วงที่ครอบคลุม → พบ · มีเลขผู้เสียภาษี → พบ
  await page.goto(`/admin/customers?tag=${encodeURIComponent(`VIP-${TAG}`)}&minSpend=2000`);
  await expect(page.locator("#cuTotal" + V)).toHaveText("0");
  await page.goto(`/admin/customers?tag=${encodeURIComponent(`VIP-${TAG}`)}&minSpend=1000&maxSpend=1500&lastFrom=${bkkDay()}&taxId=yes&sort=spend`);
  await expect(page.locator("#cuTotal" + V)).toHaveText("1");
  await page.goto(`/admin/customers?tag=${encodeURIComponent(`VIP-${TAG}`)}&taxId=no`);
  await expect(page.locator("#cuTotal" + V)).toHaveText("0");

  const res = await page.request.get(`/admin/customers/broadcast.csv?tag=${encodeURIComponent(`VIP-${TAG}`)}`);
  expect(res.status()).toBe(200);
  const csv = await res.text();
  expect(csv).toContain("เบอร์โทร (สากล)");
  expect(csv).toContain(`+66${PHONE.slice(1)}`);
  expect(csv).toContain(`VIP-${TAG}, ผู้รับเหมา-${TAG}`);
  expect(csv.trim().split("\n")).toHaveLength(2);
  const full = await (await page.request.get(`/admin/customers/export.csv?tag=${encodeURIComponent(`VIP-${TAG}`)}`)).text();
  expect(full).toContain("ยอดซื้อรวม (บาท)");
  expect(full).toContain("1300.00");
});

test("A25 โน้ตภายใน + งานที่ต้องทำ: มอบหมาย, เกินกำหนด, งานของฉัน, ทำเสร็จ, ในลิ้นชักคำสั่งซื้อ", async ({ page, browser }) => {
  await login(page);
  await page.goto(`/admin/customers/${ids.customer}`);
  await page.fill("#cuNoteText" + V, `ลูกค้าโครงการ ${TAG} ต้องการใบกำกับภาษีทุกครั้ง`);
  await page.click('#cuNotes button:has-text("บันทึกโน้ต")' + V);
  await expect(page.locator("#cuNotes .inote-list" + V)).toContainText(`ลูกค้าโครงการ ${TAG}`);

  // งานเกินกำหนด มอบหมายให้พนักงาน (จากหน้า งานที่ต้องทำ)
  await page.goto("/admin/tasks");
  await page.fill("#ntTitle" + V, `โทรตามลูกค้า ${TAG}`);
  await page.selectOption("#ntAssignee" + V, ids.staff);
  const yesterday = new Date(Date.now() + 7 * 3600e3 - 864e5).toISOString().slice(0, 10);
  await page.fill("#ntDue" + V, yesterday);
  await page.fill("#ntCust" + V, CUST_CODE);
  await page.click('#newTaskForm button:has-text("บันทึกงาน")' + V);
  await expect(page.locator(".ok-box" + V)).toContainText("บันทึกงานแล้ว");
  await page.goto("/admin/tasks?tab=overdue");
  await expect(page.locator(`#taskList li[data-task="โทรตามลูกค้า ${TAG}"]` + V)).toContainText("เกินกำหนด");

  // งานในลิ้นชักคำสั่งซื้อ
  await page.goto(`/admin?tab=ALL&open=${ids.orderNo}`);
  const panel = page.locator("#taskPanel" + V);
  await panel.locator("summary").click();
  await panel.locator('input[name="title"]').fill(`แพ็กของด่วน ${TAG}`);
  await panel.locator('button:has-text("บันทึกงาน")').click();
  await expect(page.locator(`#taskPanel li[data-task="แพ็กของด่วน ${TAG}"]` + V)).toBeVisible();
  await expect(page.locator('#taskPanel a[data-history]' + V)).toHaveAttribute("href", `/admin/log?entity=${encodeURIComponent(`Order:${ids.orderNo}`)}`);

  // พนักงาน: ป้ายเกินกำหนดที่เมนู + งานของฉัน → ทำเสร็จ
  const { ctx, page: s } = await staffPage(browser);
  await s.goto("/admin/tasks");
  await expect(s.locator('.nav-i[href="/admin/tasks"] .badge' + V)).toHaveText("1");
  const li = s.locator(`#taskList li[data-task="โทรตามลูกค้า ${TAG}"]` + V);
  await expect(li).toBeVisible();
  await li.locator(".task-chk").click();
  await expect(s.locator(`#taskList li[data-task="โทรตามลูกค้า ${TAG}"]` + V)).toHaveCount(0);
  await s.goto("/admin/tasks?tab=done");
  await expect(s.locator(`#taskList li.done[data-task="โทรตามลูกค้า ${TAG}"]` + V)).toBeVisible();
  await expect(s.locator('.nav-i[href="/admin/tasks"] .badge' + V)).toHaveCount(0);
  await ctx.close();
  const t = await one<{ done: boolean; doneAt: Date | null }>(`SELECT done, "doneAt" FROM "AdminTask" WHERE title=$1`, [`โทรตามลูกค้า ${TAG}`]);
  expect(t.done).toBe(true);
  expect(t.doneAt).not.toBeNull();
});

test("A29 บันทึกก่อน/หลัง: สินค้า ตั้งค่า คำสั่งซื้อ + ประวัติของรายการนี้ (ไม่มีความลับ)", async ({ page }) => {
  await login(page);
  // สินค้า: เปลี่ยนราคา
  await page.goto(`/admin/products/${ids.b}`);
  await page.fill("#price" + V, "333");
  await page.click('button:has-text("บันทึกสินค้า")' + V);
  await expect(page.locator("text=บันทึกแล้ว" + V).first()).toBeVisible();
  await page.click(`a[data-history="Product:${ids.b}"]` + V);
  await expect(page.locator(".lg-entity" + V)).toContainText("ประวัติการแก้ไขของ");
  const d = page.locator(".lg-diff" + V).first();
  await d.locator("summary").click();
  await expect(d.locator("tr:has-text('ราคา (สตางค์)') .lg-before")).toHaveText("30000");
  await expect(d.locator("tr:has-text('ราคา (สตางค์)') .lg-after")).toHaveText("33300");

  // ตั้งค่าร้าน: เกณฑ์สินค้าใกล้หมด
  const s0 = await one<{ lowStockThreshold: number }>(`SELECT "lowStockThreshold" FROM "ShopSetting" WHERE id='shop'`);
  await page.goto("/admin/settings");
  await page.fill("#lowStockThreshold" + V, String(s0.lowStockThreshold + 3));
  await page.locator("button[type=submit]:has-text('บันทึกการตั้งค่า')" + V).first().click();
  await expect(page.locator(".login-info[role=status]" + V).first()).toBeVisible();
  const log = await one<{ diff: Record<string, [unknown, unknown]> }>(`SELECT diff FROM "AdminLog" WHERE entity='ShopSetting' AND type='SETTINGS' ORDER BY "createdAt" DESC LIMIT 1`);
  expect(log.diff.lowStockThreshold).toEqual([s0.lowStockThreshold, s0.lowStockThreshold + 3]);
  expect(JSON.stringify(log.diff)).not.toMatch(/password|secret|token|totp/i);
  await page.goto("/admin/settings");
  await page.fill("#lowStockThreshold" + V, String(s0.lowStockThreshold));
  await page.locator("button[type=submit]:has-text('บันทึกการตั้งค่า')" + V).first().click();
  await expect(page.locator(".login-info[role=status]" + V).first()).toBeVisible();
  await page.goto("/admin/log?entity=ShopSetting");
  await expect(page.locator(".lg-diff" + V).first()).toContainText("เกณฑ์สินค้าใกล้หมด");

  // คำสั่งซื้อ: แก้ชื่อผู้รับ
  await page.goto(`/admin?tab=ALL&open=${ids.orderNo}&mode=edit`);
  await page.fill("#a-name" + V, `ลูกค้า ${TAG} (แก้)`);
  await page.click("#editOrderForm button[type=submit]" + V);
  await expect(page.locator("#editOrderForm")).toHaveCount(0);
  await page.goto(`/admin/log?entity=${encodeURIComponent(`Order:${ids.orderNo}`)}`);
  const od = page.locator(".lg-diff" + V).first();
  await od.locator("summary").click();
  await expect(od.locator("tr:has-text('ชื่อผู้รับ') .lg-after")).toHaveText(`ลูกค้า ${TAG} (แก้)`);
  // ไม่มีฟิลด์ลับใน diff ใดๆ เลย
  const leak = await one<{ n: number }>(`SELECT COUNT(*)::int n FROM "AdminLog" WHERE diff::text ~* '(passwordhash|totpsecret|backupcodes|publictoken)'`);
  expect(leak.n).toBe(0);
});

test("A27 ค้นหาทั้งระบบ Ctrl+K / '/' — คำสั่งซื้อ ลูกค้า สินค้า แป้นพิมพ์ + ตามสิทธิ์", async ({ page, browser }) => {
  await login(page);
  await page.goto("/admin/dashboard");
  await page.keyboard.press("Control+k");
  await expect(page.locator("#gsInput" + V)).toBeFocused();
  await page.fill("#gsInput" + V, ids.orderNo);
  await expect(page.locator("#gsList [role=option]" + V).first()).toContainText(ids.orderNo);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`open=${ids.orderNo}`));
  // "/" เปิด, ค้นเบอร์โทร → ลูกค้า + คำสั่งซื้อ, ↓ เลือกรายการถัดไป, Esc ปิด
  await page.goto("/admin/dashboard");
  await page.locator("body").click({ position: { x: 5, y: 300 } });
  await page.keyboard.press("/");
  await page.fill("#gsInput" + V, PHONE);
  await expect(page.locator(".gs-grp:has-text('ลูกค้า')" + V)).toBeVisible();
  await expect(page.locator(".gs-grp:has-text('คำสั่งซื้อ')" + V)).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#gs-opt-1" + V)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator("#gsInput")).toHaveCount(0);
  // สินค้า (SKU) และทางลัดหน้า
  const r = await (await page.request.get(`/admin/search?q=${encodeURIComponent(`E2E-L12-${TAG}-B`)}`)).json();
  expect(r.hits.some((h: { group: string; href: string }) => h.group === "สินค้า" && h.href === `/admin/products/${ids.b}`)).toBe(true);
  const own = await (await page.request.get("/admin/search?q=ต้นทุน")).json();
  expect(own.hits.some((h: { href: string }) => h.href === "/admin/purchase-orders/costs")).toBe(true);
  // พนักงานไม่เห็นหน้าเฉพาะเจ้าของร้าน · ไม่ล็อกอิน = 401
  const { ctx, page: s } = await staffPage(browser);
  const st = await (await s.request.get("/admin/search?q=ต้นทุน")).json();
  expect(st.hits.some((h: { href: string }) => h.href === "/admin/purchase-orders/costs")).toBe(false);
  const st2 = await (await s.request.get("/admin/search?q=สำรองข้อมูล")).json();
  expect(st2.hits.length).toBe(0);
  await ctx.close();
  const anon = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  expect((await anon.request.get("/admin/search?q=MDW", { maxRedirects: 0 })).status()).not.toBe(200);
  await anon.close();
});

test("A28 ศูนย์แจ้งเตือน: กระดิ่ง + ตัวเลขยังไม่อ่าน + อ่านแล้วทั้งหมด", async ({ page }) => {
  await login(page);
  await page.goto("/admin/notifications");
  if (await page.locator('button:has-text("ทำเครื่องหมายว่าอ่านแล้วทั้งหมด"):not([disabled])' + V).count())
    await page.click('button:has-text("ทำเครื่องหมายว่าอ่านแล้วทั้งหมด")' + V);
  await expect(page.locator("#notifUnread" + V)).toHaveText("0");
  expect((await (await page.request.get("/admin/notifications/count")).json()).unread).toBe(0);

  const o = await insertPaidOrder(); // คำสั่งซื้อใหม่หลังอ่านล่าสุด
  await db.query(`INSERT INTO "Inquiry" (id, kind, name, phone, message, "updatedAt") VALUES ($1,'CONTACT',$2,$3,'สอบถามไฟสระ ทดสอบแจ้งเตือน',now())`, [`${TAG}inq`, `ผู้ติดต่อ ${TAG}`, PHONE]);
  await expect.poll(async () => (await (await page.request.get("/admin/notifications/count")).json()).unread).toBeGreaterThanOrEqual(2);
  await page.goto("/admin/dashboard");
  await expect(page.locator("#bellCount" + V)).toBeVisible();
  await page.click("#bellBtn" + V);
  await expect(page.locator(".bell-pop" + V)).toContainText(o.orderNo);
  await expect(page.locator(".bell-pop" + V)).toContainText("คำขอจากลูกค้า");
  await page.click("#bellReadAll" + V);
  await expect(page.locator("#bellCount")).toHaveCount(0);
  expect((await (await page.request.get("/admin/notifications/count")).json()).unread).toBe(0);
  await page.goto("/admin/notifications");
  await expect(page.locator(`#notifList li:has-text("${o.orderNo}")` + V)).toBeVisible();
  await expect(page.locator("#notifList li.unread" + V)).toHaveCount(0);
});

test("A26 สำรองข้อมูล: สำรองตอนนี้ → ไฟล์ใน storage, ดาวน์โหลด, cron, ลบไฟล์เก่าตามระยะเก็บ, กู้คืนลงฐานข้อมูลใหม่", async ({ page, request }) => {
  test.setTimeout(240_000);
  await login(page);
  // ไฟล์สำรองเก่า (20 วันก่อน) → ต้องถูกลบเมื่อสำรองครั้งถัดไป (เก็บ 14 วัน)
  const oldKey = `backups/2000-01-${String(10 + Math.floor(Math.random() * 18)).padStart(2, "0")}.zip`;
  mkdirSync(join(UP, "backups"), { recursive: true });
  writeFileSync(join(UP, oldKey), "old");
  const old = await one<{ id: string }>(`INSERT INTO "BackupRun" (id, key, "sizeBytes", status, "createdAt") VALUES ($1,$2,3,'OK', now() - interval '20 days') RETURNING id`, [`${TAG}bk`, oldKey]);
  await db.query(`UPDATE "ShopSetting" SET "backupRetentionDays"=14 WHERE id='shop'`);

  await page.goto("/admin/backups");
  await page.click("#backupNow" + V);
  await expect(page.locator("#backupDone" + V)).toBeVisible({ timeout: 60_000 });
  const key = `backups/${bkkDay()}.zip`;
  expect(existsSync(join(UP, key))).toBe(true);
  expect(existsSync(join(UP, oldKey))).toBe(false);
  expect((await one<{ status: string }>(`SELECT status FROM "BackupRun" WHERE id=$1`, [old.id])).status).toBe("EXPIRED");
  const run = await one<{ id: string; sizeBytes: number }>(`SELECT id, "sizeBytes" FROM "BackupRun" WHERE key=$1 AND status='OK' ORDER BY "createdAt" DESC LIMIT 1`, [key]);
  expect(run.sizeBytes).toBeGreaterThan(1000);

  const dl = await page.request.get(`/admin/backups/${run.id}/download`);
  expect(dl.status()).toBe(200);
  const files = unzip(await dl.body());
  const manifest = JSON.parse(files["manifest.json"].toString());
  expect(manifest.app).toBe("mongdoweb");
  expect(manifest.tables.Product).toBeGreaterThanOrEqual(3);
  const products = JSON.parse(files["tables/Product.json"].toString()) as { sku: string }[];
  expect(products.some((p) => p.sku === `E2E-L12-${TAG}-A`)).toBe(true);
  expect(files["tables/AdminSession.json"]).toBeUndefined();
  const admins = JSON.parse(files["tables/Admin.json"].toString()) as { totpSecret: string | null; backupCodes: unknown[] }[];
  expect(admins.every((a) => a.totpSecret === null && Array.isArray(a.backupCodes) && a.backupCodes.length === 0)).toBe(true);
  expect(Object.keys(files).some((f) => f.startsWith("tables/PurchaseOrder"))).toBe(true);

  // งานประจำวัน: วันนี้สำรองแล้ว → ไม่สำรองซ้ำ
  const cron = await (await request.get("/api/cron/daily", { headers: { Authorization: `Bearer ${CRON}` } })).json();
  expect(cron.backup.status).toMatch(/already-today|ok/);
  // พนักงานดาวน์โหลดไม่ได้
  expect((await request.get(`/admin/backups/${run.id}/download`, { maxRedirects: 0 })).status()).not.toBe(200);

  // กู้คืนลงฐานข้อมูลใหม่ด้วยสคริปต์ตามคู่มือ แล้วเทียบจำนวนแถว
  const zipPath = join(UP, key);
  const target = `mdw_l12_restore_${Date.now().toString(36)}`;
  const admin = new pg.Client({ connectionString: DB_URL.replace(/\/[^/]+$/, "/postgres") });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${target}`);
  try {
    const url = DB_URL.replace(/\/[^/]+$/, `/${target}`);
    const env = { ...process.env, DATABASE_URL: `${url}?schema=public` };
    execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "pipe" });
    const out = execFileSync("npx", ["tsx", "scripts/restore-backup.ts", zipPath], { env, stdio: "pipe" }).toString();
    expect(out).toContain("กู้คืนเรียบร้อย");
    const t = new pg.Client({ connectionString: url });
    await t.connect();
    for (const tbl of ["Product", "Customer", "PurchaseOrder", "Order", "SalesDocument"]) {
      const n = Number((await t.query(`SELECT COUNT(*) n FROM "${tbl}"`)).rows[0].n);
      expect(n, tbl).toBe(manifest.tables[tbl]);
    }
    const p = (await t.query(`SELECT "costSatang", images FROM "Product" WHERE sku=$1`, [`E2E-L12-${TAG}-A`])).rows[0];
    expect(p.costSatang).toBe(15000);
    expect(p.images).toEqual([IMG_KEY]);
    await t.end();
    // กู้ซ้ำทับฐานข้อมูลที่มีข้อมูลแล้ว → ปฏิเสธ
    let refused = "";
    try {
      execFileSync("npx", ["tsx", "scripts/restore-backup.ts", zipPath], { env, stdio: "pipe" });
    } catch (e) {
      refused = String((e as { stderr?: Buffer }).stderr ?? "");
    }
    expect(refused).toContain("มีข้อมูลอยู่แล้ว");
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${target} WITH (FORCE)`);
    await admin.end();
  }
});

test("U28 คุกกี้แยกประเภท: GA4 เฉพาะ 'วิเคราะห์', Pixel เฉพาะ 'การตลาด', ปฏิเสธ, เปลี่ยนใจจากท้ายเว็บ", async ({ page, browser }) => {
  // ใส่รหัส GA4/Pixel ผ่านหน้าตั้งค่า (บันทึก = ล้างแคชหน้าร้าน) แล้วคืนค่าเดิมตอนจบ
  const s0 = await one<{ ga4Id: string | null; metaPixelId: string | null }>(`SELECT "ga4Id", "metaPixelId" FROM "ShopSetting" WHERE id='shop'`);
  await login(page);
  const setIds = async (ga: string, px: string) => {
    await page.goto("/admin/settings");
    await page.fill("#ga4Id" + V, ga);
    await page.fill("#metaPixelId" + V, px);
    await page.locator("button[type=submit]:has-text('บันทึกการตั้งค่า')" + V).first().click();
    await expect(page.locator(".login-info[role=status]" + V).first()).toBeVisible();
  };
  await setIds("G-E2ELOT12X", "123456789012345");
  try {
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "th-TH" });
    await ctx.route(/googletagmanager|facebook\.net/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    const p = await ctx.newPage();
    await p.goto("/");
    await expect(p.locator("#consent" + V)).toBeVisible();
    await expect(p.locator("script[data-mdw]")).toHaveCount(0);
    // ตั้งค่าเอง: วิเคราะห์อย่างเดียว
    await p.click("#consentSettings" + V);
    await p.check("#ckAnalytics");
    await p.click("#consentSave");
    await expect(p.locator("script[data-mdw=ga4]")).toHaveCount(1);
    await expect(p.locator("script[data-mdw=pixel]")).toHaveCount(0);
    // เปลี่ยนใจจากท้ายเว็บ: การตลาดอย่างเดียว → โหลดหน้าใหม่ = Pixel เท่านั้น
    await p.click("#openConsent");
    await expect(p.locator("#consentPrefs" + V)).toBeVisible();
    await p.uncheck("#ckAnalytics");
    await p.check("#ckMarketing");
    await p.click("#consentSave");
    await p.reload();
    await expect(p.locator("script[data-mdw=pixel]")).toHaveCount(1);
    await expect(p.locator("script[data-mdw=ga4]")).toHaveCount(0);
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("mdw_consent")!));
    expect(saved).toMatchObject({ v: 1, necessary: true, analytics: false, marketing: true });
    await ctx.close();
    // ปฏิเสธ (เฉพาะที่จำเป็น) → ไม่โหลดอะไรเลย
    const ctx2 = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "th-TH" });
    await ctx2.route(/googletagmanager|facebook\.net/, (r) => r.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    const q = await ctx2.newPage();
    await q.goto("/");
    await q.click("#consentReject" + V);
    await expect(q.locator("#consent")).toBeHidden();
    await q.reload();
    await expect(q.locator("#consent")).toBeHidden();
    await expect(q.locator("script[data-mdw]")).toHaveCount(0);
    // ลิงก์ในท้ายเว็บไปหน้าคำขอข้อมูลส่วนบุคคล
    await expect(q.locator('footer a[href="/privacy/request"]').first()).toBeVisible();
    await ctx2.close();
  } finally {
    await setIds(s0.ga4Id ?? "", s0.metaPixelId ?? "");
  }
});

test("U28/A24 คำขอ PDPA: ฟอร์ม → คิวเจ้าของร้าน → ส่งออก ZIP → ลบ/ไม่ระบุตัวตน (เก็บเอกสารภาษี) → ปิดคำขอ", async ({ page, browser }) => {
  // ข้อมูลของผู้ขอ: คำขอติดต่อ + คำสั่งซื้อที่ชำระแล้ว (ผูกลูกค้าที่มีเลขผู้เสียภาษี)
  await db.query(`INSERT INTO "Inquiry" (id, kind, name, phone, message, "updatedAt") VALUES ($1,'QUOTE',$2,$3,'ขอราคาไฟสระ 10 ชุด',now())`, [`${TAG}inq2`, `ผู้ขอ ${TAG}`, PHONE]);

  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "th-TH", extraHTTPHeaders: ipHdr() });
  const p = await ctx.newPage();
  const errors = trackErrors(p);
  await p.goto("/privacy/request");
  await p.click('#drForm button[type=submit]');
  await expect(p.locator("#drForm .l2-err")).toBeVisible();
  await expect(p.locator('#drForm [name=name][aria-invalid=true]')).toHaveCount(1);
  await p.check('input[name=kind][value=DELETE]');
  await p.fill("#drForm [name=name]", `ผู้ขอ ${TAG}`);
  await p.fill("#drForm [name=phone]", PHONE);
  await p.fill("#drForm [name=email]", `${TAG}@example.com`);
  await p.fill("#drForm [name=detail]", "ขอลบข้อมูลทั้งหมดของฉัน และขอสำเนาก่อนลบ");
  await p.check("#drForm [name=consent]");
  await p.waitForTimeout(2600); // กันบอท: ส่งเร็วเกินไปถูกทิ้ง
  await p.click('#drForm button[type=submit]');
  await expect(p.locator("#drDone")).toBeVisible();
  const axe = await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  expect(errors).toEqual([]);
  await ctx.close();
  const dr = await one<{ id: string; kind: string; status: string; ipHash: string }>(`SELECT id, kind, status, "ipHash" FROM "DataRequest" WHERE name=$1`, [`ผู้ขอ ${TAG}`]);
  ids.dr = dr.id;
  expect(dr).toMatchObject({ kind: "DELETE", status: "NEW" });
  expect(dr.ipHash).toMatch(/^[0-9a-f]{32}$/);

  // จำกัดจำนวนครั้งต่อ IP (3 ครั้ง/ชั่วโมง) — ตรวจที่ API · honeypot ตอบสำเร็จแต่ไม่บันทึก
  const h = ipHdr();
  const body = { kind: "ACCESS", name: `บอท ${TAG}`, phone: "0899999999", detail: "ทดสอบจำกัดจำนวน", consent: true };
  const codes: number[] = [];
  for (let i = 0; i < 4; i++) codes.push((await page.request.post("/api/data-requests", { headers: h, data: body })).status());
  expect(codes).toEqual([201, 201, 201, 429]);
  expect((await page.request.post("/api/data-requests", { headers: ipHdr(), data: { ...body, website: "spam" } })).status()).toBe(201);
  expect((await page.request.post("/api/data-requests", { headers: ipHdr(), data: { ...body, phone: "123" } })).status()).toBe(400);

  // พนักงานเข้าคิวไม่ได้
  const { ctx: sc, page: s } = await staffPage(browser);
  await s.goto("/admin/data-requests");
  await expect(s).toHaveURL(/denied=1/);
  expect((await s.request.get(`/admin/data-requests/${dr.id}/export`)).status()).toBe(403);
  await sc.close();

  await login(page);
  await page.goto("/admin/data-requests");
  await expect(page.locator(`#drTable tr:has-text("ผู้ขอ ${TAG}")` + V)).toContainText("อีก 30 วัน");
  await page.goto(`/admin/data-requests/${dr.id}`);
  await expect(page.locator('#drFound li[data-k="orders"] b' + V)).not.toHaveText("0");
  await expect(page.locator('#drFound li[data-k="inquiries"] b' + V)).not.toHaveText("0");
  const zip = await page.request.get(`/admin/data-requests/${dr.id}/export`);
  expect(zip.status()).toBe(200);
  const data = JSON.parse(unzip(await zip.body())["data.json"].toString());
  expect(data.orders.some((o: { orderNo: string }) => o.orderNo === ids.orderNo)).toBe(true);
  expect(data.inquiries.length).toBeGreaterThanOrEqual(2);
  expect(data.customers[0].note).toBeUndefined();
  expect(JSON.stringify(data)).not.toContain("ipHash");

  // ใบเสร็จที่ออกแล้ว (เอกสารภาษี) ของลูกค้ารายนี้ → ต้องเก็บชื่อ/เลขผู้เสียภาษีไว้
  await db.query(
    `INSERT INTO "SalesDocument" (id, type, "docNo", status, "issueDate", "customerId", "customerSnapshot", "grandSatang", "updatedAt")
     VALUES ($1,'RECEIPT',$2,'ISSUED',now(),$3,$4,130000,now())`,
    [`${TAG}rc`, `RCL12-${TAG}`, ids.customer, JSON.stringify({ name: `บริษัท ทดสอบ ${TAG} จำกัด`, taxId: "0105556110718", phone: PHONE, email: `${TAG}@example.com` })],
  );
  try {
    await page.click('button:has-text("ลบข้อมูลตามคำขอ")' + V);
    await page.click('.dlg button:has-text("ลบข้อมูล")' + V);
    await expect(page.locator("#drErased" + V)).toBeVisible();
    const o = await one<{ customerName: string; phone: string; email: string | null; totalSatang: number }>(`SELECT "customerName", phone, email, "totalSatang" FROM "Order" WHERE id=$1`, [ids.order]);
    expect(o).toEqual({ customerName: "ลบตามคำขอ PDPA", phone: "", email: null, totalSatang: 130000 });
    expect((await one<{ n: number }>(`SELECT COUNT(*)::int n FROM "Inquiry" WHERE phone=$1`, [PHONE])).n).toBe(0);
    const c = await one<{ name: string; phone: string | null; taxId: string; tags: string[] }>(`SELECT name, phone, "taxId", tags FROM "Customer" WHERE id=$1`, [ids.customer]);
    expect(c).toEqual({ name: `บริษัท ทดสอบ ${TAG} จำกัด`, phone: null, taxId: "0105556110718", tags: [] });
    const rc = await one<{ s: Record<string, string> }>(`SELECT "customerSnapshot" s FROM "SalesDocument" WHERE id=$1`, [`${TAG}rc`]);
    expect(rc.s).toEqual({ name: `บริษัท ทดสอบ ${TAG} จำกัด`, taxId: "0105556110718" });
    await expect(page.locator("#drResult" + V)).toContainText("ลบ/ทำให้ไม่ระบุตัวตนแล้ว");
  } finally {
    await db.query(`DELETE FROM "SalesDocument" WHERE id=$1`, [`${TAG}rc`]);
  }
  await page.fill("#drRes" + V, "ลบข้อมูลที่ไม่บังคับแล้ว คงใบเสร็จไว้ตามกฎหมาย 5 ปี แจ้งผู้ขอทางอีเมลแล้ว");
  await page.click('#drResolve button:has-text("ดำเนินการแล้ว")' + V);
  await expect(page.locator("#drStatus" + V)).toHaveText("ดำเนินการแล้ว");
  const logs = await all<{ note: string }>(`SELECT note FROM "AdminLog" WHERE entity=$1 ORDER BY "createdAt"`, [`DataRequest:${dr.id}`]);
  expect(logs.map((l) => l.note).join("\n")).toMatch(/คำขอใหม่[\s\S]*ส่งออกข้อมูลส่วนบุคคล[\s\S]*ลบข้อมูลส่วนบุคคล[\s\S]*ปิดคำขอ/);
});

test("U14 รูปหลายขนาด: srcset บนการ์ด/แกลเลอรี/สไลด์, รูปย่อ WebP + AVIF ตาม Accept, preload รูป LCP", async ({ page, request }) => {
  const base = `/media/${IMG_KEY.replace(/\.webp$/, "")}`;
  const webp = await request.get(`${base}-w640.webp`, { headers: { Accept: "image/webp,*/*" } });
  expect(webp.status()).toBe(200);
  expect(webp.headers()["content-type"]).toBe("image/webp");
  expect(webp.headers()["vary"]).toMatch(/\bAccept\b/);
  const meta = await sharp(await webp.body()).metadata();
  expect(meta.width).toBe(640);
  const avif = await request.get(`${base}-w320.webp`, { headers: { Accept: "image/avif,image/webp,*/*" } });
  expect(avif.status()).toBe(200);
  expect(avif.headers()["content-type"]).toBe("image/avif");
  expect((await avif.body()).length).toBeLessThan((await webp.body()).length);
  expect(existsSync(join(UP, IMG_KEY.replace(/\.webp$/, "-w640.webp")))).toBe(true); // เก็บไว้ใช้ครั้งต่อไป
  expect((await request.get(`${base}-w777.webp`)).status()).toBe(404); // ไม่รับขนาดอื่น (กันสร้างไฟล์ไม่จำกัด)
  expect((await request.get(`/media/products/e2e/nope-${TAG}-w640.webp`)).status()).toBe(404);

  // หน้าแรก: preload รูปสไลด์แรก + การ์ดสินค้ามี srcset/sizes/width/height
  await page.goto("/");
  const pre = page.locator('link[rel=preload][as=image]');
  await expect(pre.first()).toHaveAttribute("fetchpriority", "high");
  const first = page.locator(".slide .s-img").first();
  await expect(first).toHaveAttribute("srcset", /\d+w/);
  expect(await pre.first().getAttribute("imagesrcset")).toBe(await first.getAttribute("srcset"));
  const card = page.locator("#prodGrid .prod-img img[srcset]").first();
  if (await card.count()) {
    await expect(card).toHaveAttribute("srcset", /-w320\.webp 320w, .*-w640\.webp 640w/);
    await expect(card).toHaveAttribute("sizes", /46vw/);
    await expect(card).toHaveAttribute("width", "480");
  }
  // หน้าหมวด (ProductCard) และหน้าสินค้า (แกลเลอรี)
  const cat = await one<{ slug: string; pslug: string }>(
    `SELECT c.slug, p.slug pslug FROM "Product" p JOIN "Category" c ON c.id=p."categoryId" WHERE p."isActive" AND c."isActive" AND NOT p."isService" AND cardinality(p.images) > 0 AND p.images[1] LIKE 'products/%' LIMIT 1`,
  );
  if (cat) {
    await page.goto(`/category/${cat.slug}`);
    await expect(page.locator(".prod-img img[srcset]").first()).toHaveAttribute("srcset", /-w320\.webp 320w/);
    await page.goto(`/product/${cat.pslug}`);
    await expect(page.locator(".gal-slide img").first()).toHaveAttribute("srcset", /-w640\.webp 640w, .*-w1280\.webp 1280w, .*\.webp 1600w/);
    await expect(page.locator(".gal-slide img").first()).toHaveAttribute("fetchpriority", "high");
  }
});

test("A15 ตรวจรูป: รูปหาย/ยังไม่มีรูปย่อ + รายการที่ต้องแก้ + สร้างรูปย่อใหม่ + เอารูปที่หายออก", async ({ page }) => {
  test.setTimeout(180_000);
  await writeImage(`products/e2e/${TAG}-b.webp`, "#d23c2c", 900);
  await db.query(`UPDATE "Product" SET images=$2 WHERE id=$1`, [ids.b, [`products/e2e/${TAG}-b.webp`]]);
  await login(page);
  await page.goto(`/admin/media?scan=1&only=${TAG}`);
  const issues = page.locator("#mediaIssues" + V);
  await expect(issues.locator(`tr[data-problem=missing]:has-text("${MISSING_KEY}")`)).toContainText(`E2E-L12-${TAG}-C`);
  await expect(issues.locator(`tr[data-problem=no-variants]:has-text("${TAG}-b.webp")`)).toBeVisible();
  await expect(issues.locator(`tr[data-problem=missing]:has-text("${MISSING_KEY}") a`)).toHaveAttribute("href", `/admin/products/${ids.c}`);

  await page.goto(`/admin/media?only=${TAG}`);
  await page.click("#regenMissing" + V);
  await expect(page.locator("#regenStatus" + V)).toContainText("เสร็จแล้ว", { timeout: 150_000 });
  expect(existsSync(join(UP, `products/e2e/${TAG}-b-w1280.webp`))).toBe(true);
  expect(existsSync(join(UP, `products/e2e/${TAG}-b-w320.avif`))).toBe(true);
  await page.goto(`/admin/media?scan=1&only=${TAG}`);
  await expect(page.locator(`#mediaIssues tr[data-problem=no-variants]:has-text("${TAG}-b.webp")` + V)).toHaveCount(0);

  await page.click('button:has-text("เอารูปสินค้าที่หายออก")' + V);
  await page.click('.dlg button:has-text("เอาออก")' + V);
  await expect(page.locator(".ok-box" + V)).toContainText("เอารูปที่หายออกจากสินค้าแล้ว");
  expect((await one<{ images: string[] }>(`SELECT images FROM "Product" WHERE id=$1`, [ids.c])).images).toEqual([]);
});

test("หน้าหลังบ้านใหม่บนมือถือ 390px ไม่มีเลื่อนแนวนอน + ไม่มี error", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 }, locale: "th-TH" });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await login(page);
  for (const url of ["/admin/purchase-orders", `/admin/purchase-orders/${ids.po}`, "/admin/purchase-orders/costs", "/admin/reports/profit", "/admin/customers", "/admin/tasks", "/admin/notifications", "/admin/backups", "/admin/data-requests", "/admin/media", "/admin/log"]) {
    await page.goto(url);
    await expect(page.locator("main" + V)).toBeVisible();
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, url).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
  await ctx.close();
});
