-- CreateEnum
CREATE TYPE "OrderPurpose" AS ENUM ('OPEN', 'CLOSE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "orderPurpose" "OrderPurpose" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "orders" ADD COLUMN "closeMetadata" JSONB;

-- CreateIndex
CREATE INDEX "orders_status_orderPurpose_createdAt_idx" ON "orders"("status", "orderPurpose", "createdAt");
