/**
 * File:        lib/hooks/use-admin-jitter-default.ts
 * Module:      Market Data · admin-resolved jitter default (Trading-mfk)
 * Purpose:     Client-side hook that fetches the admin-resolved jitter rule from
 *              `/api/market-controls/preview` so consumers (the dashboard market-data
 *              provider, the demo MarketDataConfig component) can use the persisted admin
 *              configuration as their DEFAULT instead of the hardcoded dev-noise constants
 *              that previously only lived in the per-tab provider.
 *
 *              When the request fails or auth is missing, the hook returns `null` and the
 *              caller falls back to its own product-default — same posture as before this
 *              hook existed, so it's safe to drop into existing code paths without
 *              behavioural regression.
 *
 * Exports:
 *   - JitterDefault                       — { enabled, intervalMs, intensityPct, convergence }
 *   - useAdminJitterDefault(input?)       — React hook returning the latest snapshot or null
 *   - DEFAULT_JITTER_RULE                  — product-default fallback shape
 *
 * Depends on: SWR. We don't poll — the rule changes only on admin write, and the next
 * mount picks up the new value. A 5-minute cache is enough.
 *
 * Side-effects: a single GET to /api/market-controls/preview on mount + dedupe-window
 * cached re-fetches via SWR.
 *
 * Key invariants:
 *   - Returns DEFAULT_JITTER_RULE when the API call fails / 401s — never throws to the
 *     caller, never blocks render. Consumer can ignore the result entirely.
 *   - SegmentKey + symbol are inputs; without them the hook uses sensible "DEFAULT" values
 *     so the dashboard provider can fetch a fleet-default before the user picks a symbol.
 *
 * Read order:
 *   1. JitterDefault                       — return shape
 *   2. useAdminJitterDefault                — main hook (no params required)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

"use client"

import useSWR from "swr"

export interface JitterDefault {
  enabled: boolean
  intervalMs: number
  intensityPct: number
  convergence: number
}

export const DEFAULT_JITTER_RULE: JitterDefault = {
  enabled: true,
  intervalMs: 250,
  intensityPct: 0.15,
  convergence: 0.1,
}

interface UseAdminJitterDefaultInput {
  /** Optional segment to scope the resolution. Defaults to "NSE_EQ" — fleet baseline. */
  segment?: string
  /** Optional symbol. Symbol-level overrides flow through too. */
  symbol?: string
  /** Optional probe LTP. Required by the preview endpoint contract; doesn't affect jitter. */
  probeLtp?: number
}

const fetcher = async (url: string, body: any) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`market-controls preview failed: ${res.status}`)
  }
  return res.json()
}

/**
 * Returns the admin-resolved jitter rule for the given (segment, symbol) probe, or
 * DEFAULT_JITTER_RULE while loading / on error. Safe to drop into any client component:
 * fail-soft posture, never throws, no SSR concerns (uses "use client" + SWR).
 */
export function useAdminJitterDefault(input: UseAdminJitterDefaultInput = {}): JitterDefault {
  const segment = input.segment ?? "NSE_EQ"
  const symbol = input.symbol ?? "DEFAULT"
  const probeLtp = input.probeLtp && input.probeLtp > 0 ? input.probeLtp : 100

  const swrKey = `/api/market-controls/preview|${segment}|${symbol}|${probeLtp}`
  const { data } = useSWR(
    swrKey,
    () =>
      fetcher("/api/market-controls/preview", {
        segment,
        symbol,
        ltp: probeLtp,
      }),
    {
      // Admin edits trigger a Redis pub/sub bust on the server; clients re-fetch on next
      // mount or focus. No polling needed.
      revalidateOnFocus: false,
      dedupingInterval: 300_000, // 5 minutes
      shouldRetryOnError: false,
    },
  )

  const j = data?.data?.jitter
  if (
    j &&
    typeof j.enabled === "boolean" &&
    typeof j.intervalMs === "number" &&
    typeof j.intensityPct === "number" &&
    typeof j.convergence === "number"
  ) {
    return j
  }
  return DEFAULT_JITTER_RULE
}
