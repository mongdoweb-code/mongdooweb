-- ติดตามใบเสนอราคา: การเปิดดูของลูกค้า · วันนัดติดตาม · เหตุผลที่ไม่ได้งาน
ALTER TYPE "DocEventType" ADD VALUE 'VIEWED';
ALTER TYPE "DocEventType" ADD VALUE 'FOLLOW_UP';
ALTER TABLE "SalesDocument" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SalesDocument" ADD COLUMN "firstViewedAt" TIMESTAMP(3);
ALTER TABLE "SalesDocument" ADD COLUMN "lastViewedAt" TIMESTAMP(3);
ALTER TABLE "SalesDocument" ADD COLUMN "followUpAt" TIMESTAMP(3);
ALTER TABLE "SalesDocument" ADD COLUMN "lostReason" TEXT;
CREATE INDEX "SalesDocument_type_status_followUpAt_idx" ON "SalesDocument"("type", "status", "followUpAt");
