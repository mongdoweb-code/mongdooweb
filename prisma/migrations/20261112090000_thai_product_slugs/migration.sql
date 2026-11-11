-- ลิงก์สินค้าภาษาไทย: สินค้าที่นำเข้าจาก WooCommerce กลับไปใช้ URL ภาษาไทยของเว็บเดิมเป็น slug
--   เช่น /product/ไฟส่องต้นไม้-ไฟส่องส่วนหย่อม-48w-แสงวอร์มไวท์-3200k (ลิงก์เก่าใน Google/LINE เปิดได้ตรงๆ ไม่ต้อง 301)
-- slug ภาษาอังกฤษที่ใช้ช่วงที่ผ่านมา → redirect 301 ไปลิงก์ใหม่ (ตาราง Redirect, source SLUG)
-- ข้าม: URL เดิมที่มีอักษรนอกรูปแบบ (src/lib/slug.ts), ยาวเกิน 200, ซ้ำกับ slug ของสินค้าอื่น
-- รันซ้ำได้ (สินค้าที่ slug = URL เดิมแล้วจะไม่ถูกแตะ) · ไม่มีข้อมูลสินค้า (ติดตั้งใหม่) = ไม่ทำอะไร

CREATE TEMP TABLE "_thai_slug" AS
SELECT "id", "slug" AS "old_slug",
       lower(normalize(regexp_replace(regexp_replace("legacyPath", '^/product/', ''), '/+$', ''), NFC)) AS "new_slug"
FROM "Product"
WHERE "legacyPath" ~ '^/product/[^/]+/?$'
  AND "legacyPath" ~ '[ก-๙]';

DELETE FROM "_thai_slug"
WHERE "new_slug" = "old_slug"
   OR length("new_slug") > 200
   OR "new_slug" !~ '^[a-z0-9ก-ฺเ-๎๐-๙]+(-[a-z0-9ก-ฺเ-๎๐-๙]+)*$';

DELETE FROM "_thai_slug" t
WHERE EXISTS (SELECT 1 FROM "Product" p WHERE p."slug" = t."new_slug" AND p."id" <> t."id")
   OR (SELECT count(*) FROM "_thai_slug" u WHERE u."new_slug" = t."new_slug") > 1;

-- ลิงก์ใหม่เคยเป็นต้นทางของ redirect → ลบ (หน้ามีจริงแล้ว)
DELETE FROM "Redirect" r USING "_thai_slug" t WHERE r."fromPath" = '/product/' || t."new_slug";
-- redirect เดิมที่ชี้มาที่ slug อังกฤษ → ชี้ไปลิงก์ใหม่ตรงๆ (ไม่ต่อหลายทอด)
UPDATE "Redirect" r SET "toPath" = '/product/' || t."new_slug"
FROM "_thai_slug" t WHERE r."toPath" = '/product/' || t."old_slug";
-- slug อังกฤษ → ลิงก์ใหม่
INSERT INTO "Redirect" ("id", "fromPath", "toPath", "source", "createdAt")
SELECT 'thslug' || md5(t."id"), '/product/' || t."old_slug", '/product/' || t."new_slug", 'SLUG', now()
FROM "_thai_slug" t
ON CONFLICT ("fromPath") DO UPDATE SET "toPath" = EXCLUDED."toPath", "source" = 'SLUG';

UPDATE "Product" p SET "slug" = t."new_slug", "updatedAt" = now()
FROM "_thai_slug" t WHERE p."id" = t."id";

DROP TABLE "_thai_slug";
