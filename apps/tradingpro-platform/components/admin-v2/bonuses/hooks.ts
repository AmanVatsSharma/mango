/**
 * @file components/admin-v2/bonuses/hooks.ts
 * @module admin-v2/bonuses
 * @description SWR hooks for bonus surfaces.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import useSWR from "swr"
import { jsonFetcher, withQuery } from "@/lib/admin-v2/api-client"
import type {
  BonusGrantStatus,
  GrantsListEnvelope,
  PromoListEnvelope,
  RulesListEnvelope,
  UserGrantsEnvelope,
} from "./types"

export function useBonusRules(opts: { activeOnly?: boolean } = {}) {
  const url = withQuery("/api/admin/bonuses/rules", {
    activeOnly: opts.activeOnly ? "true" : undefined,
  })
  return useSWR<RulesListEnvelope>(url, jsonFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })
}

interface UseGrantsOpts {
  status?: BonusGrantStatus
  ruleId?: string
  userId?: string
  limit?: number
  offset?: number
  refreshMs?: number
}

export function useBonusGrants(opts: UseGrantsOpts = {}) {
  const url = withQuery("/api/admin/bonuses/grants", {
    status: opts.status,
    ruleId: opts.ruleId,
    userId: opts.userId,
    limit: opts.limit,
    offset: opts.offset,
  })
  return useSWR<GrantsListEnvelope>(url, jsonFetcher, {
    refreshInterval: opts.refreshMs ?? 30_000,
    revalidateOnFocus: false,
  })
}

export function useUserBonusGrants(userId: string | null | undefined) {
  return useSWR<UserGrantsEnvelope>(
    userId ? `/api/admin/bonuses/grants/by-user/${userId}` : null,
    jsonFetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false },
  )
}

export function usePromoCodes() {
  return useSWR<PromoListEnvelope>("/api/admin/bonuses/promo", jsonFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })
}
