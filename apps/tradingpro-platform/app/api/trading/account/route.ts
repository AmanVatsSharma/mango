/**
 * @file route.ts
 * @module api/trading/account
 * @description Trading account read endpoint for dashboard polling.
 * @author StockTrade
 * @created 2026-02-16
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withApiTelemetry } from '@/lib/observability/api-telemetry'
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import {
  assertRequestedUserScope,
  getRequestSearchParams,
  requireAuthenticatedUserId,
  resolveTradingErrorResponse,
} from "@/lib/server/trading-access"

export async function GET(req: Request) {
  try {
    const { result } = await withApiTelemetry(req, { name: 'trading_account_get' }, async () => {
      const searchParams = getRequestSearchParams(req)
      const userId = searchParams.get('userId')
      const accountId = searchParams.get('accountId')

      const authenticatedUserId = await requireAuthenticatedUserId()

      // Ensure user can only fetch their own data
      assertRequestedUserScope(userId, authenticatedUserId)

      // Prefer direct account ID lookup (active account switching) over user ID (arbitrary first account)
      let tradingAccount
      if (accountId) {
        // Validate the account belongs to this user before returning it
        const normalizedId = accountId // normalizeOwnedResourceId is for auth checks, not here
        tradingAccount = await prisma.tradingAccount.findUnique({
          where: { id: normalizedId },
          select: { id: true, userId: true },
        })
        if (!tradingAccount || tradingAccount.userId !== authenticatedUserId) {
          return NextResponse.json({
            success: false,
            error: "Account not found or access denied",
          }, { status: 404 })
        }
        // Re-fetch full account data
        tradingAccount = await prisma.tradingAccount.findUnique({ where: { id: normalizedId } })
      } else {
        // Fallback: get the primary LIVE account (legacy behavior — do NOT use for switching)
        tradingAccount = await prisma.tradingAccount.findFirst({
          where: { userId: authenticatedUserId },
          orderBy: [{ accountType: "asc" }], // LIVE before DEMO
        })
      }
      
      if (!tradingAccount) {
        return NextResponse.json({
          success: true,
          account: null
        })
      }
      
      return NextResponse.json({
        success: true,
        account: {
          id: tradingAccount.id,
          userId: tradingAccount.userId,
          balance: parseFiniteTradingNumber(tradingAccount.balance) ?? 0,
          availableMargin: parseFiniteTradingNumber(tradingAccount.availableMargin) ?? 0,
          usedMargin: parseFiniteTradingNumber(tradingAccount.usedMargin) ?? 0,
          clientId: tradingAccount.clientId,
          createdAt: tradingAccount.createdAt.toISOString(),
          updatedAt: tradingAccount.updatedAt.toISOString()
        }
      })
    })

    return result
  } catch (error: any) {
    console.error('❌ [API-ACCOUNT] Error:', error)
    const { message, status } = resolveTradingErrorResponse(error, 'Failed to fetch trading account', 500)
    return NextResponse.json({
      success: false,
      error: message
    }, { status })
  }
}
