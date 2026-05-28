/**
 * @file admin-list-query-number-utils.ts
 * @module server
 * @description Strict numeric/date normalization helpers for admin list-style query params (page/limit/days/date range filters).
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeAdminListPageParam(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 1
  }
  const normalizedValue = Math.trunc(parsedValue)
  return normalizedValue > 0 ? normalizedValue : 1
}

export function normalizeAdminListLimitParam(value: unknown, defaultLimit: number, maxLimit: number): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return defaultLimit
  }
  const normalizedValue = Math.trunc(parsedValue)
  return Math.min(Math.max(normalizedValue, 1), maxLimit)
}

export function normalizeAdminListDaysParam(value: unknown, defaultDays: number, maxDays: number): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return defaultDays
  }
  const normalizedValue = Math.trunc(parsedValue)
  return Math.min(Math.max(normalizedValue, 1), maxDays)
}

export function normalizeAdminListDateFilter(value: unknown): Date | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined
  }
  const parsedDate = new Date(value as any)
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate
}
