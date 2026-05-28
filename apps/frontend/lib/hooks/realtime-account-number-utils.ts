/**
 * @file realtime-account-number-utils.ts
 * @module lib/hooks
 * @description Strict numeric helpers for realtime account SSE cache patch updates.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function parseFiniteRealtimeAccountNumber(value: unknown): number | null {
  return parseFiniteMarketNumber(value)
}

export function normalizeRealtimeAccountPatchValue(value: unknown, fallback: number): number {
  return parseFiniteRealtimeAccountNumber(value) ?? fallback
}
