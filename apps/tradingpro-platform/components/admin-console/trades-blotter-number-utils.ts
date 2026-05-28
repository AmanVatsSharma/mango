/**
 * @file trades-blotter-number-utils.ts
 * @module admin-console
 * @description Numeric + formatting helpers for the Trades Blotter (advanced tab). Pure functions only — safe to unit-test.
 * @author StockTrade
 * @created 2026-04-15
 */

import { parseFiniteMarketNumber } from "@/lib/market-data/utils/quote-lookup"

export function normalizeTradesBlotterPage(value: unknown): number {
  const parsed = parseFiniteMarketNumber(value)
  if (parsed === null) return 1
  const truncated = Math.trunc(parsed)
  return truncated > 0 ? truncated : 1
}

export function normalizeTradesBlotterLimit(value: unknown, fallback = 50, max = 200): number {
  const parsed = parseFiniteMarketNumber(value)
  if (parsed === null) return fallback
  const truncated = Math.trunc(parsed)
  if (truncated <= 0) return fallback
  return truncated > max ? max : truncated
}

export function normalizeTradesBlotterPnL(value: unknown): number | null {
  const parsed = parseFiniteMarketNumber(value)
  return parsed === null ? null : parsed
}

/**
 * Format a duration in milliseconds to a compact human string: "3d 02h" / "2h 14m" / "45m 03s" / "12s" / "0s".
 */
export function formatTradesBlotterDuration(ms: unknown): string {
  const parsed = parseFiniteMarketNumber(ms)
  if (parsed === null || parsed <= 0) return "0s"
  const secs = Math.floor(parsed / 1000)
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h`
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`
  return `${s}s`
}

/**
 * Format a number as Indian Rupees (2 decimal places, grouped). Non-numeric inputs render as "₹0.00".
 */
export function formatTradesBlotterRupees(value: unknown): string {
  const parsed = parseFiniteMarketNumber(value)
  const n = parsed === null ? 0 : parsed
  const sign = n < 0 ? "-" : ""
  const abs = Math.abs(n)
  return `${sign}₹${abs.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/**
 * Compact Indian-style rupee formatter: ₹12.4k / ₹1.23L / ₹4.56Cr / ₹250.00.
 */
export function formatTradesBlotterCompactRupees(value: unknown): string {
  const parsed = parseFiniteMarketNumber(value)
  if (parsed === null) return "₹0.00"
  const sign = parsed < 0 ? "-" : ""
  const abs = Math.abs(parsed)
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)}Cr`
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}k`
  return `${sign}₹${abs.toFixed(2)}`
}

export function tradesBlotterPnlClass(value: unknown): string {
  const parsed = parseFiniteMarketNumber(value)
  if (parsed === null || parsed === 0) return "text-muted-foreground"
  return parsed > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
}

export function tradesBlotterSideClass(side: "LONG" | "SHORT" | string): string {
  if (side === "LONG") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
  if (side === "SHORT") return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
  return "bg-muted text-muted-foreground"
}

export function tradesBlotterStatusClass(
  status: "OPEN" | "CLOSED" | "PARTIAL" | string,
): string {
  if (status === "OPEN") return "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30"
  if (status === "CLOSED") return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30"
  if (status === "PARTIAL") return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
  return "bg-muted text-muted-foreground"
}
