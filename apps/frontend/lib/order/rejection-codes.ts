/**
 * File:        lib/order/rejection-codes.ts
 * Module:      Order · Rejection Codes
 * Purpose:     Maps failureCode strings (from /api/trading/orders/status) to a fixable flag
 *              and a human-readable message for display in PersistentOrderCard.
 *
 * Exports:
 *   - resolveRejection(failureCode) → RejectionInfo — lookup with unknown-code fallback
 *   - RejectionInfo — { fixable: boolean, humanMessage: string }
 *
 * Depends on: none
 * Side-effects: none
 * Key invariants:
 *   - Unknown / null / undefined codes always return fixable=false (safe default — no retry shown)
 *   - failureCode values match the strings written to Order.failureCode in OrderExecutionService
 * Read order:
 *   1. RejectionInfo — type
 *   2. REJECTION_CODE_MAP — code table
 *   3. resolveRejection — exported function
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

export interface RejectionInfo {
  fixable: boolean
  humanMessage: string
}

const FALLBACK: RejectionInfo = { fixable: false, humanMessage: "Order rejected by exchange" }

const REJECTION_CODE_MAP: Record<string, RejectionInfo> = {
  INSUFFICIENT_MARGIN: {
    fixable: true,
    humanMessage: "Insufficient margin — reduce quantity or add funds",
  },
  INVALID_QTY: {
    fixable: true,
    humanMessage: "Invalid quantity — check lot size requirements",
  },
  PRICE_OUT_OF_RANGE: {
    fixable: true,
    humanMessage: "Price is outside circuit limits",
  },
  MARKET_CLOSED: {
    fixable: false,
    humanMessage: "Market is currently closed",
  },
  SEGMENT_DISABLED: {
    fixable: false,
    humanMessage: "Segment is not enabled for trading",
  },
  RISK_LIMIT_EXCEEDED: {
    fixable: false,
    humanMessage: "Risk limit exceeded — contact support",
  },
  EXCHANGE_REJECTED: {
    fixable: false,
    humanMessage: "Order rejected by exchange",
  },
}

export function resolveRejection(failureCode: string | null | undefined): RejectionInfo {
  if (typeof failureCode !== "string" || !failureCode.trim()) return FALLBACK
  return REJECTION_CODE_MAP[failureCode.trim()] ?? FALLBACK
}
