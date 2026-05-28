/**
 * @file fund-number-utils.ts
 * @module admin-console
 * @description Strict numeric normalization helpers for admin fund-management dashboards and add-funds dialog amount handling.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseNonNegativeMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeAdminFundAmount(value: unknown, fallback = 0): number {
  return parseNonNegativeMarketNumber(value) ?? fallback
}

export function normalizeAdminAddFundsAmountInput(value: unknown): number | null {
  const parsedValue = parseNonNegativeMarketNumber(value)
  if (parsedValue === null || parsedValue <= 0) {
    return null
  }
  return parsedValue
}

export function normalizeAdminOptionalNonNegativeAmountInput(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) {
    return undefined
  }
  const parsedValue = parseNonNegativeMarketNumber(value)
  return parsedValue ?? undefined
}
