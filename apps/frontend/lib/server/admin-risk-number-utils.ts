/**
 * @file admin-risk-number-utils.ts
 * @module server
 * @description Strict numeric normalization helpers for admin risk config/limits routes (input validation + decimal output shaping).
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber, parseNonNegativeMarketNumber } from "@/lib/market-data/utils/quote-lookup"

type OptionalFieldResult<T> = {
  provided: boolean
  valid: boolean
  value: T | null
}

export function normalizeAdminRiskRequiredPositiveNumber(value: unknown): number | null {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || parsedValue <= 0) {
    return null
  }
  return parsedValue
}

export function normalizeAdminRiskRequiredNonNegativeNumber(value: unknown): number | null {
  return parseNonNegativeMarketNumber(value)
}

export function normalizeAdminRiskRequiredNonNegativeInteger(value: unknown): number | null {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || !Number.isInteger(parsedValue) || parsedValue < 0) {
    return null
  }
  return parsedValue
}

export function normalizeAdminRiskOptionalNullableNonNegativeNumber(value: unknown): OptionalFieldResult<number> {
  if (value === undefined) {
    return { provided: false, valid: true, value: null }
  }
  if (value === null || value === "") {
    return { provided: true, valid: true, value: null }
  }
  const parsedValue = parseNonNegativeMarketNumber(value)
  if (parsedValue === null) {
    return { provided: true, valid: false, value: null }
  }
  return { provided: true, valid: true, value: parsedValue }
}

export function normalizeAdminRiskOptionalNullableNonNegativeInteger(value: unknown): OptionalFieldResult<number> {
  if (value === undefined) {
    return { provided: false, valid: true, value: null }
  }
  if (value === null || value === "") {
    return { provided: true, valid: true, value: null }
  }
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || !Number.isInteger(parsedValue) || parsedValue < 0) {
    return { provided: true, valid: false, value: null }
  }
  return { provided: true, valid: true, value: parsedValue }
}

export function normalizeAdminRiskOptionalBoolean(value: unknown): OptionalFieldResult<boolean> {
  if (value === undefined) {
    return { provided: false, valid: true, value: null }
  }
  if (typeof value !== "boolean") {
    return { provided: true, valid: false, value: null }
  }
  return { provided: true, valid: true, value }
}

export function normalizeAdminRiskOutputNumber(value: unknown, fallback = 0): number {
  return parseFiniteMarketNumber(value) ?? fallback
}

export function normalizeAdminRiskOutputNullableNumber(value: unknown): number | null {
  const parsedValue = parseFiniteMarketNumber(value)
  return parsedValue === null ? null : parsedValue
}
