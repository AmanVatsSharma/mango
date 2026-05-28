-- Migration: position_identity_fifo_lots
-- Created: 2026-02-24
--
-- Purpose:
-- 1) Move away from symbol-only position uniqueness.
-- 2) Add explicit instrument/product snapshot fields on positions.
-- 3) Add indexes needed for FIFO lot matching and segregated position listing.

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS "productType" TEXT NOT NULL DEFAULT 'MIS',
  ADD COLUMN IF NOT EXISTS "isIntraday" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "instrumentId" TEXT,
  ADD COLUMN IF NOT EXISTS segment TEXT,
  ADD COLUMN IF NOT EXISTS exchange TEXT,
  ADD COLUMN IF NOT EXISTS "strikePrice" DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "optionType" "OptionType",
  ADD COLUMN IF NOT EXISTS expiry TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS token INTEGER;

-- Old symbol-level uniqueness caused contract/product mixing.
DROP INDEX IF EXISTS "positions_tradingAccountId_symbol_key";

-- Backfill instrument identity snapshot from stock reference.
UPDATE positions p
SET
  "instrumentId" = COALESCE(p."instrumentId", s."instrumentId"),
  segment = COALESCE(p.segment, s.segment),
  exchange = COALESCE(p.exchange, s.exchange),
  "strikePrice" = COALESCE(p."strikePrice", s."strikePrice"),
  "optionType" = COALESCE(p."optionType", s."optionType"),
  expiry = COALESCE(p.expiry, s.expiry),
  token = COALESCE(p.token, s.token)
FROM stocks s
WHERE p."stockId" = s.id;

-- Backfill product type using latest linked order (best effort).
UPDATE positions p
SET "productType" = COALESCE(
  NULLIF(
    UPPER(
      TRIM(
        (
          SELECT o."productType"
          FROM orders o
          WHERE o."positionId" = p.id
          ORDER BY COALESCE(o."executedAt", o."createdAt") DESC, o.id DESC
          LIMIT 1
        )
      )
    ),
    ''
  ),
  p."productType",
  'MIS'
);

-- Canonicalize product aliases to prevent cross-mode offsets.
UPDATE positions
SET "productType" = CASE
  WHEN UPPER(TRIM(COALESCE("productType", 'MIS'))) IN ('MIS', 'INTRADAY') THEN 'MIS'
  WHEN UPPER(TRIM(COALESCE("productType", 'MIS'))) IN ('CNC', 'DELIVERY') THEN 'DELIVERY'
  ELSE UPPER(TRIM(COALESCE("productType", 'MIS')))
END;

UPDATE positions
SET "isIntraday" = CASE
  WHEN "productType" = 'MIS' THEN TRUE
  ELSE FALSE
END;

CREATE INDEX IF NOT EXISTS idx_positions_fifo_lookup
  ON positions ("tradingAccountId", "stockId", "productType", "createdAt");

CREATE INDEX IF NOT EXISTS idx_positions_identity_lookup
  ON positions ("tradingAccountId", "instrumentId", segment, "optionType", expiry, "strikePrice", "productType", "createdAt");

CREATE INDEX IF NOT EXISTS idx_positions_account_product_intraday_closed_at
  ON positions ("tradingAccountId", "productType", "isIntraday", "closedAt");
