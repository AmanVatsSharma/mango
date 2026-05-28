/**
 * @file admin-transactions-number-utils.ts
 * @module server
 * @description Strict numeric/date normalization helpers for admin transactions route pagination, filters, and PATCH payload validation.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-31 — IST-inclusive YYYY-MM-DD range; allowlisted sortBy.
 *
 * Notes:
 * - Date inputs from `<input type="date">` use start/end of calendar day in Asia/Kolkata.
 */

import { parseFiniteMarketNumber, parseNonNegativeMarketNumber } from "@/lib/market-data/utils/quote-lookup"

/** Prisma Transaction fields allowed for GET orderBy (avoid dynamic injection). */
export const ADMIN_TRANSACTIONS_SORT_FIELDS = ["createdAt", "amount", "type", "id"] as const
export type AdminTransactionsSortField = (typeof ADMIN_TRANSACTIONS_SORT_FIELDS)[number]

export function normalizeAdminTransactionsPageParam(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 1
  }
  const normalizedValue = Math.trunc(parsedValue)
  return normalizedValue > 0 ? normalizedValue : 1
}

export function normalizeAdminTransactionsLimitParam(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 50
  }
  const normalizedValue = Math.trunc(parsedValue)
  const boundedValue = Math.min(Math.max(normalizedValue, 1), 200)
  return boundedValue
}

export function normalizeAdminTransactionsAmountFilter(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string" && value.trim() === "") {
    return null
  }
  return parseFiniteMarketNumber(value)
}

export function normalizeAdminTransactionsPatchAmount(value: unknown): number | null {
  if (value === undefined) {
    return null
  }
  return parseNonNegativeMarketNumber(value)
}

export function normalizeAdminTransactionsDateFilter(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string" && value.trim() === "") {
    return null
  }
  const parsedDate = new Date(value as any)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

const YMD_IST = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Parse admin ledger filter date: plain YYYY-MM-DD is interpreted in IST (full day inclusive for `to`).
 */
export function parseAdminTransactionDateFilterForRange(value: unknown, role: "from" | "to"): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string" && value.trim() === "") {
    return null
  }
  const s = typeof value === "string" ? value.trim() : String(value)
  const m = YMD_IST.exec(s)
  if (m) {
    const [, y, mo, d] = m
    if (role === "from") {
      return new Date(`${y}-${mo}-${d}T00:00:00.000+05:30`)
    }
    return new Date(`${y}-${mo}-${d}T23:59:59.999+05:30`)
  }
  return normalizeAdminTransactionsDateFilter(s)
}

/**
 * Returns default createdAt when `raw` empty; null when raw is invalid non-empty (caller should 400).
 */
export function normalizeAdminTransactionsSortByParam(raw: string | null): {
  field: AdminTransactionsSortField
  invalidExplicit: boolean
} {
  if (raw === null || raw.trim() === "") {
    return { field: "createdAt", invalidExplicit: false }
  }
  const t = raw.trim()
  if ((ADMIN_TRANSACTIONS_SORT_FIELDS as readonly string[]).includes(t)) {
    return { field: t as AdminTransactionsSortField, invalidExplicit: false }
  }
  return { field: "createdAt", invalidExplicit: true }
}

export function normalizeAdminTransactionsSortOrder(value: unknown): "asc" | "desc" {
  return typeof value === "string" && value.toLowerCase() === "asc" ? "asc" : "desc"
}
