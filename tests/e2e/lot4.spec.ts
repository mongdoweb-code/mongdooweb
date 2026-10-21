// รอบ 2 ล็อต 4: คำขอ → ใบเสนอราคา, สิทธิ์ STAFF, ผู้ใช้ใหม่ต้องเปลี่ยนรหัส, อุปกรณ์ที่เข้าสู่ระบบ, 2FA + รหัสสำรอง,
// บันทึก CSV, สำรองข้อมูล ZIP, Page CMS + ย้อนเวอร์ชัน, FAQ, ตรวจรหัส GA4, ตัวอย่าง QR พร้อมเพย์, สถานะระบบ,
// ลูกค้า CSV + รวมรายการซ้ำ, หลังบ้านบนมือถือ 390px ไม่มีเลื่อนแนวนอน
import "dotenv/config";
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import { ADMIN_PASS, ADMIN_USER, V, confirmClick, login, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL?.replace(/\?schema=\w+$/, "") });
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows[0] as T;
const rid = () => randomBytes(6).toString("hex");
const TAG = `e2e${Date.now().toString(36)}`;
const SHOTS = process.env.E2E_SHOTS ?? "test-results/lot4-shots";

// ---------- TOTP แบบอิสระจากโค้ดของแอป (RFC 6238) ----------
function b32decode(s: string) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of s.replace(/\s/g, "").toUpperCase()) {
    val = (val << 5) | abc.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(secret: string, offsetSteps = 0) {
  const step = Math.floor(Date.now() / 30000) + offsetSteps;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}

// ---------- อ่านไฟล์ ZIP (central directory) ----------
function unzip(buf: Buffer) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const n = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const files: Record<string, Buffer> = {};
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const off = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    const lstart = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(lstart, lstart + csize);
    files[name] = method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    p += 46 + nlen + elen + clen;
  }
  return files;
}

async function loginAs(page: Page, username: string, password: string) {
  await page.goto("/admin/login");
  await page.fill("#u" + V, username);
  await page.fill("#pw" + V, password);
  await page.click(".login-card button[type=submit]" + V);
}

async function newCtx(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok" });
  return { ctx, page: await ctx.newPage() };
}

const staff = { username: `${TAG}-staff`, password: "", id: "" };
const NEW_PW = `Lamp-Pool-${rid()}-ok`;
let quoteId = "";

test.beforeAll(async () => {
  await db.query(`DELETE FROM "LoginThrottle"`);
});

test.afterAll(async () => {
  await db.query(`DELETE FROM "Admin" WHERE username LIKE $1`, [`${TAG}%`]);
  await db.query(`DELETE FROM "Inquiry" WHERE name LIKE $1`, [`${TAG}%`]);
  await db.query(`DELETE FROM "LoginThrottle"`);
  await db.end();
});

test("A16 คำขอจากลูกค้า: badge, สถานะ, โน้ต, สร้างใบเสนอราคา", async ({ page }) => {
  const errors = trackErrors(page);
  const prod = await one<{ slug: string; name: string; priceSatang: number; sku: string }>(`SELECT slug, name, "priceSatang", sku FROM "Product" WHERE "priceSatang" > 0 AND "isActive" ORDER BY sku LIMIT 1`);
  const phone = `08${String(Date.now()).slice(-8)}`;
  const id = `inq${rid()}`;
  await db.query(
    `INSERT INTO "Inquiry" (id, kind, status, name, phone, email, company, message, items, attachments, "updatedAt") VALUES ($1,'QUOTE','NEW',$2,$3,'buyer@example.com',$4,$5,$6,'[]',now())`,
    [id, `${TAG} คุณทดสอบ`, phone, `${TAG} บริษัท`, "ขอราคาไฟสระ 2 ชุด พร้อมติดตั้ง", JSON.stringify([{ slug: prod.slug, name: prod.name, qty: 2 }, { slug: "no-such-item", name: "ไฟพิเศษสั่งทำ", qty: 1 }])],
  );
  await login(page);
  await page.goto("/admin/inquiries");
  await expect(page.locator(`.nav-i[href="/admin/inquiries"] .badge${V}`)).toBeVisible();
  await page.click(`.inq-row a:has-text("${TAG} คุณทดสอบ")${V}`);
  await page.waitForURL(new RegExp(`/admin/inquiries/${id}`));
  await expect(page.locator("#inqStatus" + V)).toHaveText("ใหม่");
  await page.click(`.inq-st button:has-text("กำลังดำเนินการ")${V}`);
  await expect(page.locator("#inqStatus" + V)).toHaveText("กำลังดำเนินการ");
  await page.fill("#inqNote" + V, "โทรคุยแล้ว รอวัดพื้นที่");
  await page.click(`.inote button[type=submit]${V}`);
  await expect(page.locator(".ok-box" + V)).toContainText("บันทึกโน้ต");
  await page.click("#mkQuote" + V);
  await page.waitForURL(/\/admin\/docs\/QUOTATION\/[^/]+\/edit/);
  quoteId = page.url().split("/QUOTATION/")[1].split("/")[0];
  const inq = await one<{ quotationId: string; customerId: string }>(`SELECT "quotationId", "customerId" FROM "Inquiry" WHERE id=$1`, [id]);
  expect(inq.quotationId).toBe(quoteId);
  const doc = await one<{ status: string; type: string; sourceId: string | null; n: string; sub: number }>(
    `SELECT d.status, d.type, d."sourceId", (SELECT count(*) FROM "SalesDocumentItem" i WHERE i."documentId"=d.id) n, d."subtotalSatang" sub FROM "SalesDocument" d WHERE d.id=$1`, [quoteId]);
  expect(doc).toMatchObject({ status: "DRAFT", type: "QUOTATION", sourceId: null, n: "2" });
  expect(doc.sub).toBe(prod.priceSatang * 2);
  const cust = await one<{ phone: string; kind: string }>(`SELECT phone, kind FROM "Customer" WHERE id=$1`, [inq.customerId]);
  expect(cust).toMatchObject({ phone, kind: "COMPANY" });
  // กดซ้ำ = เปิดใบเดิม ไม่สร้างใหม่
  await page.goto(`/admin/inquiries/${id}`);
  await page.click("#mkQuote" + V);
  await page.waitForURL(new RegExp(`/QUOTATION/${quoteId}`));
  expect(errors).toEqual([]);
});

test("A18 ผู้ใช้ใหม่: รหัสชั่วคราว → บังคับเปลี่ยนรหัส (≥10 ตัว)", async ({ page, browser }) => {
  await login(page);
  await page.goto("/admin/users");
  await page.fill("#nu-u" + V, staff.username);
  await page.fill("#nu-n" + V, "พนักงานทดสอบ");
  await page.click(`#new-user button[type=submit]${V}`);
  const temp = page.locator("#new-user .temp-pw code" + V);
  await expect(temp).toBeVisible();
  staff.password = (await temp.innerText()).trim();
  staff.id = (await one<{ id: string; mustChangePassword: boolean }>(`SELECT id, "mustChangePassword" FROM "Admin" WHERE username=$1`, [staff.username])).id;

  const { ctx, page: s } = await newCtx(browser);
  await loginAs(s, staff.username, staff.password);
  await s.waitForURL(/\/admin\/account\?force=1/);
  await expect(s.locator(".warn-box" + V)).toContainText("ต้องตั้งรหัสผ่านใหม่");
  await expect(s.locator(".nav-i" + V)).toHaveCount(1);
  await s.goto("/admin/products");
  await expect(s).toHaveURL(/\/admin\/account\?force=1/);
  // รหัสสั้นเกินไปถูกปฏิเสธ
  await s.fill("#pw-cur" + V, staff.password);
  await s.fill("#pw-new" + V, "short1234");
  await s.fill("#pw-cf" + V, "short1234");
  await s.locator("#pw-new" + V).evaluate((el: HTMLInputElement) => el.removeAttribute("minlength"));
  await s.locator("#pw-cf" + V).evaluate((el: HTMLInputElement) => el.removeAttribute("minlength"));
  await s.click(`#password button[type=submit]${V}`);
  await expect(s.locator("#password .login-err" + V)).toContainText("10 ตัวอักษร");
  await s.fill("#pw-new" + V, NEW_PW);
  await s.fill("#pw-cf" + V, NEW_PW);
  await s.click(`#password button[type=submit]${V}`);
  await s.waitForURL(/\/admin\?pw=1/);
  staff.password = NEW_PW;
  expect((await one<{ m: boolean }>(`SELECT "mustChangePassword" m FROM "Admin" WHERE id=$1`, [staff.id])).m).toBe(false);
  await ctx.close();
});

test("A17 สิทธิ์ STAFF: เปิดหน้าของเจ้าของร้านไม่ได้ และเรียก action ตรงก็ถูกปฏิเสธ", async ({ page, browser }) => {
  // เจ้าของร้านบันทึกตั้งค่า แล้วเก็บคำขอ server action ไว้
  await login(page);
  await page.goto("/admin/settings");
  const mark = `OWNER-${rid()}`;
  await page.fill("#businessHours" + V, mark);
  const reqP = page.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
  await page.click(`.set-foot button[type=submit]${V}`);
  const req = await reqP;
  await expect(page.locator(".login-info" + V)).toContainText("บันทึกการตั้งค่าแล้ว");
  expect((await one<{ b: string }>(`SELECT "businessHours" b FROM "ShopSetting" WHERE id='shop'`)).b).toBe(mark);

  const { ctx, page: s } = await newCtx(browser);
  await loginAs(s, staff.username, staff.password);
  await s.waitForURL(/\/admin(\?|$)/);
  for (const path of ["/admin/settings", "/admin/users", "/admin/line", "/admin/system"]) {
    await s.goto(path);
    await expect(s, path).toHaveURL(/\/admin\?denied=1/);
  }
  await expect(s.locator(".toast-denied")).toBeVisible();
  await expect(s.locator(`.nav-i[href="/admin/settings"]`)).toHaveCount(0);
  for (const path of ["/admin/export.zip", "/admin/log.csv"]) expect((await s.request.get(path)).status(), path).toBe(403);

  // ส่งคำขอ action เดียวกันด้วย cookie ของพนักงาน (แก้ค่าเป็น HACKED) → ต้องไม่เปลี่ยนข้อมูล
  const h = req.headers();
  const body = (req.postDataBuffer() ?? Buffer.alloc(0)).toString("latin1").replace(mark, `HACKED-${rid()}`.slice(0, mark.length));
  await s.request.post(req.url(), {
    headers: { "next-action": h["next-action"], "content-type": h["content-type"], accept: h["accept"] ?? "text/x-component", "next-router-state-tree": h["next-router-state-tree"] ?? "" },
    data: Buffer.from(body, "latin1"),
    maxRedirects: 0,
  });
  expect((await one<{ b: string }>(`SELECT "businessHours" b FROM "ShopSetting" WHERE id='shop'`)).b).toBe(mark);
  expect((await one<{ n: string }>(`SELECT count(*) n FROM "AdminLog" WHERE type='DENIED' AND "adminId"=$1`, [staff.id])).n).not.toBe("0");
  await ctx.close();
});

test("A19 อุปกรณ์ที่เข้าสู่ระบบ: รายการ + ออกจากระบบทุกเครื่อง", async ({ page, browser }) => {
  await db.query(`DELETE FROM "AdminSession" WHERE "adminId"=$1`, [staff.id]);
  const { ctx, page: other } = await newCtx(browser);
  await loginAs(other, staff.username, staff.password);
  await other.waitForURL(/\/admin(\?|$)/);
  await loginAs(page, staff.username, staff.password);
  await page.waitForURL(/\/admin(\?|$)/);
  await page.goto("/admin/account");
  await expect(page.locator("#sessions tbody tr" + V)).toHaveCount(2);
  await expect(page.locator("#sessions .chip.new" + V)).toHaveText("เครื่องนี้");
  await confirmClick(page, `#sessions .panel-head button`, "ออกจากระบบทุกเครื่อง");
  await expect(page.locator(".ok-box" + V)).toContainText("1 เครื่อง");
  await expect(page.locator("#sessions tbody tr" + V)).toHaveCount(1);
  await other.goto("/admin/customers");
  await expect(other).toHaveURL(/\/admin\/login/);
  await ctx.close();

  // เจ้าของร้านเห็นอุปกรณ์ของทุกคน
  await page.context().clearCookies();
  await login(page);
  await page.goto("/admin/users");
  await expect(page.locator(`#sessions td.ses-user:has-text("${staff.username}")${V}`).first()).toBeVisible();
});

test("A20 ยืนยันตัวตน 2 ขั้น: เปิด → เข้าสู่ระบบด้วยรหัส → รหัสสำรองใช้ได้ครั้งเดียว → ปิด", async ({ page }) => {
  await loginAs(page, staff.username, staff.password);
  await page.waitForURL(/\/admin(\?|$)/);
  await page.goto("/admin/account");
  await page.click(`#twofa button:has-text("เริ่มตั้งค่า")${V}`);
  await expect(page.locator(".totp-qr img" + V)).toBeVisible();
  const secret = (await page.locator("#totpKey" + V).innerText()).replace(/\s/g, "");
  await page.fill("#totp-code" + V, "000000");
  await page.click(`.totp-verify button[type=submit]${V}`);
  await expect(page.locator(".totp-verify .login-err" + V)).toBeVisible();
  await page.fill("#totp-code" + V, totp(secret));
  await page.click(`.totp-verify button[type=submit]${V}`);
  await expect(page.locator(".bk-codes code" + V)).toHaveCount(8);
  const codes = await page.locator(".bk-codes code" + V).allInnerTexts();
  await expect(page.locator("#twofa .dst-ok" + V)).toBeVisible();

  // ออกจากระบบ → รหัสผ่าน → ถามรหัส 6 หลัก
  await page.click(".side-foot button" + V);
  await page.waitForURL(/\/admin\/login/);
  await loginAs(page, staff.username, staff.password);
  await expect(page.locator(".login-card h1" + V)).toHaveText("ยืนยันตัวตน 2 ขั้น");
  await page.fill("#otp" + V, totp(secret, 1)); // รหัสที่ใช้ตอนเปิดใช้ถูกใช้ไปแล้ว — ใช้รหัสช่วงถัดไป
  await page.click(".login-card button[type=submit]" + V);
  await page.waitForURL(/\/admin(\?|$)/);

  // รหัสสำรอง: ครั้งแรกผ่าน ครั้งที่สองไม่ผ่าน
  for (const attempt of [0, 1]) {
    await page.goto("/admin");
    if (attempt === 0) {
      await page.click(".side-foot button" + V);
      await page.waitForURL(/\/admin\/login/);
    }
    await loginAs(page, staff.username, staff.password);
    await page.fill("#otp" + V, codes[0]);
    await page.click(".login-card button[type=submit]" + V);
    if (attempt === 0) {
      await page.waitForURL(/\/admin\/account\?backup=7/);
      await expect(page.locator(".info-box" + V)).toContainText("เหลือรหัสสำรอง 7");
      await page.click(".side-foot button" + V);
      await page.waitForURL(/\/admin\/login/);
    } else {
      await expect(page.locator(".login-card .login-err" + V)).toContainText("รหัสยืนยันไม่ถูกต้อง");
    }
  }
  await page.fill("#otp" + V, codes[1]);
  await page.click(".login-card button[type=submit]" + V);
  await page.waitForURL(/\/admin\/account\?backup=6/);

  // ปิด 2FA (รหัสผ่าน + รหัสสำรอง)
  await page.click(`#twofa summary:has-text("ปิดการยืนยันตัวตน")${V}`);
  await page.fill("#ds-pw" + V, staff.password);
  await page.fill("#ds-code" + V, codes[2]);
  await page.click(`#twofa .btn-danger${V}`);
  await expect(page.locator("#twofa .dst-pend" + V)).toBeVisible();
  const row = await one<{ totpEnabled: boolean; totpSecret: string | null }>(`SELECT "totpEnabled", "totpSecret" FROM "Admin" WHERE id=$1`, [staff.id]);
  expect(row).toEqual({ totpEnabled: false, totpSecret: null });
});

test("A21 + A22 บันทึกการใช้งาน (กรอง + CSV) และสำรองข้อมูล ZIP", async ({ page }) => {
  await login(page);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  await page.goto(`/admin/log?tab=auth&user=${staff.id}&from=${today}&to=${today}`);
  await expect(page.locator(".log-tbl tbody tr" + V).first()).toBeVisible();
  for (const by of await page.locator(".log-tbl td.lg-by" + V).allInnerTexts()) expect(by).toBe("พนักงานทดสอบ");
  const csv = await page.request.get(`/admin/log.csv?tab=auth&user=${staff.id}&from=${today}`);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text).toContain("ยืนยันตัวตน 2 ขั้น");
  expect(text).toContain(staff.username);

  await page.goto("/admin/system");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dataExport" + V)]);
  expect(dl.suggestedFilename()).toMatch(/^mongdoweb-backup-\d{12}\.zip$/);
  const files = unzip(Buffer.from(await (await page.request.get("/admin/export.zip")).body()));
  for (const f of ["README.txt", "orders.csv", "customers.csv", "sales_documents.csv", "sales_document_items.csv", "products.csv", "inquiries.csv"]) expect(Object.keys(files), f).toContain(f);
  expect(files["products.csv"].toString("utf8")).toMatch(/^﻿"id","sku","slug"/);
  expect(files["admin_users.csv"].toString("utf8")).not.toContain("passwordHash");
  expect(files["sales_documents.csv"].toString("utf8")).toContain(quoteId);
  expect((await one<{ n: string }>(`SELECT count(*) n FROM "AdminLog" WHERE type='DATA_EXPORT' AND "createdAt" > now() - interval '5 minutes'`)).n).not.toBe("0");
});

test("A23 + A24 Page CMS (ตัวอย่างสด, เผยแพร่, ย้อนเวอร์ชัน) และ FAQ", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page);
  await page.goto("/admin/pages?p=about");
  const head = `หัวข้อทดสอบ ${rid()}`;
  await page.fill("#pgBody" + V, `## ${head}\n\nร้านของเรา **ขายไฟ LED** โทร {{phone}}\n\n- รายการหนึ่ง\n- [ลิงก์](https://example.com)\n\n<script>window.__x=1</script>[แย่](javascript:alert(1))`);
  await expect(page.locator("#pgPreview h2" + V)).toHaveText(head);
  await expect(page.locator("#pgPreview b" + V)).toHaveText("ขายไฟ LED");
  expect(await page.locator("#pgPreview script").count()).toBe(0);
  expect(await page.locator('#pgPreview a[href^="javascript"]').count()).toBe(0);
  await page.click(`.pg-edit .pubbar button[type=submit]${V}`);
  await page.waitForURL(/saved=1/);
  await expect(page.locator(".notice-stack .ok-box" + V)).toContainText("เผยแพร่แล้ว");
  await expect(page.locator("#pgLive h2" + V)).toHaveText(head);
  await expect(page.locator("#pgLive b" + V)).toHaveText("ขายไฟ LED");
  const shopPhone = (await one<{ phone: string }>(`SELECT phone FROM "ShopSetting" WHERE id='shop'`)).phone;
  await expect(page.locator("#pgLive" + V)).toContainText(shopPhone);
  // หน้าร้าน (ถ้าล็อต 2 เปลี่ยนหน้า /about ให้อ่านจาก getPage แล้ว)
  const pub = await page.request.get("/about");
  if (pub.status() === 200 && (await pub.text()).includes("หัวข้อทดสอบ")) expect(await pub.text()).toContain(head);

  // ย้อนเวอร์ชันก่อนหน้า → หัวข้อหายไป
  await confirmClick(page, "#pgVersions li:nth-child(2) button", "ย้อนเวอร์ชัน");
  await page.waitForURL(/rolled=1/);
  await expect(page.locator("#pgLive" + V)).not.toContainText(head);

  // FAQ: เพิ่ม → แสดงผล → ลบกลับ
  await page.goto("/admin/pages?p=faq");
  const before = await page.locator(".faq-item" + V).count();
  const q = `ไฟใต้น้ำกันน้ำได้ลึกแค่ไหน ${rid()}`;
  await page.click("#faqAdd" + V);
  await page.click(`.faq-edit .pubbar button[type=submit]${V}`);
  await expect(page.locator(".faq-edit .err-box" + V)).toContainText(`ข้อที่ ${before + 1}`);
  const item = page.locator(".faq-item" + V).last();
  await item.locator("input").fill(q);
  await item.locator("textarea").fill("มาตรฐาน IP68 ลึกได้ถึง 2 เมตร");
  if (before > 0) await item.locator(`button[aria-label^="เลื่อนข้อ"][aria-label$="ขึ้น"]`).click();
  await page.click(`.faq-edit .pubbar button[type=submit]${V}`);
  await expect(page.locator(".notice-stack .ok-box" + V)).toContainText(`${before + 1} ข้อ`);
  await expect(page.locator("#faqLive" + V)).toContainText(q);
  const faq = await one<{ faq: { q: string }[] }>(`SELECT faq FROM "ShopSetting" WHERE id='shop'`);
  expect(faq.faq.findIndex((x) => x.q === q)).toBe(before > 0 ? before - 1 : 0);
  const idx = await page.locator(".faq-item input" + V).evaluateAll((els, want) => els.findIndex((e) => (e as HTMLInputElement).value === want), q);
  expect(idx).toBeGreaterThanOrEqual(0);
  await page.locator(".faq-item" + V).nth(idx).locator("button.del").click();
  await page.click(`.faq-edit .pubbar button[type=submit]${V}`);
  await expect(page.locator("#faqLive" + V)).not.toContainText(q);
  expect(errors).toEqual([]);
});

test("A25–A28 ตั้งค่า: ตรวจรหัส GA4/Pixel, งานอัตโนมัติ, ตัวอย่าง QR พร้อมเพย์ และหน้าสถานะระบบ", async ({ page }) => {
  await login(page);
  await page.goto("/admin/settings");
  const orig = await one<{ ga4Id: string | null; autoCancelDays: number }>(`SELECT "ga4Id", "autoCancelDays" FROM "ShopSetting" WHERE id='shop'`);
  await page.fill("#ga4Id" + V, "UA-12345-1");
  await page.fill("#metaPixelId" + V, "12ab");
  await page.click(`.set-foot button[type=submit]${V}`);
  await expect(page.locator(".login-err" + V)).toContainText("GA4");
  await expect(page.locator(".login-err" + V)).toContainText("Meta Pixel");
  expect(await page.locator("#ga4Id" + V).evaluate((el) => getComputedStyle(el).borderColor)).toBe("rgb(192, 57, 43)");
  await page.fill("#ga4Id" + V, "G-ABC123XYZ9");
  await page.fill("#metaPixelId" + V, "");
  await page.fill("#autoCancelDays" + V, "3");
  await page.click(`.set-foot button[type=submit]${V}`);
  await expect(page.locator(".login-info" + V)).toContainText("บันทึกการตั้งค่าแล้ว");
  const s = await one<{ ga4Id: string; autoCancelDays: number }>(`SELECT "ga4Id", "autoCancelDays" FROM "ShopSetting" WHERE id='shop'`);
  expect(s).toEqual({ ga4Id: "G-ABC123XYZ9", autoCancelDays: 3 });
  await db.query(`UPDATE "ShopSetting" SET "ga4Id"=$1, "autoCancelDays"=$2 WHERE id='shop'`, [orig.ga4Id, orig.autoCancelDays]);

  // ตัวอย่าง QR พร้อมเพย์ (ไม่บันทึก)
  await page.goto("/admin/settings");
  await page.fill("#promptpayId" + V, "081-234-5678");
  await page.fill("#ppAmount" + V, "150.50");
  const img = page.locator("#ppQr" + V);
  await expect(img).toBeVisible();
  const payload = (await img.getAttribute("data-payload"))!;
  expect(payload).toContain("0066812345678");
  expect(payload).toContain("5406150.50");
  // ตรวจ CRC16-CCITT ท้าย payload
  let crc = 0xffff;
  const p = payload.slice(0, -4);
  for (let i = 0; i < p.length; i++) {
    crc ^= p.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  expect(payload.slice(-4)).toBe(crc.toString(16).toUpperCase().padStart(4, "0"));
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(100);

  await page.goto("/admin/system");
  await expect(page.locator("#sysDb b" + V)).toHaveText("ปกติ");
  await expect(page.locator("#sysCounts li" + V).first()).toBeVisible();
  await page.click(`button:has-text("ทดสอบเขียนไฟล์")${V}`);
  await expect(page.locator(".ok-box" + V)).toContainText("เขียนและอ่านไฟล์ทดสอบสำเร็จ");
});

test("A29 ลูกค้า: ส่งออก CSV และรวมรายการซ้ำโดยไม่หายข้อมูล", async ({ page }) => {
  await login(page);
  const csv = await page.request.get("/admin/customers/export.csv");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toMatch(/^﻿"รหัส","ประเภท","ชื่อ"/);

  const phone = `09${String(Date.now()).slice(-8)}`;
  const [src, dst] = [`c${rid()}`, `c${rid()}`];
  const [srcCode, dstCode] = [`T${rid().slice(0, 7)}`, `T${rid().slice(0, 7)}`];
  await db.query(`INSERT INTO "Customer" (id, code, kind, name, phone, email, "updatedAt") VALUES ($1,$2,'PERSON',$3,$4,'dup@example.com',now())`, [src, srcCode, `${TAG} ลูกค้าซ้ำ`, phone]);
  await db.query(`INSERT INTO "Customer" (id, code, kind, name, "updatedAt") VALUES ($1,$2,'PERSON',$3,now())`, [dst, dstCode, `${TAG} ลูกค้าหลัก`]);
  const doc = `d${rid()}`;
  await db.query(`INSERT INTO "SalesDocument" (id, type, "customerId", "customerSnapshot", "updatedAt") VALUES ($1,'QUOTATION',$2,'{}',now())`, [doc, src]);
  try {
    await page.goto(`/admin/customers/${src}`);
    await page.fill("#mergeTarget" + V, dstCode);
    await confirmClick(page, "#mergeBox button", "รวมลูกค้า");
    await page.waitForURL(new RegExp(`/admin/customers/${dst}\\?merged=`));
    await expect(page.locator(".ok-box" + V)).toContainText("ย้ายเอกสาร 1 ฉบับ");
    expect((await one<{ c: string }>(`SELECT "customerId" c FROM "SalesDocument" WHERE id=$1`, [doc])).c).toBe(dst);
    expect(await one(`SELECT id FROM "Customer" WHERE id=$1`, [src])).toBeUndefined();
    const merged = await one<{ phone: string; email: string; note: string }>(`SELECT phone, email, note FROM "Customer" WHERE id=$1`, [dst]);
    expect(merged.phone).toBe(phone);
    expect(merged.email).toBe("dup@example.com");
    expect(merged.note).toContain(srcCode);
  } finally {
    await db.query(`DELETE FROM "SalesDocument" WHERE id=$1`, [doc]);
    await db.query(`DELETE FROM "Customer" WHERE id IN ($1,$2)`, [src, dst]);
  }
});

test("A30 หลังบ้านบนมือถือ 390px: ทุกหน้าไม่มีเลื่อนแนวนอน", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  mkdirSync(SHOTS, { recursive: true });
  const inq = await one<{ id: string }>(`SELECT id FROM "Inquiry" ORDER BY "createdAt" DESC LIMIT 1`);
  const cust = await one<{ id: string }>(`SELECT id FROM "Customer" ORDER BY "createdAt" DESC LIMIT 1`);
  const prod = await one<{ id: string }>(`SELECT id FROM "Product" ORDER BY sku LIMIT 1`);
  const paths = [
    "/admin", "/admin?tab=ALL", "/admin/inquiries", inq && `/admin/inquiries/${inq.id}`, "/admin/products", prod && `/admin/products/${prod.id}`, "/admin/categories", "/admin/slides",
    "/admin/pages", "/admin/pages?p=faq", "/admin/docs/QUOTATION", "/admin/docs/INVOICE", "/admin/docs/RECEIPT", quoteId && `/admin/docs/QUOTATION/${quoteId}/edit`,
    "/admin/customers", cust && `/admin/customers/${cust.id}`, "/admin/customers/new", "/admin/log", "/admin/settings", "/admin/users", "/admin/line", "/admin/system", "/admin/account",
    "/admin/dashboard", "/admin/stock", "/admin/reports",
  ].filter(Boolean) as string[];
  const wide: string[] = [];
  for (const path of paths) {
    const res = await page.goto(path);
    if (res?.status() === 404) continue; // หน้าของล็อตอื่นที่ยังไม่มีใน branch นี้
    expect(res?.status(), path).toBe(200);
    await page.waitForLoadState("networkidle");
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > 390) wide.push(`${path} (${w}px)`);
    await page.screenshot({ path: `${SHOTS}/m-${path.replace(/[/?=&]+/g, "_")}.png`, fullPage: false });
  }
  expect(wide).toEqual([]);
  // เมนูเปิดเป็นลิ้นชักบนมือถือ
  await page.goto("/admin/customers");
  await page.click(".topbar .icon-btn" + V);
  await expect(page.locator("#side")).toHaveClass(/open/);
  const box = await page.locator(`.nav-i[href="/admin/customers"]`).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("เจ้าของร้านเดิมยังเข้าสู่ระบบได้ตามปกติ (ไม่ถูกบังคับเปลี่ยนรหัส)", async ({ page }) => {
  expect(ADMIN_USER).toBeTruthy();
  await loginAs(page, ADMIN_USER, ADMIN_PASS);
  await page.waitForURL(/\/admin(\?|$)/);
  await expect(page.locator(".kpi" + V).first()).toBeVisible();
});
