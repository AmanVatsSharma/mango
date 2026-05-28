/**
 * @file expiry-date.ts
 * @module utils
 * @description Strict expiry-date parser supporting YYYYMMDD, YYYY-MM-DD, and ISO date strings.
 * @author StockTrade
 * @created 2026-02-16
 */

function parseStrictDateParts(year: number, month: number, day: number): Date | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return undefined
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined
  }

  const parsedDate = new Date(year, month - 1, day)
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return undefined
  }

  return parsedDate
}

export function parseExpiryDateCandidate(value: string | null | undefined): Date | undefined {
  if (!value) {
    return undefined
  }

  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return undefined
  }

  if (/^\d{8}$/.test(normalizedValue)) {
    const year = Number(normalizedValue.slice(0, 4))
    const month = Number(normalizedValue.slice(4, 6))
    const day = Number(normalizedValue.slice(6, 8))
    return parseStrictDateParts(year, month, day)
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    const year = Number(normalizedValue.slice(0, 4))
    const month = Number(normalizedValue.slice(5, 7))
    const day = Number(normalizedValue.slice(8, 10))
    return parseStrictDateParts(year, month, day)
  }

  const parsedDate = new Date(normalizedValue)
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate
}
