-- ปักหมุดสินค้า + ลำดับที่ร้านจัดเอง
ALTER TABLE "Product" ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Product_isPinned_sortOrder_idx" ON "Product"("isPinned", "sortOrder");

-- ตั้งลำดับเริ่มต้น = ลำดับ "แนะนำ" ที่หน้าร้านใช้อยู่ (ขายดี → ยอดเข้าชม → ลำดับเดิม → วันที่เพิ่ม) หน้าร้านจึงไม่เปลี่ยนหลัง deploy
UPDATE "Product" p SET "sortOrder" = r.n
FROM (
  SELECT id, (row_number() OVER (ORDER BY "isBestSeller" DESC, "views" DESC, "sortOrder" ASC, "createdAt" ASC))::int * 10 AS n
  FROM "Product"
) r
WHERE p.id = r.id;
