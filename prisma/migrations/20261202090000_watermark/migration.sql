-- ลายน้ำรูปภาพ (ตั้งค่าร้าน) — {} = ไม่มีลายน้ำ
ALTER TABLE "ShopSetting" ADD COLUMN "watermark" JSONB NOT NULL DEFAULT '{}';
