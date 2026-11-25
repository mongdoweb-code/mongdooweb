-- รูปแบบแถบข้อความท้ายเอกสาร: A กรอบเหลี่ยม (ค่าเริ่มต้น) · B แถบสีแบรนด์ · C เส้นคู่
ALTER TABLE "ShopSetting" ADD COLUMN "docTaglineStyle" TEXT NOT NULL DEFAULT 'A';
