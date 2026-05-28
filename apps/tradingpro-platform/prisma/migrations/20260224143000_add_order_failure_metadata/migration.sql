-- Migration: add_order_failure_metadata
-- Created: 2026-02-24
--
-- Purpose:
-- Persist machine-readable and human-readable cancellation/rejection metadata
-- on orders so UI can show exact failure cause.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS "failureCode" TEXT,
  ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
