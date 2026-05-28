/**
 * @file market-quote-tick-writer.ts
 * @module server
 * @description Debounced flush of in-memory server quotes to `market:quote:<token>` Redis (live tick mirror).
 * @author StockTrade
 * @created 2026-03-30
 *
 * Notes:
 * - Min interval is configured from DB via `setMarketQuoteRedisMirrorMinIntervalMs` (worker startup / each PnL tick).
 * - `getMarketQuoteRedisMirrorStats` supports worker heartbeat observability.
 */

import type { ServerCachedQuote } from "@/lib/market-data/server-cached-quote"
import { DEFAULT_MARKET_DISPLAY_CONFIG_V1 } from "@/lib/market-display/market-display-config.schema"
import { writeMarketQuoteRedisFromServerQuote } from "@/lib/server/market-quote-redis"

let minIntervalMs = DEFAULT_MARKET_DISPLAY_CONFIG_V1.quoteFreshness.marketQuoteRedisWriteMinIntervalMs

const pendingQuotes = new Map<number, ServerCachedQuote>()
const flushTimers = new Map<number, ReturnType<typeof setTimeout>>()
const lastWrittenAt = new Map<number, number>()

let tickRedisWrites = 0
let tickRedisDebounceSchedules = 0

export function setMarketQuoteRedisMirrorMinIntervalMs(ms: number): void {
  minIntervalMs = Math.max(0, Math.min(5_000, Math.trunc(ms)))
}

export function getMarketQuoteRedisMirrorStats(): {
  tickRedisWrites: number
  tickRedisDebounceSchedules: number
  minIntervalMs: number
} {
  return {
    tickRedisWrites,
    tickRedisDebounceSchedules,
    minIntervalMs,
  }
}

/** Zero counters (call at start of a worker run for per-tick heartbeat stats). */
export function resetMarketQuoteRedisMirrorStats(): void {
  tickRedisWrites = 0
  tickRedisDebounceSchedules = 0
}

function resetFlushTimer(token: number): void {
  const existing = flushTimers.get(token)
  if (existing) {
    clearTimeout(existing)
    flushTimers.delete(token)
  }
}

async function flushToken(token: number): Promise<void> {
  resetFlushTimer(token)
  const quote = pendingQuotes.get(token)
  pendingQuotes.delete(token)
  if (!quote) {
    return
  }
  lastWrittenAt.set(token, Date.now())
  tickRedisWrites += 1
  await writeMarketQuoteRedisFromServerQuote(token, quote)
}

/**
 * After each in-memory tick update, mirror to Redis (debounced per token when `minIntervalMs` > 0).
 */
export function scheduleMarketQuoteRedisWrite(token: number, quote: ServerCachedQuote): void {
  const t = Math.trunc(token)
  if (t <= 0) return

  if (minIntervalMs <= 0) {
    pendingQuotes.set(t, quote)
    void flushToken(t)
    return
  }

  pendingQuotes.set(t, quote)
  const now = Date.now()
  const last = lastWrittenAt.get(t) ?? 0
  if (now - last >= minIntervalMs) {
    void flushToken(t)
    return
  }

  if (flushTimers.has(t)) {
    return
  }
  tickRedisDebounceSchedules += 1
  const delay = Math.max(1, minIntervalMs - (now - last))
  flushTimers.set(
    t,
    setTimeout(() => {
      void flushToken(t)
    }, delay),
  )
}
