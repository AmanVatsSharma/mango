/**
 * @file prisma-middleware-number-utils.ts
 * @module server
 * @description Strict numeric normalization helpers for Prisma middleware realtime payload shaping.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizePrismaMiddlewareRequiredNumber(
  value: unknown,
  fallbackValue: number = 0,
): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return fallbackValue
  }
  return parsedValue
}

export function normalizePrismaMiddlewareOptionalNumber(
  value: unknown,
): number | null {
  const parsedValue = parseFiniteMarketNumber(value)
  return parsedValue
}
