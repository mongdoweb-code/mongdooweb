// ทดสอบแอปจริงแบบ end-to-end (หน้าร้าน → สั่งซื้อ → แนบสลิป → หลังบ้านอนุมัติ → เอกสารขาย)
// รัน: npm run build && npm run test:e2e  (ต้องมีฐานข้อมูลที่ migrate + seed แล้ว และตั้ง E2E_ADMIN_PASSWORD)
import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3123);
export default defineConfig({
  testDir: "tests/e2e",
  // ทุกเทสต์ใช้ฐานข้อมูลเดียวกันและมีตัวจำกัดจำนวนครั้งต่อ IP — รันทีละไฟล์ตามลำดับ
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${port}`,
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // เครื่องที่ติดตั้ง Chromium ไว้แล้ว (เช่น /opt/pw-browsers) ตั้ง PW_CHROMIUM_PATH ได้
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: `npx next start -p ${port}`, url: `http://localhost:${port}/api/health`, reuseExistingServer: true, timeout: 60_000 },
});
