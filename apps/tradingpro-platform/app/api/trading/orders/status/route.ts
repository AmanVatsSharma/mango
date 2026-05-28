/**
 * @file route.ts
 * @module api/trading/orders/status
 * @description Order status endpoint for realtime execution-state monitoring.
 * @author StockTrade
 * @created 2026-02-16
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withApiTelemetry } from "@/lib/observability/api-telemetry"
import { normalizeOptionalTradingNumber } from "@/lib/server/trading-number"
import {
  assertOrderOwnership,
  getRequestSearchParams,
  requireAuthenticatedUserId,
  resolveTradingErrorResponse,
  TradingAccessError,
} from "@/lib/server/trading-access"

function getOrderStatusMessage(status: string): string {
  switch (status) {
    case "PENDING":
      return "Order is pending execution"
    case "EXECUTED":
      return "Order executed successfully"
    case "CANCELLED":
      return "Order was cancelled"
    case "REJECTED":
      return "Order was rejected"
    case "EXPIRED":
      return "Order expired before execution"
    case "PARTIALLY_FILLED":
      return "Order partially filled"
    default:
      return `Order status: ${status}`
  }
}

export async function GET(req: Request) {
  try {
    const { result } = await withApiTelemetry(req, { name: "trading_order_status" }, async () => {
      const searchParams = getRequestSearchParams(req)
      const orderId = searchParams.get('orderId')?.trim() || ""

      if (!orderId) {
        throw new TradingAccessError('Order ID required', 400)
      }

      const authenticatedUserId = await requireAuthenticatedUserId()
      await assertOrderOwnership(orderId, authenticatedUserId)

      // Fetch order payload after ownership validation
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          status: true,
          symbol: true,
          quantity: true,
          price: true,
          averagePrice: true,
          filledQuantity: true,
          failureCode: true,
          failureReason: true,
          createdAt: true,
          executedAt: true,
        },
      })

      if (!order) {
        throw new TradingAccessError('Order not found', 404)
      }

      const status = order.status
      const message =
        order.failureReason && order.failureReason.trim().length > 0
          ? order.failureReason
          : getOrderStatusMessage(status)

      return NextResponse.json({
        success: true,
        orderId: order.id,
        status,
        symbol: order.symbol,
        quantity: order.quantity,
        price: normalizeOptionalTradingNumber(order.price),
        averagePrice: normalizeOptionalTradingNumber(order.averagePrice),
        filledQuantity: order.filledQuantity,
        failureCode: order.failureCode,
        failureReason: order.failureReason,
        createdAt: order.createdAt.toISOString(),
        executedAt: order.executedAt?.toISOString() || null,
        message
      })
    })

    return result
  } catch (error: any) {
    console.error('❌ [API-ORDER-STATUS] Error:', error)
    const { message, status } = resolveTradingErrorResponse(error, 'Failed to fetch order status', 500)
    return NextResponse.json({
      success: false,
      error: message
    }, { status })
  }
}