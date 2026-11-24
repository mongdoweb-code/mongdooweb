-- CreateEnum
CREATE TYPE "NoticeTone" AS ENUM ('INFO', 'WARNING', 'DANGER', 'SUCCESS');

-- CreateEnum
CREATE TYPE "NoticeScope" AS ENUM ('MANUAL', 'ALL', 'CATEGORIES');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "noticeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "noticeOff" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "ProductNotice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tone" "NoticeTone" NOT NULL DEFAULT 'WARNING',
    "icon" TEXT NOT NULL DEFAULT 'bolt',
    "scope" "NoticeScope" NOT NULL DEFAULT 'MANUAL',
    "categoryIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skipAccessory" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductNotice_pkey" PRIMARY KEY ("id")
);


-- คลังเริ่มต้น: ข้อความเดิมที่เคยฝังในหน้าสินค้า + ข้อความไฟบ้าน AC
INSERT INTO "ProductNotice" ("id", "name", "text", "tone", "icon", "scope", "sortOrder", "updatedAt") VALUES
  ('ntc_lowvolt', 'ไฟแรงดันต่ำ — ต้องใช้หม้อแปลง', 'ไฟแรงดันต่ำ ต้องต่อผ่านหม้อแปลง · **ห้ามต่อไฟบ้าน 220V โดยตรง**', 'WARNING', 'bolt', 'MANUAL', 10, CURRENT_TIMESTAMP),
  ('ntc_kit', 'ชุดพร้อมใช้ — มีหม้อแปลงในกล่อง', 'ชุดพร้อมใช้ มีหม้อแปลงไฟในกล่องแล้ว · **ห้ามต่อไฟบ้าน 220V เข้าโคมโดยตรง**', 'INFO', 'box', 'MANUAL', 20, CURRENT_TIMESTAMP),
  ('ntc_ac220', 'ไฟบ้าน AC 220V — ต่อตรงได้', 'ใช้ไฟบ้าน AC 220V ต่อตรงได้ ไม่ต้องใช้หม้อแปลง · **ควรให้ช่างไฟเป็นผู้ติดตั้ง**', 'INFO', 'plug', 'MANUAL', 30, CURRENT_TIMESTAMP);

-- ผูกกับสินค้าเดิมแทนกฎที่เคยฝังในโค้ด (โคมในหมวดไฟใต้น้ำ/สระ/น้ำพุ/สวน/ส่องขึ้น ที่ไม่ใช่อุปกรณ์เสริม)
-- สินค้าที่ระบุว่าใช้ไฟ AC (เช่น AC85-265V, AC220V) และไม่มี DC12/24V → ข้อความไฟบ้าน AC แทน
WITH t AS (
  SELECT p."id", p."includesPsu",
         concat_ws(' ', p."name", p."shortDescription", p."description", p."specs"::text, p."datasheet"::text) AS txt
  FROM "Product" p JOIN "Category" c ON c."id" = p."categoryId"
  WHERE NOT p."isAccessory" AND c."slug" IN ('underwater-light', 'pool-light', 'fountain-light', 'garden-light', 'uplight-led')
)
UPDATE "Product" p SET "noticeIds" = ARRAY[
  CASE
    WHEN t."includesPsu" THEN 'ntc_kit'
    WHEN t.txt !~* 'DC\s*(12|24)\s*V' AND t.txt ~* 'AC\s*(85|90|100|110|220|230)' THEN 'ntc_ac220'
    ELSE 'ntc_lowvolt'
  END]
FROM t WHERE t."id" = p."id";
