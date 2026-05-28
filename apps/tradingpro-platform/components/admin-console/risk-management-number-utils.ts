/**
 * @file risk-management-number-utils.ts
 * @module admin-console
 * @description Strict numeric normalization helpers for admin risk-management threshold controls and risk limit/config form inputs.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-08 — `riskConfigNullableNumberInputString` so 0 displays in risk-config form fields.
 */

import { parseFiniteMarketNumber, parseNonNegativeMarketNumber } from "@/lib/market-data/utils/quote-lookup"

function clampPercent(value: number): number {
  return Math.min(Math.max(value, 0), 100)
}

export function normalizeRiskManagementFractionThresholdInput(value: unknown, fallbackFraction: number): number {
  const parsedValue = parseFiniteMarketNumber(value)
  const fallbackPercent = clampPercent(fallbackFraction * 100)
  const normalizedPercent = parsedValue === null ? fallbackPercent : clampPercent(parsedValue)
  return normalizedPercent / 100
}

export function normalizeRiskConfigLeverageInput(value: unknown, fallback = 1): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || parsedValue < 1) {
    return fallback
  }
  return parsedValue
}

/**
 * Controlled `<Input type="number">` value: use instead of `x || ''` so `0` is visible and editable.
 */
export function riskConfigNullableNumberInputString(value: number | null | undefined): string {
  return value == null ? "" : String(value)
}

export function normalizeRiskConfigNullableNonNegativeInput(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) {
    return null
  }
  return parseNonNegativeMarketNumber(value)
}

export function normalizeRiskConfigNullableNonNegativeIntegerInput(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) {
    return null
  }
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || !Number.isInteger(parsedValue) || parsedValue < 0) {
    return null
  }
  return parsedValue
}

export function normalizeRiskLimitNonNegativeInput(value: unknown, fallback = 0): number {
  return parseNonNegativeMarketNumber(value) ?? fallback
}

export function normalizeRiskLimitNonNegativeIntegerInput(value: unknown, fallback = 0): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || !Number.isInteger(parsedValue) || parsedValue < 0) {
    return fallback
  }
  return parsedValue
}
