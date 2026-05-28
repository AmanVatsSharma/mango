/**
 * @file user-statement-number-utils.ts
 * @module admin-console
 * @description Strict numeric normalization helpers for admin user-statement trade and fund ledger row mapping.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber, parseNonNegativeMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeUserStatementTradeQuantity(value: unknown): number {
  return parseNonNegativeMarketNumber(value) ?? 0
}

export function normalizeUserStatementTradePrice(value: unknown): number {
  return parseNonNegativeMarketNumber(value) ?? 0
}

export function normalizeUserStatementLedgerSignedAmount(type: unknown, amount: unknown): number {
  const normalizedAmount = parseFiniteMarketNumber(amount) ?? 0
  if (normalizedAmount === 0) {
    return 0
  }
  return type === "CREDIT" ? normalizedAmount : -Math.abs(normalizedAmount)
}

export function normalizeUserStatementDepositAmount(value: unknown): number {
  return parseNonNegativeMarketNumber(value) ?? 0
}

export function normalizeUserStatementWithdrawalAmount(amount: unknown, charges: unknown): number {
  const normalizedAmount = parseNonNegativeMarketNumber(amount) ?? 0
  const normalizedCharges = parseNonNegativeMarketNumber(charges) ?? 0
  return -(normalizedAmount + normalizedCharges)
}
