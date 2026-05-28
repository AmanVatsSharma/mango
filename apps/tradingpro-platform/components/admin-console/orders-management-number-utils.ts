/**
 * @file orders-management-number-utils.ts
 * @module admin-console
 * @description Strict numeric normalization helpers for admin orders-management table mapping, pagination, and edit payload validation.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeOrdersManagementPage(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 1
  }
  const normalizedValue = Math.trunc(parsedValue)
  return normalizedValue > 0 ? normalizedValue : 1
}

export function normalizeOrdersManagementNonNegative(value: unknown, fallback = 0): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || parsedValue < 0) {
    return fallback
  }
  return parsedValue
}

export function normalizeOrdersManagementNullableNonNegative(value: unknown): number | null {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || parsedValue < 0) {
    return null
  }
  return parsedValue
}

export function normalizeOrdersManagementEditQuantity(value: unknown): number | null {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || !Number.isInteger(parsedValue) || parsedValue < 0) {
    return null
  }
  return parsedValue
}

export function normalizeOrdersManagementEditPrice(value: unknown): number | null {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || parsedValue < 0) {
    return null
  }
  return parsedValue
}
