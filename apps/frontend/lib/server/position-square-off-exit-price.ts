/**
 * @file position-square-off-exit-price.ts
 * @module server
 * @description Shared square-off exit mark resolution (client-assisted vs server authority, Redis fallback).
 * @author StockTrade
 * @created 2026-03-27
 * @updated 2026-03-30
 *
 * Changelog: audit fields on ok results; useClientPriceWhenWithinBand; reference divergence; MARKET_DATA_DEGRADED;
 * resubscribeRetry on fresh-quote wait; structured error `code`.
 */

import {
  getServerMarketDataService,
  SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS,
} from "@/lib/market-data/server-market-data.service"
import type {
  PositionCloseExitPricePolicy,
  PositionSquareOffPriceAuthority,
} from "@/lib/market-display/market-display-config.schema"
import { readRedisPositionPnLSnapshot } from "@/lib/server/position-pnl-redis-snapshot"
import { readRedisMarketQuoteSnapshotForToken } from "@/lib/server/market-quote-redis"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import { baseLogger } from "@/lib/observability/logger"

const exitPriceLog = baseLogger.child({ module: "position-square-off-exit-price" })

export type SquareOffExitPriceSource =
  | "client"
  | "server"
  | "subscription_last_tick"
  | "fallback"
  | "redis_snapshot"
  | "redis_token_quote"
  | "client_validated"

export type SquareOffExitPriceAudit = {
  clientIntendedPrice: number | null
  referencePrice: number | null
  deviationBpsActual: number | null
  executedWithClientPrice: boolean
}

export type ResolveSquareOffExitPriceOk = {
  ok: true
  price: number
  source: SquareOffExitPriceSource
  audit?: SquareOffExitPriceAudit
}

export type ResolveSquareOffExitPriceErr = {
  ok: false
  error: string
  status: number
  code?: string
}

export type ResolveSquareOffExitPriceResult = ResolveSquareOffExitPriceOk | ResolveSquareOffExitPriceErr

/**
 * Same trust gate as net square-off: valid exit + proven quote freshness via ltpAgeMs or ltpTimestamp.
 */
export function computeShouldTrustClientExitPrice(input: {
  exitPriceCandidate: number | null | undefined
  ltpAgeMsCandidate: number | null | undefined
  ltpTimestampCandidate: number | null | undefined
  nowMs: number
  maxAgeMs: number
}): boolean {
  const exitPrice =
    input.exitPriceCandidate !== null && input.exitPriceCandidate !== undefined
      ? parseFiniteTradingNumber(input.exitPriceCandidate)
      : null
  if (exitPrice === null || exitPrice <= 0) {
    return false
  }
  const ltpAgeMsCandidate = input.ltpAgeMsCandidate
  const ltpTimestampCandidate = input.ltpTimestampCandidate
  const computedClientQuoteAgeMs =
    ltpAgeMsCandidate === null
      ? null
      : typeof ltpAgeMsCandidate === "number"
        ? Math.max(0, Math.trunc(ltpAgeMsCandidate))
        : ltpTimestampCandidate && ltpTimestampCandidate > 0
          ? Math.max(0, input.nowMs - Math.trunc(ltpTimestampCandidate))
          : null
  const hasClientQuoteMetadata = computedClientQuoteAgeMs !== null
  if (!hasClientQuoteMetadata || computedClientQuoteAgeMs === null) {
    return false
  }
  return computedClientQuoteAgeMs <= input.maxAgeMs
}

export function clientExitWithinDeviationOfReference(
  clientPrice: number,
  referencePrice: number,
  maxDeviationBps: number,
): boolean {
  if (!Number.isFinite(clientPrice) || !Number.isFinite(referencePrice) || referencePrice <= 0) {
    return false
  }
  if (maxDeviationBps <= 0) {
    return clientPrice === referencePrice
  }
  if (maxDeviationBps >= 100_000) {
    return true
  }
  const rel = Math.abs(clientPrice - referencePrice) / referencePrice
  return rel <= maxDeviationBps / 10_000
}

/** Basis points |a−b|/b for audit (rounded integer). */
export function deviationBpsBetween(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null
  return Math.round((Math.abs(a - b) / b) * 10_000)
}

async function fetchServerLiveLtp(input: {
  stockToken: number
  subscriptionKey: number | string
  quoteTimeoutMs: number
  markLiveQuoteMaxAgeMs: number
}): Promise<number | null> {
  const marketData = getServerMarketDataService()
  const health = marketData.getHealth()
  if (!health.isConnected) {
    return null
  }
  const quote = await marketData.waitForFreshQuote(input.stockToken, {
    timeoutMs: input.quoteTimeoutMs,
    maxAgeMs: input.markLiveQuoteMaxAgeMs,
    subscriptionKey: input.subscriptionKey,
    resubscribeRetryTimeoutMs: SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS,
  })
  const ltp = quote?.last_trade_price ?? null
  if (ltp !== null && ltp > 0) {
    return ltp
  }
  return null
}

/**
 * Last tick in server process subscription cache, ignoring freshness (maxAgeMs: 0).
 * Used only when admin config enables allowLastSubscriptionTickFallback.
 */
async function fetchLastCachedSubscriptionTickLtp(input: {
  stockToken: number
  subscriptionKey: number | string
}): Promise<number | null> {
  const marketData = getServerMarketDataService()
  await marketData.ensureInitialized().catch(() => {})
  marketData.ensureSubscribed([input.subscriptionKey])
  const quote = marketData.getQuote(input.stockToken, { maxAgeMs: 0 })
  const ltp = quote?.last_trade_price ?? null
  if (ltp !== null && ltp > 0) {
    return ltp
  }
  return null
}

type ServerMark = { price: number; source: "server" | "subscription_last_tick" }

async function resolveServerMark(input: {
  stockToken: number
  subscriptionKey: number | string
  quoteTimeoutMs: number
  markLiveQuoteMaxAgeMs: number
  allowLastSubscriptionTickFallback: boolean
}): Promise<ServerMark | null> {
  const fresh = await fetchServerLiveLtp({
    stockToken: input.stockToken,
    subscriptionKey: input.subscriptionKey,
    quoteTimeoutMs: input.quoteTimeoutMs,
    markLiveQuoteMaxAgeMs: input.markLiveQuoteMaxAgeMs,
  })
  if (fresh !== null) {
    return { price: fresh, source: "server" }
  }
  if (!input.allowLastSubscriptionTickFallback) {
    return null
  }
  const stale = await fetchLastCachedSubscriptionTickLtp({
    stockToken: input.stockToken,
    subscriptionKey: input.subscriptionKey,
  })
  if (stale !== null) {
    return { price: stale, source: "subscription_last_tick" }
  }
  return null
}

function isMarketDataSocketDisconnected(): boolean {
  return !getServerMarketDataService().getHealth().isConnected
}

function quoteUnavailableResult(input: { markLiveQuoteMaxAgeMs: number }): ResolveSquareOffExitPriceErr {
  const disconnected = isMarketDataSocketDisconnected()
  return {
    ok: false,
    error: disconnected
      ? "Market data feed disconnected; retry shortly or use stock LTP / manual exit."
      : `Quote required (≤${input.markLiveQuoteMaxAgeMs / 1000}s) to close this position.`,
    status: disconnected ? 503 : 400,
    code: disconnected ? "MARKET_DATA_DEGRADED" : "EXIT_PRICE_UNAVAILABLE",
  }
}

function buildAudit(args: {
  clientIntended: number | null
  referencePrice: number | null
  executedPrice: number
  executedWithClientPrice: boolean
}): SquareOffExitPriceAudit | undefined {
  const { clientIntended, referencePrice, executedPrice, executedWithClientPrice } = args
  if (clientIntended === null && referencePrice === null) {
    return {
      clientIntendedPrice: null,
      referencePrice: null,
      deviationBpsActual: null,
      executedWithClientPrice,
    }
  }
  return {
    clientIntendedPrice: clientIntended,
    referencePrice,
    deviationBpsActual:
      clientIntended !== null && referencePrice !== null
        ? deviationBpsBetween(clientIntended, referencePrice)
        : clientIntended !== null
          ? deviationBpsBetween(clientIntended, executedPrice)
          : null,
    executedWithClientPrice,
  }
}

/**
 * Resolves the executed exit price for one instrument context (single lot or net-close primary lot).
 */
export async function resolveSquareOffExitPrice(input: {
  nowMs: number
  exitPriceCandidate: number | null | undefined
  ltpAgeMsCandidate: number | null | undefined
  ltpTimestampCandidate: number | null | undefined
  authority: PositionSquareOffPriceAuthority
  closeExitPolicy: PositionCloseExitPricePolicy
  maxDeviationBps: number
  positionId: string
  stockToken: number | null
  subscriptionKey: number | string
  markLiveQuoteMaxAgeMs: number
  /** Max age for `positions:pnl` Redis envelope (`updatedAtMs`). */
  pnlServerMaxAgeMs: number
  /** Max age for embedded tick when trusting snapshot `currentPrice`. */
  positionPnlQuoteMaxAgeMs: number
  /** Max age for `market:quote:<token>` reads (before position snapshot). */
  redisMarketQuoteMaxAgeMs: number
  quoteTimeoutMs: number
  /**
   * When true (admin-only callers), use last cached subscription tick if fresh quote unavailable.
   * Retail must omit or pass false.
   */
  allowLastSubscriptionTickFallback?: boolean
  /**
   * When true: if client exit is within `maxDeviationBps` of server/Redis reference, book client price;
   * if outside band, reject (422) instead of falling back to server.
   * Also allows validating a client-supplied price against server reference without full freshness metadata.
   */
  useClientPriceWhenWithinBand?: boolean
  /** Optional explicit intended price for audit (defaults to `exitPriceCandidate` when parsed). */
  clientIntendedExitPrice?: number | null
  /**
   * When non-null and > 0: if both fresh server quote (`source === "server"`) and Redis snapshot exist,
   * reject when they diverge by more than this (bps).
   */
  referenceDivergenceMaxBps?: number | null
}): Promise<ResolveSquareOffExitPriceResult> {
  const allowStale = input.allowLastSubscriptionTickFallback === true
  const useClientBand = input.useClientPriceWhenWithinBand === true
  const divergenceMax = input.referenceDivergenceMaxBps ?? null

  const trustClient = computeShouldTrustClientExitPrice({
    exitPriceCandidate: input.exitPriceCandidate,
    ltpAgeMsCandidate: input.ltpAgeMsCandidate,
    ltpTimestampCandidate: input.ltpTimestampCandidate,
    nowMs: input.nowMs,
    maxAgeMs: input.markLiveQuoteMaxAgeMs,
  })
  const exitPx =
    input.exitPriceCandidate !== null && input.exitPriceCandidate !== undefined
      ? parseFiniteTradingNumber(input.exitPriceCandidate)
      : null
  const explicitIntended =
    input.clientIntendedExitPrice !== undefined && input.clientIntendedExitPrice !== null
      ? parseFiniteTradingNumber(input.clientIntendedExitPrice)
      : null
  const clientIntendedForAudit = explicitIntended ?? exitPx

  const tryRedisPositionPrice = async (): Promise<number | null> => {
    if (input.closeExitPolicy !== "server_live_then_redis_snapshot") {
      return null
    }
    const snap = await readRedisPositionPnLSnapshot(
      input.positionId,
      input.pnlServerMaxAgeMs,
      input.nowMs,
      { positionPnlQuoteMaxAgeMs: input.positionPnlQuoteMaxAgeMs },
    )
    const px = snap?.currentPrice
    if (typeof px === "number" && Number.isFinite(px) && px > 0) {
      return px
    }
    return null
  }

  let serverMark: ServerMark | null = null
  if (input.stockToken !== null) {
    serverMark = await resolveServerMark({
      stockToken: input.stockToken,
      subscriptionKey: input.subscriptionKey,
      quoteTimeoutMs: input.quoteTimeoutMs,
      markLiveQuoteMaxAgeMs: input.markLiveQuoteMaxAgeMs,
      allowLastSubscriptionTickFallback: allowStale,
    })
  }

  let tokenRedisPx: number | null = null
  let positionRedisPx: number | null = null
  if (input.closeExitPolicy === "server_live_then_redis_snapshot") {
    if (input.stockToken !== null && input.stockToken > 0) {
      const mq = await readRedisMarketQuoteSnapshotForToken(
        input.stockToken,
        input.redisMarketQuoteMaxAgeMs,
        input.nowMs,
      )
      const ltp = mq?.last_trade_price
      if (typeof ltp === "number" && Number.isFinite(ltp) && ltp > 0) {
        tokenRedisPx = ltp
      }
    }
    positionRedisPx = await tryRedisPositionPrice()
  }

  if (divergenceMax !== null && divergenceMax > 0 && serverMark !== null && serverMark.source === "server") {
    if (tokenRedisPx !== null) {
      const dbpsT = deviationBpsBetween(serverMark.price, tokenRedisPx)
      if (dbpsT !== null && dbpsT > divergenceMax) {
        return {
          ok: false,
          error:
            "Live server quote and Redis token quote differ beyond the configured limit; retry or use manual exit.",
          status: 422,
          code: "REFERENCE_DIVERGENCE",
        }
      }
    }
    if (positionRedisPx !== null) {
      const dbps = deviationBpsBetween(serverMark.price, positionRedisPx)
      if (dbps !== null && dbps > divergenceMax) {
        return {
          ok: false,
          error:
            "Live server quote and Redis position snapshot differ beyond the configured limit; retry or use manual exit.",
          status: 422,
          code: "REFERENCE_DIVERGENCE",
        }
      }
    }
  }

  const serverLtp = serverMark?.price ?? null
  const serverSource: SquareOffExitPriceSource = serverMark?.source ?? "server"

  if (input.authority === "client_assisted") {
    if (trustClient && exitPx !== null && exitPx > 0) {
      return {
        ok: true,
        price: exitPx,
        source: "client",
        audit: buildAudit({
          clientIntended: clientIntendedForAudit,
          referencePrice: serverLtp,
          executedPrice: exitPx,
          executedWithClientPrice: true,
        }),
      }
    }
    if (serverLtp !== null) {
      return {
        ok: true,
        price: serverLtp,
        source: serverSource,
        audit: buildAudit({
          clientIntended: clientIntendedForAudit,
          referencePrice: serverLtp,
          executedPrice: serverLtp,
          executedWithClientPrice: false,
        }),
      }
    }
    if (tokenRedisPx !== null) {
      exitPriceLog.debug(
        { positionId: input.positionId, source: "redis_token_quote", price: tokenRedisPx },
        "exit mark from Redis token quote",
      )
      return {
        ok: true,
        price: tokenRedisPx,
        source: "redis_token_quote",
        audit: buildAudit({
          clientIntended: clientIntendedForAudit,
          referencePrice: tokenRedisPx,
          executedPrice: tokenRedisPx,
          executedWithClientPrice: false,
        }),
      }
    }
    if (positionRedisPx !== null) {
      exitPriceLog.debug(
        { positionId: input.positionId, source: "redis_snapshot", price: positionRedisPx },
        "exit mark from Redis position snapshot",
      )
      return {
        ok: true,
        price: positionRedisPx,
        source: "redis_snapshot",
        audit: buildAudit({
          clientIntended: clientIntendedForAudit,
          referencePrice: positionRedisPx,
          executedPrice: positionRedisPx,
          executedWithClientPrice: false,
        }),
      }
    }
    return quoteUnavailableResult(input)
  }

  // server authority
  const canUseClientAgainstRef = (trustClient || useClientBand) && exitPx !== null && exitPx > 0

  if (canUseClientAgainstRef) {
    if (serverLtp !== null) {
      const within = clientExitWithinDeviationOfReference(exitPx, serverLtp, input.maxDeviationBps)
      if (within) {
        return {
          ok: true,
          price: exitPx,
          source: "client_validated",
          audit: buildAudit({
            clientIntended: clientIntendedForAudit,
            referencePrice: serverLtp,
            executedPrice: exitPx,
            executedWithClientPrice: true,
          }),
        }
      }
      if (useClientBand) {
        return {
          ok: false,
          error: `Exit price deviates too far from server reference (₹${serverLtp.toFixed(2)}). Adjust price or disable "close at client when within band".`,
          status: 422,
          code: "EXIT_PRICE_DEVIATION",
        }
      }
      return {
        ok: true,
        price: serverLtp,
        source: serverSource,
        audit: buildAudit({
          clientIntended: clientIntendedForAudit,
          referencePrice: serverLtp,
          executedPrice: serverLtp,
          executedWithClientPrice: false,
        }),
      }
    }
    const redisRef = tokenRedisPx ?? positionRedisPx
    if (redisRef !== null) {
      const redisSource: SquareOffExitPriceSource =
        tokenRedisPx !== null && redisRef === tokenRedisPx ? "redis_token_quote" : "redis_snapshot"
      const within = clientExitWithinDeviationOfReference(exitPx, redisRef, input.maxDeviationBps)
      if (within) {
        return {
          ok: true,
          price: exitPx,
          source: "client_validated",
          audit: buildAudit({
            clientIntended: clientIntendedForAudit,
            referencePrice: redisRef,
            executedPrice: exitPx,
            executedWithClientPrice: true,
          }),
        }
      }
      if (useClientBand) {
        return {
          ok: false,
          error: `Exit price deviates too far from Redis reference (₹${redisRef.toFixed(2)}).`,
          status: 422,
          code: "EXIT_PRICE_DEVIATION",
        }
      }
      return {
        ok: true,
        price: redisRef,
        source: redisSource,
        audit: buildAudit({
          clientIntended: clientIntendedForAudit,
          referencePrice: redisRef,
          executedPrice: redisRef,
          executedWithClientPrice: false,
        }),
      }
    }
    return {
      ok: false,
      error:
        "Server-authoritative square-off requires a live server quote or Redis snapshot to validate client exit price.",
      status: isMarketDataSocketDisconnected() ? 503 : 400,
      code: isMarketDataSocketDisconnected() ? "MARKET_DATA_DEGRADED" : "EXIT_PRICE_UNAVAILABLE",
    }
  }

  if (serverLtp !== null) {
    return {
      ok: true,
      price: serverLtp,
      source: serverSource,
      audit: buildAudit({
        clientIntended: clientIntendedForAudit,
        referencePrice: serverLtp,
        executedPrice: serverLtp,
        executedWithClientPrice: false,
      }),
    }
  }
  const redisPx = tokenRedisPx ?? positionRedisPx
  if (redisPx !== null) {
    const redisSource: SquareOffExitPriceSource =
      tokenRedisPx !== null && redisPx === tokenRedisPx ? "redis_token_quote" : "redis_snapshot"
    exitPriceLog.debug(
      { positionId: input.positionId, source: redisSource, price: redisPx },
      "exit mark from Redis (server authority)",
    )
    return {
      ok: true,
      price: redisPx,
      source: redisSource,
      audit: buildAudit({
        clientIntended: clientIntendedForAudit,
        referencePrice: redisPx,
        executedPrice: redisPx,
        executedWithClientPrice: false,
      }),
    }
  }
  return quoteUnavailableResult(input)
}
