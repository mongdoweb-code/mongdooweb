-- AlterEnum
ALTER TYPE "DocEventType" ADD VALUE 'STOCK_RETURNED';

-- AlterEnum
ALTER TYPE "DocType" ADD VALUE 'CREDIT_NOTE';

-- AlterTable
ALTER TABLE "SalesDocument" ADD COLUMN     "creditReason" TEXT,
ADD COLUMN     "stockReturnedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ShopSetting" ADD COLUMN     "prefixCredit" TEXT NOT NULL DEFAULT 'CN';

