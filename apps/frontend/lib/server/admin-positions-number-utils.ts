/**
 * @file admin-positions-number-utils.ts
 * @module server
 * @description Strict numeric/date normalization helpers for admin positions route query parsing, update payload validation, and create-position request shaping.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  parseFiniteMarketNumber,
  parseNonNegativeMarketNumber,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"

export function normalizeAdminPositionsPageParam(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 1
  }
  const normalizedValue = Math.trunc(parsedValue)
  return normalizedValue > 0 ? normalizedValue : 1
}

export function normalizeAdminPositionsLimitParam(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 50
  }
  const normalizedValue = Math.trunc(parsedValue)
  return Math.min(Math.max(normalizedValue, 1), 200)
}

export function normalizeAdminPositionsSortOrder(value: unknown): "asc" | "desc" {
  return typeof value === "string" && value.toLowerCase() === "asc" ? "asc" : "desc"
}

export function normalizeAdminPositionsDateFilter(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "string" && value.trim() === "") {
    return null
  }
  const parsedDate = new Date(value as any)
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate
}

export function normalizeAdminPositionFinite(value: unknown): number | null {
  return parseFiniteMarketNumber(value)
}

export function normalizeAdminPositionNonNegative(value: unknown): number | null {
  return parseNonNegativeMarketNumber(value)
}

export function normalizeAdminPositionCreateQuantity(value: unknown): number | null {
  return parsePositiveIntegerMarketNumber(value)
}

export function normalizeAdminPositionCreatePrice(value: unknown): number | null {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || parsedValue <= 0) {
    return null
  }
  return parsedValue
}

export function normalizeAdminPositionCreateLotSize(value: unknown): number | undefined {
  return parsePositiveIntegerMarketNumber(value) ?? undefined
}

export function normalizeAdminPositionNullableNonNegativeUpdate(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value === null) {
    return null
  }
  return parseNonNegativeMarketNumber(value)
}
