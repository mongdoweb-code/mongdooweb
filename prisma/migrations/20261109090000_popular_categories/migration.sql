-- หมวดยอดนิยมหน้าแรก (ตั้งค่าในหลังบ้าน)
ALTER TABLE "ShopSetting" ADD COLUMN "popularCats" JSONB NOT NULL DEFAULT '{}';
