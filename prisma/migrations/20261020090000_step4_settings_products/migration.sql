-- ขั้นที่ 4: ตั้งค่าร้าน (หลายบัญชี, ค่าส่งตามยอด) + ข้อมูลสินค้าจากเว็บเดิม

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "description" TEXT,
ADD COLUMN     "showOnHome" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "compareAtSatang" INTEGER,
ADD COLUMN     "inStock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "keywords" TEXT,
ADD COLUMN     "seoDescription" TEXT,
ADD COLUMN     "seoTitle" TEXT,
ADD COLUMN     "shortDescription" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trackStock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "weightGram" INTEGER,
ADD COLUMN     "wooId" INTEGER;

-- AlterTable: เพิ่มคอลัมน์ใหม่ก่อน แล้วย้ายค่าเดิม แล้วค่อยลบคอลัมน์เก่า
ALTER TABLE "ShopSetting" ADD COLUMN     "bankAccounts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "businessHours" TEXT,
ADD COLUMN     "expressEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expressExtraSatang" INTEGER NOT NULL DEFAULT 4000,
ADD COLUMN     "facebookUrl" TEXT,
ADD COLUMN     "shippingTiers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "tiktokUrl" TEXT,
ADD COLUMN     "website" TEXT,
ADD COLUMN     "youtubeUrl" TEXT;

UPDATE "ShopSetting" SET
  "bankAccounts" = jsonb_build_array(jsonb_build_object('bank', "bankName", 'account', "bankAccount", 'holder', "bankHolder")),
  "shippingTiers" = CASE
    WHEN "freeShipMinSatang" IS NOT NULL AND "freeShipMinSatang" > 0
      THEN jsonb_build_array(jsonb_build_object('minSatang', 0, 'feeSatang', "shippingStdSatang"),
                             jsonb_build_object('minSatang', "freeShipMinSatang", 'feeSatang', 0))
    ELSE jsonb_build_array(jsonb_build_object('minSatang', 0, 'feeSatang', "shippingStdSatang"))
  END,
  "expressExtraSatang" = GREATEST("shippingExpSatang" - "shippingStdSatang", 0);

ALTER TABLE "ShopSetting" DROP COLUMN "bankAccount",
DROP COLUMN "bankHolder",
DROP COLUMN "bankName",
DROP COLUMN "freeShipMinSatang",
DROP COLUMN "shippingExpSatang",
DROP COLUMN "shippingStdSatang";

-- CreateIndex
CREATE UNIQUE INDEX "Product_wooId_key" ON "Product"("wooId");
