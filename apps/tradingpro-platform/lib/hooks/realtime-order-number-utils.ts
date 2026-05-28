/**
 * @file realtime-order-number-utils.ts
 * @module lib/hooks
 * @description Strict numeric normalization helpers for realtime order SSE cache patches.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function parseFiniteRealtimeOrderNumber(value: unknown): number | null {
  return parseFiniteMarketNumber(value)
}

export function normalizeRealtimeOrderQuantity(value: unknown): number {
  return parseFiniteRealtimeOrderNumber(value) ?? 0
}

export function normalizeRealtimeOrderPrice(value: unknown): number | null {
  return parseFiniteRealtimeOrderNumber(value)
}
