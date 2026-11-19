-- ค่าใช้จ่ายร้าน
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "payee" TEXT,
    "amountSatang" INTEGER NOT NULL,
    "vatSatang" INTEGER NOT NULL DEFAULT 0,
    "whtSatang" INTEGER NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "fileKey" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Expense_date_idx" ON "Expense"("date");
CREATE INDEX "Expense_category_date_idx" ON "Expense"("category", "date");
