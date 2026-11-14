-- หน้าเข้าสู่ระบบหลังบ้าน: เนื้อหาโซนการตลาด/ข้อความต้อนรับ/การแสดงหมวดและสินค้า (src/lib/login-page.ts) — {} = ค่าเริ่มต้น
ALTER TABLE "ShopSetting" ADD COLUMN "loginPage" JSONB NOT NULL DEFAULT '{}';
