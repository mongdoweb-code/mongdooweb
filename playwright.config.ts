// ทดสอบแอปจริงแบบ end-to-end (หน้าร้าน → สั่งซื้อ → แนบสลิป → หลังบ้านอนุมัติ → เอกสารขาย)
// รัน: npm run build && npm run test:e2e  (ต้องมีฐานข้อมูลที่ migrate + seed แล้ว และตั้ง E2E_ADMIN_PASSWORD)
// ค่าจาก .env (เช่น E2E_PORT, PW_CHROMIUM_PATH) ใช้ได้ทั้งตัวตั้งค่านี้และในเทสต์ — ใน CI ไม่มีไฟล์ .env ใช้ env ของ workflow
import "dotenv/config";
import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3123);
const lineMockLog = process.env.LINE_MOCK_LOG;
const lineMockPort = Number(process.env.LINE_MOCK_PORT ?? 3399);
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
    : [
        // LINE จำลอง (ตั้ง LINE_MOCK_LOG = ไฟล์บันทึกข้อความ) → แอปส่งแจ้งเตือนไปที่นี่แทน api.line.me
        ...(lineMockLog
          ? [{ command: "node tests/e2e/line-mock.mjs", url: `http://localhost:${lineMockPort}/health`, reuseExistingServer: true, timeout: 20_000 }]
          : []),
        {
          command: `npx next start -p ${port}`,
          url: `http://localhost:${port}/api/health`,
          reuseExistingServer: true,
          timeout: 60_000,
          env: lineMockLog
            ? { LINE_API_BASE: `http://localhost:${lineMockPort}`, LINE_CHANNEL_ACCESS_TOKEN: "e2e-test-token", LINE_CHANNEL_SECRET: "e2e-test-secret" }
            : {},
        },
      ],
});
