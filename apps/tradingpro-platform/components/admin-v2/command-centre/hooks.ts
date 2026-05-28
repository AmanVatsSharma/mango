/**
 * @file components/admin-v2/command-centre/hooks.ts
 * @module admin-v2/command-centre
 * @description SWR data hooks for the v2 Command Centre. Trade list, active users, risk flags.
 *              Refresh cadence is tighter than other workbenches (5s active users, 10s trades+flags)
 *              because this is the live ops surface.
 *
 *              Exports: useTradesList, useActiveUsers, useRiskFlags.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import useSWR from "swr"
import { jsonFetcher, withQuery } from "@/lib/admin-v2/api-client"
import type {
  ActiveUsersResponse,
  RiskFlagsResponse,
  TradesFilters,
  TradesListResponse,
} from "./types"

const REFRESH_FAST = { refreshInterval: 5_000, revalidateOnFocus: false }
const REFRESH_MED = { refreshInterval: 10_000, revalidateOnFocus: false }

export function useTradesList(filters: TradesFilters) {
  const url = withQuery("/api/admin/trades", {
    page: filters.page ?? 1,
    limit: filters.limit ?? 50,
    status: filters.status && filters.status !== "all" ? filters.status : undefined,
    side: filters.side && filters.side !== "all" ? filters.side : undefined,
    user: filters.user,
    userId: filters.userId,
    symbol: filters.symbol,
    segment: filters.segment,
    productType: filters.productType,
    from: filters.from,
    to: filters.to,
    minPnl: filters.minPnl,
    maxPnl: filters.maxPnl,
    sortBy: filters.sortBy,
    order: filters.order,
    includeStats: filters.includeStats === false ? "false" : undefined,
  })
  return useSWR<TradesListResponse>(url, jsonFetcher, REFRESH_MED)
}

export function useActiveUsers() {
  return useSWR<ActiveUsersResponse>(
    "/api/admin/trades/active-users",
    jsonFetcher,
    REFRESH_FAST,
  )
}

export function useRiskFlags() {
  return useSWR<RiskFlagsResponse>(
    "/api/admin/trades/risk-flags",
    jsonFetcher,
    REFRESH_MED,
  )
}
