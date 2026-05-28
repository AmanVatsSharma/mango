/**
 * @file components/admin-v2/compliance/hooks.ts
 * @module admin-v2/compliance
 * @description SWR data hooks for the v2 Compliance Workbench (KYC).
 *
 *              Exports: useKycQueue.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

"use client"

import useSWR from "swr"
import { jsonFetcher, withQuery } from "@/lib/admin-v2/api-client"
import type { KycFilters, KycListResp } from "./types"

export function useKycQueue(filters: KycFilters) {
  const url = withQuery("/api/admin/kyc", {
    page: filters.page ?? 1,
    limit: filters.limit ?? 25,
    search: filters.search,
    status: filters.status && filters.status !== "ALL" ? filters.status : undefined,
    assignedTo: filters.assignedTo,
    amlStatus: filters.amlStatus && filters.amlStatus !== "ALL" ? filters.amlStatus : undefined,
    suspiciousStatus:
      filters.suspiciousStatus && filters.suspiciousStatus !== "ALL"
        ? filters.suspiciousStatus
        : undefined,
    sla: filters.sla && filters.sla !== "ALL" ? filters.sla : undefined,
    flag: filters.flag,
    lifecycle: filters.lifecycle && filters.lifecycle !== "ALL" ? filters.lifecycle : undefined,
    relatedContactOverlap: filters.relatedContactOverlap ? "1" : undefined,
  })
  return useSWR<KycListResp>(url, jsonFetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  })
}
