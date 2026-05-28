/**
 * @file admin-analytics-number-utils.ts
 * @module server
 * @description Strict normalization helpers for admin analytics/report query tokens, date filters, and aggregate numeric serialization.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

/** Valid `range` query values for `/api/admin/analytics`. */
export type AdminAnalyticsRangeToken = "24h" | "7d" | "30d" | "90d" | "1y"

export function normalizeAdminAnalyticsRangeToken(value: unknown): AdminAnalyticsRangeToken {
  if (value === "24h" || value === "7d" || value === "30d" || value === "90d" || value === "1y") {
    return value
  }
  return "7d"
}

export function normalizeAdminFinancialPeriodToken(value: unknown): "day" | "week" | "month" | "quarter" | "year" {
  if (value === "day" || value === "week" || value === "month" || value === "quarter" || value === "year") {
    return value
  }
  return "month"
}

export function normalizeAdminAnalyticsDateFilter(value: unknown): Date | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined
  }
  const parsedDate = new Date(value as any)
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate
}

export function normalizeAdminAnalyticsNumericValue(value: unknown, fallback = 0): number {
  return parseFiniteMarketNumber(value) ?? fallback
}
