/**
 * @file instrument-summary.ts
 * @module market-data
 * @description Pure helpers for exchange badges, F&O detection, compact dates, and a single-line instrument summary for watchlist, orders, positions, and statements.
 * @author StockTrade
 * @created 2026-04-01
 */

import { getCurrentISTDate } from "@/lib/date-utils"

/** Minimal shape shared by Watchlist items, Prisma Stock slices, and order joins. */
export type InstrumentSummaryInput = {
  symbol?: string | null
  exchange?: string | null
  segment?: string | null
  name?: string | null
  strikePrice?: number | string | { toString(): string } | null
  optionType?: string | null
  expiry?: Date | string | null
  lotSize?: number | string | null
}

export type ExchangeBadgeConfig = {
  label: string
  color: string
  bgLight: string
}

/**
 * Exchange / segment badge for UI (Tailwind classes; matches legacy watchlist card).
 */
export function getExchangeBadge(exchange?: string | null, segment?: string | null): ExchangeBadgeConfig {
  const normalizedExchange = exchange?.toUpperCase() || ""
  const normalizedSegment = segment?.toUpperCase() || ""

  if (normalizedExchange.includes("MCX") || normalizedSegment.includes("MCX")) {
    return { label: "MCX", color: "bg-amber-500 text-white", bgLight: "bg-amber-100 text-amber-700" }
  }

  if (normalizedExchange.includes("BSE") || normalizedSegment.includes("BSE")) {
    return { label: "BSE", color: "bg-orange-500 text-white", bgLight: "bg-orange-100 text-orange-700" }
  }

  if (
    normalizedExchange.includes("NSE_FO") ||
    normalizedExchange.includes("NFO") ||
    normalizedSegment.includes("NFO")
  ) {
    return { label: "NSE FO", color: "bg-purple-500 text-white", bgLight: "bg-purple-100 text-purple-700" }
  }

  return { label: "NSE", color: "bg-blue-500 text-white", bgLight: "bg-blue-100 text-blue-700" }
}

/** DD MMM YY for F&O expiry chips. */
export function formatCompactExpiry(expiry?: string | Date | null): string {
  if (expiry == null || expiry === "") return ""

  try {
    const date = expiry instanceof Date ? expiry : new Date(expiry)
    if (Number.isNaN(date.getTime())) return ""

    const day = date.getDate().toString().padStart(2, "0")
    const month = date.toLocaleDateString("en-IN", { month: "short" })
    const year = date.getFullYear().toString().slice(-2)

    return `${day} ${month} ${year}`
  } catch {
    return ""
  }
}

export function normalizeStrikeNumber(strike: InstrumentSummaryInput["strikePrice"]): number | null {
  if (strike == null) return null
  if (typeof strike === "number" && Number.isFinite(strike)) return strike
  const n = Number(typeof strike === "object" && strike !== null && "toString" in strike ? strike.toString() : strike)
  return Number.isFinite(n) ? n : null
}

export function formatStrikePrice(strike?: InstrumentSummaryInput["strikePrice"]): string {
  const n = normalizeStrikeNumber(strike ?? null)
  if (n == null) return ""
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

export function isSegmentFuturesOrCommodity(segment?: string | null, optionType?: string | null): boolean {
  const seg = (segment || "").toUpperCase()
  const fo = seg.includes("FO") || seg === "NFO" || seg.includes("MCX")
  return fo && !optionType
}

export function isSegmentOption(segment?: string | null, optionType?: string | null): boolean {
  const seg = (segment || "").toUpperCase()
  const fo = seg.includes("FO") || seg === "NFO" || seg.includes("MCX")
  return fo && !!optionType
}

export function isEquitySegment(segment?: string | null, exchange?: string | null, optionType?: string | null): boolean {
  if (isSegmentOption(segment, optionType) || isSegmentFuturesOrCommodity(segment, optionType)) {
    return false
  }
  const seg = (segment || "").toUpperCase()
  const ex = (exchange || "").toUpperCase()
  return seg === "EQ" || (!seg.includes("FO") && !ex.includes("NFO") && !ex.includes("MCX"))
}

export function isMCXInstrument(exchange?: string | null, segment?: string | null): boolean {
  const ex = (exchange || "").toUpperCase()
  const seg = (segment || "").toUpperCase()
  return ex.includes("MCX") || seg.includes("MCX")
}

/** Calendar days until expiry (IST “today” vs expiry date at UTC midnight of parsed expiry). */
export function getDaysUntilExpiry(expiry?: string | Date | null): number | null {
  if (expiry == null || expiry === "") return null

  try {
    const expiryDate = expiry instanceof Date ? expiry : new Date(expiry)
    if (Number.isNaN(expiryDate.getTime())) return null

    const now = getCurrentISTDate()
    const diffMs = expiryDate.getTime() - now.getTime()
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  } catch {
    return null
  }
}

function shortVenueHint(exchange?: string | null, segment?: string | null): string {
  const badge = getExchangeBadge(exchange, segment)
  const seg = (segment || "").toUpperCase()
  if (seg && seg !== "EQ" && !seg.includes("NSE") && badge.label === "NSE") {
    return seg
  }
  return badge.label
}

function nameAlreadyCoversVenue(name: string, exchange?: string | null, segment?: string | null): boolean {
  const up = name.toUpperCase()
  const ex = (exchange || "").toUpperCase()
  const seg = (segment || "").toUpperCase()
  if (ex && up.includes(ex)) return true
  if (seg && (up.includes(seg) || (seg.includes("FO") && up.includes("F&O")))) return true
  const hint = shortVenueHint(exchange, segment)
  if (hint && up.includes(hint.replace(/\s/g, ""))) return true
  return false
}

/**
 * One-line description for registers and tables.
 * Prefers `name` when set (broker/instrument long name); otherwise composes symbol + F&O facts.
 */
export function formatInstrumentSummary(input: InstrumentSummaryInput): string {
  const symbol = (input.symbol || "").trim().toUpperCase() || "UNKNOWN"
  const nameRaw = typeof input.name === "string" ? input.name.trim() : ""

  if (nameRaw.length >= 2) {
    if (!nameAlreadyCoversVenue(nameRaw, input.exchange, input.segment)) {
      const hint = shortVenueHint(input.exchange, input.segment)
      return hint ? `${nameRaw} (${hint})` : nameRaw
    }
    return nameRaw
  }

  const opt = input.optionType ? String(input.optionType).toUpperCase() : ""
  const isFut = isSegmentFuturesOrCommodity(input.segment, input.optionType as string | null)
  const isOpt = isSegmentOption(input.segment, input.optionType as string | null)
  const isMcx = isMCXInstrument(input.exchange, input.segment)

  const parts: string[] = [symbol]

  if (isFut) {
    parts.push("FUT")
  } else if (isOpt && opt) {
    parts.push(opt)
  } else if (!isMcx && isEquitySegment(input.segment, input.exchange, input.optionType as string | null)) {
    parts.push("EQ")
  }

  const exp = formatCompactExpiry(input.expiry ?? null)
  if (exp && (isFut || isOpt)) {
    parts.push(exp)
  }

  const strikeStr = formatStrikePrice(input.strikePrice)
  if (strikeStr && isOpt) {
    parts.push(strikeStr)
  }

  const hint = shortVenueHint(input.exchange, input.segment)
  if (hint && hint !== "NSE") {
    parts.push(hint)
  } else if (hint === "NSE" && (isFut || isOpt)) {
    parts.push("NSE FO")
  }

  return parts.filter(Boolean).join(" · ")
}
