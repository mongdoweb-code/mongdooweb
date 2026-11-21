// ส่วน "ทำไมต้องมองดูเว็บ": แก้ข้อความ/จุดเด่น/รูป/คำบรรยาย/ลิงก์ในหลังบ้าน → หน้าแรกเปลี่ยนตาม · ตรวจค่าผิด · คืนค่าเดิม
import { expect, test } from "@playwright/test";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import sharp from "sharp";
import { V, login } from "./helpers";

test.describe.configure({ mode: "serial" });
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
let saved: unknown = {};
const cfg = async () => (await q<{ w: Record<string, unknown> }>(`SELECT "whyUs" w FROM "ShopSetting" WHERE id='shop'`))[0].w;
const IMG = path.join(os.tmpdir(), `mdw-why-${process.pid}.png`);
const TAG = Date.now().toString(36);

test.beforeAll(async () => {
  saved = await cfg();
  await q(`UPDATE "ShopSetting" SET "whyUs"='{}' WHERE id='shop'`);
  await sharp({ create: { width: 1200, height: 1500, channels: 3, background: "#1b3a5c" } }).png().toFile(IMG);
});
test.afterAll(async () => {
  await q(`UPDATE "ShopSetting" SET "whyUs"=$1 WHERE id='shop'`, [JSON.stringify(saved ?? {})]);
});

test("ค่าเริ่มต้น = ข้อความเดิม · เมนูหลังบ้านมีหน้านี้", async ({ page }) => {
  await page.goto("/");
  const sec = page.locator("#why");
  await expect(sec.locator(".eyebrow")).toHaveText("ทำไมต้องมองดูเว็บ");
  await expect(sec.locator(".feature-list > div")).toHaveCount(4);
  await login(page);
  await page.goto("/admin/home");
  await page.locator('nav a[href="/admin/home/why"]' + V).first().click();
  await expect(page).toHaveURL(/\/admin\/home\/why$/);
  await expect(page.getByRole("heading", { name: "ทำไมต้องมองดูเว็บ (หน้าแรก)" })).toBeVisible();
});

test("แก้ข้อความ + จุดเด่น + อัปโหลดรูป + ลิงก์ → หน้าแรกเปลี่ยนตาม", async ({ page }) => {
  await login(page);
  await page.goto("/admin/home/why");
  const root = page.locator(".wy" + V);
  // ตรวจค่าผิด: หัวข้อว่าง
  await root.getByLabel(/หัวข้อหลัก/).fill("");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(root.locator(".login-err")).toContainText("กรอกหัวข้อ");

  await root.getByLabel(/หัวข้อเล็ก/).fill(`จุดเด่น ${TAG}`);
  await root.getByLabel(/หัวข้อหลัก/).fill("ไฟคุณภาพ <งานน้ำ>\nติดตั้งง่าย");
  // แก้ข้อ 1 · ลบข้อ 4 · เพิ่มข้อใหม่ · เลื่อนขึ้น
  await root.getByLabel("หัวข้อจุดเด่นข้อที่ 1").fill(`รับประกัน 1 ปี ${TAG}`);
  await root.getByRole("button", { name: "ลบข้อที่ 4" }).click();
  await root.getByRole("button", { name: /\+ เพิ่มจุดเด่น/ }).click();
  await root.getByLabel("หัวข้อจุดเด่นข้อที่ 4").fill("ส่งไวทั่วไทย");
  await root.getByLabel("รายละเอียดข้อที่ 4").fill("แพ็กกันกระแทก ส่งภายใน 1–2 วัน");
  await root.getByRole("button", { name: "เลื่อนข้อที่ 4 ขึ้น" }).click();
  await expect(root.locator(".wy-pv-list > div").nth(2).locator("h4")).toHaveText("ส่งไวทั่วไทย");

  // รูป: ไฟล์ผิดชนิด → แจ้ง · รูปจริง → ตัวอย่างเปลี่ยน
  await root.locator(".wy-mode", { hasText: "อัปโหลดรูปเอง" }).click();
  await root.locator("input[data-why-file]").setInputFiles({ name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
  await expect(root.locator(".wy-err")).toContainText("JPG, PNG หรือ WEBP");
  await root.locator("input[data-why-file]").setInputFiles(IMG);
  await expect(root.locator(".wy-drop img")).toHaveAttribute("src", /^\/media\/why\/\d{4}\/\d{2}\/\w+-sm\.webp$/);
  await expect(root.locator(".wy-pv-visual img")).toHaveAttribute("src", /\/media\/why\//);
  await root.getByLabel(/ข้อความหลัก/).fill("สระพูลวิลล่า ภูเก็ต");
  await root.getByLabel(/ข้อความรอง/).fill("");
  // ลิงก์ผิด → ปุ่มบันทึกกดไม่ได้ · ลิงก์ถูก → บันทึก
  await root.getByLabel(/ลิงก์เมื่อกดรูป/).fill("javascript:alert(1)");
  await expect(page.getByRole("button", { name: "บันทึก", exact: true })).toBeDisabled();
  await root.getByLabel(/ลิงก์เมื่อกดรูป/).fill("/projects");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(root.locator(".ok-box")).toContainText("บันทึกแล้ว");
  const c = await cfg();
  expect(c.imageMode).toBe("upload");
  expect(String(c.imageKey)).toMatch(/^why\/\d{4}\/\d{2}\/\w+\.webp$/);
  expect((c.items as unknown[]).length).toBe(4);

  // หน้าแรก
  await page.goto("/");
  const sec = page.locator("#why");
  await expect(sec.locator(".eyebrow")).toHaveText(`จุดเด่น ${TAG}`);
  expect(await sec.locator("h2.sec-title").innerHTML()).toBe("ไฟคุณภาพ &lt;งานน้ำ&gt;<br>ติดตั้งง่าย");
  await expect(sec.locator(".feature-list > div")).toHaveCount(4);
  await expect(sec.locator(".feature-list > div").first().locator("h3")).toHaveText(`รับประกัน 1 ปี ${TAG}`);
  await expect(sec.locator(".feature-list > div").nth(2).locator(".num")).toHaveText("03");
  await expect(sec.locator(".feature-list > div").nth(2).locator("h3")).toHaveText("ส่งไวทั่วไทย");
  const vis = sec.locator("a.feature-visual.has-img");
  await expect(vis).toHaveAttribute("href", "/projects");
  await expect(vis.locator("img")).toHaveAttribute("src", /\/media\/why\//);
  await expect(vis.locator(".cap b")).toHaveText("สระพูลวิลล่า ภูเก็ต");
  await expect(vis.locator(".cap span")).toHaveCount(0);
  expect((await page.request.get((await vis.locator("img").getAttribute("src"))!)).ok()).toBe(true);
});

test("กล่องรูปโปร่งใส (PNG พื้นใส) + สีข้อความแต่ละช่อง → หน้าแรก (กลางวันใช้สีที่ตั้ง · กลางคืนใช้สีธีม) · รีเซ็ตสี", async ({ page, context }) => {
  const PNG = path.join(os.tmpdir(), `mdw-why-clear-${process.pid}.png`);
  await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><circle cx="200" cy="150" r="120" fill="#f26b38"/></svg>'), top: 150, left: 200 }])
    .png().toFile(PNG);
  await login(page);
  await page.goto("/admin/home/why");
  const root = page.locator(".wy" + V);
  // ตัวเลือกรูป 3 แบบอยู่แถวเดียวกัน
  const modes = root.locator(".wy-mode");
  await expect(modes).toHaveCount(3);
  const ys = await modes.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(ys).size).toBe(1);
  // ไม่ใช้รูป = สวิตช์โปร่งใสใช้ไม่ได้
  await root.locator(".wy-mode", { hasText: "ไม่ใช้รูป" }).click();
  await expect(root.locator("[data-why-clear]")).toBeDisabled();
  await root.locator(".wy-mode", { hasText: "อัปโหลดรูปเอง" }).click();
  await root.locator("[data-why-file]").setInputFiles(PNG);
  await expect(root.locator(".wy-drop img")).toBeVisible();
  await root.locator(".wy-switch").click();
  await expect(root.locator("[data-why-clear]")).toBeChecked();
  await expect(root.locator(".wy-pv-visual.is-clear")).toBeVisible();
  await expect(root.locator(".wy-drop.clear")).toBeVisible();
  // สี: หัวข้อหลัก = น้ำเงิน · เลขลำดับ = เขียว
  await root.locator('[data-color-key="title"]').click();
  await page.locator('.cp-pop[aria-label="สีหัวข้อหลัก"] .cp-sw[aria-label="น้ำเงิน"]').first().click();
  await root.locator('[data-color-key="num"]').click();
  await page.locator('.cp-pop[aria-label="สีเลขลำดับ"] .cp-sw[aria-label="เขียว"]').first().click();
  await expect(root.locator(".wy-pv-text h2")).toHaveCSS("color", "rgb(0, 0, 255)");
  await expect(root.locator('[data-color-key="title"]')).toHaveClass(/set/);
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(root.locator(".ok-box")).toContainText("บันทึกแล้ว");
  const c = await cfg();
  expect(c.clear).toBe(true);
  expect(c.colors).toEqual({ title: "#0000FF", num: "#00FF00" });

  await page.goto("/");
  const sec = page.locator("#why");
  const vis = sec.locator(".feature-visual.has-img.is-clear");
  await expect(vis).toBeVisible();
  await expect(vis).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(vis.locator("img")).toHaveCSS("object-fit", "contain");
  await expect(vis.locator(".cap")).toHaveCSS("position", "static");
  await expect(sec.locator("h2.sec-title")).toHaveCSS("color", "rgb(0, 0, 255)");
  await expect(sec.locator(".feature-list .num").first()).toHaveCSS("color", "rgb(0, 255, 0)");
  // ภาพที่เก็บยังมีพื้นใส (alpha)
  const buf = await (await page.request.get((await vis.locator("img").getAttribute("src"))!)).body();
  expect((await sharp(buf).metadata()).hasAlpha).toBe(true);
  // กลางคืน: ใช้สีของธีม (ไม่ใช่สีน้ำเงินที่ตั้ง)
  await context.addCookies([{ name: "mdw_theme", value: "dark", url: page.url() }]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("#why h2.sec-title")).not.toHaveCSS("color", "rgb(0, 0, 255)");
  await context.clearCookies({ name: "mdw_theme" });

  // รีเซ็ตสีหัวข้อหลัก → สีเดิมของธีม
  await page.goto("/admin/home/why");
  await root.locator('[data-color-key="title"]').click();
  await page.locator('.cp-pop[aria-label="สีหัวข้อหลัก"]').getByRole("button", { name: "สีเดิมของธีม" }).click();
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(root.locator(".ok-box")).toContainText("บันทึกแล้ว");
  expect((await cfg()).colors).toEqual({ num: "#00FF00" });
});

test("ไม่ใช้รูป → พื้นไล่สี · คืนค่าเดิม", async ({ page }) => {
  await login(page);
  await page.goto("/admin/home/why");
  const root = page.locator(".wy" + V);
  await root.locator(".wy-mode", { hasText: "ไม่ใช้รูป" }).click();
  await root.getByLabel(/ลิงก์เมื่อกดรูป/).fill("");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(root.locator(".ok-box")).toContainText("บันทึกแล้ว");
  await page.goto("/");
  await expect(page.locator("#why div.feature-visual")).toHaveCount(1);
  await expect(page.locator("#why .feature-visual img")).toHaveCount(0);

  await page.goto("/admin/home/why");
  page.once("dialog", (d) => d.accept());
  await page.locator(".wy" + V).getByRole("button", { name: "คืนค่าเดิม" }).click();
  await expect(page.locator(".wy" + V).locator(".ok-box")).toContainText("คืนค่า");
  expect(await cfg()).toEqual({});
  await page.goto("/");
  await expect(page.locator("#why .eyebrow")).toHaveText("ทำไมต้องมองดูเว็บ");
});

test("อัปโหลดต้องเข้าสู่ระบบ · ค่าปลอมในฐานข้อมูลไม่หลุดเป็น HTML", async ({ page, browser }) => {
  const anon = await browser.newContext();
  const r = await anon.request.post("/admin/home/why/upload", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") } } });
  expect(r.status()).not.toBe(200);
  await anon.close();
  await q(`UPDATE "ShopSetting" SET "whyUs"=$1 WHERE id='shop'`, [JSON.stringify({ title: "<script>x</script>", imageMode: "upload", imageKey: "https://evil/x.webp", href: "javascript:1", items: [{ title: "<img src=x onerror=1>" }] })]);
  // หน้าแก้ไขอ่านจากฐานข้อมูลตรง (หน้าร้านแคชไว้)
  await login(page);
  await page.goto("/admin/home/why");
  const root = page.locator(".wy" + V);
  await expect(root.getByLabel(/หัวข้อหลัก/)).toHaveValue("<script>x</script>");
  await expect(root.locator(".wy-mode.on")).toContainText("รูปผลงาน");
  await expect(root.getByLabel(/ลิงก์เมื่อกดรูป/)).toHaveValue("");
  await expect(root.locator(".wy-pv script, .wy-pv img[onerror]")).toHaveCount(0);
});
