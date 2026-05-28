/**
 * @file admin-trades-number-utils.ts
 * @module server
 * @description Query param normalizers + small pure numeric helpers for the admin Trades blotter API.
 * @author StockTrade
 * @created 2026-04-15
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeTradesPage(value: unknown): number {
  const parsed = parseFiniteMarketNumber(value)
  if (parsed === null) return 1
  const n = Math.trunc(parsed)
  return n > 0 ? n : 1
}

export function normalizeTradesLimit(value: unknown, max = 200): number {
  const parsed = parseFiniteMarketNumber(value)
  if (parsed === null) return 50
  const n = Math.trunc(parsed)
  return Math.min(Math.max(n, 1), max)
}

export function normalizeTradesSortOrder(value: unknown): "asc" | "desc" {
  return typeof value === "string" && value.toLowerCase() === "asc" ? "asc" : "desc"
}

export function normalizeTradesDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string" && value.trim() === "") return null
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? null : d
}

export function normalizeTradesPnL(value: unknown): number | null {
  return parseFiniteMarketNumber(value)
}

export function normalizeTradesString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

export function normalizeTradesStatusFilter(value: unknown): "open" | "closed" | "partial" | "all" {
  if (typeof value !== "string") return "all"
  const v = value.trim().toLowerCase()
  if (v === "open" || v === "closed" || v === "partial") return v
  return "all"
}

export function normalizeTradesSideFilter(value: unknown): "LONG" | "SHORT" | "ALL" {
  if (typeof value !== "string") return "ALL"
  const v = value.trim().toUpperCase()
  if (v === "LONG" || v === "SHORT") return v
  return "ALL"
}

/**
 * IST day boundary: returns [startOfDayIst, startOfNextDayIst] for the given Date (or now).
 * IST = UTC+05:30. We compute the Indian civil day without DST (IST has none).
 */
export function istDayRange(ref?: Date): { startUtc: Date; endUtc: Date } {
  const base = ref ?? new Date()
  const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000
  // Convert to IST "wallclock" by shifting, then zero the time, then shift back.
  const istMs = base.getTime() + IST_OFFSET_MS
  const istDate = new Date(istMs)
  const y = istDate.getUTCFullYear()
  const m = istDate.getUTCMonth()
  const d = istDate.getUTCDate()
  const startIstUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS
  const endIstUtcMs = startIstUtcMs + 24 * 60 * 60 * 1000
  return { startUtc: new Date(startIstUtcMs), endUtc: new Date(endIstUtcMs) }
}
