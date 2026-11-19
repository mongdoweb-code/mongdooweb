-- ภาษีหัก ณ ที่จ่าย ในการรับชำระใบแจ้งหนี้
ALTER TABLE "DocPayment" ADD COLUMN "whtRateBp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DocPayment" ADD COLUMN "whtSatang" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DocPayment" ADD COLUMN "whtCertNo" TEXT;
ALTER TABLE "DocPayment" ADD COLUMN "whtCertAt" TIMESTAMP(3);
CREATE INDEX "DocPayment_whtSatang_paidAt_idx" ON "DocPayment"("whtSatang", "paidAt");
