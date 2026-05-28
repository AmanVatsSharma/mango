/**
 * @file risk-number-utils.ts
 * @module risk
 * @description Shared numeric normalization helpers for risk services and workers.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export interface RiskThresholdPair {
  warningThreshold: number
  autoCloseThreshold: number
}

export function parseFiniteRiskNumber(value: unknown): number | null {
  return parseFiniteMarketNumber(value)
}

export function normalizeNonNegativeRiskNumber(value: unknown, fallbackValue = 0): number {
  const parsedValue = parseFiniteRiskNumber(value)
  if (parsedValue === null || parsedValue < 0) {
    return fallbackValue
  }
  return parsedValue
}

export function normalizeRiskThresholdPair(
  value: Partial<RiskThresholdPair> | null | undefined,
  fallbackValue: RiskThresholdPair,
): RiskThresholdPair {
  const warningThresholdCandidate = parseFiniteRiskNumber(value?.warningThreshold)
  const autoCloseThresholdCandidate = parseFiniteRiskNumber(value?.autoCloseThreshold)

  const warningThreshold = Math.min(
    1,
    Math.max(0, warningThresholdCandidate ?? fallbackValue.warningThreshold),
  )
  const autoCloseThreshold = Math.min(
    1,
    Math.max(0, autoCloseThresholdCandidate ?? fallbackValue.autoCloseThreshold),
  )

  if (autoCloseThreshold < warningThreshold) {
    return {
      warningThreshold,
      autoCloseThreshold: warningThreshold,
    }
  }

  return {
    warningThreshold,
    autoCloseThreshold,
  }
}
