/**
 * @file trading-dashboard-number-utils.ts
 * @module components/trading
 * @description Strict numeric helpers for TradingDashboard index and live P&L calculations.
 * @author StockTrade
 * @created 2026-02-16
 */

import type { PnLData } from "@/types/trading"
import {
  parseFiniteMarketNumber,
  parseNonNegativeMarketNumber,
  parsePositiveIntegerMarketNumber,
  parseTokenFromInstrumentId,
  resolveDisplayPriceFromQuote,
  resolveQuoteFromMap,
  resolveDisplayQuoteSnapshot,
  resolveQuotePriceSnapshot,
  type QuoteDisplaySource,
  type MarketQuoteLike,
  type StaleQuotePriceMode,
} from "@/lib/market-data/utils/quote-lookup"

const DEFAULT_PNL_MAX_AGE_MS = 15_000
const LIVE_QUOTE_MAX_AGE_MS = 5_000
const DISPLAY_QUOTE_MAX_AGE_MS = 60_000

export type TradingPnlMeta = {
  pnlMode?: "client" | "server" | null
  workerHealthy?: boolean | null
  pnlMaxAgeMs?: number | null
  /** From market_display_config_v1: open MTM uses live hybrid vs server snapshot when fresh. */
  positionsTabMtmDisplayMode?: "live_hybrid" | "live_quote_preferred" | "server_snapshot_preferred" | null
  /** Overrides LIVE_QUOTE_MAX_AGE_MS when set (admin market display config). */
  liveQuoteMaxAgeMs?: number | null
  /** Overrides DISPLAY_QUOTE_MAX_AGE_MS when set. */
  displayQuoteMaxAgeMs?: number | null
  /** From market_display_config_v1 ui; aligns display row price with watchlist. */
  staleQuotePriceMode?: StaleQuotePriceMode | null
}

export type ResolvedTradingPositionPnl = {
  positionId: string
  isClosed: boolean
  quantity: number
  currentPrice: number
  displayPrice: number | null
  displayPriceSource: QuoteDisplaySource
  quoteAgeMs: number | null
  totalPnl: number
  dayPnl: number
  unrealizedPnl: number
  bookedPnl: number
  source: "server" | "live" | "fallback" | "closed"
  serverFresh: boolean
}

export type TradingPositionsPnlSummary = {
  totalPnL: number
  dayPnL: number
  openMtm: number
  bookedToday: number
  bookedPnL: number
  winRate: number
  totalPositions: number
  closedPositions: number
  resolvedByPositionId: Map<string, ResolvedTradingPositionPnl>
}

export function resolveIndexTokenCandidate(instrumentId: string): number | null {
  return parseTokenFromInstrumentId(instrumentId)
}

export function resolveIndexQuote(
  quotes: Record<string, MarketQuoteLike> | null | undefined,
  input: { token?: unknown; instrumentId?: string | null },
): MarketQuoteLike | null {
  return (
    resolveQuoteFromMap(quotes, {
      token: input.token,
      instrumentId: input.instrumentId || null,
    }) ?? null
  )
}

function resolveLiveQuoteMaxAgeMs(pnlMeta?: TradingPnlMeta): number {
  const parsed = parseFiniteMarketNumber(pnlMeta?.liveQuoteMaxAgeMs)
  if (parsed !== null && parsed >= 250) {
    return Math.trunc(parsed)
  }
  return LIVE_QUOTE_MAX_AGE_MS
}

function resolveDisplayQuoteMaxAgeMs(pnlMeta?: TradingPnlMeta): number {
  const parsed = parseFiniteMarketNumber(pnlMeta?.displayQuoteMaxAgeMs)
  if (parsed !== null && parsed >= 1_000) {
    return Math.trunc(parsed)
  }
  return DISPLAY_QUOTE_MAX_AGE_MS
}

function resolveQuoteLtpForPnl(quote: MarketQuoteLike | null, pnlMeta?: TradingPnlMeta): number | null {
  const snap = resolveQuotePriceSnapshot({ quote, maxAgeMs: resolveLiveQuoteMaxAgeMs(pnlMeta) })
  if (!snap.isFresh) {
    return null
  }
  return snap.tradePrice > 0 ? snap.tradePrice : null
}

function resolveQuotePrevCloseForPnl(quote: MarketQuoteLike | null, pnlMeta?: TradingPnlMeta): number | null {
  const snap = resolveQuotePriceSnapshot({ quote, maxAgeMs: resolveLiveQuoteMaxAgeMs(pnlMeta) })
  if (!snap.isFresh) {
    return null
  }
  return snap.prevClose > 0 ? snap.prevClose : null
}

function resolveDisplayQuoteForPosition(quote: MarketQuoteLike | null, pnlMeta?: TradingPnlMeta) {
  return resolveDisplayQuoteSnapshot({
    quote,
    liveMaxAgeMs: resolveLiveQuoteMaxAgeMs(pnlMeta),
    displayMaxAgeMs: resolveDisplayQuoteMaxAgeMs(pnlMeta),
    staleQuotePriceMode: pnlMeta?.staleQuotePriceMode ?? "strict",
  })
}

function resolvePositionInstrumentId(position: any): string | null {
  return typeof position?.stock?.instrumentId === "string"
    ? position.stock.instrumentId
    : typeof position?.instrumentId === "string"
      ? position.instrumentId
      : null
}

function resolvePositionToken(position: any, instrumentId: string | null): number | null {
  const stockToken = parsePositiveIntegerMarketNumber(position?.stock?.token)
  if (stockToken !== null) {
    return stockToken
  }
  const token = parsePositiveIntegerMarketNumber(position?.token)
  if (token !== null) {
    return token
  }
  const parsedInstrumentToken = parseTokenFromInstrumentId(instrumentId)
  return parsedInstrumentToken !== null ? parsedInstrumentToken : null
}

function resolvePositionQuote(
  position: any,
  quotes: Record<string, MarketQuoteLike> | null | undefined,
): MarketQuoteLike | null {
  const instrumentId = resolvePositionInstrumentId(position)
  const token = resolvePositionToken(position, instrumentId)
  return (
    resolveQuoteFromMap(quotes, {
      token,
      instrumentId,
    }) ?? null
  )
}

function resolvePositionClosedState(position: any, quantity: number): boolean {
  return Boolean(position?.isClosed) || quantity === 0
}

function resolvePositionServerFreshness(input: {
  position: any
  pnlMeta?: TradingPnlMeta
  nowMs: number
}): boolean {
  if (!input.pnlMeta?.workerHealthy) {
    return false
  }
  const updatedAtMs = parseFiniteMarketNumber(input.position?.pnlUpdatedAtMs)
  if (updatedAtMs === null || updatedAtMs <= 0) {
    return false
  }
  const maxAgeMs = Math.max(
    1_000,
    parseFiniteMarketNumber(input.pnlMeta?.pnlMaxAgeMs) ?? DEFAULT_PNL_MAX_AGE_MS,
  )
  const ageMs = input.nowMs - updatedAtMs
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMs
}

export function resolveTradingPositionPnl(input: {
  position: any
  quotes: Record<string, MarketQuoteLike> | null | undefined
  pnlMeta?: TradingPnlMeta
  nowMs?: number
}): ResolvedTradingPositionPnl {
  const nowMs = parseFiniteMarketNumber(input.nowMs) ?? Date.now()
  const position = input.position ?? {}
  const positionId = typeof position?.id === "string" ? position.id : ""
  const quantity = parseFiniteMarketNumber(position?.quantity) ?? 0
  const avg = parseFiniteMarketNumber(position?.averagePrice) ?? 0
  const isClosed = resolvePositionClosedState(position, quantity)

  if (isClosed) {
    const booked = parseFiniteMarketNumber(position?.bookedPnL)
    const realized = parseFiniteMarketNumber(position?.realizedPnL)
    const legacy = parseFiniteMarketNumber(position?.unrealizedPnL)
    const closedPnl = booked ?? realized ?? legacy ?? 0
    return {
      positionId,
      isClosed: true,
      quantity,
      currentPrice: avg,
      displayPrice: avg > 0 ? avg : null,
      displayPriceSource: "SNAPSHOT",
      quoteAgeMs: null,
      totalPnl: closedPnl,
      dayPnl: closedPnl,
      unrealizedPnl: 0,
      bookedPnl: closedPnl,
      source: "closed",
      serverFresh: true,
    }
  }

  const quote = resolvePositionQuote(position, input.quotes)
  const displayQuote = resolveDisplayQuoteForPosition(quote, input.pnlMeta)
  const livePrice = resolveQuoteLtpForPnl(quote, input.pnlMeta)
  const livePrevClose = resolveQuotePrevCloseForPnl(quote, input.pnlMeta)
  const serverCurrentPrice = parseFiniteMarketNumber(position?.currentPrice)

  // Pre-2026-05 the UI showed `displayQuote.uiPrice` (looser display window) as the LTP
  // while PnL was computed from `livePrice` (strict 5s freshness window) — when the quote
  // was just barely stale, `livePrice` went null and PnL fell through to the worker
  // snapshot, but the LTP kept rendering the displayable value. Result: users saw
  // `(LTP_shown - avg) × qty ≠ PnL_shown` and reported "the numbers don't add up". The
  // cure is to compute PnL from the SAME price the UI displays — `displayQuote.tradePrice`
  // when available, falling through to the server snapshot only when no displayable price
  // exists (then both LTP and PnL go to "—" / server number, and the feed-stale badge
  // explains why). This guarantees the user's mental check always reconciles.
  const displayMatchedPrice =
    parseFiniteMarketNumber(displayQuote.tradePrice) ??
    parseFiniteMarketNumber(displayQuote.uiPrice) ??
    null
  const displayMatchedPrevClose = parseFiniteMarketNumber(displayQuote.prevClose) ?? null

  // currentPrice is used internally for risk-progress meters and SL/target progress bars —
  // it must also align with what's displayed so those meters never disagree with the LTP.
  const currentPrice = displayMatchedPrice ?? livePrice ?? serverCurrentPrice ?? avg

  const liveUnrealized =
    displayMatchedPrice !== null && displayMatchedPrice > 0
      ? (displayMatchedPrice - avg) * quantity
      : null
  // Day PnL: prefer the prevClose carried alongside the same display snapshot so it stays
  // consistent with the displayed LTP. Falls back to the strict-window prevClose only when
  // the display snapshot doesn't carry one.
  const liveDay =
    displayMatchedPrice !== null &&
    displayMatchedPrice > 0 &&
    (displayMatchedPrevClose ?? livePrevClose) !== null
      ? (displayMatchedPrice - (displayMatchedPrevClose ?? livePrevClose ?? 0)) * quantity
      : null

  const serverUnrealized = parseFiniteMarketNumber(position?.unrealizedPnL)
  const serverDay = parseFiniteMarketNumber(position?.dayPnL)
  const serverFresh = resolvePositionServerFreshness({
    position,
    pnlMeta: input.pnlMeta,
    nowMs,
  })
  // `hasLivePrice` now means "we have a *displayable* price the UI is showing", not just
  // "the strict freshness window passed". This is what gates the live-PnL branch — if it
  // gates on the strict window but the UI shows the looser display window, the two halves
  // disagree, which is exactly the mismatch the user reported.
  const hasLivePrice = displayMatchedPrice !== null && displayMatchedPrice > 0
  const hasServerSnapshot = serverUnrealized !== null || serverDay !== null

  const preferServerMtm =
    input.pnlMeta?.positionsTabMtmDisplayMode === "server_snapshot_preferred" &&
    input.pnlMeta?.pnlMode === "server" &&
    input.pnlMeta?.workerHealthy === true &&
    serverFresh &&
    hasServerSnapshot

  // Default: hybrid-live when a displayable quote exists; optional admin mode prefers worker.
  let unrealizedPnl: number
  let dayPnl: number
  if (preferServerMtm) {
    unrealizedPnl = serverUnrealized ?? 0
    dayPnl = serverDay ?? unrealizedPnl
  } else {
    unrealizedPnl = hasLivePrice
      ? liveUnrealized ?? serverUnrealized ?? 0
      : serverUnrealized ?? 0
    dayPnl = hasLivePrice
      ? liveDay ?? serverDay ?? unrealizedPnl
      : serverDay ?? serverUnrealized ?? 0
  }

  const source: ResolvedTradingPositionPnl["source"] = preferServerMtm
    ? "server"
    : hasLivePrice
      ? "live"
      : hasServerSnapshot
        ? "server"
        : serverFresh
          ? "server"
          : "fallback"

  return {
    positionId,
    isClosed: false,
    quantity,
    currentPrice,
    displayPrice: displayQuote.uiPrice,
    displayPriceSource: displayQuote.source,
    quoteAgeMs: displayQuote.quoteAgeMs,
    totalPnl: unrealizedPnl,
    dayPnl,
    unrealizedPnl,
    bookedPnl: parseFiniteMarketNumber(position?.bookedPnL) ?? 0,
    source,
    serverFresh,
  }
}

export function computeTradingPositionsPnlSummary(input: {
  positions: any[]
  quotes: Record<string, MarketQuoteLike> | null | undefined
  pnlMeta?: TradingPnlMeta
  nowMs?: number
}): TradingPositionsPnlSummary {
  let totalPnL = 0
  let dayPnL = 0
  let openMtm = 0
  let bookedToday = 0
  let bookedPnL = 0
  let winners = 0
  let totalPositions = 0
  let closedPositions = 0
  const resolvedByPositionId = new Map<string, ResolvedTradingPositionPnl>()

  for (const position of input.positions || []) {
    const resolved = resolveTradingPositionPnl({
      position,
      quotes: input.quotes,
      pnlMeta: input.pnlMeta,
      nowMs: input.nowMs,
    })
    if (resolved.positionId) {
      resolvedByPositionId.set(resolved.positionId, resolved)
    }

    totalPnL += resolved.totalPnl
    dayPnL += resolved.dayPnl
    if (resolved.isClosed) {
      bookedPnL += resolved.bookedPnl
      bookedToday += resolved.bookedPnl
      closedPositions += 1
    } else {
      openMtm += resolved.unrealizedPnl
      totalPositions += 1
    }
    if (resolved.totalPnl > 0) {
      winners += 1
    }
  }

  const allPositions = input.positions?.length ?? 0
  const winRate = allPositions > 0 ? (winners / allPositions) * 100 : 0

  return {
    totalPnL: Number.isFinite(totalPnL) ? totalPnL : 0,
    dayPnL: Number.isFinite(dayPnL) ? dayPnL : 0,
    openMtm: Number.isFinite(openMtm) ? openMtm : 0,
    bookedToday: Number.isFinite(bookedToday) ? bookedToday : 0,
    bookedPnL: Number.isFinite(bookedPnL) ? bookedPnL : 0,
    winRate: Number.isFinite(winRate) ? winRate : 0,
    totalPositions,
    closedPositions,
    resolvedByPositionId,
  }
}

export function computeTradingDashboardPnL(input: {
  positions: any[]
  quotes: Record<string, MarketQuoteLike> | null | undefined
  fallback: PnLData
  pnlMeta?: TradingPnlMeta
}): PnLData {
  if (!Array.isArray(input.positions) || input.positions.length === 0) {
    return input.fallback
  }

  const summary = computeTradingPositionsPnlSummary({
    positions: input.positions,
    quotes: input.quotes,
    pnlMeta: input.pnlMeta,
  })

  return {
    totalPnL: Number.isFinite(summary.totalPnL) ? summary.totalPnL : input.fallback.totalPnL,
    dayPnL: Number.isFinite(summary.dayPnL) ? summary.dayPnL : input.fallback.dayPnL,
  }
}

export function resolveIndexDisplayState(input: {
  quote: MarketQuoteLike | null
}): { price: number; prevClose: number; change: number } {
  const price = resolveDisplayPriceFromQuote(input.quote, 0)
  const prevClose = parseNonNegativeMarketNumber((input.quote as any)?.prev_close_price) ?? 0
  const change = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0

  return {
    price,
    prevClose,
    change: Number.isFinite(change) ? change : 0,
  }
}
