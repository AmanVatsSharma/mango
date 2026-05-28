/**
 * @file position-dialog-number-utils.ts
 * @module components/position
 * @description Strict numeric normalization helpers for position dialog numeric inputs.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizePositionDialogInputNumber(value: string): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 0
  }
  return parsedValue
}
