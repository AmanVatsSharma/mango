/**
 * @file admin-analytics-buckets.ts
 * @module server
 * @description Time-bucket construction for admin analytics revenue series (range-aligned, IST labels).
 * @author StockTrade
 * @created 2026-04-06
 *
 * Notes:
 * - Each bucket carries `bucketStart` and `alignedEnd`; revenue uses `lt alignedEnd` when the hour/day
 *   is complete, otherwise `lte now` for the in-progress boundary.
 * - Granularity: hourly for 24h, daily for 7d/30d, 7-day strips from range start for 90d/1y.
 */

import type { AdminAnalyticsRevenueGranularity } from "@/lib/types/admin-analytics"
import type { AdminAnalyticsRangeToken } from "@/lib/server/admin-analytics-number-utils"

export type AdminAnalyticsBucket = {
  bucketStart: Date
  alignedEnd: Date
  label: string
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d.getTime())
  x.setHours(0, 0, 0, 0)
  return x
}

function startOfLocalHour(d: Date): Date {
  const x = new Date(d.getTime())
  x.setMinutes(0)
  return x
}

export function resolveRevenueGranularity(range: AdminAnalyticsRangeToken): AdminAnalyticsRevenueGranularity {
  if (range === "24h") return "hour"
  if (range === "90d" || range === "1y") return "week"
  return "day"
}

function formatLabelIST(d: Date, granularity: AdminAnalyticsRevenueGranularity): string {
  if (granularity === "hour") {
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      day: "numeric",
      month: "short",
    })
  }
  if (granularity === "day") {
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  }
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

export function buildAdminAnalyticsRevenueBuckets(
  range: AdminAnalyticsRangeToken,
  startDate: Date,
  now: Date,
): AdminAnalyticsBucket[] {
  const granularity = resolveRevenueGranularity(range)
  const buckets: AdminAnalyticsBucket[] = []

  if (granularity === "hour") {
    let t = startOfLocalHour(startDate)
    while (t < now) {
      const alignedEnd = new Date(t.getTime() + 60 * 60 * 1000)
      const bucketStart = t.getTime() < startDate.getTime() ? startDate : t
      if (bucketStart < now) {
        buckets.push({
          bucketStart,
          alignedEnd,
          label: formatLabelIST(t, granularity),
        })
      }
      t = alignedEnd
    }
    return buckets
  }

  if (granularity === "day") {
    let t = startOfLocalDay(startDate)
    while (t < now) {
      const alignedEnd = new Date(t.getTime() + 24 * 60 * 60 * 1000)
      const bucketStart = t.getTime() < startDate.getTime() ? startDate : t
      if (bucketStart < now) {
        buckets.push({
          bucketStart,
          alignedEnd,
          label: formatLabelIST(t, granularity),
        })
      }
      t = alignedEnd
    }
    return buckets
  }

  let t = new Date(startDate.getTime())
  while (t < now) {
    const alignedEnd = new Date(t.getTime() + 7 * 24 * 60 * 60 * 1000)
    buckets.push({
      bucketStart: t,
      alignedEnd,
      label: formatLabelIST(t, granularity),
    })
    t = alignedEnd
  }

  return buckets
}

/** Prisma-safe createdAt filter for one revenue bucket. */
export function revenueBucketCreatedAtWhere(
  bucket: AdminAnalyticsBucket,
  now: Date,
): { gte: Date; lt?: Date; lte?: Date } {
  if (bucket.alignedEnd.getTime() <= now.getTime()) {
    return { gte: bucket.bucketStart, lt: bucket.alignedEnd }
  }
  return { gte: bucket.bucketStart, lte: now }
}
