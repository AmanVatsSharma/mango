/**
 * File:        lib/house/pnl-aggregator.ts
 * Module:      House Book · Realised P&L Aggregator
 * Purpose:     Build broker realised P&L time-series from settled `transactions`.
 *              Buckets by day / week / month for the history chart on /admin-v2/house.
 *
 * Exports:
 *   - aggregateHousePnlSeries(period, opts?): Promise<HousePnlSeries>
 *
 * Depends on:
 *   - @/lib/prisma — transactions read
 *   - ./types — HousePnlPeriod, HousePnlSeriesPoint, HousePnlSeries
 *
 * Side-effects:
 *   - DB read: transactions where type ∈ {PROFIT, LOSS} within window.
 *
 * Key invariants:
 *   - Realised P&L lives in `transactions` rows with description STARTS WITH "Realized P&L"
 *     and `orderId` set. CREDIT = client profit; DEBIT = client loss.
 *     Broker bucket = −(client realised P&L) = (CREDIT → −amt; DEBIT → +amt).
 *   - Bucket label uses IST calendar (per CLAUDE.md: store UTC, display IST).
 *   - Trades count = number of P&L transaction rows in the bucket.
 *   - Empty buckets are filled with zero so the chart x-axis is contiguous.
 *
 * Read order:
 *   1. aggregateHousePnlSeries — entrypoint
 *   2. windowFor — how the date window for each period is computed
 *   3. bucketKeyIst — IST bucketing rule
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import { prisma } from "@/lib/prisma"
import type { HousePnlPeriod, HousePnlSeries, HousePnlSeriesPoint } from "./types"

interface AggregateOpts {
  /** Override the window upper bound (UTC). Defaults to now. Useful for tests + reports. */
  toUtc?: Date
}

/**
 * Build a broker realised P&L series for the requested period.
 * Period mapping (calendar IST): day → last 30 days · week → last 12 ISO weeks · month → last 12 months.
 */
export async function aggregateHousePnlSeries(
  period: HousePnlPeriod,
  opts: AggregateOpts = {},
): Promise<HousePnlSeries> {
  const to = opts.toUtc ?? new Date()
  const from = windowFor(period, to)

  const rows = await prisma.transaction.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      orderId: { not: null },
      description: { startsWith: "Realized P&L" },
    },
    select: { amount: true, type: true, createdAt: true },
  })

  const buckets = new Map<string, HousePnlSeriesPoint>()

  for (const row of rows) {
    const key = bucketKeyIst(row.createdAt, period)
    const existing = buckets.get(key) ?? { bucket: key, brokerPnl: 0, trades: 0 }
    const amt = Number(row.amount)
    // CREDIT = client gained (broker lost). DEBIT = client lost (broker gained).
    const brokerDelta = row.type === "CREDIT" ? -amt : amt
    existing.brokerPnl += brokerDelta
    existing.trades += 1
    buckets.set(key, existing)
  }

  const points = fillEmptyBuckets(from, to, period, buckets)
  const totalBrokerPnl = points.reduce((s, p) => s + p.brokerPnl, 0)
  const totalTrades = points.reduce((s, p) => s + p.trades, 0)

  return {
    period,
    from: from.toISOString(),
    to: to.toISOString(),
    points,
    totalBrokerPnl,
    totalTrades,
  }
}

function windowFor(period: HousePnlPeriod, to: Date): Date {
  const from = new Date(to)
  if (period === "day") from.setUTCDate(from.getUTCDate() - 30)
  else if (period === "week") from.setUTCDate(from.getUTCDate() - 7 * 12)
  else from.setUTCMonth(from.getUTCMonth() - 12)
  return from
}

function bucketKeyIst(utc: Date, period: HousePnlPeriod): string {
  const ist = new Date(utc.getTime() + 5.5 * 60 * 60 * 1000)
  const y = ist.getUTCFullYear()
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0")
  const d = String(ist.getUTCDate()).padStart(2, "0")
  if (period === "day") return `${y}-${m}-${d}`
  if (period === "month") return `${y}-${m}`
  // ISO week
  const firstThursday = new Date(Date.UTC(y, 0, 4))
  const firstThursdayDow = firstThursday.getUTCDay() || 7
  const week1Start = new Date(firstThursday)
  week1Start.setUTCDate(firstThursday.getUTCDate() - (firstThursdayDow - 1))
  const diffDays = Math.floor((ist.getTime() - week1Start.getTime()) / (24 * 60 * 60 * 1000))
  const weekNum = Math.floor(diffDays / 7) + 1
  return `${y}-W${String(weekNum).padStart(2, "0")}`
}

function fillEmptyBuckets(
  from: Date,
  to: Date,
  period: HousePnlPeriod,
  filled: Map<string, HousePnlSeriesPoint>,
): HousePnlSeriesPoint[] {
  const points: HousePnlSeriesPoint[] = []
  const cursor = new Date(from)
  const stepMs =
    period === "day" ? 24 * 60 * 60 * 1000 : period === "week" ? 7 * 24 * 60 * 60 * 1000 : 0

  if (period === "month") {
    while (cursor <= to) {
      const key = bucketKeyIst(cursor, period)
      points.push(filled.get(key) ?? { bucket: key, brokerPnl: 0, trades: 0 })
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
    }
  } else {
    while (cursor <= to) {
      const key = bucketKeyIst(cursor, period)
      points.push(filled.get(key) ?? { bucket: key, brokerPnl: 0, trades: 0 })
      cursor.setTime(cursor.getTime() + stepMs)
    }
  }

  // Dedupe by bucket label (the same day can map twice on DST boundaries — defensive).
  const seen = new Set<string>()
  return points.filter((p) => (seen.has(p.bucket) ? false : (seen.add(p.bucket), true)))
}
