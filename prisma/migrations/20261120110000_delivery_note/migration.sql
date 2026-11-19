-- ใบส่งของ / ใบรับสินค้า
ALTER TYPE "DocType" ADD VALUE 'DELIVERY';
ALTER TABLE "ShopSetting" ADD COLUMN "prefixDelivery" TEXT NOT NULL DEFAULT 'DO';
