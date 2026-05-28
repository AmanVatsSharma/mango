/**
 * @file route.ts
 * @module api/admin/orders/bulk
 * @description Bulk order operations API: cancel multiple orders, analytics.
 *
 * Endpoints:
 *   POST /api/admin/orders/bulk/cancel - Bulk cancel pending orders
 *   GET  /api/admin/orders/bulk/analytics - Order analytics
 *
 * Author: StockTrade
 * Last-updated: 2026-05-14
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { getBulkOperationsService } from "@/lib/services/admin/BulkOperationsService"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"

export const dynamic = "force-dynamic"

// POST /api/admin/orders/bulk/cancel
export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/orders/bulk/cancel",
      required: "admin.orders.manage",
      fallbackMessage: "Bulk cancel failed",
    },
    async (ctx) => {
      const body = await req.json()
      const { orders } = body as {
        orders: Array<{
          orderId: string
          tradingAccountId: string
        }>
      }

      if (!Array.isArray(orders) || orders.length === 0) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "orders array is required",
          statusCode: 400,
        })
      }

      if (orders.length > 100) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Maximum 100 orders per bulk cancel",
          statusCode: 400,
        })
      }

      const bulkService = getBulkOperationsService()
      const adminUserId = ctx.session.user.id

      const cancelInputs = orders.map((o) => ({
        orderId: o.orderId,
        tradingAccountId: o.tradingAccountId,
      }))

      const result = await bulkService.bulkCancelOrders(cancelInputs, adminUserId, {
        batchSize: 25,
        delayBetweenBatchesMs: 50,
      })

      return NextResponse.json(result, { status: 200 })
    }
  )
}

// GET /api/admin/orders/bulk/analytics
export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/orders/bulk/analytics",
      required: "admin.orders.read",
      fallbackMessage: "Order analytics failed",
    },
    async (ctx) => {
      const { searchParams } = new URL(req.url)
      const fromDate = searchParams.get("from")
        ? new Date(searchParams.get("from")!)
        : undefined
      const toDate = searchParams.get("to")
        ? new Date(searchParams.get("to")!)
        : undefined
      const userId = searchParams.get("userId") || undefined
      const symbol = searchParams.get("symbol") || undefined

      const bulkService = getBulkOperationsService()
      const result = await bulkService.getOrderAnalytics({
        fromDate,
        toDate,
        userId,
        symbol,
      })

      return NextResponse.json(result, { status: 200 })
    }
  )
}