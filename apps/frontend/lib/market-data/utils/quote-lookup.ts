/**
 * @file quote-lookup.ts
 * @module market-data
 * @description Token-first quote resolution and strict numeric helpers for mixed token/instrument keyed maps.
 * @author StockTrade
 * @created 2026-02-15
 */

import { parseInstrumentId } from "@/lib/market-data/utils/instrumentMapper"

export interface MarketQuoteLike {
  display_price?: unknown
  last_trade_price?: unknown
  actual_price?: unknown
  prev_close_price?: unknown
  close?: unknown
  timestamp?: unknown
  lastUpdateTime?: unknown
  receivedAt?: unknown
}

export type QuotePriceSource = "LIVE" | "SNAPSHOT" | "FALLBACK"
export type QuoteDisplaySource = "LIVE" | "SNAPSHOT" | "STALE"

export const DEFAULT_LIVE_QUOTE_MAX_AGE_MS = 5_000
export const DEFAULT_DISPLAY_QUOTE_MAX_AGE_MS = 60_000

export interface QuotePriceSnapshot {
  uiPrice: number
  tradePrice: number
  referencePrice: number
  prevClose: number
  hasQuote: boolean
  isFresh: boolean
  isDisplayable: boolean
  quoteTimestampMs: number | null
  quoteAgeMs: number | null
  source: QuotePriceSource
}

export interface DisplayQuoteSnapshot {
  uiPrice: number | null
  tradePrice: number | null
  referencePrice: number | null
  prevClose: number | null
  hasQuote: boolean
  isFresh: boolean
  isDisplayable: boolean
  quoteTimestampMs: number | null
  quoteAgeMs: number | null
  source: QuoteDisplaySource
}

type QuoteMap = Record<string, MarketQuoteLike> | undefined | null

export type SubscriptionKey = number | string

export type SubscriptionIdentity = {
  subscriptionKey: SubscriptionKey | null
  token: number | null
  /** Set when subscriptionKey is a canonical symbol — used by the provider to build the canonical→token lookup map for the no-quote watchdog. */
  isCanonical?: boolean
}

function normalizeInstrumentId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const normalizedValue = value.trim()
  return normalizedValue || undefined
}

export function normalizeSubscriptionKey(key: SubscriptionKey): string {
  if (typeof key === "number") {
    return key.toString()
  }
  return key.trim().toUpperCase()
}

function normalizeUpperSegment(value: unknown): string {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().toUpperCase()
}

export function resolveSubscriptionExchangePrefix(value: string): string | null {
  const normalizedValue = value.trim().toUpperCase()
  if (!normalizedValue) return null

  // Commodities / MCX derivatives
  if (normalizedValue.includes("MCX")) return "MCX_FO"

  // F&O / derivatives
  if (normalizedValue.includes("NSE_FO") || normalizedValue === "NFO") return "NSE_FO"
  if (normalizedValue.includes("BSE_FO") || normalizedValue === "BFO") return "BSE_FO"
  if (normalizedValue.includes("_FO")) return normalizedValue
  if (normalizedValue.includes("FO") && normalizedValue.includes("BSE")) return "BSE_FO"
  if (normalizedValue.includes("FO") && normalizedValue.includes("NSE")) return "NSE_FO"

  // Equity
  if (normalizedValue.includes("NSE_EQ") || normalizedValue === "NSE") return "NSE_EQ"
  if (normalizedValue.includes("BSE_EQ") || normalizedValue === "BSE") return "BSE_EQ"
  if (normalizedValue.includes("_EQ")) return normalizedValue

  // Loose fallbacks
  if (normalizedValue.includes("BSE")) return "BSE_EQ"
  if (normalizedValue.includes("NSE")) return "NSE_EQ"

  return null
}

export function parseFiniteMarketNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "boolean") {
    return null
  }
  if (typeof value === "string") {
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return null
    }
    const loweredValue = normalizedValue.toLowerCase()
    if (
      loweredValue === "null" ||
      loweredValue === "undefined" ||
      loweredValue === "nan" ||
      loweredValue === "infinity" ||
      loweredValue === "+infinity" ||
      loweredValue === "-infinity"
    ) {
      return null
    }
    const parsedValue = Number(normalizedValue)
    return Number.isFinite(parsedValue) ? parsedValue : null
  }
  try {
    const parsedValue = Number(value)
    return Number.isFinite(parsedValue) ? parsedValue : null
  } catch {
    return null
  }
}

export function parseNonNegativeMarketNumber(value: unknown): number | null {
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || parsedValue < 0) {
    return null
  }
  return parsedValue
}

export function parsePositiveIntegerMarketNumber(value: unknown): number | null {
  if (typeof value === "string") {
    const normalizedValue = value.trim()
    if (!/^\d+$/.test(normalizedValue)) {
      return null
    }
    const parsedInteger = Number(normalizedValue)
    if (!Number.isFinite(parsedInteger) || parsedInteger <= 0) {
      return null
    }
    return parsedInteger
  }
  const parsedValue = parseFiniteMarketNumber(value)
  if (parsedValue === null || !Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null
  }
  return parsedValue
}

export function parseTokenFromInstrumentId(value: unknown): number | null {
  const instrumentId = normalizeInstrumentId(value)
  if (!instrumentId) {
    return null
  }
  const parsedToken = parseInstrumentId(instrumentId)
  if (isValidToken(parsedToken)) {
    return parsedToken
  }
  const parts = instrumentId.split("-")
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = parsePositiveIntegerMarketNumber(parts[index])
    if (candidate !== null) {
      return candidate
    }
  }
  return null
}

export function resolveSubscriptionToken(input: { token?: unknown; instrumentId?: unknown }): number | null {
  const tokenFromPayload = parsePositiveIntegerMarketNumber(input.token)
  if (tokenFromPayload !== null) {
    return tokenFromPayload
  }
  return parseTokenFromInstrumentId(input.instrumentId)
}

export function resolveSubscriptionIdentity(input: {
  token?: unknown
  instrumentId?: unknown
  exchange?: unknown
  segment?: unknown
  /** Canonical UIR symbol e.g. "NSE:RELIANCE" — when present, used as the WS subscribe key so the server resolves the provider token without exchange-prefix guessing. */
  canonicalSymbol?: unknown
  /** Provider-agnostic UIR id — highest priority for WS subscription as per broker-grade requirement. */
  uirId?: unknown
}): SubscriptionIdentity {
  const token = resolveSubscriptionToken({ token: input.token, instrumentId: input.instrumentId })

  // 1) UIR id (provider-agnostic) — Highest priority per user instruction.
  // Using numeric UIR id ensures the server resolves the correct instrument across any provider.
  const uirId = parsePositiveIntegerMarketNumber(input.uirId)
  if (uirId !== null) {
    return { subscriptionKey: uirId, token: token ?? uirId }
  }

  // 2) Canonical symbol takes priority over exchange-qualified numeric key.
  const canonical = typeof input.canonicalSymbol === 'string' ? input.canonicalSymbol.trim() : null
  if (canonical) {
    return { subscriptionKey: canonical, token, isCanonical: true }
  }

  // 1) Prefer an exchange-qualified instrument id when present.
  const instrumentId = normalizeInstrumentId(input.instrumentId)
  if (instrumentId) {
    const exchangePartRaw = instrumentId.split("-")[0] || ""
    const parsedTokenFromId = parseTokenFromInstrumentId(instrumentId)
    const resolvedToken = token ?? parsedTokenFromId
    const segment = normalizeUpperSegment(input.segment)
    const exchange = normalizeUpperSegment(input.exchange)
    const mappedExchangePart = resolveSubscriptionExchangePrefix(exchangePartRaw)
    const mappedSegment = resolveSubscriptionExchangePrefix(segment)
    const mappedExchange = resolveSubscriptionExchangePrefix(exchange)
    const prefix = mappedExchangePart ?? mappedSegment ?? mappedExchange
    if (resolvedToken !== null && prefix) {
      return { subscriptionKey: `${prefix}-${resolvedToken}`, token: resolvedToken }
    }
  }

  // 2) Build an exchange-aware subscription key when possible.
  const segment = normalizeUpperSegment(input.segment)
  const exchange = normalizeUpperSegment(input.exchange)
  const prefix =
    resolveSubscriptionExchangePrefix(segment) ??
    resolveSubscriptionExchangePrefix(exchange)
  if (token !== null && prefix) {
    return { subscriptionKey: `${prefix}-${token}`, token }
  }

  // 3) Fallback: numeric token subscription (server may auto-resolve exchange).
  if (token !== null) {
    return { subscriptionKey: token, token }
  }

  return { subscriptionKey: null, token: null }
}

function isValidToken(token: unknown): token is number {
  return typeof token === "number" && Number.isFinite(token) && token > 0
}

export function resolveQuoteFromMap(
  quotes: QuoteMap,
  input: { token?: unknown; uirId?: unknown; instrumentId?: string | null },
): MarketQuoteLike | undefined {
  if (!quotes) return undefined

  const keys: string[] = []

  // 1. Broker token (highest priority — exact key match)
  const normalizedToken = parsePositiveIntegerMarketNumber(input.token)
  if (normalizedToken !== null) {
    keys.push(normalizedToken.toString())
  }

  // 2. UIR id — gateway emits this on every tick; quotes are dual-keyed by it
  const normalizedUirId = parsePositiveIntegerMarketNumber(input.uirId)
  if (normalizedUirId !== null) {
    const uirKey = normalizedUirId.toString()
    if (!keys.includes(uirKey)) keys.push(uirKey)
  }

  // 3. Token parsed from instrumentId string (e.g. "NSE-738561" → 738561)
  const parsedToken = parseTokenFromInstrumentId(input.instrumentId || "")
  if (isValidToken(parsedToken)) {
    const parsedKey = parsedToken.toString()
    if (!keys.includes(parsedKey)) keys.push(parsedKey)
  }

  // 4. Raw instrumentId string (legacy exchange-qualified keys)
  const normalizedInstrumentId = normalizeInstrumentId(input.instrumentId)
  if (normalizedInstrumentId) {
    keys.push(normalizedInstrumentId)
    const uppercaseInstrumentId = normalizedInstrumentId.toUpperCase()
    if (!keys.includes(uppercaseInstrumentId)) {
      keys.push(uppercaseInstrumentId)
    }
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(quotes, key)) {
      return quotes[key]
    }
  }

  return undefined
}

export function resolveDisplayPriceFromQuote(
  quote: MarketQuoteLike | null | undefined,
  fallbackValue: unknown,
): number {
  const parsedDisplayPrice = parseNonNegativeMarketNumber(quote?.display_price)
  if (parsedDisplayPrice !== null) {
    return parsedDisplayPrice
  }

  const parsedTradePrice = parseNonNegativeMarketNumber(quote?.last_trade_price)
  if (parsedTradePrice !== null) {
    return parsedTradePrice
  }

  const parsedActualPrice = parseNonNegativeMarketNumber(quote?.actual_price)
  if (parsedActualPrice !== null) {
    return parsedActualPrice
  }

  return parseNonNegativeMarketNumber(fallbackValue) ?? 0
}

export function resolveQuotePriceSnapshot(input: {
  quote: MarketQuoteLike | null | undefined
  fallbackPrice?: unknown
  fallbackClose?: unknown
  maxAgeMs?: number
  displayMaxAgeMs?: number
  nowMs?: number
}): QuotePriceSnapshot {
  const nowMs = input.nowMs ?? Date.now()
  const quote = input.quote ?? null
  const hasQuote = Boolean(quote)
  const isFresh = isQuoteFresh(quote, { maxAgeMs: input.maxAgeMs, nowMs })
  const quoteTimestampMs = quote ? resolveQuoteTimestampMs(quote) : null
  const quoteAgeMs = quoteTimestampMs !== null ? Math.max(0, nowMs - quoteTimestampMs) : null
  const displayMaxAgeMs = Math.max(
    0,
    parseNonNegativeMarketNumber(input.displayMaxAgeMs) ?? 60_000,
  )
  const isDisplayable =
    !hasQuote
      ? false
      : displayMaxAgeMs === 0
        ? true
        : quoteAgeMs !== null
          ? quoteAgeMs <= displayMaxAgeMs
          : true // if we have quote but missing timestamp, show it (treat as displayable)

  const fallbackPrice = parseNonNegativeMarketNumber(input.fallbackPrice) ?? 0
  const uiPrice =
    parseNonNegativeMarketNumber(quote?.display_price) ??
    parseNonNegativeMarketNumber(quote?.last_trade_price) ??
    parseNonNegativeMarketNumber(quote?.actual_price) ??
    fallbackPrice
  const tradePrice =
    parseNonNegativeMarketNumber(quote?.last_trade_price) ??
    parseNonNegativeMarketNumber(quote?.actual_price) ??
    parseNonNegativeMarketNumber(quote?.display_price) ??
    fallbackPrice
  const referencePrice = tradePrice > 0 ? tradePrice : uiPrice
  const prevClose =
    parseNonNegativeMarketNumber(quote?.prev_close_price) ??
    parseNonNegativeMarketNumber(quote?.close) ??
    parseNonNegativeMarketNumber(input.fallbackClose) ??
    referencePrice

  let source: QuotePriceSource = "FALLBACK"
  if (hasQuote && isFresh) {
    source = "LIVE"
  } else if (hasQuote) {
    source = "SNAPSHOT"
  }

  return {
    uiPrice,
    tradePrice,
    referencePrice,
    prevClose,
    hasQuote,
    isFresh,
    isDisplayable,
    quoteTimestampMs,
    quoteAgeMs,
    source,
  }
}

export type StaleQuotePriceMode = "strict" | "last_tick"

/**
 * Strict display resolver used by dashboard/watchlist/positions.
 * With `strict`, missing/aged quotes hide numeric price (unless timestamp missing: non-displayable).
 * With `last_tick`, last received quote prices still render when age exceeds display max (source may be STALE).
 */
export function resolveDisplayQuoteSnapshot(input: {
  quote: MarketQuoteLike | null | undefined
  fallbackPrice?: unknown
  fallbackClose?: unknown
  liveMaxAgeMs?: number
  displayMaxAgeMs?: number
  nowMs?: number
  staleQuotePriceMode?: StaleQuotePriceMode
}): DisplayQuoteSnapshot {
  const mode: StaleQuotePriceMode = input.staleQuotePriceMode ?? "strict"
  const snapshot = resolveQuotePriceSnapshot({
    quote: input.quote,
    fallbackPrice: input.fallbackPrice,
    fallbackClose: input.fallbackClose,
    maxAgeMs: input.liveMaxAgeMs ?? DEFAULT_LIVE_QUOTE_MAX_AGE_MS,
    displayMaxAgeMs: input.displayMaxAgeMs ?? DEFAULT_DISPLAY_QUOTE_MAX_AGE_MS,
    nowMs: input.nowMs,
  })

  const isDisplayableStrict = snapshot.isDisplayable && snapshot.quoteAgeMs !== null
  const sourceBase: QuoteDisplaySource = snapshot.isFresh
    ? "LIVE"
    : isDisplayableStrict
      ? "SNAPSHOT"
      : "STALE"

  if (
    mode === "last_tick" &&
    snapshot.hasQuote &&
    (snapshot.uiPrice > 0 || snapshot.tradePrice > 0)
  ) {
    const uiPrice = snapshot.uiPrice > 0 ? snapshot.uiPrice : null
    const tradePrice = snapshot.tradePrice > 0 ? snapshot.tradePrice : null
    const referencePrice = tradePrice ?? uiPrice
    const prevClose = snapshot.prevClose > 0 ? snapshot.prevClose : null
    return {
      uiPrice,
      tradePrice,
      referencePrice,
      prevClose,
      hasQuote: snapshot.hasQuote,
      isFresh: snapshot.isFresh,
      isDisplayable: true,
      quoteTimestampMs: snapshot.quoteTimestampMs,
      quoteAgeMs: snapshot.quoteAgeMs,
      source: sourceBase,
    }
  }

  const uiPrice = isDisplayableStrict && snapshot.uiPrice > 0 ? snapshot.uiPrice : null
  const tradePrice = isDisplayableStrict && snapshot.tradePrice > 0 ? snapshot.tradePrice : null
  const referencePrice = tradePrice ?? uiPrice
  const prevClose = isDisplayableStrict && snapshot.prevClose > 0 ? snapshot.prevClose : null

  return {
    uiPrice,
    tradePrice,
    referencePrice,
    prevClose,
    hasQuote: snapshot.hasQuote,
    isFresh: snapshot.isFresh,
    isDisplayable: isDisplayableStrict,
    quoteTimestampMs: snapshot.quoteTimestampMs,
    quoteAgeMs: snapshot.quoteAgeMs,
    source: sourceBase,
  }
}

function resolveQuoteTimestampMs(quote: MarketQuoteLike): number | null {
  const timestampCandidates = [quote.lastUpdateTime, quote.timestamp, quote.receivedAt]
  for (const candidate of timestampCandidates) {
    const parsedCandidate = parseFiniteMarketNumber(candidate)
    if (parsedCandidate !== null && parsedCandidate > 0) {
      return parsedCandidate
    }
  }
  return null
}

export function isQuoteFresh(
  quote: MarketQuoteLike | null | undefined,
  options: { maxAgeMs?: number; nowMs?: number } = {},
): boolean {
  if (!quote) {
    return false
  }

  const nowMs = options.nowMs ?? Date.now()
  const maxAgeMs = Math.max(0, parseNonNegativeMarketNumber(options.maxAgeMs) ?? 15_000)
  if (maxAgeMs === 0) {
    return true
  }

  const quoteTimestampMs = resolveQuoteTimestampMs(quote)
  // Quote timestamp is mandatory for freshness checks; missing timestamp is stale by policy.
  if (quoteTimestampMs === null) {
    return false
  }

  return nowMs - quoteTimestampMs <= maxAgeMs
}

