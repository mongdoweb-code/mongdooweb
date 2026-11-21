// session หลังบ้าน: เข้าสู่ระบบครั้งเดียวใช้ได้ 24 ชั่วโมง · พักหน้าจอเกิน 30 นาทีไม่หลุด (ไม่มีหน้าต่าง "ยังอยู่ไหม?")
import { expect, test } from "@playwright/test";
import pg from "pg";
import { login } from "./helpers";

async function q<T = Record<string, unknown>>(sql: string, args: unknown[] = []) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(sql, args)).rows as T[];
  } finally {
    await c.end();
  }
}

test("session อายุ 24 ชม. · ไม่ใช้งาน 2 ชม. ยังอยู่ในระบบ", async ({ page, context }) => {
  await login(page);
  const cookie = (await context.cookies()).find((c) => c.httpOnly && c.expires > 0 && /session|mdw_adm/i.test(c.name));
  expect(cookie, "มี cookie session").toBeTruthy();
  const hours = (cookie!.expires * 1000 - Date.now()) / 3600e3;
  expect(hours).toBeGreaterThan(23.5);
  expect(hours).toBeLessThanOrEqual(24.01);
  const [s] = await q<{ h: number }>(`SELECT EXTRACT(EPOCH FROM ("expiresAt" - now()))/3600 h FROM "AdminSession" ORDER BY "createdAt" DESC LIMIT 1`);
  expect(Number(s.h)).toBeGreaterThan(23.5);
  // จำลองว่าไม่ได้ใช้งานมา 2 ชั่วโมง → ยังเข้าหลังบ้านได้
  await q(`UPDATE "AdminSession" SET "lastSeenAt" = now() - interval '2 hours' WHERE id = (SELECT id FROM "AdminSession" ORDER BY "createdAt" DESC LIMIT 1)`);
  await page.goto("/admin");
  await expect(page).not.toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("alertdialog", { name: "ยังอยู่ไหม?" })).toHaveCount(0);
});
