-- รูปหน้ารายการบนเอกสารขาย + วันที่ในช่องลงนามฝั่งร้าน
ALTER TABLE "SalesDocumentItem" ADD COLUMN "image" TEXT;
ALTER TABLE "SalesDocument" ADD COLUMN "signDate" TIMESTAMP(3);
