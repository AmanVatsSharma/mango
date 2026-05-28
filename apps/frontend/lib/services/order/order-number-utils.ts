/**
 * @file order-number-utils.ts
 * @module order
 * @description Shared strict numeric parsing helpers for order services and workers.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function parseFiniteOrderNumber(value: unknown): number | null {
  return parseFiniteMarketNumber(value)
}
