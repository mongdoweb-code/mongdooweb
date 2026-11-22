// หน้าวิดีโอ: หลังบ้านเพิ่มคลิปจากลิงก์ (YouTube / TikTok) + อัปโหลดจากเครื่อง → หน้า /videos (แท็บ/ตัวกรอง/ตัวเล่น/ลิงก์แชร์ ?v=)
// · นับยอดดู · หน้าสินค้าที่ผูก · ส่วนแนะนำหน้าแรก · ซ่อน/ลบ · สิทธิ์อัปโหลด
import { expect, test } from "@playwright/test";
import path from "node:path";
import pg from "pg";
import { V, confirmClick, login } from "./helpers";

test.describe.configure({ mode: "serial" });
// ยอดดูไม่นับบอต/เบราว์เซอร์อัตโนมัติ (HeadlessChrome) — เทสต์นี้ใช้ UA เบราว์เซอร์ปกติ
test.use({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" });
const TAG = Date.now().toString(36);
const PROD = { id: `e2e-vid-p-${TAG}`, sku: `E2E-VID-${TAG}`, slug: `e2e-vid-${TAG}`, name: `ไฟทดสอบวิดีโอ ${TAG}` };
const YT = { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=abc", id: "dQw4w9WgXcQ", title: `รีวิวไฟทดสอบ ${TAG}` };
const TT = { url: "https://www.tiktok.com/@mongdoweb/video/7301234567890123456", title: `TikTok ทดสอบ ${TAG}` };
const UP = { title: `คลิปร้านถ่ายเอง ${TAG}` };
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const vid = async (title: string) => (await q<{ id: string; views: number; fileKey: string | null; posterKey: string | null; isActive: boolean; vertical: boolean; productId: string | null }>(`SELECT id, views, "fileKey", "posterKey", "isActive", vertical, "productId" FROM "Video" WHERE title=$1`, [title]))[0];

test.beforeAll(async () => {
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" WHERE "isActive" ORDER BY "sortOrder" LIMIT 1`);
  await q(`INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "inStock", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,89000,true,'{}',$5,990000,now())`, [PROD.id, PROD.sku, PROD.slug, PROD.name, cat.id]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "Video" WHERE title LIKE $1`, [`%${TAG}%`]);
  await q(`DELETE FROM "Product" WHERE id=$1`, [PROD.id]);
});

test("หลังบ้าน: ลิงก์ผิด → แจ้ง · YouTube (ผูกสินค้า + แนะนำ) · TikTok · อัปโหลดคลิปจากเครื่อง", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/dashboard");
  await page.locator('#side a[href="/admin/videos"]').click();
  await expect(page).toHaveURL(/\/admin\/videos$/);
  const form = page.locator(".vd-add" + V);
  const url = form.getByPlaceholder(/วางลิงก์คลิป/);

  await url.fill("https://vt.tiktok.com/ZSabc/");
  await expect(form.locator(".vf-detect")).toContainText("ลิงก์เต็ม");
  await url.fill("https://www.youtube.com/@mongdoweb");
  await expect(form.locator(".vf-detect")).toContainText("ไม่ใช่ลิงก์คลิป");

  // YouTube
  await url.fill(YT.url);
  await expect(form.locator(".vf-detect")).toContainText("YouTube วิดีโอ");
  await expect(form.locator(".vf-detect")).toContainText("แนวนอน");
  await expect(form.locator(".vf-pv img")).toHaveAttribute("src", `https://i.ytimg.com/vi/${YT.id}/hqdefault.jpg`);
  await form.getByLabel(/^ชื่อคลิป/).fill(YT.title);
  await form.getByLabel(/^หัวข้อ/).fill("รีวิวสินค้า");
  await form.getByLabel(/ผูกกับสินค้า/).fill(`${PROD.sku} · ${PROD.name}`);
  await form.getByRole("checkbox", { name: /แนะนำ/ }).check();
  await form.getByRole("button", { name: "บันทึกคลิป" }).click();
  await page.waitForURL(/\/admin\/videos\?saved=1/);
  const yt = await vid(YT.title);
  expect(yt.productId).toBe(PROD.id);

  // TikTok (แนวตั้งอัตโนมัติ)
  await expect(page.locator(".vd-add" + V).getByLabel(/ผูกกับสินค้า/)).toHaveValue("");
  await expect(page.locator(".vd-add" + V).getByRole("checkbox", { name: /แนะนำ/ })).not.toBeChecked();
  await page.locator(".vd-add" + V).getByPlaceholder(/วางลิงก์คลิป/).fill(TT.url);
  await expect(page.locator(".vd-add .vf-detect" + V)).toContainText("แนวตั้ง");
  await page.locator(".vd-add" + V).getByLabel(/^ชื่อคลิป/).fill(TT.title);
  await page.locator(".vd-add" + V).getByLabel(/^หัวข้อ/).fill("ผลงานลูกค้า");
  await page.locator(".vd-add" + V).getByRole("button", { name: "บันทึกคลิป" }).click();
  await expect.poll(async () => (await vid(TT.title))?.vertical).toBe(true);
  // ฟอร์มล้างค่าหลังบันทึก: คลิปถัดไปไม่ติดสินค้า/แนะนำของคลิปก่อน
  expect((await vid(TT.title)).productId).toBeNull();

  // อัปโหลดจากเครื่อง (รูปปกจับจากเฟรมให้เอง)
  await page.goto("/admin/videos");
  const f2 = page.locator(".vd-add" + V);
  await f2.getByRole("radio", { name: "อัปโหลดจากมือถือ" }).click();
  await f2.locator("[data-video-file]").setInputFiles(path.join(__dirname, "../fixtures/clip-5s.mp4"));
  await expect(f2.locator(".vf-file")).toContainText("อัปโหลดคลิปแล้ว", { timeout: 30_000 });
  await expect(f2.locator(".vf-file")).toContainText("0:05");
  await expect(f2.locator(".vf-pv img")).toHaveAttribute("src", /\/media\/videos\/.+-sm\.webp/);
  await f2.getByLabel(/^ชื่อคลิป/).fill(UP.title);
  await f2.getByRole("button", { name: "บันทึกคลิป" }).click();
  await page.waitForURL(/\/admin\/videos\?saved=1/);
  const up = await vid(UP.title);
  expect(up.fileKey).toMatch(/^videos\/\d{4}\/\d{2}\/[a-z0-9]+\.mp4$/);
  expect(up.posterKey).toMatch(/\.webp$/);
  // ตารางมีครบ + ป้ายแหล่ง
  for (const t of [YT.title, TT.title, UP.title]) await expect(page.locator(`.vd-tbl tr:has-text("${t}")` + V)).toBeVisible();
});

test("หน้า /videos: แท็บ · ตัวกรอง · ตัวเล่น (YouTube ฝัง / ไฟล์ร้าน) · ลิงก์แชร์ ?v= · ยอดดู", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto("/videos");
  await expect(page.getByRole("heading", { name: "วิดีโอสินค้าและงานติดตั้ง", level: 1 })).toBeVisible();
  const card = (t: string) => page.locator(`.vg-card:has-text("${t}")`);
  await expect(card(YT.title)).toBeVisible();
  await expect(card(TT.title)).toBeVisible();
  // ยังไม่โหลดตัวเล่นของแพลตฟอร์มจนกว่าจะกด
  await expect(page.locator("iframe")).toHaveCount(0);
  // การ์ดผูกสินค้า
  await expect(card(YT.title).locator(".vg-prod")).toContainText("฿890");
  // แท็บแนวตั้ง
  await page.getByRole("tab", { name: /Shorts · Reels/ }).click();
  await expect(card(TT.title)).toBeVisible();
  await expect(card(YT.title)).toHaveCount(0);
  await expect(page).toHaveURL(/tab=v/);
  await page.getByRole("tab", { name: /ทั้งหมด/ }).click();
  // ตัวกรองหัวข้อ
  await page.locator(".vg-chip", { hasText: "ผลงานลูกค้า" }).click();
  await expect(card(TT.title)).toBeVisible();
  await expect(card(YT.title)).toHaveCount(0);
  await page.locator(".vg-chip", { hasText: "ทุกหัวข้อ" }).click();

  // เปิด YouTube → iframe nocookie + ปุ่มดูสินค้า · Esc ปิด
  await card(YT.title).locator(".vg-thumb").click();
  const dlg = page.getByRole("dialog", { name: YT.title });
  await expect(dlg.locator("iframe")).toHaveAttribute("src", new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${YT.id}\\?autoplay=1`));
  await expect(dlg.getByRole("link", { name: "ดูสินค้า / สั่งซื้อ" })).toHaveAttribute("href", `/product/${PROD.slug}`);
  await expect(dlg.getByRole("link", { name: /เปิดใน YouTube/ })).toHaveAttribute("href", `https://www.youtube.com/watch?v=${YT.id}`);
  await expect(page).toHaveURL(/[?&]v=/);
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect.poll(async () => (await vid(YT.title)).views).toBe(1);

  // คลิปที่ร้านอัปโหลด → <video> จาก /media (ส่งแบบ Range ได้)
  await card(UP.title).locator(".vg-thumb").click();
  const video = page.getByRole("dialog", { name: UP.title }).locator("video");
  await expect(video).toHaveAttribute("src", /^\/media\/videos\/.+\.mp4$/);
  const src = (await video.getAttribute("src"))!;
  const r = await page.request.get(src, { headers: { Range: "bytes=0-99" } });
  expect(r.status()).toBe(206);
  await page.keyboard.press("Escape");

  // ลิงก์แชร์ → เปิดคลิปนั้นทันที
  const tt = await vid(TT.title);
  await page.goto(`/videos?v=${tt.id}`);
  await expect(page.getByRole("dialog", { name: TT.title }).locator("iframe")).toHaveAttribute("src", /^https:\/\/www\.tiktok\.com\/player\/v1\/7301234567890123456/);
});

test("หน้าสินค้าที่ผูก + หน้าแรก (แนะนำ) · ซ่อนแล้วหายจากหน้าเว็บ · ลบคลิป + ไฟล์ · สิทธิ์อัปโหลด", async ({ page, browser }) => {
  await page.goto(`/product/${PROD.slug}`);
  const sec = page.locator(".pdp-videos");
  await expect(sec.getByRole("heading", { name: "วิดีโอสินค้า" })).toBeVisible();
  await expect(sec.locator(".vg-card")).toHaveCount(1);
  await expect(sec).toContainText(YT.title);
  await page.goto("/");
  await expect(page.locator('[data-home="videos"]')).toContainText(YT.title);

  // ซ่อน → หายจากหน้า /videos
  await login(page);
  await page.goto("/admin/videos");
  await page.locator(`.vd-tbl tr:has-text("${TT.title}") .vd-tg` + V).click();
  await expect.poll(async () => (await vid(TT.title)).isActive).toBe(false);
  await page.goto("/videos");
  await expect(page.locator(`.vg-card:has-text("${TT.title}")`)).toHaveCount(0);

  // ลบคลิปที่อัปโหลด → ไฟล์ถูกลบด้วย
  const up = await vid(UP.title);
  await page.goto("/admin/videos");
  await confirmClick(page, `.vd-tbl tr:has-text("${UP.title}") .ra-del`, "ลบคลิป");
  await page.waitForURL(/deleted=1/);
  expect(await vid(UP.title)).toBeUndefined();
  expect((await page.request.get(`/media/${up.fileKey}`, { headers: { Range: "bytes=0-9" } })).status()).toBe(404);

  // อัปโหลดต้องเข้าสู่ระบบ + มาจากเว็บเดียวกัน
  const anon = await browser.newContext();
  const a = await anon.request.post("/api/admin/videos/upload?kind=video", { data: Buffer.from("x"), headers: { "content-type": "video/mp4" } });
  expect(a.status()).not.toBe(200);
  await anon.close();
  const x = await page.request.post("/api/admin/videos/upload?kind=video", { data: Buffer.from("x"), headers: { "content-type": "video/mp4", origin: "https://evil.example" } });
  expect(x.status()).toBe(403);
});
