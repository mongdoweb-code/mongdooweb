-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "badges" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "cardBadgeLayout" TEXT NOT NULL DEFAULT '1',
ADD COLUMN     "cardBadgeOpacity" INTEGER NOT NULL DEFAULT 85;


-- ป้ายเดิม (ช่องเดียว) → รายการป้าย 1 ป้าย สีส้ม
UPDATE "Product" SET "badges" = jsonb_build_array(jsonb_build_object('t', "badge", 'c', 'orange')) WHERE "badge" IS NOT NULL AND btrim("badge") <> '';
