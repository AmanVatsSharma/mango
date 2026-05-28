/**
 * @file market-data-number-utils.ts
 * @module market-data
 * @description Strict numeric normalization helpers for market-data token and timing inputs.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  parseFiniteMarketNumber,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"

export function normalizeMarketDataFiniteNumber(value: unknown): number | null {
  return parseFiniteMarketNumber(value)
}

export function normalizeMarketDataPositiveToken(value: unknown): number | null {
  return parsePositiveIntegerMarketNumber(value)
}

export function normalizeMarketDataQuoteMaxAgeMs(
  value: unknown,
  fallbackValue: number = 7_500,
): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || parsedValue < 0) {
    return fallbackValue
  }

  const normalizedValue = Math.floor(parsedValue)
  if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
    return fallbackValue
  }

  return normalizedValue
}
