/**
 * @file positions-management-number-utils.ts
 * @module admin-console
 * @description Strict numeric normalization helpers for admin positions-management table mapping, pagination, and create-position payload shaping.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  parseFiniteMarketNumber,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"

export function normalizePositionsManagementPage(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 1
  }
  const normalizedValue = Math.trunc(parsedValue)
  return normalizedValue > 0 ? normalizedValue : 1
}

export function normalizePositionsManagementNonNegative(value: unknown, fallback = 0): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || parsedValue < 0) {
    return fallback
  }
  return parsedValue
}

export function normalizePositionsManagementFinite(value: unknown, fallback = 0): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return fallback
  }
  return parsedValue
}

export function normalizePositionsManagementNullableNonNegative(value: unknown): number | null {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || parsedValue < 0) {
    return null
  }
  return parsedValue
}

export function normalizeCreatePositionQuantity(value: unknown): number | null {
  return parsePositiveIntegerMarketNumber(value)
}

export function normalizeCreatePositionPrice(value: unknown): number | null {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || parsedValue <= 0) {
    return null
  }
  return parsedValue
}

export function normalizeCreatePositionLotSize(value: unknown): number | undefined {
  return parsePositiveIntegerMarketNumber(value) ?? undefined
}
