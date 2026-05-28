-- AlterTable: optional crypto proof fields for manual crypto deposits
ALTER TABLE "deposits" ADD COLUMN IF NOT EXISTS "crypto_network" TEXT;
ALTER TABLE "deposits" ADD COLUMN IF NOT EXISTS "crypto_tx_hash" TEXT;
ALTER TABLE "deposits" ADD COLUMN IF NOT EXISTS "crypto_asset" TEXT;
