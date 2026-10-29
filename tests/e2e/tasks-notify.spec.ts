// งานที่ต้องทำ → แจ้งเตือนที่กระดิ่ง: งานใหม่ (ของฉัน/งานรวม รวมที่สร้างเอง) และงานเกินกำหนด
import { expect, test } from "@playwright/test";
import pg from "pg";
import { V, login } from "./helpers";

const TAG = Date.now().toString(36);
async function q(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows;
  } finally {
    await c.end();
  }
}
test.afterAll(async () => {
  await q(`DELETE FROM "AdminTask" WHERE title LIKE $1`, [`%E2E-TN-${TAG}%`]);
});

test("สร้างงานใหม่ → กระดิ่งเพิ่มทันที + แสดงในรายการแจ้งเตือน · งานเกินกำหนดก็แจ้ง", async ({ page }) => {
  await login(page);
  // อ่านทั้งหมดก่อน (ผ่านปุ่มในกระดิ่ง)
  await page.goto("/admin/tasks");
  await page.click("#bellBtn" + V);
  const readAll = page.locator("#bellReadAll" + V);
  if (await readAll.isEnabled()) await readAll.click();
  await expect.poll(async () => (await (await page.request.get("/admin/notifications/count")).json()).unread).toBe(0);
  await page.keyboard.press("Escape");

  // งานใหม่ มอบหมายให้ตัวเอง (ค่าเริ่มต้น)
  await page.fill("#ntTitle" + V, `ตรวจสต็อกไฟใต้น้ำ E2E-TN-${TAG}`);
  await page.click('#newTaskForm button[type=submit]' + V);
  await expect(page.locator(".ok-box" + V)).toContainText("บันทึกงานแล้ว");
  await expect(page.locator("#bellCount" + V)).toHaveText("1");
  await page.click("#bellBtn" + V);
  await expect(page.locator(".bell-pop" + V)).toContainText(`งานใหม่: ตรวจสต็อกไฟใต้น้ำ E2E-TN-${TAG}`);
  await page.keyboard.press("Escape");

  // งานเกินกำหนด (ครบกำหนดเมื่อครู่ ยังไม่เสร็จ) → แจ้ง "งานเกินกำหนด"
  const [me] = await q(`SELECT id FROM "Admin" WHERE username = $1`, [process.env.E2E_ADMIN_USER ?? "admin"]);
  await q(`INSERT INTO "AdminTask" (id, title, "assigneeId", "dueAt", "createdAt") VALUES ($1, $2, $3, now() - interval '1 minute', now() - interval '30 days')`, [`e2e-tn-${TAG}`, `โทรตามลูกค้า E2E-TN-${TAG}`, me.id]);
  await expect.poll(async () => (await (await page.request.get("/admin/notifications/count")).json()).unread).toBe(2);
  await page.goto("/admin/notifications");
  await expect(page.locator(`#notifList li[data-kind=TASK_DUE]:has-text("E2E-TN-${TAG}")` + V)).toHaveCount(1);
  await expect(page.locator(`#notifList li[data-kind=TASK]:has-text("E2E-TN-${TAG}")` + V)).toHaveCount(1);
});
