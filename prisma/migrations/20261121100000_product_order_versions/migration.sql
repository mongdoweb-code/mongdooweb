-- เก็บลำดับสินค้าก่อนบันทึก (หน้าจัดเรียงสินค้าหน้าร้าน → คืนลำดับก่อนหน้า)
ALTER TYPE "ContentKind" ADD VALUE 'PRODUCT_ORDER';
