-- หมวดสินค้า: ไอคอนที่อัปโหลดเอง (แทนไอคอนเส้น) — ว่าง = ใช้ไอคอนเส้นตาม "icon"
ALTER TABLE "Category" ADD COLUMN "iconKey" TEXT;
