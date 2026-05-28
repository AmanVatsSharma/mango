-- Add closure metadata columns to positions
ALTER TABLE "positions"
  ADD COLUMN "closureReason" TEXT,
  ADD COLUMN "closureNote" VARCHAR(500),
  ADD COLUMN "closedByUserId" TEXT;

-- Indexes for filtering / joining
CREATE INDEX "positions_closureReason_idx" ON "positions"("closureReason");
CREATE INDEX "positions_closedByUserId_idx" ON "positions"("closedByUserId");

-- Self-FK to users (SetNull so deleting a user doesn't orphan closure history)
ALTER TABLE "positions"
  ADD CONSTRAINT "positions_closedByUserId_fkey"
  FOREIGN KEY ("closedByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: positions closed via the retail close path are identifiable by
-- Order.closeMetadata->>'source' = 'retail_positions_api'. Everything else
-- (admin net-close, risk auto-liquidation, expiry squareoff) stays NULL and
-- renders as UNKNOWN in the admin blotter — new closes write the reason
-- explicitly via PositionManagementService.closePosition(closureContext).
UPDATE "positions" p
SET "closureReason" = 'USER_CLOSED'
FROM "orders" o
WHERE o."positionId" = p."id"
  AND o."orderPurpose" = 'CLOSE'
  AND o."status" = 'EXECUTED'
  AND o."closeMetadata"->>'source' = 'retail_positions_api'
  AND p."closedAt" IS NOT NULL
  AND p."closureReason" IS NULL;
