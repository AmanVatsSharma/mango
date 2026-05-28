/**
 * @file position-edit-number-utils.ts
 * @module admin-console
 * @description Strict numeric normalization helpers for admin position-edit dialog validation, optional field parsing, and fund-impact math.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber, parseNonNegativeMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizePositionEditRequiredNonNegative(value: unknown): number | null {
  const parsedValue = parseNonNegativeMarketNumber(value)
  return parsedValue === null ? null : parsedValue
}

export function normalizePositionEditOptionalNonNegative(value: unknown): number | null {
  if (value === "") {
    return null
  }
  const parsedValue = parseNonNegativeMarketNumber(value)
  return parsedValue === null ? null : parsedValue
}

export function normalizePositionEditOptionalFinite(value: unknown): number | undefined {
  if (value === "") {
    return undefined
  }
  const parsedValue = parseFiniteMarketNumber(value)
  return parsedValue === null ? undefined : parsedValue
}

export function normalizePositionEditFundImpactInput(value: unknown): number {
  return parseFiniteMarketNumber(value) ?? 0
}
