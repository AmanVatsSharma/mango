/**
 * @file admin-kyc-query-utils.ts
 * @module server
 * @description Strict query/date normalization helpers for admin KYC routes.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-07
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

/** Segment filter for GET /api/admin/kyc — distinguishes compliance leads vs post-approval trading activity. */
export type AdminKycLifecycleFilter = "ALL" | "LEAD" | "APPROVED_NOT_TRADING" | "TRADING"

type OptionalDateFieldResult = {
  provided: boolean
  valid: boolean
  value: Date | null
}

export function normalizeAdminKycPageParam(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 1
  }
  const normalizedValue = Math.trunc(parsedValue)
  return normalizedValue > 0 ? normalizedValue : 1
}

export function normalizeAdminKycLimitParam(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 20
  }
  const normalizedValue = Math.trunc(parsedValue)
  return Math.min(Math.max(normalizedValue, 1), 200)
}

export function normalizeAdminKycQueryDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string" && value.trim() === "") {
    return null
  }
  const parsedDate = new Date(value as any)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

/**
 * Whether GET /api/admin/kyc should restrict to KYC rows whose user has normalized email/phone overlap with another account.
 * Accepts `1`, `true`, `yes` (case-insensitive).
 */
export function normalizeAdminKycRelatedContactOverlapParam(value: string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false
  }
  const v = String(value).trim().toLowerCase()
  return v === "1" || v === "true" || v === "yes"
}

/**
 * Queue lifecycle segment: `LEAD` (KYC not approved), `APPROVED_NOT_TRADING` (approved, no executed orders yet),
 * `TRADING` (approved with ≥1 executed order). Invalid values → `ALL`.
 */
export function normalizeAdminKycLifecycleParam(value: string | null | undefined): AdminKycLifecycleFilter {
  if (value === null || value === undefined) {
    return "ALL"
  }
  const v = String(value).trim().toUpperCase()
  if (v === "LEAD" || v === "APPROVED_NOT_TRADING" || v === "TRADING") {
    return v
  }
  return "ALL"
}

export function normalizeAdminKycOptionalDateField(value: unknown): OptionalDateFieldResult {
  if (value === undefined) {
    return { provided: false, valid: true, value: null }
  }
  if (value === null || value === "") {
    return { provided: true, valid: true, value: null }
  }
  const parsedDate = new Date(value as any)
  if (Number.isNaN(parsedDate.getTime())) {
    return { provided: true, valid: false, value: null }
  }
  return { provided: true, valid: true, value: parsedDate }
}
