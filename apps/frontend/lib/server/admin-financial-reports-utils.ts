/**
 * @file admin-financial-reports-utils.ts
 * @module server
 * @description Merge deposit/withdrawal time-bucket rows into a single series for admin financial reports charts.
 * @author StockTrade
 * @created 2026-04-06
 */

import { normalizeAdminAnalyticsNumericValue } from "@/lib/server/admin-analytics-number-utils"
import type { TimeGranularity } from "@/lib/services/admin/SuperAdminFinanceService"

export function financialTimeGranularityForPeriod(
  period: "day" | "week" | "month" | "quarter" | "year",
): TimeGranularity {
  if (period === "year") {
    return "month"
  }
  if (period === "quarter") {
    return "week"
  }
  return "day"
}

export type RawFinancialBucketRow = { bucket: Date; total: unknown }

export function mergeAdminFinancialTimeSeries(
  deposits: RawFinancialBucketRow[],
  withdrawals: RawFinancialBucketRow[],
): { bucket: string; deposits: number; withdrawals: number }[] {
  const map = new Map<string, { bucket: string; deposits: number; withdrawals: number }>()
  const keyOf = (b: Date) => new Date(b).toISOString()

  for (const row of deposits) {
    const key = keyOf(row.bucket)
    const cur = map.get(key) ?? { bucket: key, deposits: 0, withdrawals: 0 }
    cur.deposits = normalizeAdminAnalyticsNumericValue(row.total)
    map.set(key, cur)
  }
  for (const row of withdrawals) {
    const key = keyOf(row.bucket)
    const cur = map.get(key) ?? { bucket: key, deposits: 0, withdrawals: 0 }
    cur.withdrawals = normalizeAdminAnalyticsNumericValue(row.total)
    map.set(key, cur)
  }
  return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket))
}
