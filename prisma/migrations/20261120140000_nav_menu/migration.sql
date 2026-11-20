-- เมนูหลักหน้าร้านที่ตั้งค่าได้จากหลังบ้าน
ALTER TABLE "ShopSetting" ADD COLUMN "navMenu" JSONB NOT NULL DEFAULT '{}';
