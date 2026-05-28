/**
 * @file components/admin-v2/client-360/hooks.ts
 * @module admin-v2/client-360
 * @description SWR data hooks for v2 clients list + detail. Centralized so every consumer
 *              uses the same cache keys, fetcher, and revalidation cadence.
 *
 *              Exports:
 *                - useClientsList(filters)   — paginated list with reactive filter changes.
 *                - useClientDetail(userId)   — single client detail; null userId is safe (no fetch).
 *                - useClientCrmNotes(userId) — CRM notes (SWR refresh 30s).
 *                - useClientCrmTasks(userId, status) — CRM tasks.
 *                - useClientActivity(userId) — activity timeline.
 *                - useClientRiskLimit(userId) — RiskLimit + base configs.
 *                - useClientStatement(userId) — full statement (lazy: enabled flag).
 *
 *              Side-effects: network requests to /api/admin/users/**.
 *
 *              Key invariants:
 *                - All hooks no-op when their primary id is null/empty (returns { data: undefined }).
 *                - Refresh intervals follow Section 5 of the plan: 30s for Overview/CRM/Risk,
 *                  60s for Compliance/Funds, off (manual refresh) for Sessions/Audit.
 *
 *              Read order:
 *                1. useClientsList — list view; backbone of the Clients page.
 *                2. useClientDetail — drives every Client 360 tab via shared cache.
 *                3. The other hooks — per-tab augmenters.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import useSWR, { type SWRConfiguration } from "swr"
import { jsonFetcher, withQuery } from "@/lib/admin-v2/api-client"
import type {
  ClientFilters,
  UserDetailResp,
  UserListResp,
} from "./types"

const REFRESH_30S: SWRConfiguration = { refreshInterval: 30_000, revalidateOnFocus: false }
const REFRESH_60S: SWRConfiguration = { refreshInterval: 60_000, revalidateOnFocus: false }
const MANUAL: SWRConfiguration = { refreshInterval: 0, revalidateOnFocus: false }

export function useClientsList(filters: ClientFilters) {
  const url = withQuery("/api/admin/users", {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    search: filters.search,
    status: filters.status && filters.status !== "all" ? filters.status : undefined,
    kycStatus: filters.kycStatus && filters.kycStatus !== "all" ? filters.kycStatus : undefined,
    userRole: filters.role && filters.role !== "all" ? filters.role : undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    rmId: filters.rmId,
    contactDuplicate: filters.contactDuplicate ? "1" : undefined,
  })
  return useSWR<UserListResp>(url, jsonFetcher, REFRESH_30S)
}

export function useClientDetail(userId: string | null | undefined) {
  return useSWR<UserDetailResp>(
    userId ? `/api/admin/users/${userId}` : null,
    jsonFetcher,
    REFRESH_30S,
  )
}

export function useClientCrmNotes(userId: string | null | undefined) {
  return useSWR(
    userId ? `/api/admin/users/${userId}/crm/notes?limit=50` : null,
    jsonFetcher,
    REFRESH_30S,
  )
}

export function useClientCrmTasks(
  userId: string | null | undefined,
  status: "active" | "done" | "all" = "active",
) {
  return useSWR(
    userId ? `/api/admin/users/${userId}/crm/tasks?status=${status}&upcoming=1` : null,
    jsonFetcher,
    REFRESH_30S,
  )
}

export function useClientActivity(userId: string | null | undefined) {
  return useSWR(
    userId ? `/api/admin/users/${userId}/activity?limit=50` : null,
    jsonFetcher,
    REFRESH_60S,
  )
}

export function useClientRiskLimit(userId: string | null | undefined) {
  return useSWR(
    userId ? `/api/admin/users/${userId}/risk-limit` : null,
    jsonFetcher,
    REFRESH_30S,
  )
}

export function useClientStatement(userId: string | null | undefined, enabled: boolean) {
  return useSWR(
    enabled && userId ? `/api/admin/users/${userId}/statement` : null,
    jsonFetcher,
    MANUAL,
  )
}
