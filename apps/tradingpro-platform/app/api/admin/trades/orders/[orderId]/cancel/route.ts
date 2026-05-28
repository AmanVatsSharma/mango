/**
 * @file route.ts
 * @module admin-console/trades
 * @description POST /api/admin/trades/orders/[orderId]/cancel — admin-initiated cancel of a
 *              pending OPEN or CLOSE order. Delegates to OrderExecutionService.cancelOrder,
 *              which handles margin refund and charge reversal.
 * @author StockTrade
 * @created 2026-04-15
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { createTradingLogger } from "@/lib/services/logging/TradingLogger"
import { createOrderExecutionService } from "@/lib/services/order/OrderExecutionService"

export async function POST(
  req: Request,
  context: { params: Promise<{ orderId: string }> | { orderId: string } },
) {
  const params = await Promise.resolve(context.params)
  const orderId = params.orderId

  return handleAdminApi(
    req,
    {
      route: "/api/admin/trades/orders/[orderId]/cancel",
      required: "admin.positions.manage",
      fallbackMessage: "Failed to cancel order",
    },
    async (ctx) => {
      if (!orderId || typeof orderId !== "string") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "orderId is required",
          statusCode: 400,
        })
      }

      const existing = await adminPrisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          symbol: true,
          tradingAccountId: true,
          positionId: true,
          tradingAccount: { select: { userId: true } },
        },
      })
      if (!existing) {
        throw new AppError({ code: "NOT_FOUND", message: "Order not found", statusCode: 404 })
      }
      if (existing.status !== "PENDING") {
        throw new AppError({
          code: "ORDER_NOT_CANCELLABLE",
          message: `Cannot cancel ${existing.status} order`,
          statusCode: 409,
        })
      }

      const logger = createTradingLogger({
        userId: existing.tradingAccount?.userId ?? ctx.session.user.id,
        tradingAccountId: existing.tradingAccountId,
        symbol: existing.symbol,
        positionId: existing.positionId ?? undefined,
      })
      const orderService = createOrderExecutionService(logger)
      const result = await orderService.cancelOrder(orderId)

      return NextResponse.json({ success: true, result }, { status: 200 })
    },
  )
}
