// ติดตามใบเสนอราคา: ลูกค้าเปิดลิงก์ (นับเฉพาะคนจริง ไม่นับบอตพรีวิว LINE/Facebook) · นัดติดตาม + บันทึก · แท็บ ต้องติดตาม / ใกล้หมดอายุ
// · KPI · ไม่ตอบรับพร้อมเหตุผล · กลับเป็นรอตอบรับ (ล้างเหตุผล) · ข้อความส่ง LINE
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login, trackErrors } from "./helpers";

test.describe.configure({ mode: "serial" });
const TAG = Date.now().toString(36);
const CUST = `ลูกค้าติดตามใบเสนอราคา ${TAG}`;
async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}
const bkk = (n = 0) => new Date(Date.now() + 7 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
let id = "", docNo = "";
const row = async () => (await q<{ v: number; f: string | null; s: string; l: string | null }>(
  `SELECT "viewCount" v, to_char(("followUpAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') f, status s, "lostReason" l FROM "SalesDocument" WHERE id=$1`, [id]))[0];

test("ออกใบเสนอราคา → ลูกค้าเปิดลิงก์ (บอตพรีวิวไม่นับ) → หน้าเอกสารแสดงการเปิดดู + ข้อความส่ง LINE", async ({ page, playwright }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto("/admin/docs/QUOTATION/new/edit");
  await page.getByRole("button", { name: "+ ลูกค้าใหม่" }).click();
  await page.fill("#qcName" + V, CUST);
  await page.getByRole("button", { name: "บันทึกลูกค้าและเลือก" }).click();
  await expect(page.locator(".de-cust" + V)).toBeVisible();
  const l1 = page.locator(".de-line" + V).first();
  await l1.locator(".ac-wrap input").fill(`ชุดไฟสระ ${TAG}`);
  await l1.locator(".ln-nums input").nth(2).fill("4500");
  await page.click(`button:has-text("บันทึกและออกเอกสาร")${V}`);
  await page.waitForURL(/\/admin\/docs\/QUOTATION\/[^/?]+\?issued=1/);
  id = page.url().split("/").pop()!.split("?")[0];
  docNo = (await page.locator(".dv-title .num" + V).textContent())!.trim();

  const track = page.locator("#qtTrack" + V);
  await expect(track).toContainText("ลูกค้ายังไม่เปิดดูลิงก์");
  await expect(track).toContainText("ยืนราคาเหลือ");
  await expect(page.getByRole("button", { name: "คัดลอกข้อความส่ง LINE" })).toBeVisible();
  const url = await page.locator("#docLink input" + V).inputValue();
  const path = new URL(url).pathname + new URL(url).search;

  // บอตพรีวิวลิงก์ของ LINE / Facebook ไม่นับ
  const bot = await playwright.request.newContext({ baseURL: page.url().split("/admin")[0], userAgent: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" });
  expect((await bot.get(path)).status()).toBe(200);
  const line = await playwright.request.newContext({ baseURL: page.url().split("/admin")[0], userAgent: "Mozilla/5.0 (compatible; Line/14.0; LinePreview)" });
  expect((await line.get(path)).status()).toBe(200);
  await page.waitForTimeout(800);
  expect((await row()).v).toBe(0);
  // ลูกค้าจริง (เบราว์เซอร์มือถือ ไม่ได้ล็อกอินหลังบ้าน)
  const cust = await playwright.request.newContext({ baseURL: page.url().split("/admin")[0], userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" });
  expect((await cust.get(path)).status()).toBe(200);
  await expect.poll(async () => (await row()).v).toBe(1);
  // แอดมินกด "เปิดดู" เอง ไม่นับ
  await page.goto(path);
  await page.waitForTimeout(800);
  expect((await row()).v).toBe(1);
  await Promise.all([bot.dispose(), line.dispose(), cust.dispose()]);

  await page.goto(`/admin/docs/QUOTATION/${id}`);
  await expect(page.locator("#qtTrack" + V)).toContainText("ลูกค้าเปิดดูแล้ว 1 ครั้ง");
  await expect(page.locator(".timeline" + V)).toContainText("ลูกค้าเปิดดู — ลูกค้าเปิดดูครั้งแรก");
  expect(errors).toEqual([]);
});

test("นัดติดตาม + บันทึก → แท็บ ต้องติดตาม / ใกล้หมดอายุ + KPI + ป้ายในรายการ", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto(`/admin/docs/QUOTATION/${id}`);
  await page.fill("#fuNote" + V, "โทรคุยแล้ว ลูกค้าขอเทียบราคา");
  await page.getByRole("button", { name: "พรุ่งนี้" }).click();
  await expect.poll(async () => (await row()).f).toBe(bkk(1));
  await expect(page.locator("#qtTrack" + V)).toContainText("อีก 1 วัน");
  await expect(page.locator(".timeline" + V)).toContainText(`นัดติดตาม — นัดติดตาม ${bkk(1).split("-").reverse().join("/")} · โทรคุยแล้ว ลูกค้าขอเทียบราคา`);
  // ยังไม่ถึงนัด → ไม่อยู่แท็บต้องติดตาม
  await page.goto("/admin/docs/QUOTATION?tab=follow");
  await expect(page.locator(`tr:has-text("${docNo}")` + V)).toHaveCount(0);
  // เลื่อนนัดเป็นวันนี้ (เหมือนวันผ่านไป) + ยืนราคาเหลือ 2 วัน
  await q(`UPDATE "SalesDocument" SET "followUpAt"=$2::date - interval '7 hours', "validUntil"=$3::date - interval '7 hours' WHERE id=$1`, [id, bkk(0), bkk(2)]);
  await page.goto("/admin/docs/QUOTATION?tab=follow");
  const r = page.locator(`tr:has-text("${docNo}")` + V);
  await expect(r).toHaveCount(1);
  await expect(r.locator(".qt-chips")).toContainText("นัดวันนี้");
  await expect(r.locator(".qt-chips")).toContainText("เปิดดู 1 ครั้ง");
  await expect(r.locator(".qt-chips")).toContainText("เหลือ 2 วัน");
  await expect(page.locator(".kpi.hot" + V, { hasText: "ต้องติดตามวันนี้" })).toBeVisible();
  await page.goto("/admin/docs/QUOTATION?tab=expiring");
  await expect(page.locator(`tr:has-text("${docNo}")` + V)).toHaveCount(1);
  await expect(page.getByRole("tab", { name: /ต้องติดตาม/ })).toBeVisible();
  // ยกเลิกนัด
  await page.goto(`/admin/docs/QUOTATION/${id}`);
  await page.getByRole("button", { name: "ยกเลิกนัด" }).click();
  await expect.poll(async () => (await row()).f).toBeNull();
});

test("ลูกค้าไม่ตอบรับพร้อมเหตุผล → แสดงในหน้าเอกสาร/รายการ · กลับเป็นรอตอบรับแล้วเหตุผลถูกล้าง", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto(`/admin/docs/QUOTATION/${id}`);
  await page.locator("summary", { hasText: "ลูกค้าไม่ตอบรับ" }).click();
  await page.selectOption("#lostReason" + V, "ราคาสูงกว่าคู่แข่ง");
  await page.fill("#lostNote" + V, "คู่แข่งเสนอ ฿4,000");
  await page.getByRole("button", { name: "บันทึกว่าไม่ตอบรับ" }).click();
  await expect.poll(async () => (await row()).s).toBe("REJECTED");
  expect((await row()).l).toBe("ราคาสูงกว่าคู่แข่ง — คู่แข่งเสนอ ฿4,000");
  await expect(page.locator(".dv-kv" + V)).toContainText("เหตุผลที่ไม่ได้งานราคาสูงกว่าคู่แข่ง — คู่แข่งเสนอ ฿4,000");
  await page.goto("/admin/docs/QUOTATION?tab=rejected");
  await expect(page.locator(`tr:has-text("${docNo}") .qc.bad` + V)).toContainText("ราคาสูงกว่าคู่แข่ง");
  await page.goto(`/admin/docs/QUOTATION/${id}`);
  await page.getByRole("button", { name: "กลับเป็นรอตอบรับ" }).click();
  await expect.poll(async () => (await row()).s).toBe("ISSUED");
  expect((await row()).l).toBeNull();
});
