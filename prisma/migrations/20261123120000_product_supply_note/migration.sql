-- คำเตือนการต่อไฟในหน้าสินค้า ตั้งแยกรายสินค้า (AUTO = พฤติกรรมเดิม + ตรวจไฟบ้านจากสเปก)
-- CreateEnum
CREATE TYPE "SupplyType" AS ENUM ('AUTO', 'LOW_VOLTAGE', 'MAINS', 'HIDDEN');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "supplyNote" TEXT,
ADD COLUMN     "supplyType" "SupplyType" NOT NULL DEFAULT 'AUTO';
