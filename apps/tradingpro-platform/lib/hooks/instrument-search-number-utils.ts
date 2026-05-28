/**
 * @file instrument-search-number-utils.ts
 * @module lib/hooks
 * @description Strict numeric and enum normalization helpers for instrument-search API payload mapping.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  parseNonNegativeMarketNumber,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"

export function normalizeInstrumentSearchToken(value: unknown): number | undefined {
  return parsePositiveIntegerMarketNumber(value) ?? undefined
}

export function normalizeInstrumentSearchNonNegativeNumber(value: unknown): number | undefined {
  return parseNonNegativeMarketNumber(value) ?? undefined
}

export function normalizeInstrumentSearchLotSize(value: unknown): number | undefined {
  return parsePositiveIntegerMarketNumber(value) ?? undefined
}

export function normalizeInstrumentSearchOptionType(
  value: unknown,
  mode: "strict" | "legacy",
): "CE" | "PE" | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const normalizedValue = value.trim().toUpperCase()
  if (!normalizedValue) {
    return undefined
  }
  if (mode === "strict") {
    return normalizedValue === "CE" || normalizedValue === "PE" ? normalizedValue : undefined
  }
  if (normalizedValue === "XX") {
    return undefined
  }
  return normalizedValue as "CE" | "PE"
}
