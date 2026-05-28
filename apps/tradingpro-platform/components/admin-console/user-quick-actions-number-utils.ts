/**
 * @file user-quick-actions-number-utils.ts
 * @module admin-console
 * @description Strict numeric parsing helpers for admin user quick-action risk-limit dialog inputs.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function parseUserQuickActionNumericInput(value: string): number | null {
  if (!value.trim()) {
    return null
  }
  const parsedValue = parseFiniteMarketNumber(value)
  return parsedValue === null ? Number.NaN : parsedValue
}
