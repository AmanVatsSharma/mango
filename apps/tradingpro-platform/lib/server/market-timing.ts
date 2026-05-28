/**
 * @file market-timing.ts
 * @module server-market-timing
 * @description Server-side market timing utilities with database access. Each Indian venue
 *              the milli-search API can populate into a watchlist (NSE / BSE / MCX / NCO /
 *              CDS / BCD / IDX) maps to a specific trading window so order placement returns
 *              an accurate reason instead of falsely reporting "NSE trading hours" for a
 *              currency-derivative or commodity instrument. Non-Indian venues (NASDAQ /
 *              NYSE / FX / NSEIX / CRYPTO / BINANCE) are dispatched explicitly: crypto
 *              is treated as 24/7, the rest are reported as "not yet enabled" rather than
 *              being silently misrouted to NSE timing.
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-05-06 — Segment-aware trading windows for NCO_FO / CDS_FO / BCD_FO / IDX / CRYPTO + explicit "not enabled" handling for NASDAQ / NYSE / FX / NSEIX so users see accurate rejection reasons.
 */

import { prisma } from "@/lib/prisma"
import { getCurrentISTDate } from "@/lib/date-utils"
import type { MarketSession } from "@/lib/hooks/market-timing"

const NSE_SEGMENTS = new Set(["NSE", "NSE_EQ", "NSEEQ", "NSE_FO", "NSEFO", "NFO", "EQ", "BSE", "BSE_EQ", "BSE_FO", "BFO"])
const MCX_SEGMENTS = new Set(["MCX", "MCX_FO", "MCXFO"])
// NCO (NSE/BSE non-MCX commodity) trades a long-hours window similar to MCX in retail terms.
// Treat it as a commodity venue — mirrors the same 09:00–23:55 IST band used for MCX.
const NCO_SEGMENTS = new Set(["NCO", "NCO_FO", "NCOFO"])
// Currency derivatives — NSE (CDS) and BSE (BCD) — trade 09:00–17:00 IST per regulator rules
// and observe NSE/BSE holidays. They share a window helper since the timings are identical.
const CDS_SEGMENTS = new Set(["CDS", "CDS_FO", "CDSFO"])
const BCD_SEGMENTS = new Set(["BCD", "BCD_FO", "BCDFO"])
// Indices (IDX / INDICES) aren't directly tradable as cash but can show up in watchlists.
// They're observed only while the underlying NSE EQ window is open, so the dispatch below
// falls them through into the NSE branch by design — no dedicated set needed.
//
// 24/7 venues — only the explicit force-closed flag from operations gates them. Spot-only
// crypto is the canonical example today; any future always-on venue can join this set.
const CRYPTO_SEGMENTS = new Set(["CRYPTO", "BINANCE", "SPOT"])
// Venues that the milli-search API may surface but which this platform does not yet route
// live orders to. Returning a clear "not enabled" reason avoids misleading users who tried
// to place an order from a watchlist row of these classes.
const VENUES_NOT_ENABLED_FOR_LIVE_ORDERS = new Set([
  "NASDAQ",
  "NYSE",
  "US",
  "GLOBAL",
  "FX",
  "FOREX",
  "NSEIX",
])
const NSE_CLOSE_MINUTES_IST = 15 * 60 + 30
const MCX_CLOSE_MINUTES_IST = 23 * 60 + 55
const CURRENCY_OPEN_MINUTES_IST = 9 * 60        // 09:00 IST
const CURRENCY_CLOSE_MINUTES_IST = 17 * 60      // 17:00 IST
const DEFAULT_INTRADAY_SQUARE_OFF_PRE_CLOSE_BUFFER_MINUTES = 15
const MIN_INTRADAY_SQUARE_OFF_PRE_CLOSE_BUFFER_MINUTES = 1
const MAX_INTRADAY_SQUARE_OFF_PRE_CLOSE_BUFFER_MINUTES = 120

// Cache for force closed setting (5 second TTL)
let cachedForceClosed: boolean | null = null
let cacheTimestamp: number = 0
const CACHE_TTL_MS = 5000 // 5 seconds

// Cache for NSE holiday list (configurable TTL)
let cachedNseHolidays: Set<string> | null = null
let holidaysCacheTimestamp: number = 0
const HOLIDAYS_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Check if market is force closed from database
 * Uses caching to avoid excessive DB queries
 * 
 * @returns Promise<boolean> - True if market is force closed
 */
export async function getMarketForceClosedFromDB(): Promise<boolean> {
  const now = Date.now()
  
  // Return cached value if still valid
  if (cachedForceClosed !== null && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log('[MarketTiming-DB] Returning cached force_closed value')
    return cachedForceClosed
  }

  console.log('[MarketTiming-DB] Fetching market_force_closed from database')
  
  try {
    const setting = await prisma.systemSettings.findFirst({
      where: {
        key: 'market_force_closed',
        isActive: true
      }
    })

    const forceClosed = setting?.value === 'true'
    
    // Update cache
    cachedForceClosed = forceClosed
    cacheTimestamp = now

    console.log('[MarketTiming-DB] Force closed setting:', forceClosed)
    return forceClosed
  } catch (error: any) {
    console.error('[MarketTiming-DB] Error fetching force_closed:', error)
    
    // Return cached value if available, otherwise default to false
    if (cachedForceClosed !== null) {
      console.log('[MarketTiming-DB] Using cached value due to error')
      return cachedForceClosed
    }

    return false
  }
}

/**
 * Invalidate the force closed cache
 * Call this after updating market_force_closed setting
 */
export function invalidateMarketForceClosedCache(): void {
  console.log('[MarketTiming-DB] Invalidating force_closed cache')
  cachedForceClosed = null
  cacheTimestamp = 0
}

/**
 * Invalidate the NSE holidays cache.
 * Call this after updating `market_holidays_csv` setting.
 */
export function invalidateNseHolidaysCache(): void {
  console.log('[MarketTiming-DB] Invalidating NSE holidays cache')
  cachedNseHolidays = null
  holidaysCacheTimestamp = 0
}

/**
 * Format a Date (IST) to YYYY-MM-DD
 */
const formatYyyyMmDd = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function getISTDateKey(date?: Date): string {
  const d = date ? new Date(date) : nowIST()
  return formatYyyyMmDd(d)
}

/**
 * Returns an IST Date for now
 */
const nowIST = (): Date => {
  try {
    return getCurrentISTDate()
  } catch {
    const now = new Date()
    return new Date(now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }))
  }
}

/**
 * Get NSE holidays from database
 */
async function getNSEHolidaysFromDB(): Promise<Set<string>> {
  const now = Date.now()

  // Return cached value if still valid
  if (cachedNseHolidays && (now - holidaysCacheTimestamp) < HOLIDAYS_CACHE_TTL_MS) {
    return cachedNseHolidays
  }

  try {
    const setting = await prisma.systemSettings.findFirst({
      where: {
        key: 'market_holidays_csv',
        isActive: true
      }
    })

    if (!setting?.value) {
      cachedNseHolidays = new Set<string>()
      holidaysCacheTimestamp = now
      return cachedNseHolidays
    }

    const holidays = setting.value
      .split(/[,\n\r]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))

    cachedNseHolidays = new Set(holidays)
    holidaysCacheTimestamp = now
    return cachedNseHolidays
  } catch (error) {
    console.error('[MarketTiming-DB] Error fetching holidays:', error)

    // Return cached value if available, otherwise default to empty set
    if (cachedNseHolidays) {
      return cachedNseHolidays
    }

    cachedNseHolidays = new Set<string>()
    holidaysCacheTimestamp = now
    return cachedNseHolidays
  }
}

/**
 * Check if given IST date is an NSE holiday (from DB)
 */
export async function isNSEHolidayFromDB(date?: Date): Promise<boolean> {
  try {
    const d = date ? new Date(date) : nowIST()
    const key = formatYyyyMmDd(d)
    const holidays = await getNSEHolidaysFromDB()
    const isHoliday = holidays.has(key)
    if (isHoliday) console.log(`📅 [MARKET-TIMING-DB] Holiday detected for ${key}`)
    return isHoliday
  } catch (error) {
    console.warn("[MARKET-TIMING-DB] isNSEHolidayFromDB failed, defaulting to false", error)
    return false
  }
}

/**
 * Returns true during pre-open window (Mon–Fri, 09:00–09:15 IST)
 */
function isPreOpenTime(date?: Date): boolean {
  try {
    const d = date ? new Date(date) : nowIST()
    const day = d.getDay() // Sun=0 .. Sat=6
    if (day === 0 || day === 6) return false
    const minutes = d.getHours() * 60 + d.getMinutes()
    const preOpenStart = 9 * 60 + 0 // 09:00
    const marketOpen = 9 * 60 + 15 // 09:15
    return minutes >= preOpenStart && minutes < marketOpen
  } catch (error) {
    console.warn("[MARKET-TIMING-DB] isPreOpenTime failed, defaulting to false", error)
    return false
  }
}

/**
 * Returns true when regular session is open (Mon–Fri, 09:15–15:30 IST)
 */
function isMarketOpenTime(date?: Date): boolean {
  try {
    const d = date ? new Date(date) : nowIST()
    const day = d.getDay()
    if (day === 0 || day === 6) return false
    const minutes = d.getHours() * 60 + d.getMinutes()
    const marketOpen = 9 * 60 + 15 // 09:15
    const marketClose = 15 * 60 + 30 // 15:30
    return minutes >= marketOpen && minutes <= marketClose
  } catch (error) {
    console.error("[MARKET-TIMING-DB] Error checking market open status:", error)
    return false
  }
}

const minutesSinceMidnight = (d: Date): number => (d.getHours() * 60) + d.getMinutes()

const isWeekend = (d: Date): boolean => {
  const day = d.getDay()
  return day === 0 || day === 6
}

const isMcxWindow = (d: Date): boolean => {
  const start = 9 * 60 // 09:00
  const end = MCX_CLOSE_MINUTES_IST // 23:55
  const minutes = minutesSinceMidnight(d)
  return minutes >= start && minutes <= end
}

/**
 * Indian currency derivatives (CDS / BCD) trade 09:00–17:00 IST. CDS is hosted on NSE and
 * BCD on BSE, but the regulator-mandated window is identical so a single helper covers both.
 */
const isCurrencyDerivativesWindow = (d: Date): boolean => {
  const minutes = minutesSinceMidnight(d)
  return minutes >= CURRENCY_OPEN_MINUTES_IST && minutes <= CURRENCY_CLOSE_MINUTES_IST
}

/**
 * Map an arbitrary segment string onto one of the three intraday-square-off families this
 * module models close-minutes for: NSE-style (15:30 IST), MCX/NCO commodity (23:55 IST), or
 * CDS/BCD currency-derivatives (17:00 IST). Falls back to NSE when the segment is unknown,
 * preserving the legacy default for plain Indian-equity intraday positions.
 */
function normalizeSquareOffSegment(segment?: string | null): "NSE" | "MCX" | "CURRENCY" {
  const normalizedSegment = (segment || "NSE").trim().toUpperCase()
  if (MCX_SEGMENTS.has(normalizedSegment) || NCO_SEGMENTS.has(normalizedSegment)) {
    return "MCX"
  }
  if (CDS_SEGMENTS.has(normalizedSegment) || BCD_SEGMENTS.has(normalizedSegment)) {
    return "CURRENCY"
  }
  return "NSE"
}

function resolveSegmentCloseMinutes(segment: "NSE" | "MCX" | "CURRENCY"): number {
  if (segment === "MCX") return MCX_CLOSE_MINUTES_IST
  if (segment === "CURRENCY") return CURRENCY_CLOSE_MINUTES_IST
  return NSE_CLOSE_MINUTES_IST
}

/**
 * Single source of truth for "what minute of the IST day does this venue's session open?".
 * Returns IST minutes-since-midnight so callers can subtract from the current IST minute
 * to compute "minutes since session open" — used by the trading-policy engine for
 * early-session detection (e.g. anti-scalp bursts in the first 15 minutes).
 *
 * Mirrors `getSegmentTradingSession`'s family classification:
 *   - MCX / NCO commodity        → 09:00 (540)
 *   - CDS / BCD currency derivs  → 09:00 (540)
 *   - Crypto                     → 00:00 (0)  — 24/7, "since open" is "since midnight IST"
 *   - NSE / BSE / IDX / unknown  → 09:15 (555)
 *
 * Pre-2026-05 the order route hand-checked only `MCX | MCX_FO | MCXFO` and treated every
 * other segment (including NCO/CDS/BCD/CRYPTO) as having a 09:15 open, which gave the
 * policy engine a false "minutes since open" for those venues.
 */
export function resolveSegmentSessionOpenMinutesIST(segment?: string | null): number {
  const token = (segment || "NSE").trim().toUpperCase()
  if (MCX_SEGMENTS.has(token) || NCO_SEGMENTS.has(token)) return 9 * 60          // 09:00 IST
  if (CDS_SEGMENTS.has(token) || BCD_SEGMENTS.has(token)) return 9 * 60          // 09:00 IST
  if (CRYPTO_SEGMENTS.has(token)) return 0                                       // 24/7
  return 9 * 60 + 15                                                             // NSE/BSE/IDX 09:15 IST
}

export function normalizeIntradaySquareOffPreCloseBufferMinutes(value: unknown): number {
  const parsedBuffer =
    typeof value === "string" ? Number.parseFloat(value.trim()) : typeof value === "number" ? value : Number.NaN
  if (!Number.isFinite(parsedBuffer)) {
    return DEFAULT_INTRADAY_SQUARE_OFF_PRE_CLOSE_BUFFER_MINUTES
  }
  const normalizedBuffer = Math.trunc(parsedBuffer)
  return Math.max(
    MIN_INTRADAY_SQUARE_OFF_PRE_CLOSE_BUFFER_MINUTES,
    Math.min(MAX_INTRADAY_SQUARE_OFF_PRE_CLOSE_BUFFER_MINUTES, normalizedBuffer),
  )
}

export function getIntradaySquareOffPreCloseBufferMinutesFromEnv(): number {
  const configuredValue =
    process.env.POSITION_INTRADAY_EOD_PRE_CLOSE_BUFFER_MINUTES ??
    process.env.INTRADAY_EOD_PRE_CLOSE_BUFFER_MINUTES
  return normalizeIntradaySquareOffPreCloseBufferMinutes(configuredValue)
}

export type SegmentIntradaySquareOffWindowDecision = {
  shouldSquareOffNow: boolean
  segment: "NSE" | "MCX" | "CURRENCY"
  dateKeyIst: string
  nowMinutesIst: number
  closeMinutesIst: number
  windowStartMinutesIst: number
  preCloseBufferMinutes: number
  reason: string
}

export async function getSegmentIntradaySquareOffWindowDecision(input?: {
  segment?: string | null
  date?: Date
  preCloseBufferMinutes?: number
}): Promise<SegmentIntradaySquareOffWindowDecision> {
  try {
    const d = input?.date ? new Date(input.date) : nowIST()
    const segment = normalizeSquareOffSegment(input?.segment)
    const preCloseBufferMinutes = normalizeIntradaySquareOffPreCloseBufferMinutes(
      input?.preCloseBufferMinutes ?? getIntradaySquareOffPreCloseBufferMinutesFromEnv(),
    )
    const closeMinutesIst = resolveSegmentCloseMinutes(segment)
    const windowStartMinutesIst = Math.max(0, closeMinutesIst - preCloseBufferMinutes)
    const nowMinutesIst = minutesSinceMidnight(d)
    const dateKeyIst = getISTDateKey(d)

    const forceClosed = await getMarketForceClosedFromDB()
    if (forceClosed) {
      return {
        shouldSquareOffNow: false,
        segment,
        dateKeyIst,
        nowMinutesIst,
        closeMinutesIst,
        windowStartMinutesIst,
        preCloseBufferMinutes,
        reason: "Market is force-closed by operations",
      }
    }

    if (isWeekend(d)) {
      return {
        shouldSquareOffNow: false,
        segment,
        dateKeyIst,
        nowMinutesIst,
        closeMinutesIst,
        windowStartMinutesIst,
        preCloseBufferMinutes,
        reason: "Weekend (markets closed)",
      }
    }

    // NSE-listed (equity / F&O) and CDS/BCD currency derivatives both observe the NSE holiday
    // calendar configured in the DB. MCX and NCO commodity venues have a distinct calendar
    // that this module does not model yet — leave them un-gated by holiday for now.
    if (segment === "NSE" || segment === "CURRENCY") {
      const isHoliday = await isNSEHolidayFromDB(d)
      if (isHoliday) {
        return {
          shouldSquareOffNow: false,
          segment,
          dateKeyIst,
          nowMinutesIst,
          closeMinutesIst,
          windowStartMinutesIst,
          preCloseBufferMinutes,
          reason: "NSE holiday (DB configured)",
        }
      }
    }

    const shouldSquareOffNow = nowMinutesIst >= windowStartMinutesIst && nowMinutesIst <= closeMinutesIst
    const reason = shouldSquareOffNow
      ? `Within pre-close square-off window (${preCloseBufferMinutes}m buffer)`
      : `Outside pre-close square-off window (${preCloseBufferMinutes}m buffer)`

    return {
      shouldSquareOffNow,
      segment,
      dateKeyIst,
      nowMinutesIst,
      closeMinutesIst,
      windowStartMinutesIst,
      preCloseBufferMinutes,
      reason,
    }
  } catch (error) {
    const d = input?.date ? new Date(input.date) : nowIST()
    const segment = normalizeSquareOffSegment(input?.segment)
    const preCloseBufferMinutes = normalizeIntradaySquareOffPreCloseBufferMinutes(
      input?.preCloseBufferMinutes ?? getIntradaySquareOffPreCloseBufferMinutesFromEnv(),
    )
    const closeMinutesIst = resolveSegmentCloseMinutes(segment)
    const windowStartMinutesIst = Math.max(0, closeMinutesIst - preCloseBufferMinutes)
    const nowMinutesIst = minutesSinceMidnight(d)
    const dateKeyIst = getISTDateKey(d)
    console.warn("[MARKET-TIMING-DB] getSegmentIntradaySquareOffWindowDecision failed, defaulting to skip", error)
    return {
      shouldSquareOffNow: false,
      segment,
      dateKeyIst,
      nowMinutesIst,
      closeMinutesIst,
      windowStartMinutesIst,
      preCloseBufferMinutes,
      reason: "Unable to confirm intraday square-off window",
    }
  }
}

/**
 * Get market session from server (checks DB force_closed first)
 * 
 * @param date - Optional date to check (defaults to now in IST)
 * @returns Promise<MarketSession> - Current market session
 */
export async function getServerMarketSession(date?: Date): Promise<MarketSession> {
  try {
    // Check force closed first (highest priority)
    const forceClosed = await getMarketForceClosedFromDB()
    if (forceClosed) {
      console.log('[MARKET-TIMING-DB] Market is force closed')
      return "closed"
    }

    const d = date ? new Date(date) : nowIST()
    const day = d.getDay()
    if (day === 0 || day === 6) return "closed"
    
    // Check holidays from DB
    const isHoliday = await isNSEHolidayFromDB(d)
    if (isHoliday) return "closed"
    
    if (isPreOpenTime(d)) return "pre-open"
    return isMarketOpenTime(d) ? "open" : "closed"
  } catch (error) {
    console.warn("[MARKET-TIMING-DB] getServerMarketSession failed, defaulting to closed", error)
    return "closed"
  }
}

/**
 * Check if market is open from server (checks DB force_closed first)
 * 
 * @param date - Optional date to check (defaults to now in IST)
 * @returns Promise<boolean> - True if market is open
 */
export async function isServerMarketOpen(date?: Date): Promise<boolean> {
  try {
    // Check force closed first
    const forceClosed = await getMarketForceClosedFromDB()
    if (forceClosed) {
      return false
    }

    const d = date ? new Date(date) : nowIST()
    const day = d.getDay()
    if (day === 0 || day === 6) return false
    
    const isHoliday = await isNSEHolidayFromDB(d)
    if (isHoliday) return false
    
    return isMarketOpenTime(d)
  } catch (error) {
    console.error("[MARKET-TIMING-DB] isServerMarketOpen failed, defaulting to false", error)
    return false
  }
}

/**
 * Segment-aware trading session helper. Dispatches each watchlist-reachable venue family
 * onto its real trading window:
 *
 *   - NSE / BSE equity / F&O / IDX  → 09:15–15:30 IST (09:00–09:15 pre-open), NSE holiday calendar
 *   - MCX / NCO commodity           → 09:00–23:55 IST
 *   - CDS / BCD currency derivatives → 09:00–17:00 IST, NSE holiday calendar
 *   - CRYPTO / BINANCE              → 24/7, only force-closed gates
 *   - NASDAQ / NYSE / FX / NSEIX    → "venue not yet enabled" with an explicit reason
 *
 * The previous implementation routed *every* non-MCX segment through NSE timing, which is
 * why a CDS option order at 16:30 IST would be rejected with the false reason "NSE trading
 * hours are 09:15–15:30 IST" even though CDS trades till 17:00. Each venue now reports a
 * reason that matches its actual window, so the order dashboard's rejection toast is truthful.
 */
export async function getSegmentTradingSession(
  segment?: string | null,
  date?: Date
): Promise<{ session: MarketSession; reason?: string }> {
  try {
    const normalizedSegment = (segment || "NSE").toUpperCase()
    const d = date ? new Date(date) : nowIST()

    const forceClosed = await getMarketForceClosedFromDB()
    if (forceClosed) {
      return { session: "closed", reason: "Market is force-closed by operations" }
    }

    // Crypto is 24/7 — only the force-closed flag above can gate it. Weekend and holiday
    // checks below would incorrectly close it on Saturdays / Sundays / Indian holidays.
    if (CRYPTO_SEGMENTS.has(normalizedSegment)) {
      return { session: "open" }
    }

    // Venues that aren't yet wired for live order placement. Returning a clear reason here
    // prevents the misleading "NSE trading hours" message users were seeing for these.
    if (VENUES_NOT_ENABLED_FOR_LIVE_ORDERS.has(normalizedSegment)) {
      return {
        session: "closed",
        reason: `${normalizedSegment} venue is not yet enabled for live order placement on this platform`,
      }
    }

    if (isWeekend(d)) {
      return { session: "closed", reason: "Weekend (markets closed)" }
    }

    // MCX commodity + NCO commodity share the same retail window (09:00–23:55 IST).
    if (MCX_SEGMENTS.has(normalizedSegment) || NCO_SEGMENTS.has(normalizedSegment)) {
      const open = isMcxWindow(d)
      return {
        session: open ? "open" : "closed",
        reason: open
          ? undefined
          : `${normalizedSegment} commodity orders are accepted between 09:00–23:55 IST`,
      }
    }

    // CDS (NSE) and BCD (BSE) currency derivatives — 09:00–17:00 IST, NSE holiday calendar.
    if (CDS_SEGMENTS.has(normalizedSegment) || BCD_SEGMENTS.has(normalizedSegment)) {
      const isHoliday = await isNSEHolidayFromDB(d)
      if (isHoliday) {
        return { session: "closed", reason: `${normalizedSegment} closed on NSE/BSE holiday` }
      }
      const open = isCurrencyDerivativesWindow(d)
      return {
        session: open ? "open" : "closed",
        reason: open
          ? undefined
          : `${normalizedSegment} currency derivative orders are accepted between 09:00–17:00 IST`,
      }
    }

    // Default to NSE/BSE equity logic (includes NSE_EQ, NSE_FO, BSE, BSE_FO, IDX, INDICES).
    const isHoliday = await isNSEHolidayFromDB(d)
    if (isHoliday) {
      return { session: "closed", reason: "NSE holiday (DB configured)" }
    }

    if (isPreOpenTime(d)) {
      return { session: "pre-open", reason: "NSE pre-open window 09:00–09:15 IST" }
    }

    if (isMarketOpenTime(d)) {
      return { session: "open" }
    }

    return { session: "closed", reason: "NSE trading hours are 09:15–15:30 IST" }
  } catch (error) {
    console.warn("[MARKET-TIMING-DB] getSegmentTradingSession failed, defaulting to closed", error)
    return { session: "closed", reason: "Unable to confirm trading window" }
  }
}

