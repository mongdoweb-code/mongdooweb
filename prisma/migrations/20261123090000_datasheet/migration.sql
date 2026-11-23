-- Data Sheet สินค้า (แบบ A ตารางเรียบ / B มืออาชีพ / C เทียบรุ่น) + แม่แบบต่อหมวด
-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "datasheetTemplate" JSONB;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "datasheet" JSONB;

-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "datasheetCompare" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "datasheetStyle" TEXT NOT NULL DEFAULT 'B';

