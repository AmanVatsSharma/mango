/**
 * @file use-market-catalog.ts
 * @module lib/hooks
 * @description SWR-backed hook for the user-facing resolved market catalog. Fetches
 *              /api/market-data/catalog with focusThrottleInterval to avoid hammering on
 *              tab-focus, and revalidates every 30s (matches the server-side resolver TTL —
 *              an extra cycle of data isn't worth the bytes).
 *
 * Exports:
 *   - useMarketCatalog() → { data, error, isLoading, mutate }
 *
 * Side-effects:
 *   - Background HTTP GET to /api/market-data/catalog.
 *
 * Key invariants:
 *   - Returns ResolvedCatalog directly (data.data is unwrapped).
 *   - On error returns undefined data; consumers must guard.
 *
 * @author        BharatERP
 * @created       2026-05-01
 */

"use client"

import useSWR, { type SWRConfiguration } from "swr"
import type { ResolvedCatalog } from "@/lib/market-catalog/resolve-catalog"

const CATALOG_URL = "/api/market-data/catalog"

// 15s hard timeout — catalog is large but stable; a hung backend would leave
// SWR's in-flight promise pending forever, blocking any consumer that reads
// `data` for instrument metadata. AbortSignal.timeout lets SWR's onError
// surface the failure and the SWR auto-revalidate retry the request.
const FETCHER_TIMEOUT_MS = 15_000

const fetcher = async (url: string): Promise<ResolvedCatalog> => {
  const res = await fetch(url, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(FETCHER_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`)
  const json = await res.json()
  if (!json?.success || !json.data) throw new Error("catalog response missing data")
  return json.data as ResolvedCatalog
}

// Instrument catalog rarely changes; 5 min is plenty + revalidate on focus.
const SWR_OPTIONS: SWRConfiguration = {
  revalidateOnFocus: true,
  revalidateIfStale: true,
  refreshInterval: 5 * 60_000,
  focusThrottleInterval: 60_000,
  dedupingInterval: 30_000,
}

export function useMarketCatalog() {
  const { data, error, isLoading, mutate } = useSWR(CATALOG_URL, fetcher, SWR_OPTIONS)
  return { data, error, isLoading, mutate }
}
