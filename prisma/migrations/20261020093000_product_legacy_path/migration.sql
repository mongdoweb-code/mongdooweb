-- URL เดิมของสินค้าในเว็บ WooCommerce (redirect 301)
ALTER TABLE "Product" ADD COLUMN "legacyPath" TEXT;
CREATE UNIQUE INDEX "Product_legacyPath_key" ON "Product"("legacyPath");
