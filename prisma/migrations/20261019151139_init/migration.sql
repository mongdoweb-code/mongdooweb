-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'STAFF');

-- CreateEnum
CREATE TYPE "CategoryGroup" AS ENUM ('WATER', 'OUTDOOR', 'BUILDING', 'DECO');

-- CreateEnum
CREATE TYPE "UseArea" AS ENUM ('POOL', 'POND', 'FOUNTAIN', 'GARDEN');

-- CreateEnum
CREATE TYPE "LightColor" AS ENUM ('WHITE', 'RGB', 'ANY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_VERIFICATION', 'PAID', 'SHIPPED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SlipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "OrderEventType" AS ENUM ('CREATED', 'SLIP_UPLOADED', 'APPROVED', 'REJECTED', 'REOPENED', 'SHIPPED', 'CANCELLED', 'NOTE');

-- CreateEnum
CREATE TYPE "VatMode" AS ENUM ('NONE', 'EXCLUSIVE', 'INCLUSIVE');

-- CreateEnum
CREATE TYPE "DateEra" AS ENUM ('AD', 'BE');

-- CreateEnum
CREATE TYPE "SlideAlign" AS ENUM ('LEFT', 'CENTER');

-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('SLIDES', 'CATEGORIES');

-- CreateEnum
CREATE TYPE "CustomerKind" AS ENUM ('COMPANY', 'PERSON');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('QUOTATION', 'INVOICE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'REJECTED', 'PARTIAL', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "DocEventType" AS ENUM ('CREATED', 'ISSUED', 'CONVERTED', 'ACCEPTED', 'REJECTED', 'PAYMENT', 'PRINTED', 'VOIDED', 'NOTE');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legacySlug" TEXT,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "icon" TEXT,
    "group" "CategoryGroup" NOT NULL DEFAULT 'DECO',
    "popular" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'ชิ้น',
    "isService" BOOLEAN NOT NULL DEFAULT false,
    "priceSatang" INTEGER NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "specs" JSONB,
    "images" TEXT[],
    "model3dKey" TEXT,
    "useAreas" "UseArea"[],
    "lightColor" "LightColor" NOT NULL DEFAULT 'ANY',
    "includesPsu" BOOLEAN NOT NULL DEFAULT false,
    "isAccessory" BOOLEAN NOT NULL DEFAULT false,
    "badge" TEXT,
    "isBestSeller" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "addressLine" TEXT NOT NULL,
    "subdistrict" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" VARCHAR(5) NOT NULL,
    "note" TEXT,
    "subtotalSatang" INTEGER NOT NULL,
    "shippingMethod" TEXT NOT NULL,
    "shippingName" TEXT NOT NULL,
    "shippingSatang" INTEGER NOT NULL,
    "totalSatang" INTEGER NOT NULL,
    "carrier" TEXT,
    "trackingNo" TEXT,
    "shippedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "nameSnapshot" TEXT NOT NULL,
    "priceSatang" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSlip" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "declaredAmountSatang" INTEGER NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL,
    "status" "SlipStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSlip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "note" TEXT,
    "adminId" TEXT,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSetting" (
    "id" TEXT NOT NULL DEFAULT 'shop',
    "bankName" TEXT NOT NULL,
    "bankAccount" TEXT NOT NULL,
    "bankHolder" TEXT NOT NULL,
    "promptpayId" TEXT,
    "promptpayName" TEXT NOT NULL,
    "shippingStdSatang" INTEGER NOT NULL DEFAULT 5000,
    "shippingExpSatang" INTEGER NOT NULL DEFAULT 9000,
    "freeShipMinSatang" INTEGER,
    "slipCheckWithin" TEXT NOT NULL,
    "lineOaUrl" TEXT,
    "newOrderSound" BOOLEAN NOT NULL DEFAULT true,
    "legalName" TEXT NOT NULL DEFAULT 'ร้านมองดูเว็บ',
    "addressText" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "lineId" TEXT,
    "email" TEXT,
    "taxId" VARCHAR(13),
    "branch" TEXT,
    "logoKey" TEXT,
    "vatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vatMode" "VatMode" NOT NULL DEFAULT 'EXCLUSIVE',
    "vatRateBp" INTEGER NOT NULL DEFAULT 700,
    "prefixQuote" TEXT NOT NULL DEFAULT 'QT',
    "prefixInvoice" TEXT NOT NULL DEFAULT 'IV',
    "prefixReceipt" TEXT NOT NULL DEFAULT 'RC',
    "dateEra" "DateEra" NOT NULL DEFAULT 'AD',
    "quoteValidDays" INTEGER NOT NULL DEFAULT 30,
    "invoiceDueDays" INTEGER NOT NULL DEFAULT 7,
    "termsQuote" TEXT,
    "termsInvoice" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeroSlide" (
    "id" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "imageKey" TEXT,
    "imageUrl" TEXT,
    "focalX" INTEGER NOT NULL DEFAULT 50,
    "focalY" INTEGER NOT NULL DEFAULT 50,
    "alt" TEXT NOT NULL,
    "eyebrow" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL DEFAULT '',
    "cta1Label" TEXT NOT NULL,
    "cta1Href" TEXT NOT NULL,
    "cta2Label" TEXT,
    "cta2Href" TEXT,
    "align" "SlideAlign" NOT NULL DEFAULT 'LEFT',
    "overlay" INTEGER NOT NULL DEFAULT 55,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "credit" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroSlide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "kind" "ContentKind" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "adminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "CustomerKind" NOT NULL DEFAULT 'PERSON',
    "name" TEXT NOT NULL,
    "taxId" VARCHAR(13),
    "branch" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "addressLine" TEXT,
    "subdistrict" TEXT,
    "district" TEXT,
    "province" TEXT,
    "postalCode" VARCHAR(5),
    "shipTo" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocSequence" (
    "type" "DocType" NOT NULL,
    "period" VARCHAR(4) NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DocSequence_pkey" PRIMARY KEY ("type","period")
);

-- CreateTable
CREATE TABLE "SalesDocument" (
    "id" TEXT NOT NULL,
    "type" "DocType" NOT NULL,
    "docNo" TEXT,
    "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "customerId" TEXT,
    "customerSnapshot" JSONB NOT NULL,
    "subtotalSatang" INTEGER NOT NULL DEFAULT 0,
    "discountSatang" INTEGER NOT NULL DEFAULT 0,
    "vatMode" "VatMode" NOT NULL DEFAULT 'NONE',
    "vatRateBp" INTEGER NOT NULL DEFAULT 0,
    "vatSatang" INTEGER NOT NULL DEFAULT 0,
    "grandSatang" INTEGER NOT NULL DEFAULT 0,
    "paidSatang" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "paymentTerms" TEXT,
    "carrier" TEXT,
    "note" TEXT,
    "internalNote" TEXT,
    "voidReason" TEXT,
    "sourceId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesDocumentItem" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "productId" TEXT,
    "sku" TEXT,
    "name" TEXT NOT NULL,
    "detail" TEXT,
    "unit" TEXT NOT NULL,
    "qtyMilli" INTEGER NOT NULL,
    "priceSatang" INTEGER NOT NULL,
    "discountSatang" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesDocumentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocPayment" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "receiptId" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amountSatang" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesDocumentEvent" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "type" "DocEventType" NOT NULL,
    "note" TEXT,
    "adminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesDocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Category_legacySlug_key" ON "Category"("legacySlug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_categoryId_isActive_idx" ON "Product"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "Product_isBestSeller_isActive_idx" ON "Product"("isBestSeller", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNo_key" ON "Order"("orderNo");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_phone_idx" ON "Order"("phone");

-- CreateIndex
CREATE INDEX "Order_trackingNo_idx" ON "Order"("trackingNo");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "PaymentSlip_sha256_idx" ON "PaymentSlip"("sha256");

-- CreateIndex
CREATE INDEX "PaymentSlip_orderId_uploadedAt_idx" ON "PaymentSlip"("orderId", "uploadedAt");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "HeroSlide_isActive_sortOrder_idx" ON "HeroSlide"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "ContentVersion_kind_publishedAt_idx" ON "ContentVersion"("kind", "publishedAt");

-- CreateIndex
CREATE INDEX "AdminLog_createdAt_idx" ON "AdminLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_taxId_idx" ON "Customer"("taxId");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SalesDocument_docNo_key" ON "SalesDocument"("docNo");

-- CreateIndex
CREATE INDEX "SalesDocument_type_status_issueDate_idx" ON "SalesDocument"("type", "status", "issueDate");

-- CreateIndex
CREATE INDEX "SalesDocument_customerId_idx" ON "SalesDocument"("customerId");

-- CreateIndex
CREATE INDEX "SalesDocument_dueDate_idx" ON "SalesDocument"("dueDate");

-- CreateIndex
CREATE INDEX "SalesDocumentItem_documentId_sortOrder_idx" ON "SalesDocumentItem"("documentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "DocPayment_receiptId_key" ON "DocPayment"("receiptId");

-- CreateIndex
CREATE INDEX "DocPayment_invoiceId_idx" ON "DocPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "SalesDocumentEvent_documentId_createdAt_idx" ON "SalesDocumentEvent"("documentId", "createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminLog" ADD CONSTRAINT "AdminLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SalesDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocumentItem" ADD CONSTRAINT "SalesDocumentItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SalesDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocumentItem" ADD CONSTRAINT "SalesDocumentItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocPayment" ADD CONSTRAINT "DocPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SalesDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocPayment" ADD CONSTRAINT "DocPayment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "SalesDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocumentEvent" ADD CONSTRAINT "SalesDocumentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SalesDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocumentEvent" ADD CONSTRAINT "SalesDocumentEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
