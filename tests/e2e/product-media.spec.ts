// หลังบ้าน › สินค้า: รูป (อัปโหลดทันที, ตั้งเป็นปก, จัดลำดับ, ลบ) + วิดีโอสินค้า (MP4 10–60 วินาที) → หน้าร้านแสดงวิดีโอ + Range 206
// สร้างสินค้าทดสอบ 1 รายการ (E2E-MEDIA-*) แล้วลบทิ้งตอนจบ — sortOrder สูง ไม่ขึ้นเป็นสินค้าแรกของแคตตาล็อก
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import pg from "pg";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });

const TAG = Date.now().toString(36);
const P = { id: `e2e-media-${TAG}`, sku: `E2E-MEDIA-${TAG}`, slug: `e2e-media-${TAG}`, name: `สินค้าทดสอบรูปและวิดีโอ ${TAG}` };
const PNG = readFileSync("tests/fixtures/slip.png");

async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const row = async () => (await q<{ images: string[]; videoKey: string | null; videoPosterKey: string | null; videoSeconds: number | null }>(
  `SELECT images, "videoKey", "videoPosterKey", "videoSeconds" FROM "Product" WHERE id = $1`, [P.id]))[0];
const tiles = (page: import("@playwright/test").Page) => page.locator("#productMedia .pm-tile" + V);
const save = async (page: import("@playwright/test").Page) => {
  const btn = page.locator('button[type=submit]:has-text("บันทึกสินค้า")' + V).first();
  await expect(btn).toBeEnabled();
  await btn.click();
};

test.beforeAll(async () => {
  const [cat] = await q<{ id: string }>(`SELECT id FROM "Category" ORDER BY "sortOrder" LIMIT 1`);
  await q(`INSERT INTO "Product" (id, sku, slug, name, "priceSatang", "inStock", "isActive", images, "categoryId", "sortOrder", "updatedAt") VALUES ($1,$2,$3,$4,12900,true,true,'{}',$5,960000,now())`, [
    P.id, P.sku, P.slug, P.name, cat.id,
  ]);
});
test.afterAll(async () => {
  await q(`DELETE FROM "Product" WHERE id = $1`, [P.id]);
});

test("อัปโหลดรูปทันที · ตั้งรูปที่ 3 เป็นปก · เลื่อน/ลบ → บันทึกแล้วลำดับตรงฐานข้อมูล", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  await expect(page.locator("#productMedia .pm-add" + V)).toContainText("(0/30)");
  // เลือก 3 รูปพร้อมกัน แล้วเพิ่มอีก 1 รูปภายหลัง (ต้องต่อท้าย ไม่แทนที่ของเดิม)
  await page.setInputFiles("#newImages", ["a", "b", "c"].map((n) => ({ name: `${n}.png`, mimeType: "image/png", buffer: PNG })));
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.locator("#productMedia .pm-progress" + V)).toHaveCount(0, { timeout: 20000 });
  await page.setInputFiles("#newImages", [{ name: "d.png", mimeType: "image/png", buffer: PNG }]);
  await expect(tiles(page)).toHaveCount(4);
  await expect(page.locator("#productMedia .pm-progress" + V)).toHaveCount(0, { timeout: 20000 });
  // ไฟล์ที่ไม่ใช่รูป → แจ้งเตือน ไม่เพิ่มช่อง
  await page.setInputFiles("#newImages", [{ name: "x.txt", mimeType: "text/plain", buffer: Buffer.from("hello") }]);
  await expect(page.locator("#productMedia [role=alert]" + V).first()).toBeVisible();
  await expect(tiles(page)).toHaveCount(4);

  const keys = await tiles(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-key")));
  expect(keys.every(Boolean)).toBe(true);
  expect(new Set(keys).size).toBe(4);
  // ป้าย "ปก" อยู่ที่รูปแรกเท่านั้น
  await expect(tiles(page).nth(0).locator(".pm-cover-tag")).toHaveText("ปก");
  await expect(page.locator("#productMedia .pm-cover-tag" + V)).toHaveCount(1);

  await page.getByRole("button", { name: "ตั้งรูปที่ 3 เป็นภาพปก" }).click();
  await expect(tiles(page).nth(0)).toHaveAttribute("data-key", keys[2]!);
  await expect(tiles(page).nth(0).locator(".pm-cover-tag")).toBeVisible();
  // เลื่อนรูปที่ 4 ไปก่อน 1 ช่อง แล้วลบรูปที่ 2
  await page.getByRole("button", { name: "เลื่อนรูปที่ 4 ไปก่อน" }).click();
  await page.getByRole("button", { name: "ลบรูปที่ 2" }).click();
  const want = [keys[2], keys[3], keys[1]];
  expect(await tiles(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-key")))).toEqual(want);

  await save(page);
  await expect.poll(async () => (await row()).images).toEqual(want);
  // โหลดหน้าใหม่: ลำดับและภาพปกยังอยู่
  await page.reload();
  expect(await tiles(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-key")))).toEqual(want);
  // บันทึกซ้ำโดยไม่แก้อะไร → รูปไม่ซ้ำ/ไม่เพิ่ม (บั๊กเดิม: รูปใหม่ถูกอัปโหลดซ้ำ)
  await save(page);
  await page.waitForTimeout(800);
  expect((await row()).images).toEqual(want);
});

test("วิดีโอ: สั้นกว่า 10 วินาทีถูกปฏิเสธ · 12 วินาทีอัปโหลดได้ + ภาพปกวิดีโอ → หน้าร้านเล่นได้ (Range 206) + JSON-LD", async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  await page.setInputFiles("#productVideo", "tests/fixtures/clip-5s.mp4");
  await expect(page.locator(".pm-video" + V).locator("xpath=..").getByRole("alert").first()).toContainText("10–60 วินาที", { timeout: 15000 });
  await expect(page.locator(".pm-vadd" + V)).toBeVisible();
  // server ก็ตรวจซ้ำ (กันเรียก API ตรง ๆ)
  const bad = await page.evaluate(async () => {
    const b = await (await fetch("/admin/products/upload", { method: "POST", body: (() => { const f = new FormData(); f.set("kind", "video"); f.set("file", new File([new Uint8Array([0, 0, 0, 8, 0x66, 0x72, 0x65, 0x65])], "x.mp4", { type: "video/mp4" })); return f; })() })).json();
    return b.error as string;
  });
  expect(bad).toBeTruthy();

  await page.setInputFiles("#productVideo", "tests/fixtures/clip-12s.mp4");
  await expect(page.locator(".pm-vinfo" + V)).toContainText("พร้อมใช้", { timeout: 20000 });
  await expect(page.locator(".pm-vinfo" + V)).toContainText("0:12");
  await save(page);
  await expect.poll(async () => (await row()).videoKey).toMatch(/^videos\/\d{4}\/\d{2}\/[a-z0-9]+\.mp4$/);
  const r = await row();
  expect(r.videoSeconds).toBe(12);

  // หน้าร้าน: สไลด์วิดีโอต่อจากภาพปก + รูปย่อมีปุ่มเล่น
  await page.goto(`/product/${P.slug}`);
  const thumbs = page.locator(".pdp-thumbs button" + V);
  await expect(thumbs).toHaveCount(4);
  await expect(thumbs.nth(1)).toHaveAttribute("aria-label", "ดูวิดีโอสินค้า");
  await expect(thumbs.nth(1).locator(".tv-time")).toHaveText("0:12");
  await thumbs.nth(1).click();
  const video = page.locator(".gal-video video" + V);
  await expect(video).toBeVisible();
  const src = await video.getAttribute("src");
  expect(src).toContain(r.videoKey!);
  // เล่นได้จริง (Chromium รองรับ VP9 ใน MP4 ของไฟล์ทดสอบ)
  await video.evaluate(async (v: HTMLVideoElement) => { v.muted = true; await v.play(); });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  // เลื่อนไปรูปถัดไป → วิดีโอหยุดเอง
  await page.getByRole("button", { name: "รูปถัดไป" }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

  // HTTP Range
  const full = await request.get(src!);
  expect(full.status()).toBe(200);
  expect(full.headers()["accept-ranges"]).toBe("bytes");
  const part = await request.get(src!, { headers: { Range: "bytes=0-99" } });
  expect(part.status()).toBe(206);
  expect(part.headers()["content-range"]).toMatch(/^bytes 0-99\/\d+$/);
  expect((await part.body()).length).toBe(100);
  expect((await request.get(src!, { headers: { Range: "bytes=99999999-" } })).status()).toBe(416);

  // JSON-LD VideoObject (ต้องมีภาพปก)
  const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
  const vo = ld.map((t) => JSON.parse(t)).flatMap((j) => (j["@graph"] ?? [j])).map((x) => x.subjectOf).find(Boolean);
  expect(vo?.["@type"]).toBe("VideoObject");
  expect(vo.duration).toBe("PT12S");
  expect(vo.contentUrl).toContain(r.videoKey);

  // ลบวิดีโอ → บันทึก → ฐานข้อมูลว่าง หน้าร้านไม่มีวิดีโอ
  await page.goto(`/admin/products/${P.id}`);
  await page.getByRole("button", { name: "ลบวิดีโอ" }).click();
  await save(page);
  await expect.poll(async () => (await row()).videoKey).toBeNull();
  await page.goto(`/product/${P.slug}`);
  await expect(page.locator(".gal-video" + V)).toHaveCount(0);
});

test("มือถือ: ปุ่ม 'ตั้งเป็นปก' เห็นได้โดยไม่ต้องชี้ และไม่มีแถบเลื่อนแนวนอน", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto(`/admin/products/${P.id}`);
  await expect(tiles(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "ตั้งรูปที่ 2 เป็นภาพปก" })).toBeVisible();
  await expect(page.getByRole("button", { name: "ตั้งรูปที่ 2 เป็นภาพปก" })).toHaveCSS("opacity", "1");
  // ปุ่ม ← → ✕ ต้องอยู่ในกรอบรูป (ไม่ถูกตัด) — ✕ คลิกได้
  const fit = await tiles(page).first().evaluate((e) => { const a = e.querySelector(".pm-acts") as HTMLElement; return a.scrollWidth <= a.clientWidth + 1; });
  expect(fit).toBe(true);
  const del = page.getByRole("button", { name: "ลบรูปที่ 1" });
  await del.scrollIntoViewIfNeeded();
  await expect(del).toBeInViewport({ ratio: 1 });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
});
