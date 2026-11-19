-- ลูกค้า: หลายเบอร์โทร + โทรสาร (เบอร์เดิมกลายเป็นเบอร์แรกของรายการ)
ALTER TABLE "Customer" ADD COLUMN "phones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Customer" ADD COLUMN "fax" TEXT;
UPDATE "Customer" SET "phones" = ARRAY["phone"] WHERE "phone" IS NOT NULL AND "phone" <> '';
CREATE INDEX "Customer_phones_idx" ON "Customer" USING GIN ("phones");
