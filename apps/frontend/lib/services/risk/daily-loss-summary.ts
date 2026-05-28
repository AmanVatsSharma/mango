/**
 * File:        lib/services/risk/daily-loss-summary.ts
 * Module:      Risk · per-user daily PnL summary (Trading-upr)
 * Purpose:     Compute today's REALIZED + UNREALIZED PnL for one user, with a small
 *              in-process cache so the order-admission hot path doesn't re-sum the
 *              positions table on every order. Powers the maxDailyLoss enforcement in
 *              OrderExecutionService.validateOrder.
 *
 * Exports:
 *   - DailyPnLSummary                        — { realizedPnL, unrealizedPnL, totalPnL, computedAtMs }
 *   - getTodayPnLSummary(userId)             — cached read (5s TTL)
 *   - bustDailyPnLCache(userId?)             — clears one user's entry or all
 *   - __resetDailyPnLCacheForTests()         — test escape hatch
 *
 * Depends on:
 *   - @/lib/prisma — TradingAccount + Position queries
 *   - @/lib/services/risk/risk-number-utils — Decimal/finite parsing
 *   - @/lib/observability/logger — structured Pino audit
 *
 * Side-effects:
 *   - Mutates a globalThis-keyed cache slot.
 *   - One findFirst + closed-position findMany per cache miss; subsequent reads within
 *     5s come from memory.
 *
 * Key invariants:
 *   - TODAY = since IST 00:00 (Asia/Kolkata; no DST). The boundary is computed in the
 *     caller's clock, so a server in any TZ produces consistent IST-day cutoffs.
 *   - realizedPnL = sum of Position.unrealizedPnL on positions CLOSED today (closedAt
 *     between start-of-IST-day and now). Once a position closes, its unrealizedPnL
 *     row reflects the realized P&L of the close — same convention OrderExecutionService
 *     uses elsewhere. (Note: this approximation pairs with the explicit invalidation on
 *     position close; we don't try to reconstruct realized PnL from Transaction rows.)
 *   - unrealizedPnL = sum of Position.unrealizedPnL on positions still open (closedAt
 *     IS NULL).
 *   - totalPnL = realizedPnL + unrealizedPnL. Negative values mean LOSS.
 *
 * Read order:
 *   1. DailyPnLSummary                       — return shape
 *   2. getTodayPnLSummary                    — main entrypoint with cache
 *   3. bustDailyPnLCache                     — invalidation
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { prisma } from "@/lib/prisma"
import { parseFiniteRiskNumber } from "@/lib/services/risk/risk-number-utils"
import { baseLogger } from "@/lib/observability/logger"

const log = baseLogger.child({ module: "daily-loss-summary" })

const DEFAULT_TTL_MS = 5_000

export interface DailyPnLSummary {
  realizedPnL: number
  unrealizedPnL: number
  totalPnL: number
  computedAtMs: number
}

type CacheEntry = {
  fetchedAtMs: number
  value: DailyPnLSummary
}

type CacheState = {
  entries: Map<string, CacheEntry>
}

function getCache(): CacheState {
  const g = globalThis as unknown as { __dailyLossSummaryCache?: CacheState }
  if (!g.__dailyLossSummaryCache) {
    g.__dailyLossSummaryCache = { entries: new Map() }
  }
  return g.__dailyLossSummaryCache
}

/**
 * IST day boundary (Asia/Kolkata, UTC+5:30, no DST). Returns the UTC Date corresponding
 * to today's IST 00:00.
 */
function startOfIstDayUtc(now: Date = new Date()): Date {
  const istShifted = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  istShifted.setUTCHours(0, 0, 0, 0)
  return new Date(istShifted.getTime() - 5.5 * 60 * 60 * 1000)
}

export async function getTodayPnLSummary(
  userId: string,
  options: { maxAgeMs?: number } = {},
): Promise<DailyPnLSummary> {
  const cache = getCache()
  const ttl = Math.max(0, options.maxAgeMs ?? DEFAULT_TTL_MS)

  const cached = cache.entries.get(userId)
  // ttl===0 explicitly means "always miss" (admin-preview / test-bypass) — separate from
  // the `<= ttl` check because `0 <= 0` would trivially hit cache when the call lands in
  // the same ms as the seed.
  if (ttl > 0 && cached && Date.now() - cached.fetchedAtMs <= ttl) {
    return cached.value
  }

  const account = await prisma.tradingAccount.findFirst({
    where: { userId },
    select: { id: true },
  })
  if (!account) {
    // Fail-soft: a user without a trading account has no PnL exposure today. Caller
    // proceeds (in practice the order route would've already rejected for "no account").
    const empty: DailyPnLSummary = {
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalPnL: 0,
      computedAtMs: Date.now(),
    }
    cache.entries.set(userId, { fetchedAtMs: Date.now(), value: empty })
    return empty
  }

  const startUtc = startOfIstDayUtc()

  // One round-trip for closed-today positions; one for currently-open positions.
  // Could be one query with `OR`, but keeping them split keeps the reasoning obvious in
  // the audit logs (closed vs open are reported as separate sums).
  const [closedTodayPositions, openPositions] = await Promise.all([
    prisma.position.findMany({
      where: {
        tradingAccountId: account.id,
        closedAt: { gte: startUtc },
      },
      select: { unrealizedPnL: true },
    }),
    prisma.position.findMany({
      where: {
        tradingAccountId: account.id,
        closedAt: null,
        quantity: { not: 0 },
      },
      select: { unrealizedPnL: true },
    }),
  ])

  const realizedPnL = closedTodayPositions.reduce(
    (sum, p) => sum + (parseFiniteRiskNumber(p.unrealizedPnL) ?? 0),
    0,
  )
  const unrealizedPnL = openPositions.reduce(
    (sum, p) => sum + (parseFiniteRiskNumber(p.unrealizedPnL) ?? 0),
    0,
  )
  const totalPnL = realizedPnL + unrealizedPnL

  const value: DailyPnLSummary = {
    realizedPnL,
    unrealizedPnL,
    totalPnL,
    computedAtMs: Date.now(),
  }
  cache.entries.set(userId, { fetchedAtMs: Date.now(), value })

  log.debug(
    { userId, realizedPnL, unrealizedPnL, totalPnL },
    "DAILY_PNL_SUMMARY_COMPUTED",
  )

  return value
}

/**
 * Clear the cache entry for one user (or all). Called on position close so the next
 * order admission sees the fresh realized PnL instead of stale 5s data.
 */
export function bustDailyPnLCache(userId?: string): void {
  const cache = getCache()
  if (userId) {
    cache.entries.delete(userId)
  } else {
    cache.entries.clear()
  }
}

/**
 * Test-only escape hatch — clears state including the cache map slot itself so jest's
 * resetModules-less reuse pattern doesn't leak.
 */
export function __resetDailyPnLCacheForTests(): void {
  const g = globalThis as unknown as { __dailyLossSummaryCache?: CacheState }
  delete g.__dailyLossSummaryCache
}
