-- ตั้งค่าเอกสารขาย: ข้อความท้ายใบเสร็จ และช่องลงชื่อ
ALTER TABLE "ShopSetting" ADD COLUMN "termsReceipt" TEXT,
ADD COLUMN "showSignature" BOOLEAN NOT NULL DEFAULT true;
