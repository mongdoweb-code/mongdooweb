-- วิดีโอสินค้า (1 คลิปต่อสินค้า)
ALTER TABLE "Product" ADD COLUMN "videoKey" TEXT,
ADD COLUMN "videoPosterKey" TEXT,
ADD COLUMN "videoSeconds" INTEGER;
