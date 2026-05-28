/**
 * @file components/admin-v2/affiliates/hooks.ts
 * @module admin-v2/affiliates
 * @description SWR hooks for the affiliate workbench. All endpoints under /api/admin/affiliates.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

"use client"

import useSWR from "swr"
import { jsonFetcher, withQuery } from "@/lib/admin-v2/api-client"
import type {
  AffiliateDetailResp,
  AffiliateListResp,
  AttributionListResp,
  CommissionListResp,
  CommissionStatus,
  Kind,
  PayoutListResp,
  PayoutStatus,
  Status,
  Tier,
} from "./types"

interface UseAffiliatesOpts {
  q?: string
  tier?: Tier
  status?: Status
  parentId?: string | "null"
  page?: number
  limit?: number
}

export function useAffiliates(opts: UseAffiliatesOpts = {}) {
  const url = withQuery("/api/admin/affiliates", {
    q: opts.q,
    tier: opts.tier,
    status: opts.status,
    parentId: opts.parentId,
    page: opts.page,
    limit: opts.limit,
  })
  return useSWR<AffiliateListResp>(url, jsonFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })
}

export function useAffiliateDetail(affiliateId: string | null | undefined) {
  return useSWR<AffiliateDetailResp>(
    affiliateId ? `/api/admin/affiliates/${affiliateId}` : null,
    jsonFetcher,
    { refreshInterval: 30_000, revalidateOnFocus: false },
  )
}

interface UseCommissionsOpts {
  affiliateId?: string
  sourceUserId?: string
  status?: CommissionStatus
  kind?: Kind
  fromDate?: string
  toDate?: string
  page?: number
  limit?: number
}

export function useAffiliateCommissions(opts: UseCommissionsOpts = {}) {
  const url = withQuery("/api/admin/affiliates/commissions", {
    affiliateId: opts.affiliateId,
    sourceUserId: opts.sourceUserId,
    status: opts.status,
    kind: opts.kind,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    page: opts.page,
    limit: opts.limit,
  })
  return useSWR<CommissionListResp>(url, jsonFetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  })
}

interface UsePayoutsOpts {
  affiliateId?: string
  status?: PayoutStatus
  page?: number
  limit?: number
}

export function useAffiliatePayouts(opts: UsePayoutsOpts = {}) {
  const url = withQuery("/api/admin/affiliates/payouts", {
    affiliateId: opts.affiliateId,
    status: opts.status,
    page: opts.page,
    limit: opts.limit,
  })
  return useSWR<PayoutListResp>(url, jsonFetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  })
}

interface UseAttributionsOpts {
  affiliateId?: string
  userId?: string
  source?: string
  liveOnly?: boolean
  page?: number
  limit?: number
}

export function useAffiliateAttributions(opts: UseAttributionsOpts = {}) {
  const url = withQuery("/api/admin/affiliates/attributions", {
    affiliateId: opts.affiliateId,
    userId: opts.userId,
    source: opts.source,
    liveOnly: opts.liveOnly ? "true" : undefined,
    page: opts.page,
    limit: opts.limit,
  })
  return useSWR<AttributionListResp>(url, jsonFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })
}
