-- ตัวเลือกต่อเอกสาร: ใส่ลายเซ็น/ตราประทับอิเล็กทรอนิกส์ · แสดงเลขบัญชีบนใบเสนอราคา (เอกสารเดิม = แสดงตามเดิม)
ALTER TABLE "SalesDocument" ADD COLUMN "signImage" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SalesDocument" ADD COLUMN "showBank" BOOLEAN NOT NULL DEFAULT true;
