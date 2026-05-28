/**
 * @file repository-number-utils.ts
 * @module repositories
 * @description Strict finite numeric normalization helpers for repository aggregate/decimal values.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeRepositoryFiniteNumber(
  value: unknown,
  fallbackValue: number = 0,
): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return fallbackValue
  }
  return parsedValue
}
