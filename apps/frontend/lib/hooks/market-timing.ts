/**
 * File:        lib/hooks/market-timing.ts
 * Module:      Market · Timing
 * Purpose:     Central helpers to determine Indian market (NSE) session status in IST.
 *              Open: Mon–Fri 09:15–15:30 IST; Pre-Open: 09:00–09:15; Closed: otherwise/force-closed.
 *
 * Exports:
 *   - getMarketSession() → "open" | "pre-open" | "closed"
 *   - refreshMarketForceClosedFromServer() → Promise<void>  — deduped GET /api/market/status
 *   - setMarketForceClosed(bool) → void
 *   - isMarketDay() → boolean
 *   - MarketSession — type alias
 *
 * Side-effects:
 *   - HTTP GET /api/market/status (concurrent calls share one in-flight Promise)
 *
 * Key invariants:
 *   - cachedForceClosed is sticky; only refreshed by explicit call
 *   - All calculations use Asia/Kolkata timezone (IST)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-07
 */

import { getCurrentISTDate } from "@/lib/date-utils"

export type MarketSession = "open" | "pre-open" | "closed"

// Simple in-memory holiday list (YYYY-MM-DD). Replace/populate from your preferred source.
// For production, consider loading this from a server API, database, or a cron-updated JSON.
const NSE_HOLIDAYS_YYYYMMDD = new Set<string>([
  // Examples (replace with actual NSE trading holidays for the year)
  // "2025-01-26", // Republic Day
  // "2025-03-14", // Holi (example)
])

// Cache for force closed (client). Sticky until set explicitly or refreshed from /api/market/status.
let cachedForceClosed: boolean | null = null

// In-flight dedup: multiple simultaneous callers share one fetch Promise.
let _marketStatusInflight: Promise<void> | null = null

/**
 * Get market force closed status (client-side cache)
 * Updated via setMarketForceClosed() or refreshMarketForceClosedFromServer().
 * Does not time out: ops force-close must not flip back to open after a few seconds.
 */
function getMarketForceClosed(): boolean {
  return cachedForceClosed === true
}

/**
 * Pull force-closed flag from server (GET /api/market/status). Browser only.
 * Concurrent calls within the same tick share one in-flight Promise — no duplicate GETs.
 */
export async function refreshMarketForceClosedFromServer(): Promise<void> {
  if (typeof window === "undefined") return
  if (_marketStatusInflight) return _marketStatusInflight

  _marketStatusInflight = (async () => {
    try {
      // 5s timeout — this fires from the dashboard's 60s session-status timer.
      // A hung backend would leave _marketStatusInflight pinned forever, which
      // means subsequent calls return the same stalled promise (single-flight
      // dedup) and the dashboard never gets fresh market-session info. Short
      // timeout matches the cadence (60s tick) — better to skip a beat than
      // to silently freeze the session-status state.
      const res = await fetch("/api/market/status", {
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      })
      if (!res.ok) return
      const json = (await res.json()) as { data?: { forceClosed?: boolean } }
      setMarketForceClosed(json?.data?.forceClosed === true)
    } catch {
      /* ignore transient network errors + timeout aborts */
    } finally {
      _marketStatusInflight = null
    }
  })()

  return _marketStatusInflight
}

/**
 * Set market force closed status (called from settings component)
 * 
 * @param forceClosed - True if market should be force closed
 */
export function setMarketForceClosed(forceClosed: boolean): void {
  console.log(`[MARKET-TIMING] Setting force_closed: ${forceClosed}`)
  cachedForceClosed = forceClosed
}

/**
 * Invalidate force closed cache
 */
export function invalidateForceClosedCache(): void {
  cachedForceClosed = null
}

/** Format a Date (IST) to YYYY-MM-DD */
const formatYyyyMmDd = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Returns an IST Date for now (safe wrapper). */
const nowIST = (): Date => {
  try {
    return getCurrentISTDate()
  } catch {
    // Fallback using toLocaleString if import path changes
    const now = new Date()
    return new Date(now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))
  }
}

/** Check if given IST date is an NSE holiday (static list). */
export function isNSEHoliday(date?: Date): boolean {
  try {
    const d = date ? new Date(date) : nowIST()
    const key = formatYyyyMmDd(d)
    const isHoliday = NSE_HOLIDAYS_YYYYMMDD.has(key)
    if (isHoliday) console.log(`📅 [MARKET-TIMING] Holiday detected for ${key}`)
    return isHoliday
  } catch (error) {
    console.warn("[MARKET-TIMING] isNSEHoliday failed, defaulting to false", error)
    return false
  }
}

/** Returns true during pre-open window (Mon–Fri, 09:00–09:15 IST). */
export function isPreOpen(date?: Date): boolean {
  try {
    // Check force closed first (highest priority)
    if (getMarketForceClosed()) {
      console.log('[MARKET-TIMING] Market is force closed - blocking pre-open')
      return false
    }

    const d = date ? new Date(date) : nowIST()
    const day = d.getDay() // Sun=0 .. Sat=6
    if (day === 0 || day === 6) return false
    if (isNSEHoliday(d)) return false
    const minutes = d.getHours() * 60 + d.getMinutes()
    const preOpenStart = 9 * 60 + 0 // 09:00
    const marketOpen = 9 * 60 + 15 // 09:15
    return minutes >= preOpenStart && minutes < marketOpen
  } catch (error) {
    console.warn("[MARKET-TIMING] isPreOpen failed, defaulting to false", error)
    return false
  }
}

/** Returns true when regular session is open (Mon–Fri, 09:15–15:30 IST). */
export function isMarketOpen(date?: Date): boolean {
  try {
    // Check force closed first (highest priority)
    if (getMarketForceClosed()) {
      console.log('[MARKET-TIMING] Market is force closed - blocking orders')
      return false
    }

    const d = date ? new Date(date) : nowIST()
    const day = d.getDay()
    if (day === 0 || day === 6) return false
    if (isNSEHoliday(d)) return false
    const minutes = d.getHours() * 60 + d.getMinutes()
    const marketOpen = 9 * 60 + 15 // 09:15
    const marketClose = 15 * 60 + 30 // 15:30
    return minutes >= marketOpen && minutes <= marketClose
  } catch (error) {
    console.error("[MARKET-TIMING] Error checking market open status:", error)
    return false
  }
}

/** Returns the current market session in IST. */
export function getMarketSession(date?: Date): MarketSession {
  try {
    // Check force closed first (highest priority)
    if (getMarketForceClosed()) {
      console.log('[MARKET-TIMING] Market is force closed')
      return "closed"
    }

    const d = date ? new Date(date) : nowIST()
    const day = d.getDay()
    if (day === 0 || day === 6) return "closed"
    if (isNSEHoliday(d)) return "closed"
    if (isPreOpen(d)) return "pre-open"
    return isMarketOpen(d) ? "open" : "closed"
  } catch (error) {
    console.warn("[MARKET-TIMING] getMarketSession failed, defaulting to closed", error)
    return "closed"
  }
}

const minutesSinceMidnight = (d: Date): number => d.getHours() * 60 + d.getMinutes()

/**
 * Segment-aware market session check — mirrors the server-side getSegmentTradingSession in
 * lib/server/market-timing.ts. Every venue family gets its own window so the OrderScreen
 * "Market closed" gate fires at the right time for CDS/BCD (till 17:00), NCO/MCX (till 23:55),
 * and CRYPTO (24/7). Previously only MCX vs NSE was branched — CDS options at 16:30 IST were
 * incorrectly blocked on the client while the server would have accepted them.
 *
 * @param segment - Market segment (NSE, NSE_EQ, NSE_FO, NFO, MCX, CDS, BCD, NCO, CRYPTO…)
 * @param date - Optional date to check (defaults to now in IST)
 */
export function getSegmentMarketSession(
  segment?: string | null,
  date?: Date
): { session: MarketSession; reason?: string } {
  try {
    if (getMarketForceClosed()) {
      return { session: "closed", reason: "Market is force-closed by operations" }
    }

    const d = date ? new Date(date) : nowIST()
    const seg = (segment || "NSE").trim().toUpperCase()
    const minutes = minutesSinceMidnight(d)
    const day = d.getDay()

    // Crypto is 24/7 — only force-closed flag above gates it.
    if (seg === "CRYPTO" || seg === "BINANCE" || seg === "SPOT") {
      return { session: "open" }
    }

    // Venues not yet enabled for live order placement on this platform.
    if (seg === "NASDAQ" || seg === "NYSE" || seg === "US" || seg === "FX" || seg === "FOREX" || seg === "NSEIX" || seg === "GLOBAL") {
      return { session: "closed", reason: `${seg} venue is not yet enabled for live order placement` }
    }

    // Weekend applies to all remaining regulated Indian venues.
    if (day === 0 || day === 6) {
      return { session: "closed", reason: "Weekend (markets closed)" }
    }

    // MCX commodity + NCO commodity (BSE non-MCX) — 09:00–23:55 IST.
    const isMcxFamily = seg.includes("MCX") || seg.startsWith("NCO")
    if (isMcxFamily) {
      const open = minutes >= 9 * 60 && minutes <= 23 * 60 + 55
      return {
        session: open ? "open" : "closed",
        reason: open ? undefined : `${seg} commodity orders are accepted between 09:00–23:55 IST`,
      }
    }

    // CDS (NSE) + BCD (BSE) currency derivatives — 09:00–17:00 IST, NSE holiday calendar.
    const isCurrencyDerivatives = seg.startsWith("CDS") || seg.startsWith("BCD")
    if (isCurrencyDerivatives) {
      if (isNSEHoliday(d)) {
        return { session: "closed", reason: `${seg} closed on NSE/BSE holiday` }
      }
      const open = minutes >= 9 * 60 && minutes <= 17 * 60
      return {
        session: open ? "open" : "closed",
        reason: open ? undefined : `${seg} currency derivative orders are accepted between 09:00–17:00 IST`,
      }
    }

    // Default: NSE/BSE equity + F&O — 09:15–15:30 IST (09:00–09:15 pre-open), NSE holiday calendar.
    if (isNSEHoliday(d)) {
      return { session: "closed", reason: "NSE holiday" }
    }

    if (isPreOpen(d)) {
      return { session: "pre-open", reason: "NSE pre-open window 09:00–09:15 IST" }
    }

    if (isMarketOpen(d)) {
      return { session: "open" }
    }

    return { session: "closed", reason: "NSE trading hours are 09:15–15:30 IST" }
  } catch (error) {
    console.warn("[MARKET-TIMING] getSegmentMarketSession failed, defaulting to closed", error)
    return { session: "closed", reason: "Unable to confirm trading window" }
  }
}

/** Allow runtime override of holiday set (e.g., after fetching from server). */
export function setNSEHolidays(datesYyyyMmDd: string[]): void {
  try {
    NSE_HOLIDAYS_YYYYMMDD.clear()
    for (const d of datesYyyyMmDd) {
      // Basic sanity check for YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) NSE_HOLIDAYS_YYYYMMDD.add(d)
    }
    console.log(`[MARKET-TIMING] NSE holidays loaded (${NSE_HOLIDAYS_YYYYMMDD.size})`)
  } catch (error) {
    console.error("[MARKET-TIMING] setNSEHolidays failed", error)
  }
}
