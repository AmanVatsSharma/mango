/**
 * @file admin-funds-number-utils.ts
 * @module server
 * @description Strict normalization helpers for admin deposits/withdrawals route payloads and notification amount serialization.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeAdminFundActionToken(value: unknown): "approve" | "reject" | null {
  if (typeof value !== "string") {
    return null
  }
  const normalizedValue = value.trim().toLowerCase()
  return normalizedValue === "approve" || normalizedValue === "reject" ? normalizedValue : null
}

export function normalizeAdminFundIdentifier(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function normalizeAdminFundReason(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function normalizeAdminFundNotificationAmount(value: unknown): number | null {
  return parseFiniteMarketNumber(value)
}
