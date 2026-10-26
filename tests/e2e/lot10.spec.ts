// รอบ 3 ล็อต 10: รีวิวผู้ซื้อจริง (U4/A4) · แจ้งเมื่อมีของ (U9/A7) · ผลงานติดตั้ง (U12/A9) · บทความ + ตั้งเวลา + URL เดิม (U13/A10)
// ค้นหาฉลาด: คำพ้อง/พิมพ์ผิด/บันทึกคำที่ไม่เจอ (U15/A11) · slug เปลี่ยน → 301 + redirect เอง + บันทึก 404 (A13/A14)
// LINE พร้อมบริบท + ร้านเปิด/ปิด (U27) · หน้าออฟไลน์ + แนบสลิปลองใหม่ + ตะกร้าไม่หาย (U29) · ความน่าเชื่อถือ + ลำดับหน้าแรก (U30/A30)
// ข้อมูลทดสอบสร้างในเทสต์ (SKU E2E-L10-*) และลบ/คืนค่าทั้งหมดตอนจบ — ผ่านได้ทั้งฐานข้อมูลใหม่ (seed) และสำเนาข้อมูลจริง
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import pg from "pg";
import sharp from "sharp";
import { V, login, todayBkk, trackErrors } from "./helpers";
import { refreshStorefront } from "./storefront-fixtures";

test.describe.configure({ mode: "serial" });

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL?.replace(/\?schema=\w+$/, "") });
const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query(sql, args)).rows as T[];
const one = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await q<T>(sql, args))[0];
const rid = () => randomBytes(4).toString("hex");
const fakeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const TAG = rid();
const WORD = "ลูมิน่าเทสต์";
const A = { id: `e2e-l10-a-${TAG}`, sku: `E2E-L10-REV-${TAG}`, slug: `e2e-l10-review-${TAG}`, name: `ไฟใต้น้ำ ${WORD} E2E ${TAG}` };
const B = { id: `e2e-l10-b-${TAG}`, sku: `E2E-L10-OOS-${TAG}`, slug: `e2e-l10-oos-${TAG}`, name: `สปอตไลท์หมดสต็อก E2E ${TAG}` };
const PHONE = `08${String(Date.now()).slice(-8)}`;
const ORDER_NO = `MDW-L10${TAG.toUpperCase()}`;
const ADDR = { name: "ทดสอบ ล็อตสิบ", addr: "99 หมู่ 1", sub: "บางกรวย", dist: "บางกรวย", prov: "นนทบุรี", zip: "11130" };
let orderId = "";
let saved: Record<string, unknown> = {};
let lineRecipient = "";
const created = { reviewIds: [] as string[], posts: [] as string[], projects: [] as string[], synonyms: [] as string[], orders: [] as string[], redirectsLike: [] as string[] };

const png = (color: string, w = 400, h = 300) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
const file = async (name: string, color: string) => ({ name, mimeType: "image/png", buffer: await png(color) });

async function newPage(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok", extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  return ctx.newPage();
}
async function admin(browser: Browser) {
  const p = await newPage(browser);
  await login(p);
  return p;
}
/** หน้าร้านแคชข้อมูล — รอจนเห็นค่าที่เปลี่ยน (สูงสุด ~15 วินาที) */
async function gotoUntil(page: Page, url: string, check: () => Promise<boolean>) {
  await expect.poll(async () => { await page.goto(url); return check(); }, { timeout: 20_000 }).toBe(true);
}

test.beforeAll(async ({ browser }) => {
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" WHERE "isActive" ORDER BY (slug = 'underwater-light') DESC, "sortOrder" LIMIT 1`);
  saved = (await one(`SELECT "homeSections", trust, "openingHours", "lineId" FROM "ShopSetting" WHERE id = 'shop'`))!;
  await q(`UPDATE "ShopSetting" SET "lineId" = '@mongdoweb' WHERE id = 'shop'`);
  await q(
    `INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "trackStock", stock, "inStock", "categoryId", "sortOrder", "updatedAt", keywords)
     VALUES ($1,$2,$3,$4,59000,false,0,true,$5,-5,now(),'e2e'), ($6,$7,$8,$9,30000,true,0,false,$5,-5,now(),'e2e')`,
    [A.id, A.sku, A.slug, A.name, cat.id, B.id, B.sku, B.slug, B.name],
  );
  orderId = `e2e-l10-o-${TAG}`;
  await q(
    `INSERT INTO "Order" (id, "orderNo", status, "customerName", phone, "addressLine", subdistrict, district, province, "postalCode", "subtotalSatang", "shippingMethod", "shippingName", "shippingSatang", "totalSatang", "paidAt", "updatedAt")
     VALUES ($1,$2,'PAID','สมหญิง ทดสอบรีวิว',$3,'1 ถนนทดสอบ','บางกรวย','บางกรวย','นนทบุรี','11130',59000,'std','ส่งธรรมดา',0,59000,now(),now())`,
    [orderId, ORDER_NO, PHONE],
  );
  await q(`INSERT INTO "OrderItem" (id, "orderId", "productId", "nameSnapshot", "priceSatang", qty) VALUES ($1,$2,$3,$4,59000,1)`, [`${orderId}-i`, orderId, A.id, A.name]);
  created.orders.push(orderId);
  if (process.env.LINE_MOCK_LOG) {
    lineRecipient = `e2e-l10-line-${TAG}`;
    await q(`INSERT INTO "LineRecipient" (id, kind, "lineId", name, enabled, "updatedAt") VALUES ($1,'USER',$2,'E2E lot10',true,now())`, [lineRecipient, `U${TAG}l10`]);
  }
  await refreshStorefront(browser);
});

test.afterAll(async ({ browser }) => {
  await q(`DELETE FROM "Review" WHERE "productId" IN ($1,$2)`, [A.id, B.id]);
  await q(`DELETE FROM "StockAlert" WHERE "productId" IN ($1,$2)`, [A.id, B.id]);
  for (const id of created.orders) await q(`DELETE FROM "Order" WHERE id = $1`, [id]).catch(() => {});
  await q(`DELETE FROM "Order" WHERE phone LIKE $1`, [`${PHONE.slice(0, 9)}%`]).catch(() => {});
  await q(`DELETE FROM "StockMovement" WHERE "productId" IN ($1,$2)`, [A.id, B.id]);
  await q(`DELETE FROM "Product" WHERE id IN ($1,$2)`, [A.id, B.id]).catch(() =>
    q(`UPDATE "Product" SET "isActive" = false, slug = slug || '-x${TAG}', sku = sku || '-x' WHERE id IN ($1,$2)`, [A.id, B.id]),
  );
  await q(`DELETE FROM "Post" WHERE slug LIKE $1`, [`e2e-l10-%${TAG}%`]);
  await q(`DELETE FROM "Project" WHERE slug LIKE $1`, [`e2e-l10-%${TAG}%`]);
  await q(`DELETE FROM "Redirect" WHERE "fromPath" LIKE $1 OR "toPath" LIKE $1`, [`%${TAG}%`]);
  await q(`DELETE FROM "NotFoundLog" WHERE path LIKE $1`, [`%${TAG}%`]);
  await q(`DELETE FROM "SearchSynonym" WHERE $1 = ANY(words)`, [WORD]);
  await q(`DELETE FROM "SearchLog" WHERE query LIKE $1`, [`%zzq${TAG}%`]);
  if (lineRecipient) await q(`DELETE FROM "LineRecipient" WHERE id = $1`, [lineRecipient]);
  await q(`UPDATE "ShopSetting" SET "homeSections" = $1, trust = $2, "openingHours" = $3, "lineId" = $4 WHERE id = 'shop'`, [
    JSON.stringify(saved.homeSections ?? []),
    JSON.stringify(saved.trust ?? {}),
    JSON.stringify(saved.openingHours ?? []),
    saved.lineId ?? null,
  ]);
  await refreshStorefront(browser);
  await db.end();
});

// ---------------------------------------------------------------------------
test("U4/A4 รีวิวจากผู้ซื้อจริง: ยืนยันเลขที่+เบอร์ → รออนุมัติ → อนุมัติ/ตอบ/ซ่อน + คะแนนเฉลี่ย + JSON-LD", async ({ browser, request }) => {
  const page = await newPage(browser);
  const errors = trackErrors(page);
  await page.goto(`/product/${A.slug}`);
  await expect(page.locator("#reviews")).toContainText("ยังไม่มีรีวิว");
  await page.click("button.l10-rv-open");
  const form = page.locator("form.l10-rv-form");
  // เบอร์ไม่ตรง → ไม่ผ่าน
  await form.locator("label:has(input[value='5'])").click();
  await form.locator("input[name=orderNo]").fill(ORDER_NO);
  await form.locator("input[name=phone]").fill("0899999999");
  await form.locator("textarea[name=body]").fill("แสงสวยมาก ติดตั้งง่าย กันน้ำดีจริง ใช้มาสองสัปดาห์");
  await page.waitForTimeout(2100); // กันบอท: ส่งเร็วเกินไปถูกข้าม
  await form.locator("button[type=submit]").click();
  await expect(form.locator(".l2-err")).toContainText("ไม่พบคำสั่งซื้อ");
  // ถูกต้อง + รูป 1 รูป
  await form.locator("input[name=phone]").fill(PHONE);
  await form.locator("input[type=file]").setInputFiles(await file("pool.png", "#2c7bd2"));
  await expect(form.locator(".l10-files li")).toHaveCount(1);
  await form.locator("button[type=submit]").click();
  await expect(page.locator(".l10-rv-done")).toContainText("ขอบคุณ");
  const r = await one<{ id: string; status: string; images: string[]; name: string }>(`SELECT id, status, images, name FROM "Review" WHERE "productId" = $1`, [A.id]);
  expect(r.status).toBe("PENDING");
  expect(r.name).toBe("สมหญิง ท.");
  expect(r.images[0]).toMatch(/^reviews\/.+\.webp$/);
  // รูปของรีวิวที่ยังไม่อนุมัติ: คนทั่วไปเปิดไม่ได้
  expect((await request.get(`/media/${r.images[0]}`)).status()).toBe(404);
  // ซ้ำ (คำสั่งซื้อ + สินค้าเดิม) → 409 · สินค้าที่ไม่ได้ซื้อ → 403
  const again = await request.post("/api/reviews", { headers: { "x-forwarded-for": fakeIp() }, multipart: { product: A.slug, orderNo: ORDER_NO, phone: PHONE, rating: "4", body: "รีวิวซ้ำอีกครั้งนะครับ" } });
  expect(again.status()).toBe(409);
  const other = await request.post("/api/reviews", { headers: { "x-forwarded-for": fakeIp() }, multipart: { product: B.slug, orderNo: ORDER_NO, phone: PHONE, rating: "4", body: "ไม่ได้ซื้อชิ้นนี้แต่อยากรีวิว" } });
  expect(other.status()).toBe(403);
  await page.goto(`/product/${A.slug}`);
  await expect(page.locator(".l10-rv-list")).toHaveCount(0);

  // หลังบ้าน: อนุมัติ → ตอบกลับ
  const ad = await admin(browser);
  await ad.goto("/admin/reviews");
  const row = ad.locator(`li[data-review="${r.id}"]`);
  await expect(row).toContainText(A.sku);
  await expect(row.locator("img")).toHaveCount(1);
  await row.locator("button:has-text('อนุมัติ')").click();
  await expect(ad.locator(".ok-box")).toContainText("อนุมัติแล้ว");
  const p1 = await one<{ ratingAvg: number; ratingCount: number }>(`SELECT "ratingAvg", "ratingCount" FROM "Product" WHERE id = $1`, [A.id]);
  expect(p1).toEqual({ ratingAvg: 5, ratingCount: 1 });
  await ad.goto("/admin/reviews?tab=APPROVED");
  await row.locator("summary").click();
  await row.locator("textarea[name=reply]").fill("ขอบคุณมากครับ ยินดีให้บริการ");
  await row.locator("button:has-text('บันทึกคำตอบ')").click();
  await expect(ad.locator(".ok-box")).toContainText("บันทึกคำตอบแล้ว");

  await page.goto(`/product/${A.slug}`);
  await expect(page.locator(".l10-rv")).toHaveCount(1);
  await expect(page.locator(".l10-rv")).toContainText("แสงสวยมาก");
  await expect(page.locator(".l10-rv-reply")).toContainText("ขอบคุณมากครับ");
  await expect(page.locator(".l10-rv-avg b")).toHaveText("5.0");
  expect((await request.get(`/media/${r.images[0]}`)).status()).toBe(200);
  const ld = await page.locator("script[type='application/ld+json']").allTextContents();
  const rating = ld.map((t) => JSON.parse(t)).find((j) => j.aggregateRating);
  expect(rating.aggregateRating).toMatchObject({ "@type": "AggregateRating", ratingValue: "5.0", reviewCount: 1 });
  expect(rating["@id"]).toMatch(new RegExp(`/product/${A.slug}#product$`));
  expect(rating.review[0].reviewRating.ratingValue).toBe(5);

  // ซ่อน → หายจากหน้าร้าน + คะแนนกลับเป็น 0
  await ad.goto("/admin/reviews?tab=APPROVED");
  await ad.locator(`li[data-review="${r.id}"] button:has-text('ซ่อน')`).click();
  await expect(ad.locator(".ok-box")).toContainText("ซ่อนรีวิวแล้ว");
  expect(await one(`SELECT "ratingAvg", "ratingCount" FROM "Product" WHERE id = $1`, [A.id])).toEqual({ ratingAvg: null, ratingCount: 0 });
  await page.goto(`/product/${A.slug}`);
  await expect(page.locator(".l10-rv")).toHaveCount(0);
  expect(ld.length).toBeGreaterThan(0);
  // อนุมัติกลับไว้ใช้ในส่วนความน่าเชื่อถือ (U30)
  await ad.goto("/admin/reviews?tab=HIDDEN");
  await ad.locator(`li[data-review="${r.id}"] button:has-text('อนุมัติ')`).click();
  await expect(ad.locator(".ok-box")).toContainText("อนุมัติแล้ว");
  expect(errors).toEqual([]);
  await ad.context().close();
  await page.context().close();
});

test("U9/A7 แจ้งเมื่อมีของ: ฝากเบอร์ → หลังบ้านเห็นตามสินค้า + CSV → เติมสต็อก → แจ้ง LINE ร้าน → ทำเครื่องหมายแจ้งแล้ว", async ({ browser }) => {
  const page = await newPage(browser);
  await page.goto(`/product/${B.slug}`);
  await page.click("button.l10-sa-btn");
  const form = page.locator("form.l10-sa-form");
  await page.waitForTimeout(1600);
  await form.locator("button[type=submit]").click();
  await expect(form.locator(".l2-err")).toContainText("อย่างน้อย 1 ช่อง");
  await form.locator("input[name=phone]").fill("081-234-5678");
  await form.locator("input[name=lineId]").fill("@lot10tester");
  await form.locator("button[type=submit]").click();
  await expect(page.locator(".l10-sa-ok")).toContainText("ติดต่อกลับทันทีที่สินค้าเข้า");
  const a = await one<{ phone: string; lineId: string }>(`SELECT phone, "lineId" FROM "StockAlert" WHERE "productId" = $1`, [B.id]);
  expect(a).toEqual({ phone: "0812345678", lineId: "@lot10tester" });
  // สินค้าที่มีของ → ฝากไม่ได้
  const r = await page.request.post("/api/stock-alerts", { data: { product: A.slug, phone: "0812345678" } });
  expect(r.status()).toBe(409);

  const ad = await admin(browser);
  await ad.goto("/admin/stock-alerts");
  const grp = ad.locator(`[data-product="${B.sku}"]`);
  await expect(grp).toContainText("081-234-5678");
  await expect(grp).toContainText("ยังหมด");
  const [dl] = await Promise.all([ad.waitForEvent("download"), ad.click("a:has-text('ส่งออก CSV')")]);
  const csv = readFileSync((await dl.path())!, "utf8");
  expect(csv).toContain(B.sku);
  expect(csv).toContain("0812345678");

  // เติมสต็อกจาก 0 → 5 ผ่านหน้าแก้ไขสินค้า (setStock) → LINE ร้าน
  const logBefore = process.env.LINE_MOCK_LOG && existsSync(process.env.LINE_MOCK_LOG) ? readFileSync(process.env.LINE_MOCK_LOG, "utf8").length : 0;
  await ad.goto(`/admin/products/${B.id}`);
  await ad.fill("#stock" + V, "5");
  await ad.click("button[type=submit]:has-text('บันทึกสินค้า')" + V);
  await expect(ad.locator(".login-info[role=status]" + V).first()).toBeVisible();
  expect((await one<{ stock: number }>(`SELECT stock FROM "Product" WHERE id = $1`, [B.id])).stock).toBe(5);
  if (process.env.LINE_MOCK_LOG) {
    await expect
      .poll(() => (existsSync(process.env.LINE_MOCK_LOG!) ? readFileSync(process.env.LINE_MOCK_LOG!, "utf8").slice(logBefore) : ""), { timeout: 15_000 })
      .toMatch(new RegExp(`กลับมามีของ[^\\n]*${B.sku}[^\\n]*ลูกค้ารอ 1 คน`));
  }
  await ad.goto("/admin/stock-alerts");
  await expect(grp).toContainText("มีของแล้ว");
  await grp.locator("button:has-text('แจ้งแล้วทั้งหมด')").click();
  await expect(ad.locator(".ok-box")).toContainText("แจ้งแล้ว");
  await expect(ad.locator(`[data-product="${B.sku}"]`)).toHaveCount(0);
  await ad.goto("/admin/stock-alerts?tab=done");
  await expect(ad.locator(`[data-product="${B.sku}"]`)).toContainText("081-234-5678");
  expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "StockAlert" WHERE "productId" = $1 AND "notifiedAt" IS NOT NULL`, [B.id])).n).toBe(1);
  await ad.context().close();
  await page.context().close();
});

test("U12/A9 ผลงานติดตั้ง: เพิ่มในหลังบ้าน (รูป + สินค้าที่ใช้) → /projects แยกประเภท → หน้าผลงาน → ซ่อน = 404 · เปลี่ยน slug = 301", async ({ browser, request }) => {
  const ad = await admin(browser);
  const errors = trackErrors(ad);
  const slug = `e2e-l10-pool-${TAG}`;
  await ad.goto("/admin/projects/new");
  await ad.fill("#title", `สระวิลล่าทดสอบ ${TAG}`);
  await ad.fill("#slug", slug);
  await ad.fill("#kind", `สระทดสอบ${TAG}`);
  await ad.fill("#location", "หัวหิน");
  await ad.fill("#summary", "ไฟใต้น้ำ RGB 8 ดวง รอบสระวิลล่า");
  await ad.fill("#body", "## งานนี้ทำอะไร\n- ไฟใต้น้ำ 8 ดวง\n- **ควบคุมด้วยรีโมท**");
  await ad.setInputFiles("#newImages", [await file("a.png", "#114477"), await file("b.png", "#447711")]);
  await ad.fill("#products", A.sku);
  await ad.click("#saveProject");
  await ad.waitForURL(/\/admin\/projects\/[^/]+\?saved=1/);
  await expect(ad.locator(".login-info")).toContainText("เพิ่มผลงานแล้ว");
  const pr = await one<{ id: string; images: string[]; productIds: string[] }>(`SELECT id, images, "productIds" FROM "Project" WHERE slug = $1`, [slug]);
  expect(pr.images).toHaveLength(2);
  expect(pr.productIds).toEqual([A.id]);
  // ลบรูปที่ 2 แล้วบันทึก
  await ad.click("button[aria-label='ลบรูปที่ 2']");
  await ad.click("#saveProject");
  await expect(ad.locator(".login-info")).toContainText("บันทึกแล้ว");
  expect((await one<{ images: string[] }>(`SELECT images FROM "Project" WHERE id = $1`, [pr.id])).images).toEqual([pr.images[0]]);

  const page = await newPage(browser);
  await page.goto("/projects");
  await expect(page.locator(`.l10-card:has-text("สระวิลล่าทดสอบ ${TAG}")`)).toBeVisible();
  await page.goto(`/projects?kind=${encodeURIComponent(`สระทดสอบ${TAG}`)}`);
  await expect(page.locator(".l10-card")).toHaveCount(1);
  await page.click(`.l10-card-t a`);
  await expect(page).toHaveURL(new RegExp(`/projects/${slug}$`));
  await expect(page.locator("h1")).toContainText(`สระวิลล่าทดสอบ ${TAG}`);
  await expect(page.locator(".l10-prose h2")).toHaveText("งานนี้ทำอะไร");
  await expect(page.locator(`#prod-${A.slug}`)).toBeVisible();
  await expect(page.locator(".l10-gallery img")).toHaveCount(1);

  // เปลี่ยน slug → ลิงก์เดิม 301
  await ad.fill("#slug", `${slug}-v2`);
  await ad.click("#saveProject");
  await expect.poll(async () => (await one<{ slug: string }>(`SELECT slug FROM "Project" WHERE id = $1`, [pr.id])).slug).toBe(`${slug}-v2`);
  const old = await request.get(`/projects/${slug}`, { maxRedirects: 0 });
  expect(old.status()).toBe(301);
  expect(old.headers().location).toContain(`/projects/${slug}-v2`);
  // ซ่อน → 404 จริง
  await ad.uncheck("input[name=isPublished]");
  await ad.click("#saveProject");
  await expect(ad.locator(".login-info")).toContainText("ซ่อนอยู่");
  expect((await request.get(`/projects/${slug}-v2`)).status()).toBe(404);
  expect(errors).toEqual([]);
  // เปิดกลับไว้ให้หน้าแรก (U30)
  await ad.check("input[name=isPublished]");
  await ad.click("#saveProject");
  await expect.poll(async () => (await one<{ p: boolean }>(`SELECT "isPublished" p FROM "Project" WHERE id = $1`, [pr.id])).p).toBe(true);
  await ad.context().close();
  await page.context().close();
});

test("U13/A10 บทความ: เผยแพร่ + รูปปก + SEO + Article JSON-LD + สินค้าที่เกี่ยวข้อง · ตั้งเวลา = ซ่อนจนถึงเวลา · URL WordPress เดิม 301 · RSS · sitemap", async ({ browser, request }) => {
  const ad = await admin(browser);
  const errors = trackErrors(ad);
  const slug = `e2e-l10-guide-${TAG}`;
  const wpId = 900000 + Math.floor(Math.random() * 90000);
  await ad.goto("/admin/posts/new");
  await ad.fill("#title", `วิธีเลือกไฟสระ ${TAG}`);
  await expect(ad.locator("#slug")).not.toHaveValue("");
  await ad.fill("#slug", slug);
  await ad.fill("#excerpt", "สรุปวิธีเลือกไฟใต้น้ำให้เหมาะกับสระ");
  await ad.fill("#body", "## เลือกวัตต์\nสระ 4×8 เมตรใช้ 6–8 ดวง\n\nดู [สินค้า](/products)");
  await ad.selectOption("#status", "PUBLISHED");
  await ad.fill("#seoTitle", `คู่มือไฟสระ ${TAG}`);
  await ad.fill("#tags", "ไฟสระว่ายน้ำ, คู่มือ");
  await ad.fill("#products", A.sku);
  await ad.fill("#wpId", String(wpId));
  await ad.fill("#legacyPath", `/2019/05/old-pool-guide-${TAG}/`);
  await ad.setInputFiles("#cover", await file("cover.png", "#0a5a8a"));
  await ad.setInputFiles("#bodyImages", await file("inline.png", "#8a5a0a"));
  await ad.click("#savePost");
  await ad.waitForURL(/\/admin\/posts\/[^/]+\?saved=1/);
  const post = await one<{ id: string; body: string; coverKey: string }>(`SELECT id, body, "coverKey" FROM "Post" WHERE slug = $1`, [slug]);
  expect(post.coverKey).toMatch(/^posts\//);
  expect(post.body).toMatch(/!\[\]\(\/media\/posts\/.+\.webp\)$/);

  const page = await newPage(browser);
  await page.goto("/blog");
  await expect(page.locator(`.l10-card:has-text("วิธีเลือกไฟสระ ${TAG}")`)).toBeVisible();
  await page.goto(`/blog/${slug}`);
  await expect(page).toHaveTitle(`คู่มือไฟสระ ${TAG} — มองดูเว็บ`);
  await expect(page.locator("h1")).toHaveText(`วิธีเลือกไฟสระ ${TAG}`);
  await expect(page.locator(".l10-prose figure img")).toHaveCount(1);
  await expect(page.locator(".l10-post-cover")).toBeVisible();
  await expect(page.locator(`#prod-${A.slug}`)).toBeVisible();
  expect(await page.locator("meta[name=description]").getAttribute("content")).toBe("สรุปวิธีเลือกไฟใต้น้ำให้เหมาะกับสระ");
  const art = (await page.locator("script[type='application/ld+json']").allTextContents()).map((t) => JSON.parse(t)).find((j) => j["@type"] === "Article");
  expect(art).toMatchObject({ headline: `วิธีเลือกไฟสระ ${TAG}`, keywords: "ไฟสระว่ายน้ำ, คู่มือ" });
  expect(art.image[0]).toMatch(/\/media\/posts\//);
  // URL เดิมของ WordPress
  const byId = await request.get(`/?p=${wpId}`, { maxRedirects: 0 });
  expect(byId.status()).toBe(301);
  const next = await request.get(byId.headers().location, { maxRedirects: 0 });
  expect(next.headers().location ?? byId.headers().location).toContain(`/blog/${slug}`);
  const byPath = await request.get(`/2019/05/old-pool-guide-${TAG}`, { maxRedirects: 0 });
  expect(byPath.status()).toBe(301);
  expect(byPath.headers().location).toContain(`/blog/${slug}`);
  expect(await (await request.get("/blog/rss.xml")).text()).toContain(`/blog/${slug}`);
  expect(await (await request.get("/sitemap.xml")).text()).toContain(`/blog/${slug}`);

  // ตั้งเวลาไว้อีก 2 วัน → ซ่อน (หน้ารวม + หน้าบทความ 404)
  const later = `e2e-l10-later-${TAG}`;
  await ad.goto("/admin/posts/new");
  await ad.fill("#title", `บทความตั้งเวลา ${TAG}`);
  await ad.fill("#slug", later);
  await ad.fill("#body", "เนื้อหาที่จะเผยแพร่ในอนาคต อย่างน้อยสิบตัวอักษร");
  await ad.selectOption("#status", "PUBLISHED");
  const future = new Date(Date.now() + 2 * 864e5 + 7 * 3600e3).toISOString().slice(0, 16);
  await ad.fill("#publishAt", future);
  await ad.click("#savePost");
  await ad.waitForURL(/\?saved=1/);
  await ad.goto("/admin/posts");
  await expect(ad.locator(`tr:has-text("บทความตั้งเวลา ${TAG}") .chip`)).toContainText("ตั้งเวลา");
  expect((await request.get(`/blog/${later}`)).status()).toBe(404);
  await page.goto("/blog");
  await expect(page.locator(`.l10-card:has-text("บทความตั้งเวลา ${TAG}")`)).toHaveCount(0);
  // เลื่อนเวลาเผยแพร่ให้ใกล้ขึ้น (อีก 8 วินาที) แล้วล้างแคชหน้าร้าน 1 ครั้ง → ยังซ่อนอยู่
  await q(`UPDATE "Post" SET "publishAt" = now() + interval '8 seconds' WHERE slug = $1`, [later]);
  await refreshStorefront(browser);
  const at = Date.now() + 8000;
  await page.goto("/blog");
  await expect(page.locator(`.l10-card:has-text("บทความตั้งเวลา ${TAG}")`)).toHaveCount(0);
  expect((await request.get(`/blog/${later}`)).status()).toBe(404);
  // ถึงเวลาแล้ว — ไม่มีใครกดอะไร ไม่มีการล้างแคช → ขึ้นเอง
  await new Promise((r) => setTimeout(r, Math.max(0, at - Date.now()) + 1000));
  expect((await request.get(`/blog/${later}`)).status()).toBe(200);
  await page.goto("/blog");
  await expect(page.locator(`.l10-card:has-text("บทความตั้งเวลา ${TAG}")`)).toBeVisible();
  // ร่าง = 404
  await ad.goto(`/admin/posts/${post.id}`);
  await ad.selectOption("#status", "DRAFT");
  await ad.click("#savePost");
  await expect(ad.locator(".login-info")).toContainText("ร่าง");
  expect((await request.get(`/blog/${slug}`)).status()).toBe(404);
  await ad.selectOption("#status", "PUBLISHED");
  await ad.click("#savePost");
  await expect(ad.locator(".login-info")).toContainText("แสดงบนหน้าเว็บแล้ว");
  expect(errors).toEqual([]);
  await ad.context().close();
  await page.context().close();
});

test("U15/A11 ค้นหา: คำพ้องไทย/อังกฤษ + พิมพ์ผิด + ค้นด่วน · บันทึกคำที่ไม่เจอ → เพิ่มคำพ้องจากรายงาน → ค้นเจอ", async ({ browser }) => {
  const page = await newPage(browser);
  // underwater (อังกฤษ) = ใต้น้ำ (คำพ้องเริ่มต้น)
  await page.goto(`/search?q=underwater ${encodeURIComponent(WORD)}`);
  await expect(page.locator(`#prod-${A.slug}`)).toBeVisible();
  // พิมพ์ผิด 1 ตัว (ตกไม้เอก) → ผลใกล้เคียง
  await page.goto(`/search?q=${encodeURIComponent("ลูมินาเทสต์")}`);
  await expect(page.locator(".srch-count")).toContainText("ใกล้เคียง");
  await expect(page.locator(`#prod-${A.slug}`)).toBeVisible();
  // ค้นด่วนที่หัวเว็บ: คำพ้อง + พิมพ์ผิด
  await page.click("#searchBtn");
  await page.fill("#q", "ลูมินาเทสต์");
  await expect(page.locator("#suggest .sg-opt").first()).toContainText(WORD);
  await expect(page.locator("#suggest .sg-approx")).toBeVisible();

  // คำที่ไม่เจอ → บันทึก (ไม่เก็บเบอร์โทร)
  const zq = `zzq${TAG}`;
  await page.goto(`/search?q=${zq}`);
  await expect(page.locator(".srch-empty-head")).toContainText("ไม่พบสินค้า");
  await page.goto(`/search?q=0812345678`);
  await expect.poll(async () => (await one<{ n: number }>(`SELECT count(*)::int n FROM "SearchLog" WHERE query = $1 AND results = 0`, [zq])).n).toBeGreaterThan(0);
  expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "SearchLog" WHERE query LIKE '%0812345678%'`)).n).toBe(0);

  const ad = await admin(browser);
  await ad.goto("/admin/search?range=7");
  const row = ad.locator(`tr[data-query="${zq}"]`);
  await expect(row).toBeVisible();
  await row.locator("input[name=to]").fill(WORD);
  await row.locator("button:has-text('เพิ่มคำพ้อง')").click();
  await expect(ad.locator(".ok-box")).toContainText(`${zq} = ${WORD}`);
  await expect(ad.locator(`#synList input[value*="${zq}"]`)).toHaveCount(1);
  await page.goto(`/search?q=${zq}`);
  await expect(page.locator(`#prod-${A.slug}`)).toBeVisible();
  await expect(page.locator(".srch-count")).toContainText("พบ");
  // แก้กลุ่มคำ (ต้องมี ≥ 2 คำ)
  const syn = ad.locator(`#synList li:has(input[value*="${zq}"])`);
  await syn.locator("input[name=words]").fill(zq);
  await syn.locator("button:has-text('บันทึก')").click();
  await expect(ad.locator(".l10-err")).toContainText("อย่างน้อย 2 คำ");
  await ad.context().close();
  await page.context().close();
});

test("A13/A14 เปลี่ยน slug สินค้า → 301 อัตโนมัติ (ย่อสาย) · redirect เอง (กัน loop) · บันทึก 404 → สร้าง redirect คลิกเดียว + นับครั้ง", async ({ browser, request }) => {
  const ad = await admin(browser);
  const s1 = `${A.slug}-v2`, s2 = `${A.slug}-v3`;
  for (const s of [s1, s2]) {
    await ad.goto(`/admin/products/${A.id}`);
    await ad.fill("#slug" + V, s);
    await ad.click("button[type=submit]:has-text('บันทึกสินค้า')" + V);
    await expect.poll(async () => (await one<{ slug: string }>(`SELECT slug FROM "Product" WHERE id = $1`, [A.id])).slug).toBe(s);
  }
  // ลิงก์เดิมทั้งสองอันชี้ไปลิงก์ล่าสุดตรงๆ (ไม่เด้งสองทอด)
  for (const s of [A.slug, s1]) {
    const r = await request.get(`/product/${s}`, { maxRedirects: 0 });
    expect(r.status(), s).toBe(301);
    expect(r.headers().location).toMatch(new RegExp(`/product/${s2}$`));
  }
  expect((await request.get(`/product/${s2}`)).status()).toBe(200);
  await expect.poll(async () => (await one<{ hits: number }>(`SELECT hits FROM "Redirect" WHERE "fromPath" = $1`, [`/product/${A.slug}`])).hits).toBeGreaterThan(0);
  // กลับไปใช้ slug เดิม → redirect ของ slug นั้นหายไป (หน้ามีอยู่จริงอีกครั้ง)
  await ad.goto(`/admin/products/${A.id}`);
  await ad.fill("#slug" + V, A.slug);
  await ad.click("button[type=submit]:has-text('บันทึกสินค้า')" + V);
  await expect.poll(async () => (await one<{ slug: string }>(`SELECT slug FROM "Product" WHERE id = $1`, [A.id])).slug).toBe(A.slug);
  await expect.poll(async () => (await one(`SELECT 1 FROM "Redirect" WHERE "fromPath" = $1`, [`/product/${A.slug}`])) ?? null).toBeNull();
  expect((await request.get(`/product/${A.slug}`, { maxRedirects: 0 })).status()).toBe(200);
  expect((await request.get(`/product/${s2}`, { maxRedirects: 0 })).headers().location).toMatch(new RegExp(`/product/${A.slug}$`));

  // redirect เอง + กัน loop + ตรวจรูปแบบ
  await ad.goto("/admin/redirects");
  await ad.fill("#rd-from", `/lot10-promo-${TAG}/`);
  await ad.fill("#rd-to", `/product/${A.slug}`);
  await ad.click("button:has-text('เพิ่ม redirect')");
  await expect(ad.locator(".ok-box")).toContainText(`/lot10-promo-${TAG} → /product/${A.slug}`);
  const promo = await request.get(`/lot10-promo-${TAG}`, { maxRedirects: 0 });
  expect(promo.status()).toBe(301);
  expect(promo.headers().location).toMatch(new RegExp(`/product/${A.slug}$`));
  await ad.fill("#rd-from", `/product/${A.slug}`);
  await ad.fill("#rd-to", `/lot10-promo-${TAG}`);
  await ad.click("button:has-text('เพิ่ม redirect')");
  await expect(ad.locator(".l10-err")).toContainText("วนซ้ำ");
  await ad.fill("#rd-from", "/admin/orders");
  await ad.fill("#rd-to", "/products");
  await ad.click("button:has-text('เพิ่ม redirect')");
  await expect(ad.locator(".l10-err")).toContainText("หน้าระบบ");
  await ad.fill("#rd-from", `/lot10-x-${TAG}`);
  await ad.fill("#rd-to", "javascript:alert(1)");
  await ad.click("button:has-text('เพิ่ม redirect')");
  await expect(ad.locator(".l10-err")).toContainText("ลิงก์ปลายทาง");

  // 404 → บันทึก (พร้อม referer) → สร้าง redirect คลิกเดียว
  const missing = `/lot10-old-page-${TAG}`;
  const nf = await request.get(missing, { headers: { referer: "https://www.google.com/search?q=secret" } });
  expect(nf.status()).toBe(404);
  await expect.poll(async () => (await one<{ hits: number; referer: string }>(`SELECT hits, referer FROM "NotFoundLog" WHERE path = $1`, [missing])) ?? null).toEqual({ hits: 1, referer: "https://www.google.com/search" });
  await ad.goto("/admin/redirects");
  const row = ad.locator(`tr[data-path="${missing}"]`);
  await expect(row).toContainText("google.com");
  await row.locator("input[name=to]").fill("/products");
  await row.locator("button:has-text('สร้าง redirect')").click();
  await expect(ad.locator(".ok-box")).toContainText(`${missing} → /products`);
  await expect(ad.locator(`tr[data-path="${missing}"]`)).toHaveCount(0);
  const now = await request.get(missing, { maxRedirects: 0 });
  expect(now.status()).toBe(301);
  expect((await one<{ source: string }>(`SELECT source FROM "Redirect" WHERE "fromPath" = $1`, [missing])).source).toBe("NOT_FOUND");
  // ไฟล์ static ไม่ผ่าน proxy / ไม่ถูกบันทึกเป็น 404
  await request.get(`/js/no-such-${TAG}.js`);
  await new Promise((r) => setTimeout(r, 500));
  expect(await one(`SELECT 1 FROM "NotFoundLog" WHERE path = $1`, [`/js/no-such-${TAG}.js`])).toBeUndefined();
  await ad.context().close();
});

test("U27 ปุ่ม LINE พร้อมบริบท (สินค้า/เลขคำสั่งซื้อ) + สถานะร้านเปิด/ปิดตามเวลาทำการ", async ({ browser }) => {
  const ad = await admin(browser);
  await ad.goto("/admin/home");
  const hours = ad.locator("#hoursForm");
  for (let d = 0; d < 7; d++) {
    await hours.locator(`input[name=on${d}]`).check();
    await hours.locator(`input[name=open${d}_1]`).fill("00:00");
    await hours.locator(`input[name=close${d}_1]`).fill("23:59");
  }
  await hours.locator("button[type=submit]").click();
  await expect(ad.locator(".ok-box")).toContainText("บันทึกเวลาทำการแล้ว");

  const page = await newPage(browser);
  await page.goto(`/product/${A.slug}`);
  const fl = page.locator(".float-line");
  await expect(fl.locator(".fl-st.on")).toHaveCount(1);
  await expect(fl).toHaveAttribute("aria-label", /ร้านเปิดอยู่/);
  const href = decodeURIComponent((await fl.getAttribute("href"))!);
  expect(href).toContain("https://line.me/R/oaMessage/@mongdoweb/?");
  expect(href).toContain(A.sku);
  expect(href).toContain(A.name);
  await page.goto("/contact");
  await expect(page.locator("[data-open-status]")).toHaveText(/^ร้านเปิดอยู่ · ปิด 23:59 น\.$/);
  // หน้าติดตาม: เลขที่คำสั่งซื้อ
  await page.goto(`/track?no=${ORDER_NO}`);
  await page.fill("#orderNo", ORDER_NO);
  await page.locator(".float-line").focus();
  expect(decodeURIComponent((await page.locator(".float-line").getAttribute("href"))!)).toContain(ORDER_NO);

  // ปิดทุกวัน ยกเว้นเที่ยงคืนนาทีเดียว → ปิดแล้ว · เปิดอีกครั้ง …
  await ad.goto("/admin/home");
  for (let d = 0; d < 7; d++) await hours.locator(`input[name=close${d}_1]`).fill("00:01");
  await hours.locator("button[type=submit]").click();
  await expect(ad.locator(".ok-box")).toContainText("บันทึกเวลาทำการแล้ว");
  await page.goto("/contact");
  await expect(page.locator("[data-open-status]")).toHaveText(/^ปิดแล้ว · เปิดอีกครั้ง(พรุ่งนี้|วันนี้) 00:00 น\.$/);
  await expect(page.locator(".float-line .fl-st.off")).toHaveCount(1);
  // เวลาผิด → ไม่บันทึก
  await ad.goto("/admin/home");
  await hours.locator("input[name=close1_1]").fill("00:00");
  await hours.locator("input[name=open1_1]").fill("10:00");
  await hours.locator("button[type=submit]").click();
  await expect(ad.locator(".l10-err")).toContainText("เวลาไม่ถูกต้อง");
  await ad.context().close();
  await page.context().close();
});

test("U29 เน็ตไม่ดี: หน้าออฟไลน์ (service worker ไม่เก็บหน้า/ข้อมูลส่วนตัว) · แนบสลิปลองใหม่เอง · ตะกร้าไม่หาย", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok", extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  // ตะกร้า
  await page.evaluate((slug) => localStorage.setItem("mdw_cart", JSON.stringify({ [slug]: 2 })), A.slug);
  await ctx.setOffline(true);
  await page.goto("/products").catch(() => {});
  await expect(page.locator("h1")).toHaveText("ไม่มีการเชื่อมต่ออินเทอร์เน็ต");
  await ctx.setOffline(false);
  await page.goto("/");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("mdw_cart") || "{}"))).toEqual({ [A.slug]: 2 });
  // แคชเก็บเฉพาะ offline.html + ไฟล์ static (ไม่มีหน้า HTML/หลังบ้าน/API)
  const keys = await page.evaluate(async () => {
    const out: string[] = [];
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(keys).toContain("/offline.html");
  expect(keys.every((k) => k === "/offline.html" || /^\/(_next\/static|js|img|icons)\//.test(k)), keys.join(",")).toBe(true);

  await ctx.close();

  // แนบสลิป (ปิด service worker ในบริบทนี้ เพื่อให้ page.route เห็นคำขอทุกครั้ง)
  const ctx2 = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "th-TH", timezoneId: "Asia/Bangkok", serviceWorkers: "block", extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  const pg2 = await ctx2.newPage();
  // ครั้งแรกเน็ตหลุด → ลองใหม่เองสำเร็จ / ครั้งแรกถึงเซิร์ฟเวอร์แต่คำตอบหาย → ครั้งต่อไปได้ 409 = ถือว่าสำเร็จ
  const slip = readFileSync("tests/fixtures/slip.png").toString("base64");
  for (const mode of ["abort", "lost"] as const) {
    const phone = `08${String(Date.now()).slice(-8)}`;
    const o = await pg2.request.post("/api/orders", { headers: { "x-forwarded-for": fakeIp() }, data: { items: { [A.slug]: 1 }, shipping: "std", address: { ...ADDR, phone } } });
    expect(o.status()).toBe(201);
    const { orderNo, totalSatang } = await o.json();
    created.orders.push((await one<{ id: string }>(`SELECT id FROM "Order" WHERE "orderNo" = $1`, [orderNo])).id);
    let calls = 0;
    await pg2.route(`**/api/orders/${orderNo}/slip`, async (route) => {
      calls++;
      if (calls > 1) return route.continue();
      if (mode === "abort") return route.abort("internetdisconnected");
      await route.fetch(); // ถึงเซิร์ฟเวอร์จริง แต่เบราว์เซอร์ไม่ได้รับคำตอบ
      return route.abort("connectionreset");
    });
    await pg2.goto("/checkout");
    await pg2.waitForFunction(() => typeof (window as unknown as { uploadWithProgress?: unknown }).uploadWithProgress === "function");
    const res = await pg2.evaluate(
      async ([no, ph, amt, b64, day]) => {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const fd = new FormData();
        fd.append("phone", ph);
        fd.append("slip", new File([bin], "slip.png", { type: "image/png" }));
        fd.append("paidAt", `${day}T00:00`);
        fd.append("amount", amt);
        // ฟังก์ชันส่งสลิปของหน้า checkout (public/js/checkout.js)
        return (window as unknown as { uploadWithProgress: (u: string, f: FormData, p: (n: number) => void) => Promise<{ ok: boolean }> }).uploadWithProgress(
          `/api/orders/${encodeURIComponent(no)}/slip`, fd, () => {},
        );
      },
      [orderNo, phone, String(totalSatang / 100), slip, todayBkk()] as const,
    );
    expect(res.ok, mode).toBe(true);
    expect(calls, mode).toBe(2);
    expect((await one<{ status: string }>(`SELECT status FROM "Order" WHERE "orderNo" = $1`, [orderNo])).status).toBe("PENDING_VERIFICATION");
    expect((await one<{ n: number }>(`SELECT count(*)::int n FROM "PaymentSlip" s JOIN "Order" o ON o.id = s."orderId" WHERE o."orderNo" = $1`, [orderNo])).n).toBe(1);
    await pg2.unroute(`**/api/orders/${orderNo}/slip`);
  }
  await ctx2.close();
});

test("U30/A30 ความน่าเชื่อถือหน้าแรก (คะแนนรีวิว โลโก้ ตัวเลข) + จัดลำดับ/ซ่อนส่วนของหน้าแรก", async ({ browser }) => {
  const ad = await admin(browser);
  const errors = trackErrors(ad);
  await ad.goto("/admin/home");
  const tf = ad.locator("#trustForm");
  await tf.locator("#trTitle").fill(`ลูกค้าไว้ใจเรา ${TAG}`);
  await tf.locator("input[name=statValue0]").fill("500+");
  await tf.locator("input[name=statLabel0]").fill("งานติดตั้งทั่วประเทศ");
  await tf.locator("input[name=showRating]").check();
  await tf.locator("#newLogos").setInputFiles([await file(`Acme Hotel ${TAG}.png`, "#333333")]);
  await tf.locator("button[type=submit]").click();
  await expect(ad.locator(".ok-box")).toContainText("บันทึกส่วนความน่าเชื่อถือแล้ว");
  // ลำดับ: ย้าย "ความน่าเชื่อถือ" ขึ้นไปอยู่ถัดจากสไลด์ และซ่อนตัวช่วยเลือกไฟ
  const order = ad.locator("#sectionsForm");
  for (let i = 0; i < 12; i++) {
    const up = order.locator("li[data-key=trust] button[aria-label^='เลื่อน'][aria-label$='ขึ้น']");
    const idx = await order.locator("li").evaluateAll((els) => els.findIndex((e) => e.getAttribute("data-key") === "trust"));
    if (idx <= 1) break;
    await up.click();
  }
  await order.locator("li[data-key=finder] input[type=checkbox]").uncheck();
  await expect(order.locator("li[data-key=slides] input[type=checkbox]")).toBeDisabled();
  await order.locator("button[type=submit]").click();
  await expect(ad.locator(".ok-box")).toContainText("บันทึกลำดับหน้าแรกแล้ว");

  const page = await newPage(browser);
  const perr = trackErrors(page);
  await page.goto("/");
  const keys = await page.locator("#main [data-home]").evaluateAll((els) => els.map((e) => e.getAttribute("data-home")));
  expect(keys.slice(0, 2)).toEqual(["slides", "trust"]);
  await expect(page.locator("[data-home=finder]")).toBeHidden();
  const trust = page.locator(".l10-trust");
  await expect(trust.locator("h2")).toHaveText(`ลูกค้าไว้ใจเรา ${TAG}`);
  await expect(trust.locator(".l10-stat")).toContainText("500+");
  await expect(trust.locator(`.l10-logos img[alt="Acme Hotel ${TAG}"]`)).toBeVisible();
  await expect(trust.locator(".l10-trust-rating")).toContainText("รีวิวผู้ซื้อจริง");
  // ผลงาน + บทความล่าสุดในหน้าแรก (จากเทสต์ก่อนหน้า)
  await expect(page.locator("[data-home=projects] .l10-card").first()).toBeVisible();
  await expect(page.locator("[data-home=posts] .l10-card").first()).toBeVisible();
  // สไลด์และสินค้าขายดียังทำงาน (home.js สร้าง element ได้แม้ลำดับส่วนเปลี่ยน)
  await expect(page.locator("#slides > *").first()).toBeAttached();
  await expect(page.locator("#prodGrid > *").first()).toBeAttached();
  // ลบโลโก้ → หายจากหน้าแรก
  await ad.goto("/admin/home");
  await ad.locator("#trustForm input[name=logoDel0]").check();
  await ad.locator("#trustForm button[type=submit]").click();
  await expect(ad.locator(".ok-box")).toContainText("บันทึกส่วนความน่าเชื่อถือแล้ว");
  await page.goto("/");
  await expect(page.locator(".l10-logos img")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(perr).toEqual([]);
  await ad.context().close();
  await page.context().close();
});

test("หน้าใหม่ของล็อต 10 ไม่มี error และหลังบ้านบนมือถือไม่เลื่อนแนวนอน", async ({ browser }) => {
  const ad = await admin(browser);
  await ad.setViewportSize({ width: 390, height: 844 });
  for (const url of ["/admin/reviews", "/admin/stock-alerts", "/admin/projects", "/admin/posts", "/admin/search", "/admin/redirects", "/admin/home", "/admin/posts/new", "/admin/projects/new"]) {
    const errs = trackErrors(ad);
    const r = await ad.goto(url);
    expect(r?.status(), url).toBe(200);
    expect(await ad.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), url).toBeLessThanOrEqual(1);
    expect(errs, url).toEqual([]);
  }
  await ad.context().close();
});
