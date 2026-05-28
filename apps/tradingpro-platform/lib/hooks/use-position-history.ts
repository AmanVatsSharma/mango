/**
 * File:        lib/hooks/use-position-history.ts
 * Module:      Trading · Realtime Hooks
 * Purpose:     SSE-driven closed-position history (History tab). Refetches on `position_closed` events; no periodic polling.
 *
 * Exports:
 *   - usePositionHistory(userId?) → { history, isLoading, error }
 *   - PositionHistoryRow — re-exported type for consumer components
 *
 * Depends on:
 *   - swr — data fetching + cache; refreshInterval is 0
 *   - ./use-shared-sse — single shared EventSource per user; subscribes to `position_closed`
 *   - @/app/api/trading/positions/history/route — PositionHistoryRow type
 *
 * Side-effects:
 *   - HTTP GET /api/trading/positions/history on mount, on tab focus, on network reconnect, on `position_closed` SSE event
 *
 * Key invariants:
 *   - History is append-only during a session — only `position_closed` adds new rows
 *   - revalidateOnFocus enabled (cheap safety net for tab return)
 *   - No periodic polling — drift bounded by SSE delivery + revalidateOnFocus/Reconnect
 *
 * Read order:
 *   1. usePositionHistory — SWR init + SSE subscribe
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

"use client"

import { useCallback } from "react"
import useSWR from "swr"
import type { PositionHistoryRow } from "@/app/api/trading/positions/history/route"
import { useSharedSSESubscribe } from "@/lib/hooks/use-shared-sse"

export type { PositionHistoryRow }

interface HistoryResponse {
  history: PositionHistoryRow[]
}

// 15s hard timeout — same pattern as the orders/positions/account fetchers.
// A hung backend leaves SWR's in-flight promise pending forever and the user
// sees no closed-position history with no error signal. AbortSignal.timeout
// makes the fetch reject so SWR can surface the failure and schedule a retry.
const FETCHER_TIMEOUT_MS = 15_000

async function fetcher(url: string): Promise<HistoryResponse> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCHER_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`positions/history ${res.status}`)
  return res.json() as Promise<HistoryResponse>
}

export function usePositionHistory(userId?: string | null) {
  const { data, error, isLoading, mutate } = useSWR<HistoryResponse>(
    "/api/trading/positions/history",
    fetcher,
    {
      refreshInterval: 0,
      revalidateOnFocus: true,
      focusThrottleInterval: 60_000,
      revalidateOnReconnect: true,
    },
  )

  // SSE-driven: refetch when a position closes (history grows by one row).
  useSharedSSESubscribe(userId || undefined, useCallback((message) => {
    if (message.event === 'position_closed') {
      mutate().catch((err) => {
        console.error('❌ [USE-POSITION-HISTORY] Refresh after position_closed failed:', err)
      })
    }
  }, [mutate]))

  return {
    history: data?.history ?? [],
    isLoading,
    error,
  }
}
