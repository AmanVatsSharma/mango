/**
 * File:        lib/market-data/live-quote-ladder.ts
 * Module:      Market Data · Live Price Resolution
 * Purpose:     Resolves a live price for a single position using a tiered
 *              Redis-first ladder (market-quote → position-pnl worker → DB ltp).
 *
 * Exports:
 *   - LivePriceSource                      — union of price resolution tiers
 *   - LivePriceResult                      — resolved price + metadata
 *   - resolveLivePrice(opts) → Promise<LivePriceResult>  — main entry point
 *
 * Depends on:
 *   - @/lib/server/market-quote-redis       — readRedisMarketQuoteSnapshotForToken, resolveMarketQuoteRedisMaxAgeMs
 *   - @/lib/server/position-pnl-redis-snapshot — readRedisPositionPnLSnapshot
 *
 * Side-effects:
 *   - Redis GET calls (2 at most per invocation); no writes.
 *
 * Key invariants:
 *   - `price` is 0 only when source === "unpriced"
 *   - `ageMs` is null for "stock-ltp" and "unpriced" (no timestamp available)
 *   - `fallbackLtp` must be > 0 and finite to count as valid; 0 or negative is treated as missing
 *   - workerPnL is populated at tier-2 and carries the worker's computed P&L values verbatim
 *   - prevClose is populated at tier-1 from the market-quote snapshot for dayPnL computation
 *   - ageMs is clamped to 0 to handle minor clock skew
 *
 * Read order:
 *   1. LivePriceSource / LivePriceResult — data shapes
 *   2. resolveLivePrice — tier waterfall logic
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

import {
  readRedisMarketQuoteSnapshotForToken,
  resolveMarketQuoteRedisMaxAgeMs,
} from "@/lib/server/market-quote-redis"
import {
  readRedisPositionPnLSnapshot,
} from "@/lib/server/position-pnl-redis-snapshot"

export type LivePriceSource = "market-quote" | "position-pnl" | "stock-ltp" | "unpriced"

export type LivePriceResult = {
  price: number
  source: LivePriceSource
  ageMs: number | null
  prevClose?: number
  workerPnL?: {
    unrealizedPnL: number
    dayPnL: number
    updatedAtMs: number
  }
}

export async function resolveLivePrice(opts: {
  instrumentToken: number | null | undefined
  positionId: string
  fallbackLtp: number | null | undefined
  /** Override max-age for Redis quotes (ms). Falls back to env REDIS_MARKET_QUOTE_MAX_AGE_MS. */
  maxAgeMs?: number
}): Promise<LivePriceResult> {
  const { instrumentToken, positionId, fallbackLtp } = opts
  const nowMs = Date.now()
  const maxAgeMs = opts.maxAgeMs ?? resolveMarketQuoteRedisMaxAgeMs()

  if (instrumentToken != null && instrumentToken > 0) {
    const snap = await readRedisMarketQuoteSnapshotForToken(
      Math.trunc(instrumentToken),
      maxAgeMs,
      nowMs,
    )
    if (snap) {
      return {
        price: snap.last_trade_price,
        source: "market-quote",
        ageMs: Math.max(0, nowMs - snap.receivedAtMs),
        prevClose: snap.prev_close_price,
      }
    }
  }

  const workerSnap = await readRedisPositionPnLSnapshot(positionId, maxAgeMs, nowMs)
  if (workerSnap && typeof workerSnap.currentPrice === "number" && workerSnap.currentPrice > 0) {
    return {
      price: workerSnap.currentPrice,
      source: "position-pnl",
      ageMs: Math.max(0, nowMs - workerSnap.updatedAtMs),
      workerPnL: {
        unrealizedPnL: workerSnap.unrealizedPnL,
        dayPnL: workerSnap.dayPnL,
        updatedAtMs: workerSnap.updatedAtMs,
      },
    }
  }

  if (typeof fallbackLtp === "number" && Number.isFinite(fallbackLtp) && fallbackLtp > 0) {
    return { price: fallbackLtp, source: "stock-ltp", ageMs: null }
  }

  return { price: 0, source: "unpriced", ageMs: null }
}
