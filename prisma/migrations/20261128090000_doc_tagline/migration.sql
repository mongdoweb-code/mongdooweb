-- แถบข้อความท้ายเอกสาร แก้ได้จากตั้งค่าร้าน (null = ข้อความเดิม)
ALTER TABLE "ShopSetting" ADD COLUMN "docTagline" TEXT,
ADD COLUMN "docTaglineOn" BOOLEAN NOT NULL DEFAULT true;
