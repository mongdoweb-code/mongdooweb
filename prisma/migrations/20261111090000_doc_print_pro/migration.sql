-- หน้าพิมพ์เอกสารขาย: ลายเซ็น + ตราประทับ + ผู้ลงนาม · ช่องทางชำระเงินและ QR ออนไลน์บนใบเสนอราคา
ALTER TABLE "ShopSetting" ADD COLUMN "signatureKey" TEXT;
ALTER TABLE "ShopSetting" ADD COLUMN "stampKey" TEXT;
ALTER TABLE "ShopSetting" ADD COLUMN "signerName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShopSetting" ADD COLUMN "signerTitle" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShopSetting" ADD COLUMN "quotePayInfo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShopSetting" ADD COLUMN "quoteOnlineQr" BOOLEAN NOT NULL DEFAULT true;
