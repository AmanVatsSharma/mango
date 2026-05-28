/**
 * @file position-pnl-redis-snapshot.ts
 * @module server
 * @description Parse worker-written `positions:pnl:{positionId}` Redis JSON for overlays and exit-price fallback.
 * @author StockTrade
 * @created 2026-03-24
 * @updated 2026-03-30
 *
 * Changelog: `quoteReceivedAtMs` + tick-age strip vs `positionPnlQuoteMaxAgeMs`.
 */

import { isRedisEnabled, redisGet } from "@/lib/redis/redis-client"
import { parseFiniteTradingNumber } from "@/lib/server/trading-number"

export const POSITION_PNL_REDIS_KEY_PREFIX = "positions:pnl:" as const

export type RedisPositionPnLSnapshot = {
  unrealizedPnL: number
  dayPnL: number
  currentPrice?: number
  updatedAtMs: number
  quoteReceivedAtMs?: number
}

export type ParseRedisPositionPnLSnapshotOptions = {
  /** When set, drop `currentPrice` if the embedded tick is older than this (ms). */
  positionPnlQuoteMaxAgeMs?: number
}

export function positionPnlRedisKey(positionId: string): string {
  return `${POSITION_PNL_REDIS_KEY_PREFIX}${positionId}`
}

/**
 * Parse Redis JSON. Returns null if missing, invalid, or older than maxAgeMs relative to nowMs (envelope `updatedAtMs`).
 */
export function parseRedisPositionPnLSnapshot(
  rawValue: unknown,
  maxAgeMs: number,
  nowMs: number,
  options?: ParseRedisPositionPnLSnapshotOptions,
): RedisPositionPnLSnapshot | null {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return null
  }
  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>
    const updatedAtMs = parseFiniteTradingNumber(parsed?.updatedAtMs)
    if (updatedAtMs === null || nowMs - updatedAtMs > maxAgeMs) {
      return null
    }
    const unrealizedPnL = parseFiniteTradingNumber(parsed?.unrealizedPnL)
    const dayPnL = parseFiniteTradingNumber(parsed?.dayPnL)
    if (unrealizedPnL === null || dayPnL === null) {
      return null
    }
    let currentPrice = parseFiniteTradingNumber(parsed?.currentPrice)
    const quoteReceivedAtMs = parseFiniteTradingNumber(parsed?.quoteReceivedAtMs)
    const tickCap = options?.positionPnlQuoteMaxAgeMs
    if (typeof currentPrice === "number" && currentPrice > 0 && tickCap !== undefined && tickCap > 0) {
      const tickMs = quoteReceivedAtMs ?? updatedAtMs
      if (nowMs - tickMs > tickCap) {
        currentPrice = undefined
      }
    }
    return {
      unrealizedPnL,
      dayPnL,
      currentPrice: currentPrice ?? undefined,
      updatedAtMs,
      quoteReceivedAtMs: quoteReceivedAtMs ?? undefined,
    }
  } catch {
    return null
  }
}

export async function readRedisPositionPnLSnapshot(
  positionId: string,
  maxAgeMs: number,
  nowMs: number = Date.now(),
  options?: ParseRedisPositionPnLSnapshotOptions,
): Promise<RedisPositionPnLSnapshot | null> {
  if (!isRedisEnabled()) return null
  const raw = await redisGet(positionPnlRedisKey(positionId))
  return parseRedisPositionPnLSnapshot(raw, maxAgeMs, nowMs, options)
}
