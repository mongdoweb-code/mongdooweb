-- รูปภาพประกอบใต้ Data Sheet ของหน้าสินค้า (null = ไม่มี)
ALTER TABLE "Product" ADD COLUMN "gallery" JSONB;
