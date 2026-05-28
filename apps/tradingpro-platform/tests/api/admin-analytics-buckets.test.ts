/**
 * @file admin-analytics-buckets.test.ts
 * @module tests-api
 * @description Unit tests for admin analytics revenue bucket builder and Prisma date filters.
 * @author StockTrade
 * @created 2026-04-06
 */

import {
  buildAdminAnalyticsRevenueBuckets,
  resolveRevenueGranularity,
  revenueBucketCreatedAtWhere,
} from "@/lib/server/admin-analytics-buckets"

describe("admin-analytics-buckets", () => {
  it("resolves granularity per range token", () => {
    expect(resolveRevenueGranularity("24h")).toBe("hour")
    expect(resolveRevenueGranularity("7d")).toBe("day")
    expect(resolveRevenueGranularity("30d")).toBe("day")
    expect(resolveRevenueGranularity("90d")).toBe("week")
    expect(resolveRevenueGranularity("1y")).toBe("week")
  })

  it("builds hourly buckets for 24h range", () => {
    const now = new Date("2026-04-06T15:30:00.000Z")
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const buckets = buildAdminAnalyticsRevenueBuckets("24h", start, now)
    expect(buckets.length).toBeGreaterThan(0)
    expect(buckets.length).toBeLessThanOrEqual(25)
    for (const b of buckets) {
      expect(b.bucketStart.getTime()).toBeLessThan(now.getTime())
      expect(b.alignedEnd.getTime()).toBeGreaterThan(b.bucketStart.getTime())
    }
  })

  it("builds daily buckets for 7d range", () => {
    const now = new Date("2026-04-06T12:00:00.000Z")
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const buckets = buildAdminAnalyticsRevenueBuckets("7d", start, now)
    expect(buckets.length).toBeGreaterThanOrEqual(7)
    expect(buckets.length).toBeLessThanOrEqual(8)
  })

  it("builds weekly strips for 90d range", () => {
    const now = new Date("2026-04-06T12:00:00.000Z")
    const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const buckets = buildAdminAnalyticsRevenueBuckets("90d", start, now)
    expect(buckets.length).toBeGreaterThanOrEqual(12)
    expect(buckets.length).toBeLessThanOrEqual(15)
  })

  it("revenueBucketCreatedAtWhere uses lt when bucket ends before now", () => {
    const now = new Date("2026-04-06T12:00:00.000Z")
    const bucket = {
      bucketStart: new Date("2026-04-05T00:00:00.000Z"),
      alignedEnd: new Date("2026-04-06T00:00:00.000Z"),
      label: "test",
    }
    const w = revenueBucketCreatedAtWhere(bucket, now)
    expect(w).toEqual({ gte: bucket.bucketStart, lt: bucket.alignedEnd })
  })

  it("revenueBucketCreatedAtWhere uses lte now for in-progress bucket", () => {
    const now = new Date("2026-04-06T12:00:00.000Z")
    const bucket = {
      bucketStart: new Date("2026-04-06T00:00:00.000Z"),
      alignedEnd: new Date("2026-04-07T00:00:00.000Z"),
      label: "today",
    }
    const w = revenueBucketCreatedAtWhere(bucket, now)
    expect(w).toEqual({ gte: bucket.bucketStart, lte: now })
  })
})
