/**
 * @file admin-users-number-utils.ts
 * @module server
 * @description Strict numeric/date normalization helpers for admin users route pagination, optional date filters, and initial-balance parsing.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-03 — contactDuplicate query flag for overlapping email/phone admin list.
 */

import { parseNonNegativeMarketNumber, parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeAdminUsersPageParam(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 1
  }
  const normalizedValue = Math.trunc(parsedValue)
  return normalizedValue > 0 ? normalizedValue : 1
}

export function normalizeAdminUsersLimitParam(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 50
  }
  const normalizedValue = Math.trunc(parsedValue)
  return Math.min(Math.max(normalizedValue, 1), 200)
}

export function normalizeAdminUsersDateFilter(value: unknown): Date | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined
  }
  const parsedDate = new Date(value as any)
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate
}

export function normalizeAdminUsersOptionalInitialBalance(value: unknown): number | undefined | null {
  if (value === null || value === undefined) {
    return undefined
  }
  if (typeof value === "string" && value.trim() === "") {
    return undefined
  }
  const parsedValue = parseNonNegativeMarketNumber(value)
  return parsedValue === null ? null : parsedValue
}

export function normalizeAdminUsersOptionalNonNegativeAmount(value: unknown): number | undefined | null {
  if (value === undefined) {
    return undefined
  }
  const parsedValue = parseNonNegativeMarketNumber(value)
  return parsedValue === null ? null : parsedValue
}

export function normalizeAdminUsersOutputNumber(value: unknown, fallback = 0): number {
  return parseFiniteMarketNumber(value) ?? fallback
}

/** True when admin user list should only include accounts with normalized email/phone overlap. */
export function normalizeAdminUsersContactDuplicateParam(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "number") {
    return value === 1
  }
  const s = String(value).trim().toLowerCase()
  return s === "1" || s === "true" || s === "yes"
}
