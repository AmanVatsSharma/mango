/**
 * File:        components/admin-v2/withdrawals/hooks.ts
 * Module:      admin-v2/withdrawals
 * Purpose:     SWR hooks for the withdrawal-review workbench.
 *
 * Exports:
 *   - useQueue(filter, search)  — paginated queue + KPIs, refreshes every 15s.
 *   - useRiskRules()            — admin rule list, refreshes on focus only.
 *   - postReleaseChain, postHold, postBulkApprove, postReevaluate — mutators.
 *   - postRuleCreate, postRuleUpdate — rule CRUD mutators.
 *
 * Depends on:
 *   - swr — react data hook.
 *   - @/lib/admin-v2/api-client — jsonFetcher + withQuery + ApiError.
 *
 * Side-effects: SWR network reads + POST/PATCH on mutators.
 *
 * Key invariants:
 *   - Mutators throw on non-2xx so the caller can surface to a toast. They never swallow.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

"use client"

import useSWR from "swr"
import { jsonFetcher, withQuery, ApiError } from "@/lib/admin-v2/api-client"
import type {
  QueueResponse,
  RuleListResponse,
  QueueFilter,
} from "./types"

export function useQueue(filter: QueueFilter, search: string) {
  const url = withQuery("/api/admin/withdrawals/queue", {
    filter,
    search: search || undefined,
  })
  return useSWR<QueueResponse>(url, jsonFetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
}

export function useRiskRules() {
  return useSWR<RuleListResponse>(
    "/api/admin/withdrawals/risk-rules",
    jsonFetcher,
    { revalidateOnFocus: true, focusThrottleInterval: 60_000 },
  )
}

async function postJson<T>(url: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(
      (json && typeof json === "object" && "error" in json && typeof json.error === "string"
        ? json.error
        : `Request failed (${res.status})`),
      res.status,
      json,
    )
  }
  return json as T
}

export interface ReleaseInput {
  withdrawalId: string
  transactionId?: string
  note?: string
}

export function postReleaseChain(input: ReleaseInput) {
  return postJson<{
    success: boolean
    chainComplete: boolean
    chain: unknown
    financial?: unknown
  }>(`/api/admin/withdrawals/${input.withdrawalId}/release`, {
    transactionId: input.transactionId,
    note: input.note,
  })
}

export interface HoldInput {
  withdrawalId: string
  mode: "HOLD" | "REEVALUATE"
  reason?: string
}

export function postHold(input: HoldInput) {
  return postJson<{ success: boolean; isHeld?: boolean; riskScore?: number }>(
    `/api/admin/withdrawals/${input.withdrawalId}/hold`,
    { mode: input.mode, reason: input.reason },
  )
}

export interface BulkItem {
  withdrawalId: string
  transactionId: string
}

export function postBulkApprove(items: BulkItem[]) {
  return postJson<{
    success: boolean
    approved: string[]
    skippedHeld: string[]
    failed: { withdrawalId: string; reason: string }[]
  }>("/api/admin/withdrawals/bulk-approve", { items })
}

export function postRuleCreate(input: {
  ruleKey: string
  name: string
  description?: string | null
  points: number
  params?: Record<string, unknown>
}) {
  return postJson<{ success: boolean; rule: unknown }>(
    "/api/admin/withdrawals/risk-rules",
    input,
  )
}

export function postRuleUpdate(input: {
  id: string
  name?: string
  description?: string | null
  points?: number
  isActive?: boolean
  params?: Record<string, unknown>
}) {
  return postJson<{ success: boolean; rule: unknown }>(
    "/api/admin/withdrawals/risk-rules",
    input,
    "PATCH",
  )
}
