CREATE TYPE "LineTargetKind" AS ENUM ('USER', 'GROUP', 'ROOM');

CREATE TABLE "LineRecipient" (
    "id" TEXT NOT NULL,
    "kind" "LineTargetKind" NOT NULL,
    "lineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LineRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LineRecipient_lineId_key" ON "LineRecipient"("lineId");
