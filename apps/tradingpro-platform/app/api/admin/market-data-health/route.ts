/**
 * @file route.ts
 * @module admin-console
 * @description Admin diagnostics endpoint for server market-data feed health and token-level quote probe.
 * @author StockTrade
 * @created 2026-02-24
 */

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  getServerMarketDataService,
  SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS,
} from "@/lib/market-data/server-market-data.service"
import {
  parseNonNegativeMarketNumber,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"

const DEFAULT_PROBE_TIMEOUT_MS = 1_250
const DEFAULT_PROBE_MAX_AGE_MS = 5_000

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/market-data-health",
      required: "admin.system.read",
      fallbackMessage: "Failed to fetch market data health",
    },
    async (ctx) => {
      const searchParams = new URL(req.url).searchParams
      const token = parsePositiveIntegerMarketNumber(searchParams.get("token"))
      const subscriptionKeyRaw = searchParams.get("subscriptionKey") || searchParams.get("instrumentId")
      const requestedTimeoutMs = parseNonNegativeMarketNumber(searchParams.get("timeoutMs"))
      const requestedMaxAgeMs = parseNonNegativeMarketNumber(searchParams.get("maxAgeMs"))

      const timeoutMs = Math.max(0, Math.trunc(requestedTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS))
      const maxAgeMs = Math.max(0, Math.trunc(requestedMaxAgeMs ?? DEFAULT_PROBE_MAX_AGE_MS))

      const marketData = getServerMarketDataService()
      await marketData.ensureInitialized().catch((error) => {
        ctx.logger.warn(
          {
            message: (error as any)?.message || String(error),
          },
          "GET /api/admin/market-data-health - ensureInitialized failed",
        )
      })

      let probe:
        | {
            token: number
            status: "fresh"
            ageMs: number
            lastTradePrice: number
            receivedAt: number
            upstreamTimestamp: string | null
          }
        | {
            token: number
            status: "stale_or_missing" | "feed_disconnected"
            maxAgeMs: number
            timeoutMs: number
          }
        | null = null

      if (token !== null) {
        const normalizedSubscriptionKey =
          subscriptionKeyRaw && subscriptionKeyRaw.trim().length > 0
            ? parsePositiveIntegerMarketNumber(subscriptionKeyRaw) ?? subscriptionKeyRaw.trim()
            : undefined
        const quote = await marketData.waitForFreshQuote(token, {
          timeoutMs,
          maxAgeMs,
          subscriptionKey: normalizedSubscriptionKey,
          resubscribeRetryTimeoutMs: SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS,
        })
        if (quote) {
          probe = {
            token,
            status: "fresh",
            ageMs: Math.max(0, Date.now() - quote.receivedAt),
            lastTradePrice: quote.last_trade_price,
            receivedAt: quote.receivedAt,
            upstreamTimestamp: quote.upstreamTimestamp ?? null,
          }
        } else {
          const healthSnapshot = marketData.getHealth()
          probe = {
            token,
            status: healthSnapshot.isConnected ? "stale_or_missing" : "feed_disconnected",
            maxAgeMs,
            timeoutMs,
          }
        }
      }

      const health = marketData.getHealth()
      return NextResponse.json(
        {
          success: true,
          data: {
            health,
            probe,
            timestamp: new Date().toISOString(),
          },
        },
        { status: 200 },
      )
    },
  )
}
