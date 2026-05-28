/**
 * @file risk-monitor-number-utils.ts
 * @module risk
 * @description Strict numeric normalization helpers for client-side risk monitor threshold input controls.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeRiskMonitorThresholdPercentInput(value: unknown, fallback: number): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return fallback
  }
  return Math.max(0, Math.min(100, parsedValue))
}
