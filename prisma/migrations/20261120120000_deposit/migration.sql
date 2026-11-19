-- ใบเสร็จรับเงินมัดจำ (จากใบเสนอราคา)
ALTER TABLE "SalesDocument" ADD COLUMN "isDeposit" BOOLEAN NOT NULL DEFAULT false;
