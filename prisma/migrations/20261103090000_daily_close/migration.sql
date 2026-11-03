-- ปิดยอดประจำวัน
CREATE TABLE "DailyClose" (
    "id" TEXT NOT NULL,
    "day" VARCHAR(10) NOT NULL,
    "totalSatang" INTEGER NOT NULL,
    "countedSatang" INTEGER,
    "byMethod" JSONB NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "note" TEXT,
    "closedBy" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyClose_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyClose_day_key" ON "DailyClose"("day");
