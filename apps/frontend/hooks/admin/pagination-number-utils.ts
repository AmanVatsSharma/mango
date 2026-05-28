/**
 * @file pagination-number-utils.ts
 * @module hooks/admin
 * @description Strict pagination page-token normalization helpers for admin pagination hooks.
 * @author StockTrade
 * @created 2026-02-16
 */

export function normalizePaginationPageToken(value: string | null, fallbackValue: number): number {
  if (!value) {
    return fallbackValue
  }
  const normalizedValue = value.trim()
  if (!/^\d+$/.test(normalizedValue)) {
    return fallbackValue
  }
  const parsedPage = Number(normalizedValue)
  if (!Number.isFinite(parsedPage) || parsedPage < 1) {
    return fallbackValue
  }
  return parsedPage
}
