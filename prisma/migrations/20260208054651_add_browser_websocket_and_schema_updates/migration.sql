-- AlterEnum
ALTER TYPE "ConnectorType" ADD VALUE 'BROWSER_WEBSOCKET';

-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "errorHandling" JSONB;

-- AlterTable
ALTER TABLE "Target" ADD COLUMN     "lastTestAt" TIMESTAMP(3),
ADD COLUMN     "lastTestError" TEXT,
ADD COLUMN     "lastTestSuccess" BOOLEAN,
ADD COLUMN     "presetId" TEXT;

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");
