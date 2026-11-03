-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('OPEN', 'APPLIED', 'CANCELLED');

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "supplierId" TEXT;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "lineId" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "terms" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "countNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "createdById" TEXT,
    "appliedById" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountLine" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "counted" INTEGER,
    "countedAt" TIMESTAMP(3),
    "applied" INTEGER,

    CONSTRAINT "StockCountLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StockCount_countNo_key" ON "StockCount"("countNo");

-- CreateIndex
CREATE INDEX "StockCount_status_createdAt_idx" ON "StockCount"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StockCountLine_productId_idx" ON "StockCountLine"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountLine_countId_productId_key" ON "StockCountLine"("countId", "productId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountLine" ADD CONSTRAINT "StockCountLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: สร้างผู้ขายจากชื่อในใบสั่งซื้อเดิม (ผู้ติดต่อจากใบล่าสุด) แล้วผูกใบสั่งซื้อ
INSERT INTO "Supplier" ("id", "name", "contact", "updatedAt")
SELECT 'sup_' || md5(n), n, c, CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (btrim("supplierName")) btrim("supplierName") AS n, "supplierContact" AS c
  FROM "PurchaseOrder" WHERE btrim("supplierName") <> ''
  ORDER BY btrim("supplierName"), "createdAt" DESC
) s
ON CONFLICT ("name") DO NOTHING;

UPDATE "PurchaseOrder" p SET "supplierId" = s."id" FROM "Supplier" s WHERE s."name" = btrim(p."supplierName") AND p."supplierId" IS NULL;
