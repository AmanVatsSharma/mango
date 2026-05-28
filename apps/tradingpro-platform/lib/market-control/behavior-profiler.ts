/**
 * @file behavior-profiler.ts
 * @module lib/market-control
 * @description Per-user behaviour profiler. Phase-2 wraps the existing scalper-flagger signals
 *              (trades-per-minute, profitable round-trips-per-hour) and exposes a combined score
 *              shape that the admin drawer can render. Additional signals (martingaleScore,
 *              newsWindowScore, staleQuoteScore) are placeholders — they currently return 0 and
 *              are computed as the Phase-2 rollout ticks on.
 *
 *              Integration path: OrderExecutionWorker calls recordFill + evaluateAndMaybeFlag
 *              after every close — those still live in scalper-flagger.ts for now, this file is
 *              the stable public surface the admin API reads.
 * @author StockTrade
 * @created 2026-04-16
 */

import { isRedisEnabled, redisGet } from "@/lib/redis/redis-client"

const TRADES_KEY = (userId: string) => `mc:flag:trades:${userId}`
const ROUNDTRIPS_KEY = (userId: string) => `mc:flag:roundtrips:${userId}`

export interface BehaviorProfile {
  userId: string
  scalperScore: number // 0..1
  martingaleScore: number // 0..1 — placeholder
  newsWindowScore: number // 0..1 — placeholder
  staleQuoteScore: number // 0..1 — placeholder
  signals: {
    tradesLastMinute: number
    profitableRoundTripsLastHour: number
  }
}

async function readCount(key: string): Promise<number> {
  if (!isRedisEnabled()) return 0
  const raw = await redisGet(key)
  if (!raw) return 0
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}

/** Load the per-user profile used by the admin drawer. Best-effort — returns zeros on failure. */
export async function getBehaviorProfile(userId: string): Promise<BehaviorProfile> {
  const [tpm, rtph] = await Promise.all([readCount(TRADES_KEY(userId)), readCount(ROUNDTRIPS_KEY(userId))])
  const scalperScore = Math.min(1, tpm / 5 + rtph / 8) / 2
  return {
    userId,
    scalperScore: Number.isFinite(scalperScore) ? scalperScore : 0,
    martingaleScore: 0,
    newsWindowScore: 0,
    staleQuoteScore: 0,
    signals: { tradesLastMinute: tpm, profitableRoundTripsLastHour: rtph },
  }
}
