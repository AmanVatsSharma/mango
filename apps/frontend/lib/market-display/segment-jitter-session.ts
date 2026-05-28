/**
 * @file segment-jitter-session.ts
 * @module market-display
 * @description Maps display segment buckets to exchange trading windows for jitter gating (MCX vs NSE-style hours).
 * @author StockTrade
 * @created 2026-03-24
 *
 * Notes:
 * - Uses client `getSegmentMarketSession` (IST, force-closed, holidays). Jitter runs only when session === "open" (not pre-open).
 * - `default` bucket uses NSE_EQ timing (conservative) for numeric-only subscriptions.
 * - BSE keys follow the same calendar path as NSE in the underlying helper (see market-timing).
 */

import { getMarketSession, getSegmentMarketSession } from "@/lib/hooks/market-timing"
import {
  MARKET_DISPLAY_SEGMENT_KEYS,
  type MarketDisplaySegmentKey,
} from "@/lib/market-display/market-display-config.schema"

/** Segment string passed into `getSegmentMarketSession` for each display bucket. */
export function marketDisplaySegmentKeyToTimingQuery(key: MarketDisplaySegmentKey): string {
  if (key === "default") return "NSE_EQ"
  return key
}

/**
 * Per-segment "regular session open" flags for jitter. Computed once per animation frame.
 */
export function buildSegmentJitterSessionOpenMap(at: Date = new Date()): Record<MarketDisplaySegmentKey, boolean> {
  const out = {} as Record<MarketDisplaySegmentKey, boolean>
  for (const key of MARKET_DISPLAY_SEGMENT_KEYS) {
    const query = marketDisplaySegmentKeyToTimingQuery(key)
    const { session } = getSegmentMarketSession(query, at)
    out[key] = session === "open"
  }
  return out
}

/** Legacy behavior: single NSE-centric session applies to every segment bucket. */
export function buildUniformSegmentJitterSessionOpenMap(at: Date = new Date()): Record<MarketDisplaySegmentKey, boolean> {
  const session = getMarketSession(at)
  const open = session === "open"
  const out = {} as Record<MarketDisplaySegmentKey, boolean>
  for (const key of MARKET_DISPLAY_SEGMENT_KEYS) {
    out[key] = open
  }
  return out
}
