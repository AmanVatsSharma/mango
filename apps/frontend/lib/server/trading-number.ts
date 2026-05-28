/**
 * @file trading-number.ts
 * @module server/trading
 * @description Shared strict numeric parsing helpers for trading APIs.
 * @author StockTrade
 * @created 2026-02-16
 */

export function parseFiniteTradingNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "boolean") {
    return null
  }
  if (typeof value === "string") {
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return null
    }
    const loweredValue = normalizedValue.toLowerCase()
    if (
      loweredValue === "null" ||
      loweredValue === "undefined" ||
      loweredValue === "nan" ||
      loweredValue === "infinity" ||
      loweredValue === "+infinity" ||
      loweredValue === "-infinity"
    ) {
      return null
    }
    const parsedValue = Number(normalizedValue)
    return Number.isFinite(parsedValue) ? parsedValue : null
  }
  try {
    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : null
  } catch {
    return null
  }
}

export function normalizeOptionalTradingNumber(value: unknown): number | null {
  const parsedValue = parseFiniteTradingNumber(value)
  return parsedValue === null ? null : parsedValue
}

export function normalizeClampedTradingInteger(
  value: unknown,
  fallbackValue: number,
  minValue: number,
  maxValue: number,
): number {
  const parsedValue = parseFiniteTradingNumber(value)
  if (parsedValue === null) {
    return fallbackValue
  }
  const normalizedValue = Math.trunc(parsedValue)
  return Math.min(maxValue, Math.max(minValue, normalizedValue))
}
