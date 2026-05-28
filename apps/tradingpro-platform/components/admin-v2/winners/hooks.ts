/**
 * @file components/admin-v2/winners/hooks.ts
 * @module admin-v2/winners
 * @description SWR hooks for the Winner Mitigation surfaces.
 *
 *              Exports:
 *                - useWinnerList(opts)     — flagged-winners list, search/filter via opts
 *                - useWinnerControl(userId) — single client snapshot + history
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import useSWR from "swr"
import { jsonFetcher, withQuery } from "@/lib/admin-v2/api-client"
import type { WinnerControlEnvelope, WinnerListEnvelope, WinnerRung } from "./types"

interface UseWinnerListOpts {
  rung?: WinnerRung | undefined
  pinned?: boolean | undefined
  search?: string
  limit?: number
  offset?: number
  refreshMs?: number
}

export function useWinnerList(opts: UseWinnerListOpts = {}) {
  const url = withQuery("/api/admin/winners/list", {
    rung: opts.rung,
    pinned: opts.pinned === undefined ? undefined : String(opts.pinned),
    search: opts.search,
    limit: opts.limit,
    offset: opts.offset,
  })
  return useSWR<WinnerListEnvelope>(url, jsonFetcher, {
    refreshInterval: opts.refreshMs ?? 30_000,
    revalidateOnFocus: false,
  })
}

export function useWinnerControl(userId: string | null | undefined) {
  return useSWR<WinnerControlEnvelope>(
    userId ? `/api/admin/winners/${userId}` : null,
    jsonFetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false },
  )
}
