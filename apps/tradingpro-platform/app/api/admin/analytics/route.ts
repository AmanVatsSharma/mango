/**
 * @file route.ts
 * @module admin-console
 * @description API route for advanced analytics and metrics
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-06
 *
 * Notes:
 * - topPerformingUsers entries include isTradingDashboardOnline.
 * - Revenue series buckets follow the selected range (hour/day/week); growth and conversion are computed.
 */

import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  buildAdminAnalyticsRevenueBuckets,
  revenueBucketCreatedAtWhere,
  resolveRevenueGranularity,
} from "@/lib/server/admin-analytics-buckets"
import {
  normalizeAdminAnalyticsNumericValue,
  normalizeAdminAnalyticsRangeToken,
} from "@/lib/server/admin-analytics-number-utils"
import {
  activeHeadcountBaseWhere,
  resolveActiveUserCountWhere,
} from "@/lib/server/active-user-count-policy"
import { enrichUsersWithTradingPresence } from "@/lib/server/admin-trading-presence"
import type { AdminAnalyticsResponse } from "@/lib/types/admin-analytics"

type TopPerformerRow = {
  id: string
  name: string | null
  client_id: string | null
  profit: unknown
  trades: bigint
}

async function fetchTopPerformingUsers(startDate: Date, now: Date) {
  const rows = await prisma.$queryRaw<TopPerformerRow[]>(Prisma.sql`
    SELECT u.id, u.name, u.client_id,
      COALESCE(c.credit_sum, 0) AS profit,
      COALESCE(e.trade_count, 0::bigint) AS trades
    FROM users u
    LEFT JOIN (
      SELECT ta."userId", SUM(t.amount) AS credit_sum
      FROM transactions t
      INNER JOIN trading_accounts ta ON ta.id = t."tradingAccountId"
      WHERE t.type = 'CREDIT'::"TransactionType"
        AND t."createdAt" >= ${startDate}
        AND t."createdAt" <= ${now}
      GROUP BY ta."userId"
    ) c ON c."userId" = u.id
    LEFT JOIN (
      SELECT ta."userId", COUNT(*)::bigint AS trade_count
      FROM orders o
      INNER JOIN trading_accounts ta ON ta.id = o."tradingAccountId"
      WHERE o.status = 'EXECUTED'::"OrderStatus"
        AND o."createdAt" >= ${startDate}
        AND o."createdAt" <= ${now}
      GROUP BY ta."userId"
    ) e ON e."userId" = u.id
    WHERE COALESCE(c.credit_sum, 0) > 0 OR COALESCE(e.trade_count, 0) > 0
    ORDER BY COALESCE(c.credit_sum, 0) DESC
    LIMIT 5
  `)

  return rows.map((row) => ({
    id: row.id,
    name: row.name || "Unknown",
    clientId: row.client_id || row.id.slice(0, 10),
    profit: normalizeAdminAnalyticsNumericValue(row.profit),
    trades: Number(row.trades),
  }))
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current > 0 ? 100 : current < 0 ? -100 : null
  }
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/analytics",
      required: "admin.analytics.read",
      fallbackMessage: "Failed to fetch analytics",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const range = normalizeAdminAnalyticsRangeToken(searchParams.get("range"))

      ctx.logger.debug({ range }, "GET /api/admin/analytics - request")

      const now = new Date()
      const dateRanges: Record<string, Date> = {
        "24h": new Date(now.getTime() - 24 * 60 * 60 * 1000),
        "7d": new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        "30d": new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        "90d": new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
        "1y": new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
      }
      const startDate = dateRanges[range] || dateRanges["7d"]
      const periodMs = now.getTime() - startDate.getTime()
      const prevStart = new Date(startDate.getTime() - periodMs)

      const { where: activeUsersWhere } = await resolveActiveUserCountWhere(
        activeHeadcountBaseWhere({ updatedAt: { gte: startDate } }),
      )
      const { where: prevActiveUsersWhere } = await resolveActiveUserCountWhere(
        activeHeadcountBaseWhere({ updatedAt: { gte: prevStart, lt: startDate } }),
      )

      const revenueBuckets = buildAdminAnalyticsRevenueBuckets(range, startDate, now)

      const [
        totalUsers,
        activeUsers,
        prevActiveUsers,
        totalTrades,
        totalRevenue,
        deposits,
        withdrawals,
        orders,
        newUsersInRange,
        newUsersPrev,
        newUsersApprovedInRange,
        prevRevenueAgg,
        topPerformingBase,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: activeUsersWhere }),
        prisma.user.count({ where: prevActiveUsersWhere }),
        adminPrisma.order.count({
          where: { createdAt: { gte: startDate }, status: "EXECUTED" },
        }),
        adminPrisma.transaction.aggregate({
          where: { createdAt: { gte: startDate }, type: "CREDIT" },
          _sum: { amount: true },
        }),
        adminPrisma.deposit.aggregate({
          where: { createdAt: { gte: startDate }, status: "COMPLETED" },
          _sum: { amount: true },
        }),
        adminPrisma.withdrawal.aggregate({
          where: { createdAt: { gte: startDate }, status: "COMPLETED" },
          _sum: { amount: true },
        }),
        adminPrisma.order.findMany({
          where: { createdAt: { gte: startDate } },
          select: { price: true, quantity: true, createdAt: true },
          take: 1000,
        }),
        prisma.user.count({ where: { createdAt: { gte: startDate, lte: now } } }),
        prisma.user.count({
          where: { createdAt: { gte: prevStart, lt: startDate } },
        }),
        prisma.user.count({
          where: {
            createdAt: { gte: startDate, lte: now },
            kyc: { status: "APPROVED" },
          },
        }),
        adminPrisma.transaction.aggregate({
          where: {
            type: "CREDIT",
            createdAt: { gte: prevStart, lt: startDate },
          },
          _sum: { amount: true },
        }),
        fetchTopPerformingUsers(startDate, now),
      ])

      const totalRevenueAmount = normalizeAdminAnalyticsNumericValue(totalRevenue._sum.amount)
      const totalDeposits = normalizeAdminAnalyticsNumericValue(deposits._sum.amount)
      const totalWithdrawals = normalizeAdminAnalyticsNumericValue(withdrawals._sum.amount)
      const prevRevenueAmount = normalizeAdminAnalyticsNumericValue(prevRevenueAgg._sum.amount)
      const avgOrderValue =
        orders.length > 0
          ? orders.reduce(
              (sum, o) =>
                sum + normalizeAdminAnalyticsNumericValue(o.price) * o.quantity,
              0,
            ) / orders.length
          : 0

      const revenueGrowth = percentChange(totalRevenueAmount, prevRevenueAmount)
      const userGrowth = percentChange(newUsersInRange, newUsersPrev)
      const conversionRate =
        newUsersInRange === 0 ? null : Math.round((newUsersApprovedInRange / newUsersInRange) * 1000) / 10

      const revenueByPeriod = await Promise.all(
        revenueBuckets.map(async (bucket) => {
          const createdAt = revenueBucketCreatedAtWhere(bucket, now)
          const dayRevenue = await adminPrisma.transaction.aggregate({
            where: { type: "CREDIT", createdAt },
            _sum: { amount: true },
          })
          return {
            period: bucket.label,
            value: normalizeAdminAnalyticsNumericValue(dayRevenue._sum.amount),
          }
        }),
      )

      const tradingVolume = await prisma.order.groupBy({
        by: ["symbol"],
        where: { createdAt: { gte: startDate }, status: "EXECUTED" },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      })

      const topPerformingUsersWithPresence = await enrichUsersWithTradingPresence(topPerformingBase)

      const analytics: AdminAnalyticsResponse = {
        totalRevenue: totalRevenueAmount,
        totalTrades,
        activeUsers,
        avgOrderValue,
        totalDeposits,
        totalWithdrawals,
        conversionRate,
        churnRate: null,
        userGrowth,
        revenueGrowth,
        topPerformingUsers: topPerformingUsersWithPresence,
        revenueByPeriod,
        revenueBucketGranularity: resolveRevenueGranularity(range),
        userActivity: [],
        tradingVolume: tradingVolume.map((tv) => ({
          symbol: tv.symbol,
          volume: normalizeAdminAnalyticsNumericValue(tv._sum.quantity),
        })),
      }

      ctx.logger.info(
        {
          range,
          totalTrades,
          activeUsers,
          prevActiveUsers,
          totalRevenue: totalRevenueAmount,
          totalUsers,
          topPerformers: topPerformingUsersWithPresence.length,
        },
        "GET /api/admin/analytics - success",
      )

      return NextResponse.json(analytics, { status: 200 })
    },
  )
}
