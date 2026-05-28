/**
 * @file trade-management-number-utils.ts
 * @module admin-console
 * @description Strict numeric normalization helpers for admin trade-management pagination, row mapping, and edit amount validation.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-31 — page size cap (1–200); ledger display helpers (CREDIT emerald / DEBIT red).
 */

import { parseFiniteMarketNumber, parseNonNegativeMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export type AdminLedgerTxnType = "CREDIT" | "DEBIT"

/** Tailwind classes: credit emerald, debit red. */
export function ledgerAmountDisplayClass(type: AdminLedgerTxnType): string {
  return type === "CREDIT" ? "text-emerald-500" : "text-red-500"
}

/** UI string e.g. +₹1,234.56 or −₹100 */
export function formatLedgerAmountRupeeLabel(type: AdminLedgerTxnType, storedAmount: number): string {
  const abs = Math.abs(storedAmount)
  const prefix = type === "CREDIT" ? "+" : "−"
  const num = abs.toLocaleString("en-IN", { maximumFractionDigits: 2 })
  return `${prefix}₹${num}`
}

/** CSV numeric: signed by type (CREDIT positive, DEBIT negative). */
export function formatLedgerSignedAmountForCsv(type: AdminLedgerTxnType, storedAmount: number): string {
  const abs = Math.abs(storedAmount)
  return type === "CREDIT" ? String(abs) : String(-abs)
}

export function normalizeTradeManagementPage(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 1
  }
  const normalizedValue = Math.trunc(parsedValue)
  return normalizedValue > 0 ? normalizedValue : 1
}

export function normalizeTradeManagementAmount(value: unknown, fallback = 0): number {
  return parseFiniteMarketNumber(value) ?? fallback
}

export function normalizeTradeManagementEditableAmount(value: unknown): number | null {
  const parsedValue = parseNonNegativeMarketNumber(value)
  if (parsedValue === null) {
    return null
  }
  return parsedValue
}

/** Matches `/api/admin/transactions` limit bounds. */
export function normalizeTradeManagementLimit(value: unknown): number {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null) {
    return 50
  }
  const normalizedValue = Math.trunc(parsedValue)
  return Math.min(Math.max(normalizedValue, 1), 200)
}
