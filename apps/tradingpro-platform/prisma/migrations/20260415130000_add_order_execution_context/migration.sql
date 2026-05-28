-- AlterTable: add executionContext JSON column to Order so the fill-time worker can replay the
-- spread / slippage / tilt snapshot captured at placement.
ALTER TABLE "orders" ADD COLUMN "executionContext" JSONB;
