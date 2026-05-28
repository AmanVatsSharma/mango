/**
 * @file route.ts
 * @module api/trading/orders/list
 * @description Orders list endpoint for dashboard polling and realtime refresh.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-01
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withApiTelemetry } from '@/lib/observability/api-telemetry'
import { normalizeOptionalTradingNumber } from "@/lib/server/trading-number"
import {
  assertRequestedUserScope,
  getRequestSearchParams,
  requireAuthenticatedUserId,
  resolveTradingErrorResponse,
} from "@/lib/server/trading-access"
import { formatInstrumentSummary } from "@/lib/market-data/instrument-summary"

export async function GET(req: Request) {
  try {
    const { result } = await withApiTelemetry(req, { name: 'trading_orders_list' }, async () => {
      const searchParams = getRequestSearchParams(req)
      const userId = searchParams.get('userId')
      const accountId = searchParams.get('accountId')

      const authenticatedUserId = await requireAuthenticatedUserId()

      // Ensure user can only fetch their own data
      assertRequestedUserScope(userId, authenticatedUserId)

      // Get trading account — prefer accountId, fallback to user's primary account
      let tradingAccount
      if (accountId) {
        tradingAccount = await prisma.tradingAccount.findUnique({
          where: { id: accountId },
          select: { id: true, userId: true },
        })
        if (!tradingAccount || tradingAccount.userId !== authenticatedUserId) {
          return NextResponse.json({ success: false, error: "Account not found" }, { status: 404 })
        }
        tradingAccount = await prisma.tradingAccount.findUnique({ where: { id: accountId } })
      } else {
        tradingAccount = await prisma.tradingAccount.findFirst({
          where: { userId: authenticatedUserId },
          orderBy: [{ accountType: "asc" }],
        })
      }
      
      if (!tradingAccount) {
        return NextResponse.json({ success: true, orders: [] })
      }
      
      // Fetch orders (last 100, sorted by newest first)
      const orders = await prisma.order.findMany({
        where: {
          tradingAccountId: tradingAccount.id
        },
        include: {
          Stock: {
            select: {
              symbol: true,
              name: true,
              ltp: true,
              instrumentId: true,
              exchange: true,
              segment: true,
              strikePrice: true,
              optionType: true,
              expiry: true,
              lot_size: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 100
      })
      
      return NextResponse.json({
        success: true,
        orders: orders.map((order) => {
          const st = order.Stock
          const instrumentLabel = formatInstrumentSummary({
            symbol: order.symbol,
            exchange: st?.exchange,
            segment: st?.segment,
            name: st?.name,
            strikePrice: st?.strikePrice,
            optionType: st?.optionType ?? undefined,
            expiry: st?.expiry,
            lotSize: st?.lot_size,
          })
          return {
            id: order.id,
            symbol: order.symbol,
            instrumentLabel,
            quantity: order.quantity,
            orderType: order.orderType,
            orderSide: order.orderSide,
            price: normalizeOptionalTradingNumber(order.price),
            averagePrice: normalizeOptionalTradingNumber(order.averagePrice),
            filledQuantity: order.filledQuantity,
            productType: order.productType,
            status: order.status,
            failureCode: order.failureCode,
            failureReason: order.failureReason,
            createdAt: order.createdAt.toISOString(),
            executedAt: order.executedAt?.toISOString() || null,
            stock: st,
          }
        }),
      })
    })

    return result
  } catch (error: any) {
    console.error('❌ [API-ORDERS-LIST] Error:', error)
    const { message, status } = resolveTradingErrorResponse(error, 'Failed to fetch orders', 500)
    return NextResponse.json({
      success: false,
      error: message
    }, { status })
  }
}
