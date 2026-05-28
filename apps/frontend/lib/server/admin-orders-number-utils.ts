/**
 * @file admin-orders-number-utils.ts
 * @module server
 * @description Strict numeric/date normalization helpers for admin orders route query parsing and PATCH payload validation.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber, parseNonNegativeMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeAdminOrdersPageParam(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 1
  }
  const normalizedValue = Math.trunc(parsedValue)
  return normalizedValue > 0 ? normalizedValue : 1
}

export function normalizeAdminOrdersLimitParam(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 50
  }
  const normalizedValue = Math.trunc(parsedValue)
  return Math.min(Math.max(normalizedValue, 1), 200)
}

export function normalizeAdminOrdersSortOrder(value: unknown): "asc" | "desc" {
  return typeof value === "string" && value.toLowerCase() === "asc" ? "asc" : "desc"
}

export function normalizeAdminOrdersDateFilter(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string" && value.trim() === "") {
    return null
  }
  const parsedDate = new Date(value as any)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

export function normalizeAdminOrdersNonNegativeUpdate(value: unknown): number | null {
  return parseNonNegativeMarketNumber(value)
}

export function normalizeAdminOrdersNullableNonNegativeUpdate(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  return parseNonNegativeMarketNumber(value)
}

export function normalizeAdminOrdersExecutedAt(value: unknown): Date | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null || value === "") {
    return null
  }
  const parsedDate = new Date(value as any)
  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate
}
