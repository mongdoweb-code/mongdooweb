-- หน้าวิดีโอ (/videos): คลิปจาก YouTube/Facebook/TikTok/Instagram หรืออัปโหลดเอง
-- CreateEnum
CREATE TYPE "VideoSource" AS ENUM ('YOUTUBE', 'FACEBOOK', 'TIKTOK', 'INSTAGRAM', 'UPLOAD');
-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "source" "VideoSource" NOT NULL,
    "url" TEXT,
    "externalId" TEXT,
    "vertical" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "topic" TEXT,
    "fileKey" TEXT,
    "posterKey" TEXT,
    "thumbUrl" TEXT,
    "seconds" INTEGER,
    "hevc" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "publishAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "Video_isActive_sortOrder_idx" ON "Video"("isActive", "sortOrder");
-- CreateIndex
CREATE INDEX "Video_productId_idx" ON "Video"("productId");
-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- เมนูหน้าร้านที่ร้านตั้งเองไว้แล้ว: เพิ่ม "วิดีโอ" (แสดง) ต่อจาก "ผลงานติดตั้ง" (ไม่มี = ต่อท้าย) — ร้านที่ยังใช้เมนูเดิม ({}) ได้จาก NAV_BUILTINS
UPDATE "ShopSetting" AS s
SET "navMenu" = jsonb_set(s."navMenu", '{items}', (
  SELECT jsonb_agg(x.e ORDER BY x.o)
  FROM (
    SELECT t.e, t.o::numeric AS o FROM jsonb_array_elements(s."navMenu"->'items') WITH ORDINALITY AS t(e, o)
    UNION ALL
    SELECT '{"key":"videos","label":"วิดีโอ","show":true}'::jsonb,
      COALESCE(
        (SELECT t.o FROM jsonb_array_elements(s."navMenu"->'items') WITH ORDINALITY AS t(e, o) WHERE t.e->>'key' = 'projects'),
        (SELECT count(*) FROM jsonb_array_elements(s."navMenu"->'items'))
      )::numeric + 0.5
  ) AS x
))
WHERE jsonb_typeof(s."navMenu"->'items') = 'array'
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s."navMenu"->'items') AS t(e) WHERE t.e->>'key' = 'videos');
