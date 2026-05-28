/**
 * File:        components/admin-v2/observability/hooks.ts
 * Module:      admin-v2/observability
 * Purpose:     SWR hooks for the Phase 16 Observability Dashboard. Each hook targets a
 *              different admin health endpoint with a staggered refresh interval to avoid
 *              thundering-herd spikes on the server.
 *
 * Exports:
 *   - useSystemHealth()          — 10s refresh, /api/admin/system/health
 *   - useMarketDataHealth()      — 15s refresh, /api/admin/market-data-health
 *   - useQueueStatus()           — 10s refresh, /api/admin/queue-status
 *   - useQuotesBatcherStatus()   — 10s refresh, /api/admin/quotes-batcher-status
 *
 * Side-effects:
 *   - Network: GET requests on mount + interval
 *
 * Key invariants:
 *   - revalidateOnFocus: false on all hooks — a focused tab shouldn't hammer the server
 *   - keepPreviousData: true on system/queue hooks so panels don't flicker on refetch
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import useSWR from "swr"
import { jsonFetcher } from "@/lib/admin-v2/api-client"
import type {
  MarketDataHealthResp,
  QuotesBatcherStatusResp,
  QueueStatusResp,
  SystemHealthResp,
} from "./types"

export function useSystemHealth() {
  return useSWR<SystemHealthResp>("/api/admin/system/health", jsonFetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
}

export function useMarketDataHealth() {
  return useSWR<MarketDataHealthResp>("/api/admin/market-data-health", jsonFetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
}

export function useQueueStatus() {
  return useSWR<QueueStatusResp>("/api/admin/queue-status", jsonFetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
}

export function useQuotesBatcherStatus() {
  return useSWR<QuotesBatcherStatusResp>("/api/admin/quotes-batcher-status", jsonFetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
}
