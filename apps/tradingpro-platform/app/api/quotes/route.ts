/**
 * File:        app/api/quotes/route.ts
 * Module:      Quotes · REST endpoint (vedpragya-backed)
 * Purpose:     Returns last-trade-price (and previous close where available)
 *              for one or more instrument IDs. Backed by the vedpragya
 *              market-data WebSocket via the server-side ServerMarketDataService
 *              singleton — replaces the legacy Rupeezy REST upstream.
 *
 *              Used as a REST fallback by:
 *              - WebSocketMarketDataProvider (browser): when the live WS misses
 *                a quote
 *              - PositionManagementService, RiskMonitoringService (server):
 *                for one-off LTP lookups in non-hot paths. (Critical paths —
 *                order execution, P&L worker, square-off — already call
 *                ServerMarketDataService directly.)
 *
 * Exports:
 *   - GET(request) — query: ?q=<instrumentId>&q=<instrumentId>&mode=ltp
 *
 * Depends on:
 *   - @/lib/market-data/server-market-data.service — vedpragya WS client + cache
 *   - @/lib/market-data/utils/quote-lookup — instrumentId → token parsing
 *   - @/lib/services/cache/CacheService — short-lived response cache (SWR)
 *   - @/lib/services/security/RateLimiter — per-IP rate limit
 *   - @/lib/observability/{logger,metrics,sentry} — instrumentation
 *
 * Side-effects:
 *   - Subscribes the requested instruments on the vedpragya Socket.IO client
 *     (the singleton holds them for subsequent requests — cheap to repeat).
 *   - Writes to in-process response cache + last-known-good cache.
 *
 * Key invariants:
 *   - Response shape MUST stay { success: true, data: { [instrumentId]: quote } }
 *     so all existing REST consumers keep working unchanged. The per-instrument
 *     quote object exposes both `last_trade_price` and `ltp` aliases (callers
 *     check both) plus `ohlc.close` for previous-close where available.
 *   - We wait up to LIVE_WAIT_TIMEOUT_MS for a fresh quote. If we still have
 *     none, the slot is omitted from the response. Callers must handle missing
 *     keys (every existing caller does).
 *   - This route never throws past the outer try/catch — partial failures
 *     return a 200 with whatever quotes we did get, plus a `meta.partial: true`
 *     flag. A full upstream failure falls back to last-known-good cache.
 *
 * Read order:
 *   1. parseRequest — query parsing + validation
 *   2. fetchQuotes — vedpragya subscribe + waitForFreshQuote
 *   3. GET — wraps with caching, ETag, rate limiting, error handling
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import { NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { getServerMarketDataService } from "@/lib/market-data/server-market-data.service"
import {
  parseTokenFromInstrumentId,
  resolveSubscriptionExchangePrefix,
} from "@/lib/market-data/utils/quote-lookup"
import { cacheService, CacheNamespaces } from "@/lib/services/cache/CacheService"
import { checkRateLimit, getRateLimitKey } from "@/lib/services/security/RateLimiter"
import { config } from "@/lib/config/runtime"
import { withRequest, baseLogger } from "@/lib/observability/logger"
import {
  requestCount,
  requestDuration,
  cacheHits,
  cacheMiss,
  upstreamErrors,
} from "@/lib/observability/metrics"
import { captureError } from "@/lib/observability/sentry"

const log = baseLogger.child({ module: "api/quotes" })

const LIVE_WAIT_TIMEOUT_MS = 800
const LIVE_WAIT_POLL_MS = 50

const RESPONSE_HEADERS = {
  "X-Powered-By": "Vedpragya Bharat",
  "X-API-Name": "Vedpragya Quotes API",
} as const

type QuotePayload = {
  instrumentId: string
  instrumentToken: number
  last_trade_price: number
  ltp: number
  ohlc?: { close: number }
  close?: number
  prev_close_price?: number
  receivedAt: number
  upstreamTimestamp?: string
}

function parseInstruments(searchParams: URLSearchParams): string[] {
  return searchParams
    .getAll("q")
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .sort()
}

async function fetchOne(
  instrumentId: string,
): Promise<QuotePayload | null> {
  const token = parseTokenFromInstrumentId(instrumentId)
  if (token === null) return null

  const exchangePrefix = resolveSubscriptionExchangePrefix(instrumentId)
  const subscriptionKey = exchangePrefix
    ? `${exchangePrefix}-${token}`
    : token

  const service = getServerMarketDataService()
  service.ensureSubscribed([subscriptionKey])

  const cached = service.getQuote(token)
  if (cached) {
    return shapeQuote(instrumentId, cached)
  }

  const fresh = await service.waitForFreshQuote(token, {
    timeoutMs: LIVE_WAIT_TIMEOUT_MS,
    pollMs: LIVE_WAIT_POLL_MS,
    subscriptionKey,
  })
  if (!fresh) return null
  return shapeQuote(instrumentId, fresh)
}

function shapeQuote(
  instrumentId: string,
  quote: {
    instrumentToken: number
    last_trade_price: number
    prev_close_price?: number
    close?: number
    receivedAt: number
    upstreamTimestamp?: string
  },
): QuotePayload {
  const ltp = quote.last_trade_price
  const close = quote.close ?? quote.prev_close_price
  const payload: QuotePayload = {
    instrumentId,
    instrumentToken: quote.instrumentToken,
    last_trade_price: ltp,
    ltp,
    receivedAt: quote.receivedAt,
    upstreamTimestamp: quote.upstreamTimestamp,
  }
  if (close != null && close > 0) {
    payload.ohlc = { close }
    payload.close = close
    payload.prev_close_price = close
  }
  return payload
}

async function fetchQuotes(instruments: string[]): Promise<{
  data: Record<string, QuotePayload>
  partial: boolean
}> {
  const results = await Promise.all(
    instruments.map(async (id) => [id, await fetchOne(id)] as const),
  )
  const data: Record<string, QuotePayload> = {}
  let partial = false
  for (const [id, quote] of results) {
    if (quote) {
      data[id] = quote
    } else {
      partial = true
    }
  }
  return { data, partial }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const { searchParams } = new URL(request.url)
  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  const reqLog = withRequest({ route: "/api/quotes", ip: ip || undefined })

  try {
    const instruments = parseInstruments(searchParams)
    const mode = searchParams.get("mode") || "ltp"

    if (instruments.length === 0) {
      return NextResponse.json(
        {
          error: "Query parameter 'q' is required",
          code: "MISSING_INSTRUMENTS",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers: RESPONSE_HEADERS },
      )
    }

    if (config.feature.rateLimit) {
      const key = getRateLimitKey("quotes_ip", ip as string)
      const limit = checkRateLimit(key, {
        windowMs: config.rateLimit.quotesWindowMs,
        maxRequests: config.rateLimit.quotesMax,
        message: "Too many requests",
      })
      if (!limit.allowed) {
        reqLog.warn({ event: "rate_limited", retryAfter: limit.retryAfter })
        const res = NextResponse.json(
          {
            error: "Too Many Requests",
            code: "RATE_LIMITED",
            retryAfter: limit.retryAfter,
          },
          { status: 429 },
        )
        res.headers.set("Retry-After", String(limit.retryAfter || 1))
        return res
      }
    }

    const cacheKey = `${mode}|${instruments.join(",")}`
    const wantEtag = request.headers.get("if-none-match")

    const cached = config.feature.cache
      ? cacheService.get<any>(cacheKey, { namespace: CacheNamespaces.QUOTES })
      : null
    if (cached) {
      cacheHits.inc({ route: "/api/quotes" })
      const body = { success: true, data: cached.data, meta: cached.meta }
      const etag = `W/"${crypto.createHash("sha1").update(JSON.stringify(body)).digest("hex")}"`
      const headers: Record<string, string> = {
        ETag: etag,
        "Cache-Control": "public, max-age=2, s-maxage=2, stale-while-revalidate=5",
        Vary: "mode, Accept-Encoding",
        "X-Cache-Status": "hit",
        ...RESPONSE_HEADERS,
      }
      if (wantEtag && wantEtag === etag) {
        return new NextResponse(null, { status: 304, headers })
      }
      const res = NextResponse.json(body, { headers })
      requestCount.inc({ route: "/api/quotes", method: "GET", status: "200" })
      requestDuration.observe(
        { route: "/api/quotes", method: "GET", status: "200" },
        (Date.now() - startTime) / 1000,
      )
      return res
    } else {
      cacheMiss.inc({ route: "/api/quotes" })
    }

    const { data, partial } = await fetchQuotes(instruments)
    const processingTime = Date.now() - startTime
    const meta = {
      instrumentCount: Object.keys(data).length,
      requested: instruments.length,
      partial,
      mode,
      processingTime,
      timestamp: new Date().toISOString(),
    }

    if (config.feature.cache && Object.keys(data).length > 0) {
      cacheService.set(
        cacheKey,
        { data, meta },
        { namespace: CacheNamespaces.QUOTES, ttl: config.cache.apiTtlMs },
      )
      if (config.cache.apiStaleMs > 0) {
        cacheService.set(
          `lastgood|${cacheKey}`,
          { data, meta },
          { namespace: CacheNamespaces.QUOTES, ttl: config.cache.apiStaleMs },
        )
      }
    }

    const body = { success: true, data, meta }
    const etag = `W/"${crypto.createHash("sha1").update(JSON.stringify(body)).digest("hex")}"`
    const headers: Record<string, string> = {
      ETag: etag,
      "Cache-Control": "public, max-age=2, s-maxage=2, stale-while-revalidate=5",
      Vary: "mode, Accept-Encoding",
      "X-Cache-Status": "miss",
      ...RESPONSE_HEADERS,
    }
    if (wantEtag && wantEtag === etag) {
      return new NextResponse(null, { status: 304, headers })
    }

    requestCount.inc({ route: "/api/quotes", method: "GET", status: "200" })
    requestDuration.observe(
      { route: "/api/quotes", method: "GET", status: "200" },
      processingTime / 1000,
    )
    return NextResponse.json(body, { headers })
  } catch (error: any) {
    const processingTime = Date.now() - startTime
    log.error(
      {
        message: error?.message,
        instruments: searchParams.getAll("q"),
        processingTime,
      },
      "quotes_fetch_failed",
    )

    try {
      captureError(error, { route: "/api/quotes" })
      upstreamErrors.inc({ route: "/api/quotes", upstream: "vedpragya" })
    } catch {}

    const mode = searchParams.get("mode") || "ltp"
    const instruments = parseInstruments(searchParams)
    const cacheKey = `${mode}|${instruments.join(",")}`
    const stale = config.feature.cache
      ? cacheService.get<any>(`lastgood|${cacheKey}`, {
          namespace: CacheNamespaces.QUOTES,
        })
      : null
    if (stale) {
      const body = {
        success: true,
        data: stale.data,
        meta: { ...stale.meta, stale: true },
      }
      const etag = `W/"${crypto.createHash("sha1").update(JSON.stringify(body)).digest("hex")}"`
      const headers: Record<string, string> = {
        ETag: etag,
        "Cache-Control": "public, max-age=0, s-maxage=0, stale-while-revalidate=5",
        Vary: "mode, Accept-Encoding",
        "X-Cache-Status": "stale",
        ...RESPONSE_HEADERS,
      }
      requestCount.inc({ route: "/api/quotes", method: "GET", status: "200" })
      requestDuration.observe(
        { route: "/api/quotes", method: "GET", status: "200" },
        processingTime / 1000,
      )
      return NextResponse.json(body, { headers })
    }

    requestCount.inc({ route: "/api/quotes", method: "GET", status: "500" })
    requestDuration.observe(
      { route: "/api/quotes", method: "GET", status: "500" },
      processingTime / 1000,
    )
    return NextResponse.json(
      {
        error: "An unexpected error occurred while fetching quotes",
        code: "UNEXPECTED_ERROR",
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers: RESPONSE_HEADERS },
    )
  }
}
