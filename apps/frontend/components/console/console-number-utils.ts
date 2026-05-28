/**
 * @file console-number-utils.ts
 * @module components/console
 * @description Strict numeric and datetime normalization helpers for console account, statements, deposits, and withdrawals views.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber, parseNonNegativeMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeConsoleNumber(value: unknown, fallback = 0): number {
  return parseFiniteMarketNumber(value) ?? fallback
}

export function normalizeConsoleNonNegativeNumber(value: unknown, fallback = 0): number {
  return parseNonNegativeMarketNumber(value) ?? fallback
}

export function normalizeConsoleAmountInput(value: unknown): number {
  return parseFiniteMarketNumber(value) ?? 0
}

export function normalizeConsoleTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return null
  }
  const date = new Date(trimmedValue)
  return Number.isNaN(date.getTime()) ? null : date
}
