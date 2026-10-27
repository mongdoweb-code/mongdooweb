-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "marketingOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "costSatang" INTEGER;

-- AlterTable
ALTER TABLE "SalesDocumentItem" ADD COLUMN     "costSatang" INTEGER;

