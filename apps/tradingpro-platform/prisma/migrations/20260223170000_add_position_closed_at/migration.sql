-- Migration: add_position_closed_at
-- Created: 2026-02-23

-- Add closedAt so we can compute "Booked (Today)" in IST.
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);

-- Best-effort backfill for existing closed positions.
-- Note: positions are unique per (tradingAccountId, symbol) so reopen cycles overwrite the same row;
-- closedAt stores the last close time we can infer.
UPDATE positions p
SET "closedAt" = COALESCE(
  (SELECT MAX(o."executedAt") FROM orders o WHERE o."positionId" = p.id),
  (SELECT MAX(o."createdAt") FROM orders o WHERE o."positionId" = p.id),
  (SELECT MAX(t."createdAt") FROM transactions t WHERE t."positionId" = p.id),
  p."createdAt"
)
WHERE p.quantity = 0 AND p."closedAt" IS NULL;

-- Support today-filter queries.
CREATE INDEX IF NOT EXISTS idx_positions_account_closed_at
  ON positions ("tradingAccountId", "closedAt");

