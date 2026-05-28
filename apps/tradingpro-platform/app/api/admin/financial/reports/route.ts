/**
 * @file route.ts
 * @module admin-console
 * @description API route for financial reports: cash flow, pending ops, platform commission rules, executed orders / placement charges, and time series for charts.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-06
 */

import { NextResponse } from "next/server"
import { DepositStatus, OrderStatus, WithdrawalStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import {
  normalizeAdminAnalyticsDateFilter,
  normalizeAdminAnalyticsNumericValue,
  normalizeAdminFinancialPeriodToken,
} from "@/lib/server/admin-analytics-number-utils"
import {
  financialTimeGranularityForPeriod,
  mergeAdminFinancialTimeSeries,
} from "@/lib/server/admin-financial-reports-utils"
import {
  activeHeadcountBaseWhere,
  resolveActiveUserCountWhere,
} from "@/lib/server/active-user-count-policy"
import { SuperAdminFinanceService } from "@/lib/services/admin/SuperAdminFinanceService"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/financial/reports",
      required: "admin.reports.read",
      fallbackMessage: "Failed to fetch financial reports",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const period = normalizeAdminFinancialPeriodToken(searchParams.get("period"))
      const dateFromRaw = searchParams.get("dateFrom")
      const dateToRaw = searchParams.get("dateTo")
      const dateFrom = normalizeAdminAnalyticsDateFilter(dateFromRaw)
      const dateTo = normalizeAdminAnalyticsDateFilter(dateToRaw)

      if (dateFromRaw !== null && dateFromRaw.trim() !== "" && !dateFrom) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid dateFrom filter", statusCode: 400 })
      }
      if (dateToRaw !== null && dateToRaw.trim() !== "" && !dateTo) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid dateTo filter", statusCode: 400 })
      }

      ctx.logger.debug({ period, dateFrom, dateTo }, "GET /api/admin/financial/reports - request")

      const now = new Date()
      let startDate: Date
      if (dateFrom) {
        startDate = dateFrom
      } else {
        switch (period) {
          case "day":
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
            break
          case "week":
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            break
          case "month":
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            break
          case "quarter":
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
            break
          case "year":
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
            break
          default:
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        }
      }

      const endDate = dateTo || now
      const { where: activeUsersWhere } = await resolveActiveUserCountWhere(
        activeHeadcountBaseWhere({ updatedAt: { gte: startDate } }),
      )

      const executedOrderWindow = {
        status: OrderStatus.EXECUTED,
        OR: [
          { executedAt: { gte: startDate, lte: endDate } },
          {
            AND: [{ executedAt: null }, { createdAt: { gte: startDate, lte: endDate } }],
          },
        ],
      }

      const [
        deposits,
        withdrawals,
        pendingDeposits,
        pendingWithdrawals,
        orderMetrics,
        activeUsers,
        rules,
      ] = await Promise.all([
        adminPrisma.deposit.aggregate({
          where: {
            createdAt: { gte: startDate, lte: endDate },
            status: DepositStatus.COMPLETED,
          },
          _sum: { amount: true },
        }),
        adminPrisma.withdrawal.aggregate({
          where: {
            createdAt: { gte: startDate, lte: endDate },
            status: WithdrawalStatus.COMPLETED,
          },
          _sum: { amount: true },
        }),
        adminPrisma.deposit.count({
          where: { status: { in: [DepositStatus.PENDING, DepositStatus.PROCESSING] } },
        }),
        adminPrisma.withdrawal.count({
          where: { status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING] } },
        }),
        adminPrisma.order.aggregate({
          where: executedOrderWindow,
          _sum: { placementCharges: true },
          _count: { _all: true },
        }),
        prisma.user.count({ where: activeUsersWhere }),
        SuperAdminFinanceService.getCommissionRules(),
      ])

      const totalDeposits = normalizeAdminAnalyticsNumericValue(deposits._sum.amount)
      const totalWithdrawals = normalizeAdminAnalyticsNumericValue(withdrawals._sum.amount)
      const netFlow = totalDeposits - totalWithdrawals
      const revenue = totalDeposits
      const expenses = totalWithdrawals
      const profit = netFlow

      const platformCommission = await SuperAdminFinanceService.computeCommission(
        totalDeposits,
        totalWithdrawals,
        rules,
        startDate,
        endDate,
      )

      const executedOrdersCount = orderMetrics._count._all
      const totalPlacementCharges = normalizeAdminAnalyticsNumericValue(orderMetrics._sum.placementCharges)

      const periodLabel =
        period === "month"
          ? now.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
          : `${startDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} – ${endDate.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`

      const reports = [
        {
          id: "1",
          period: periodLabel,
          revenue,
          expenses,
          profit,
          commission: platformCommission,
          trades: executedOrdersCount,
          users: activeUsers,
          placementChargesTotal: totalPlacementCharges,
        },
      ]

      const tsGranularity = financialTimeGranularityForPeriod(period)
      const { deposits: depSeries, withdrawals: wdlSeries } = await SuperAdminFinanceService.getTimeSeries(
        tsGranularity,
        startDate,
        endDate,
      )
      const timeSeries = mergeAdminFinancialTimeSeries(
        depSeries.map((r) => ({ bucket: r.bucket as Date, total: r.total })),
        wdlSeries.map((r) => ({ bucket: r.bucket as Date, total: r.total })),
      )

      const summary = {
        totalDeposits,
        totalWithdrawals,
        netFlow,
        pendingDeposits,
        pendingWithdrawals,
        platformCommission,
        executedOrdersCount,
        totalPlacementCharges,
        activeUsers,
      }

      ctx.logger.info(
        { period, totalDeposits, totalWithdrawals, netFlow, platformCommission },
        "GET /api/admin/financial/reports - success",
      )
      return NextResponse.json(
        {
          reports,
          summary,
          timeSeries,
          timeSeriesGranularity: tsGranularity,
        },
        { status: 200 },
      )
    },
  )
}
