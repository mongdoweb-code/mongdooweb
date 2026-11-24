-- AlterTable
ALTER TABLE "SalesDocument" ADD COLUMN     "pinnedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SalesDocument_type_pinnedAt_idx" ON "SalesDocument"("type", "pinnedAt");

