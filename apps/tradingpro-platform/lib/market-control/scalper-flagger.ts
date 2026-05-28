/**
 * @file scalper-flagger.ts
 * @module lib/market-control
 * @description Rolling-window counters in Redis that detect scalping patterns and auto-demote the
 *              user's market-control group. Completely best-effort — if Redis is disabled, all
 *              flaggers become no-ops and the user stays at STANDARD.
 *
 *              Signals tracked per user:
 *                - trades per minute (any side)           → recorded on each fill
 *                - profitable round-trips per hour         → recorded on each CLOSE with favorable > minProfitableRoundTripPct
 *
 *              When either threshold exceeds the config in `antiScalping.scalperAutoFlag`, the user
 *              is demoted to `demoteToGroup` (default SCALPER). The demotion persists until an
 *              admin manually clears it via `clearUserMarketGroup`.
 * @author StockTrade
 * @created 2026-04-15
 */

import { isRedisEnabled, redisGet, redisSet } from "@/lib/redis/redis-client"
import { setUserMarketGroup } from "./user-group"
import type { AntiScalpingV1, UserGroupKey } from "./market-control-config.schema"

/**
 * A single entry in a sliding-window counter. Stored as JSON-encoded array in Redis so we can
 * prune expired entries cheaply on each write without a ZSET.
 */
type WindowEntry = { t: number /* epoch ms */ }

const TRADES_KEY = (userId: string) => `mc:flag:trades:${userId}`
const ROUNDTRIPS_KEY = (userId: string) => `mc:flag:roundtrips:${userId}`

const TRADES_WINDOW_MS = 60_000 // 1 minute
const ROUNDTRIPS_WINDOW_MS = 60 * 60_000 // 1 hour
const MAX_WINDOW_ENTRIES = 500

async function readWindow(key: string, now: number, windowMs: number): Promise<WindowEntry[]> {
  const raw = await redisGet(key)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const cutoff = now - windowMs
    return parsed
      .filter(
        (e): e is WindowEntry =>
          !!e && typeof (e as any).t === "number" && (e as any).t >= cutoff,
      )
      .slice(-MAX_WINDOW_ENTRIES)
  } catch {
    return []
  }
}

async function appendWindow(
  key: string,
  now: number,
  windowMs: number,
): Promise<number> {
  const existing = await readWindow(key, now, windowMs)
  existing.push({ t: now })
  const trimmed = existing.slice(-MAX_WINDOW_ENTRIES)
  await redisSet(key, JSON.stringify(trimmed), Math.ceil(windowMs / 1000) + 5)
  return trimmed.length
}

/** Call on every successful fill to tick the trades-per-minute counter. */
export async function recordFill(userId: string | null | undefined): Promise<void> {
  if (!userId || !isRedisEnabled()) return
  try {
    await appendWindow(TRADES_KEY(userId), Date.now(), TRADES_WINDOW_MS)
  } catch {
    // best effort
  }
}

/**
 * Call on every CLOSE fill with the favourable move %. Records the round-trip only when the trade
 * was profitable above the configured minimum.
 */
export async function recordCloseRoundTrip(
  userId: string | null | undefined,
  favorablePct: number,
  rules: AntiScalpingV1,
): Promise<void> {
  if (!userId || !isRedisEnabled()) return
  if (!rules.scalperAutoFlag.enabled) return
  if (favorablePct < rules.scalperAutoFlag.minProfitableRoundTripPct) return
  try {
    await appendWindow(ROUNDTRIPS_KEY(userId), Date.now(), ROUNDTRIPS_WINDOW_MS)
  } catch {
    // best effort
  }
}

/**
 * Evaluates both counters against the rules. Returns the group the user should be in *right now*.
 * If thresholds are breached, side-effects (setUserMarketGroup) are applied before returning.
 */
export async function evaluateAndMaybeFlag(
  userId: string | null | undefined,
  rules: AntiScalpingV1,
): Promise<UserGroupKey | null> {
  if (!userId || !isRedisEnabled()) return null
  if (!rules.scalperAutoFlag.enabled) return null
  const now = Date.now()
  const trades = await readWindow(TRADES_KEY(userId), now, TRADES_WINDOW_MS)
  const rts = await readWindow(ROUNDTRIPS_KEY(userId), now, ROUNDTRIPS_WINDOW_MS)

  const tradesPerMin = trades.length
  const rtPerHour = rts.length

  const breach =
    tradesPerMin >= rules.scalperAutoFlag.tradesPerMinuteThreshold ||
    rtPerHour >= rules.scalperAutoFlag.quickRoundTripsPerHour

  if (breach) {
    const target: UserGroupKey = rules.scalperAutoFlag.demoteToGroup
    await setUserMarketGroup(userId, target)
    return target
  }
  return null
}
