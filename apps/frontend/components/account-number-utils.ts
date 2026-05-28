/**
 * @file account-number-utils.ts
 * @module components
 * @description Strict numeric normalization helpers for account statement amount rendering.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeAccountStatementAmount(value: unknown): number {
  return parseFiniteMarketNumber(value) ?? 0
}
