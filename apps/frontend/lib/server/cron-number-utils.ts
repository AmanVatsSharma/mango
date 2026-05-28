/**
 * @file cron-number-utils.ts
 * @module server/cron
 * @description Shared strict query-number parsing helpers for cron endpoints.
 * @author StockTrade
 * @created 2026-02-16
 */

export function parseFiniteCronQueryNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }
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
