/**
 * @file realtime-position-number-utils.ts
 * @module lib/hooks
 * @description Strict numeric and lifecycle-closure helpers for realtime position SSE cache updates.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function parseFiniteRealtimePositionNumber(value: unknown): number | null {
  return parseFiniteMarketNumber(value)
}

export function resolveRealtimePositionClosedState(event: string, quantityCandidate: unknown): boolean {
  if (event === "position_closed") {
    return true
  }
  const parsedQuantity = parseFiniteRealtimePositionNumber(quantityCandidate)
  return parsedQuantity === 0
}
