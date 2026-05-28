/**
 * File:        components/admin-v2/surveillance/hooks.ts
 * Module:      admin-v2/surveillance
 * Purpose:     SWR hooks + mutators for the Phase 13b surveillance workbench.
 *
 * Exports:
 *   - useAlerts(filter)            — paginated queue + KPIs, refreshes every 30s.
 *   - useAlertDetail(id)           — drawer payload, no auto-refresh.
 *   - useSurveillanceRules()       — admin rule list, focus-revalidated.
 *   - postAlertAction              — assign / dismiss / resolve.
 *   - patchRule, runBatch          — rule edits + manual batch trigger (super-admin only).
 *
 * Depends on:
 *   - swr — react data hook.
 *   - @/lib/admin-v2/api-client — jsonFetcher + withQuery + ApiError.
 *
 * Side-effects: SWR network reads + POST/PATCH mutators.
 *
 * Key invariants:
 *   - Mutators throw on non-2xx so the caller can surface the error to a toast.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

"use client"

import useSWR from "swr"
import { jsonFetcher, withQuery, ApiError } from "@/lib/admin-v2/api-client"
import type {
  SurveillanceQueueResponse,
  SurveillanceRuleListResponse,
  SurveillanceAlertDetail,
  SurveillanceFilter,
} from "./types"

export function useAlerts(filter: SurveillanceFilter, page = 1, pageSize = 25) {
  const url = withQuery("/api/admin/surveillance/alerts", {
    status: filter.status === "ANY" ? undefined : filter.status,
    severity: filter.severity === "ANY" ? undefined : filter.severity,
    ruleKey: filter.ruleKey === "ANY" ? undefined : filter.ruleKey,
    q: filter.q || undefined,
    page,
    pageSize,
  })
  return useSWR<SurveillanceQueueResponse>(url, jsonFetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
}

export function useAlertDetail(id: string | null) {
  return useSWR<SurveillanceAlertDetail>(
    id ? `/api/admin/surveillance/alerts/${id}` : null,
    jsonFetcher,
    { revalidateOnFocus: false },
  )
}

export function useSurveillanceRules() {
  return useSWR<SurveillanceRuleListResponse>(
    "/api/admin/surveillance/rules",
    jsonFetcher,
    { revalidateOnFocus: true, focusThrottleInterval: 60_000 },
  )
}

async function postJson<T>(
  url: string,
  body: unknown,
  method: "POST" | "PATCH" = "POST",
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const errMsg =
      json && typeof json === "object" && "error" in json && typeof json.error === "string"
        ? json.error
        : `Request failed (${res.status})`
    throw new ApiError(errMsg, res.status, json)
  }
  return json as T
}

export function postAlertAction(
  alertId: string,
  action:
    | { action: "assign" }
    | { action: "dismiss"; reason: string }
    | { action: "resolve"; note: string },
) {
  return postJson<{ success: boolean; alert: unknown }>(
    `/api/admin/surveillance/alerts/${alertId}`,
    action,
  )
}

export function patchRule(input: {
  ruleKey: string
  isActive?: boolean
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  baseConfidence?: number
  params?: Record<string, unknown>
  name?: string
  description?: string | null
}) {
  return postJson<{ success: boolean; rule: unknown }>(
    "/api/admin/surveillance/rules",
    input,
    "PATCH",
  )
}

export function runBatch() {
  return postJson<{
    success: boolean
    ranAt: string
    reports: {
      ruleKey: string
      isActive: boolean
      fires: number
      created: number
      updated: number
      failed: number
      autoDismissed: number
      errored: boolean
      error?: string
    }[]
  }>("/api/admin/surveillance/batch", {})
}
