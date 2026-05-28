/**
 * @file edit-user-number-utils.ts
 * @module admin-console
 * @description Strict numeric normalization helpers for admin edit-user dialog fund and leverage input handling.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber, parseNonNegativeMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeEditUserRequiredNonNegativeAmount(value: unknown): number | null {
  return parseNonNegativeMarketNumber(value)
}

export function normalizeEditUserAmountForDisplay(value: unknown): number {
  return parseFiniteMarketNumber(value) ?? 0
}

export function normalizeEditUserLeverageMultiplierInput(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) {
    return null
  }
  return parseFiniteMarketNumber(value)
}
