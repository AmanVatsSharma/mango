/**
 * @file position-number-utils.ts
 * @module position
 * @description Shared strict numeric parsing helpers for position services and workers.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function parseFinitePositionNumber(value: unknown): number | null {
  return parseFiniteMarketNumber(value)
}
