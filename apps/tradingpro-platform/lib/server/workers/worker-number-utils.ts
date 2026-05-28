/**
 * @file worker-number-utils.ts
 * @module workers
 * @description Shared strict numeric parsing helper for worker runtime and admin paths.
 * @author StockTrade
 * @created 2026-02-16
 */

export function parseFiniteWorkerNumber(value: unknown): number | null {
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
