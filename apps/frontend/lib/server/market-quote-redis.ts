/**
 * @file market-quote-redis.ts
 * @module server
 * @description Cross-process LTP cache keyed by instrument token (`market:quote:<token>`) for API/worker parity.
 * @author StockTrade
 * @created 2026-03-30
 *
 * Notes:
 * - Written from live `ServerMarketDataService` ticks (debounced) and legacy `PositionPnLWorker` path removed where redundant.
 * - Read by positions list / closes when a fresh token quote is needed cross-process.
 * - `parseRedisMarketQuoteSnapshot` optional `expectedInstrumentToken` rejects corrupt JSON vs Redis key.
 */

import { isRedisEnabled, redisGet, redisSet } from "@/lib/redis/redis-client"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"
import type { ServerCachedQuote } from "@/lib/market-data/server-cached-quote"
import { DEFAULT_MARKET_DISPLAY_CONFIG_V1 } from "@/lib/market-display/market-display-config.schema"
import { normalizeMarketDataQuoteMaxAgeMs } from "@/lib/market-data/market-data-number-utils"

export type RedisMarketQuoteSnapshot = {
  instrumentToken: number
  last_trade_price: number
  prev_close_price?: number
  receivedAtMs: number
  upstreamTimestamp?: string
}

function envInt(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback
  }
  const parsed = parseFiniteTradingNumber(raw)
  if (parsed === null || !Number.isFinite(parsed)) {
    return fallback
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)))
}

export function resolveMarketQuoteRedisTtlSeconds(): number {
  return envInt("REDIS_MARKET_QUOTE_TTL_SECONDS", 60, 10, 86_400)
}

/**
 * Max age for accepting a token quote overlay on the positions list (defaults align with `MARKETDATA_QUOTE_MAX_AGE_MS`).
 */
export function resolveMarketQuoteRedisMaxAgeMs(): number {
  return normalizeMarketDataQuoteMaxAgeMs(process.env.REDIS_MARKET_QUOTE_MAX_AGE_MS, 7_500)
}

export function marketQuoteRedisKey(instrumentToken: number): string {
  return `market:quote:${Math.trunc(instrumentToken)}`
}

export type ParseRedisMarketQuoteSnapshotOptions = {
  /** When set, reject payloads whose embedded `instrumentToken` does not match the Redis key token. */
  expectedInstrumentToken?: number
}

export function parseRedisMarketQuoteSnapshot(
  rawValue: unknown,
  maxAgeMs: number,
  nowMs: number,
  options?: ParseRedisMarketQuoteSnapshotOptions,
): RedisMarketQuoteSnapshot | null {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return null
  }
  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>
    const receivedAtMs = parseFiniteTradingNumber(parsed?.receivedAtMs)
    if (receivedAtMs === null || nowMs - receivedAtMs > maxAgeMs) {
      return null
    }
    const instrumentToken = parseFiniteTradingNumber(parsed?.instrumentToken)
    const last_trade_price = parseFiniteTradingNumber(parsed?.last_trade_price)
    if (
      instrumentToken === null ||
      !Number.isInteger(instrumentToken) ||
      instrumentToken <= 0 ||
      last_trade_price === null ||
      last_trade_price <= 0
    ) {
      return null
    }
    const prev_close_price = parseFiniteTradingNumber(parsed?.prev_close_price)
    const upstreamTimestamp =
      typeof parsed?.upstreamTimestamp === "string" && parsed.upstreamTimestamp.trim()
        ? parsed.upstreamTimestamp.trim()
        : undefined
    const expected = options?.expectedInstrumentToken
    if (
      expected !== undefined &&
      Number.isFinite(expected) &&
      Math.trunc(expected) > 0 &&
      instrumentToken !== Math.trunc(expected)
    ) {
      return null
    }
    return {
      instrumentToken,
      last_trade_price,
      prev_close_price:
        prev_close_price !== null && prev_close_price > 0 ? prev_close_price : undefined,
      receivedAtMs,
      upstreamTimestamp,
    }
  } catch {
    return null
  }
}

function pickPrevCloseFromQuote(quote: ServerCachedQuote): number | undefined {
  const fromPrev = quote.prev_close_price
  if (typeof fromPrev === "number" && Number.isFinite(fromPrev) && fromPrev > 0) {
    return fromPrev
  }
  const fromClose = quote.close
  if (typeof fromClose === "number" && Number.isFinite(fromClose) && fromClose > 0) {
    return fromClose
  }
  return undefined
}

export async function writeMarketQuoteRedisFromServerQuote(
  instrumentToken: number,
  quote: ServerCachedQuote,
): Promise<void> {
  if (!isRedisEnabled()) return
  const token = Math.trunc(instrumentToken)
  if (token <= 0) return
  const ltp = quote.last_trade_price
  if (typeof ltp !== "number" || !Number.isFinite(ltp) || ltp <= 0) {
    return
  }
  const prevClose = pickPrevCloseFromQuote(quote)
  const payload = JSON.stringify({
    instrumentToken: token,
    last_trade_price: Number(ltp.toFixed(4)),
    ...(prevClose !== undefined ? { prev_close_price: Number(prevClose.toFixed(4)) } : {}),
    receivedAtMs: quote.receivedAt,
    ...(quote.upstreamTimestamp ? { upstreamTimestamp: quote.upstreamTimestamp } : {}),
  })
  await redisSet(marketQuoteRedisKey(token), payload, resolveMarketQuoteRedisTtlSeconds())
}

export async function readRedisMarketQuoteSnapshotForToken(
  instrumentToken: number,
  maxAgeMs: number,
  nowMs: number = Date.now(),
): Promise<RedisMarketQuoteSnapshot | null> {
  if (!isRedisEnabled()) return null
  const token = Math.trunc(instrumentToken)
  if (token <= 0) return null
  const raw = await redisGet(marketQuoteRedisKey(token))
  return parseRedisMarketQuoteSnapshot(raw, maxAgeMs, nowMs, {
    expectedInstrumentToken: token,
  })
}
