/**
 * @file settings-number-utils.ts
 * @module admin-console
 * @description Strict numeric normalization helpers for admin settings brokerage input fields.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseNonNegativeMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeSettingsNullableNonNegativeInput(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) {
    return null
  }
  return parseNonNegativeMarketNumber(value)
}
