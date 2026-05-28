/**
 * @file market-widget-number-utils.ts
 * @module components/trading/widgets
 * @description Strict numeric normalization helpers for trading home ticker and screener widgets.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-03-28
 *
 * Notes:
 * - `resolveMarketWidgetLivePriceForInstrument` resolves LTP using token and/or instrumentId like watchlist rows.
 */

import {
  parseFiniteMarketNumber,
  parseNonNegativeMarketNumber,
  parsePositiveIntegerMarketNumber,
  resolveDisplayPriceFromQuote,
  resolveQuoteFromMap,
  type MarketQuoteLike,
} from "@/lib/market-data/utils/quote-lookup"

export interface TickerWidgetItemInput {
  label: string
  token: unknown
}

export interface TickerWidgetRow {
  label: string
  token: number
  ltp: number
  changePct: number
}

export interface ScreenerWidgetRow {
  id: string
  symbol: string
  name: string
  ltp?: number
  changePercent?: number
  segment?: string
  exchange?: string
  /**
   * Trading-d9s: parsed instrument token used by the screener widget to
   * overlay live WebSocket prices on top of the catalog snapshot. Null
   * when the search backend didn't return one — the row falls back to
   * the (stale) catalog ltp instead of misbehaving.
   */
  token: number | null
  /** Snapshot LTP from the search catalog at result time, kept separate from
   *  `ltp` so the overlay logic can prefer the live quote without losing the
   *  fallback value. */
  catalogLtp?: number
}

export function resolveMarketWidgetLivePriceForInstrument(
  quotes: Record<string, MarketQuoteLike> | null | undefined,
  input: { token?: unknown; instrumentId?: string | null },
): number | null {
  const quote = resolveQuoteFromMap(quotes, {
    token: input.token,
    instrumentId: input.instrumentId ?? null,
  })
  if (!quote) {
    return null
  }
  const price = resolveDisplayPriceFromQuote(quote, null)
  return price > 0 ? price : null
}

export function resolveMarketWidgetLivePrice(
  quotes: Record<string, MarketQuoteLike> | null | undefined,
  token: unknown,
): number | null {
  return resolveMarketWidgetLivePriceForInstrument(quotes, { token, instrumentId: null })
}

export function buildTickerWidgetRows(
  items: TickerWidgetItemInput[],
  quotes: Record<string, MarketQuoteLike> | null | undefined,
): TickerWidgetRow[] {
  const rows: TickerWidgetRow[] = []
  for (const item of items || []) {
    const token = parsePositiveIntegerMarketNumber(item?.token)
    if (token === null) {
      continue
    }
    const quote = resolveQuoteFromMap(quotes, { token, instrumentId: null })
    if (!quote) {
      continue
    }
    const ltp = resolveDisplayPriceFromQuote(quote, 0)
    const previousClose = parseNonNegativeMarketNumber((quote as any)?.prev_close_price) ?? 0
    const changePct = previousClose > 0 ? ((ltp - previousClose) / previousClose) * 100 : 0
    rows.push({
      label: item.label,
      token,
      ltp,
      changePct: Number.isFinite(changePct) ? changePct : 0,
    })
  }
  return rows
}

export function normalizeScreenerWidgetRows(rawRows: any[]): ScreenerWidgetRow[] {
  return (rawRows || []).map((row: any) => {
    const normalizedSymbol = typeof row?.symbol === "string" ? row.symbol.trim() : ""
    const normalizedTicker = typeof row?.ticker === "string" ? row.ticker.trim() : ""
    const normalizedName = typeof row?.name === "string" ? row.name.trim() : ""
    const normalizedExchange = typeof row?.exchange === "string" ? row.exchange.trim().toUpperCase() : undefined
    const normalizedSegment = typeof row?.segment === "string" ? row.segment.trim().toUpperCase() : undefined
    // The search GraphQL spreads the full Stock node; pull the token from
    // any of the field-name variants we've seen across providers.
    const tokenCandidate =
      parsePositiveIntegerMarketNumber(row?.token) ??
      parsePositiveIntegerMarketNumber(row?.instrumentToken) ??
      parsePositiveIntegerMarketNumber(row?.instrument_token) ??
      parsePositiveIntegerMarketNumber(row?.kiteToken) ??
      null
    const catalogLtp = parseNonNegativeMarketNumber(row?.ltp) ?? undefined

    return {
      id: typeof row?.id === "string" ? row.id : String(row?.id ?? ""),
      symbol: normalizedSymbol || normalizedTicker || "UNKNOWN",
      name: normalizedName || "Unknown",
      ltp: catalogLtp,
      catalogLtp,
      changePercent: parseFiniteMarketNumber(row?.changePercent) ?? undefined,
      segment: normalizedSegment,
      exchange: normalizedExchange,
      token: tokenCandidate,
    }
  })
}

export function normalizeScreenerChangePercentForBadge(value: unknown): number {
  return parseFiniteMarketNumber(value) ?? 0
}
