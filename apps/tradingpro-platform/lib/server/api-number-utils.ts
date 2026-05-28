/**
 * @file api-number-utils.ts
 * @module server
 * @description Shared strict numeric/date normalization helpers for non-admin API query params and response serialization.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeApiBoundedInteger(
  value: unknown,
  fallback: number,
  minValue: number,
  maxValue: number
): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return fallback
  }
  const normalizedValue = Math.trunc(parsedValue)
  return Math.min(Math.max(normalizedValue, minValue), maxValue)
}

export function normalizeApiOptionalDate(value: unknown): Date | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined
  }
  const parsedDate = new Date(value as any)
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate
}

export function normalizeApiFiniteNumber(value: unknown, fallback = 0): number {
  return parseFiniteMarketNumber(value) ?? fallback
}
