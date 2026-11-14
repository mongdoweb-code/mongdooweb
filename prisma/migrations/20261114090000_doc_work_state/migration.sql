-- สถานะงานภายในร้านของเอกสารขาย (ใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จ / ใบลดหนี้): ต้องดำเนินการ · เสร็จสิ้น
-- ไม่พิมพ์บนเอกสารและไม่แสดงในหน้าลูกค้า · NULL = ยังไม่ระบุ
CREATE TYPE "DocWork" AS ENUM ('TODO', 'DONE');
ALTER TYPE "DocEventType" ADD VALUE 'WORK';

ALTER TABLE "SalesDocument" ADD COLUMN "workState" "DocWork",
  ADD COLUMN "workNote" TEXT,
  ADD COLUMN "workAt" TIMESTAMP(3),
  ADD COLUMN "workById" TEXT;

CREATE INDEX "SalesDocument_type_workState_idx" ON "SalesDocument"("type", "workState");

ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_workById_fkey" FOREIGN KEY ("workById") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
