/**
 * File:        components/trading/realtime/trading-realtime-number-utils.ts
 * Module:      Trading · Realtime · Position Subscription Helpers
 * Purpose:     Resolve WS subscription keys (canonical symbols, instrumentIds, tokens) and
 *              fallback PnL from raw position objects coming from the broker API.
 *
 * Exports:
 *   - computeTradingRealtimeFallbackPnl(positions) → PnLData        — client-side PnL sum
 *   - resolveRealtimePositionInstrumentIds(positions) → string[]     — "NSE_EQ-334562" style keys
 *   - resolveRealtimePositionTokens(positions) → number[]            — raw broker tokens
 *   - resolveRealtimePositionCanonicalSymbols(positions) → string[]  — "NSE:RELIANCE" UIR canonicals
 *
 * Depends on:
 *   - @/lib/market-data/utils/quote-lookup — parsePositiveIntegerMarketNumber, parseTokenFromInstrumentId
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - Canonical symbols use exchange prefix stripped to root ("NSE_EQ" → "NSE").
 *   - Only returns a canonical when both exchange AND symbol are resolvable.
 *
 * Read order:
 *   1. resolveRealtimePositionCanonicalSymbols — primary UIR path
 *   2. resolveRealtimePositionInstrumentIds    — fallback instrumentId path
 *   3. resolveRealtimePositionTokens           — last-resort token path
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-04
 */

import type { PnLData } from "@/types/trading"
import {
  parseFiniteMarketNumber,
  parsePositiveIntegerMarketNumber,
  parseTokenFromInstrumentId,
} from "@/lib/market-data/utils/quote-lookup"

export function computeTradingRealtimeFallbackPnl(positions: any[]): PnLData {
  let total = 0
  let day = 0
  for (const position of positions || []) {
    total += parseFiniteMarketNumber(position?.unrealizedPnL) ?? 0
    day += parseFiniteMarketNumber(position?.dayPnL) ?? 0
  }
  return {
    totalPnL: Number.isFinite(total) ? total : 0,
    dayPnL: Number.isFinite(day) ? day : 0,
  }
}

export function resolveRealtimePositionInstrumentIds(positions: any[]): string[] {
  const ids = (positions || [])
    .map((position) => position?.stock?.instrumentId || position?.instrumentId)
    .filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
  return Array.from(new Set(ids))
}

export function resolveRealtimePositionTokens(positions: any[]): number[] {
  const tokens = new Set<number>()
  for (const position of positions || []) {
    const stockToken = parsePositiveIntegerMarketNumber(position?.stock?.token)
    const directToken = parsePositiveIntegerMarketNumber(position?.token)
    const instrumentId =
      typeof position?.stock?.instrumentId === "string"
        ? position.stock.instrumentId
        : typeof position?.instrumentId === "string"
          ? position.instrumentId
          : ""
    const parsedInstrumentToken = parseTokenFromInstrumentId(instrumentId)
    const resolvedToken = stockToken ?? directToken ?? parsedInstrumentToken
    if (typeof resolvedToken === "number" && resolvedToken > 0) {
      tokens.add(resolvedToken)
    }
  }
  return Array.from(tokens)
}
