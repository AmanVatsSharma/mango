-- Order admission margin & placement charges (ledger alignment)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "blockedMargin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "placementCharges" INTEGER NOT NULL DEFAULT 0;
