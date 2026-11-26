-- ตัวอักษร (ฟอนต์) ที่ตั้งได้จากหลังร้าน ({} = หน้าตาเดิม)
ALTER TABLE "ShopSetting" ADD COLUMN "typography" JSONB NOT NULL DEFAULT '{}';
