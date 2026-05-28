/**
 * File: components/trading/widgets/home-widget-data-utils.ts
 * Module: components/trading/widgets
 * Purpose: Data-shaping helpers for config-driven Home widgets (ticker/chart/movers/stats).
 * Author: StockTrade
 * Last-updated: 2026-02-17
 * Notes:
 * - Resolves configurable symbol inputs into instrument tokens where possible.
 * - Supports manual symbols, token-like symbols, and watchlist-derived symbol matches.
 */

import { INDEX_INSTRUMENTS } from "@/lib/market-data/utils/instrumentMapper"
import {
  parsePositiveIntegerMarketNumber,
  parseTokenFromInstrumentId,
} from "@/lib/market-data/utils/quote-lookup"
import type { HomeDashboardConfig } from "@/lib/home-dashboard/home-dashboard-config-schema"
import type { TickerWidgetRow } from "@/components/trading/widgets/market-widget-number-utils"
import type { Stock } from "@/types/trading"

export interface HomeTickerItem {
  label: string
  token: number
}

export interface HomeChartSymbol {
  key: string
  label: string
  token: number
}

export interface HomeMarketStatsSummary {
  advances: number
  declines: number
  unchanged: number
  averageChangePct: number
  bestPerformer: TickerWidgetRow | null
  worstPerformer: TickerWidgetRow | null
}

type WatchlistTokenCandidate = {
  token?: unknown
  symbol?: unknown
  name?: unknown
}

const STATIC_HOME_SYMBOL_TOKENS: Record<string, number> = {
  "NSE:NIFTY": INDEX_INSTRUMENTS.NIFTY,
  "NSE:BANKNIFTY": INDEX_INSTRUMENTS.BANKNIFTY,
  "NSE:RELIANCE": INDEX_INSTRUMENTS.RELIANCE,
  "NSE:TCS": INDEX_INSTRUMENTS.TCS,
  "NSE:HDFCBANK": INDEX_INSTRUMENTS.HDFC_BANK,
  NIFTY: INDEX_INSTRUMENTS.NIFTY,
  BANKNIFTY: INDEX_INSTRUMENTS.BANKNIFTY,
  RELIANCE: INDEX_INSTRUMENTS.RELIANCE,
  TCS: INDEX_INSTRUMENTS.TCS,
  HDFCBANK: INDEX_INSTRUMENTS.HDFC_BANK,
}

function normalizeLookupToken(value: unknown): number | null {
  return parsePositiveIntegerMarketNumber(value)
}

function normalizeLookupSymbol(value: unknown): string {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().toUpperCase()
}

function flattenWatchlistItems(watchlists: any[] | null | undefined): WatchlistTokenCandidate[] {
  const flattenedItems: WatchlistTokenCandidate[] = []
  for (const watchlist of watchlists || []) {
    for (const item of watchlist?.items || []) {
      flattenedItems.push({
        token: item?.token,
        symbol: item?.symbol,
        name: item?.name,
      })
    }
  }
  return flattenedItems
}

function resolveSymbolTokenFromWatchlists(symbolInput: string, watchlists: any[] | null | undefined): number | null {
  const symbolForMatch = symbolInput.includes(":") ? symbolInput.split(":")[1] : symbolInput
  const normalizedSymbolForMatch = normalizeLookupSymbol(symbolForMatch)
  const watchlistItems = flattenWatchlistItems(watchlists)
  for (const item of watchlistItems) {
    const token = normalizeLookupToken(item.token)
    if (token === null) {
      continue
    }
    const itemSymbol = normalizeLookupSymbol(item.symbol)
    const itemName = normalizeLookupSymbol(item.name)
    if (itemSymbol === normalizedSymbolForMatch || itemName === normalizedSymbolForMatch) {
      return token
    }
  }
  return null
}

export function resolveHomeSymbolToToken(
  symbolInput: string,
  watchlists: any[] | null | undefined,
): HomeTickerItem | null {
  const normalizedSymbolInput = normalizeLookupSymbol(symbolInput)
  if (!normalizedSymbolInput) {
    return null
  }

  const directToken = normalizeLookupToken(normalizedSymbolInput)
  if (directToken !== null) {
    return { label: normalizedSymbolInput, token: directToken }
  }

  const parsedInstrumentToken = parseTokenFromInstrumentId(normalizedSymbolInput)
  if (parsedInstrumentToken !== null) {
    return { label: normalizedSymbolInput, token: parsedInstrumentToken }
  }

  const staticToken = STATIC_HOME_SYMBOL_TOKENS[normalizedSymbolInput]
  if (staticToken) {
    const symbolLabel = normalizedSymbolInput.includes(":")
      ? normalizedSymbolInput.split(":")[1]
      : normalizedSymbolInput
    return { label: symbolLabel, token: staticToken }
  }

  const watchlistToken = resolveSymbolTokenFromWatchlists(normalizedSymbolInput, watchlists)
  if (watchlistToken !== null) {
    const symbolLabel = normalizedSymbolInput.includes(":")
      ? normalizedSymbolInput.split(":")[1]
      : normalizedSymbolInput
    return { label: symbolLabel, token: watchlistToken }
  }

  return null
}

export function buildHomeTickerItemsFromConfig(
  symbols: string[],
  watchlists: any[] | null | undefined,
): HomeTickerItem[] {
  const uniqueItems = new Map<number, HomeTickerItem>()
  for (const symbolInput of symbols || []) {
    const resolvedItem = resolveHomeSymbolToToken(symbolInput, watchlists)
    if (!resolvedItem) {
      continue
    }
    if (!uniqueItems.has(resolvedItem.token)) {
      uniqueItems.set(resolvedItem.token, resolvedItem)
    }
  }

  if (uniqueItems.size > 0) {
    return Array.from(uniqueItems.values())
  }

  return [
    { label: "NIFTY", token: INDEX_INSTRUMENTS.NIFTY },
    { label: "BANKNIFTY", token: INDEX_INSTRUMENTS.BANKNIFTY },
  ]
}

export function buildHomeChartSymbols(
  config: HomeDashboardConfig,
  watchlists: any[] | null | undefined,
  tickerItems: HomeTickerItem[],
): { symbols: HomeChartSymbol[]; defaultSymbolKey: string } {
  const resolvedConfiguredChart = resolveHomeSymbolToToken(config.chartSymbol, watchlists)
  const candidates = [
    resolvedConfiguredChart,
    ...tickerItems,
    { label: "NIFTY", token: INDEX_INSTRUMENTS.NIFTY },
    { label: "BANKNIFTY", token: INDEX_INSTRUMENTS.BANKNIFTY },
  ].filter(Boolean) as HomeTickerItem[]

  const uniqueSymbols = new Map<number, HomeChartSymbol>()
  for (const candidate of candidates) {
    if (uniqueSymbols.has(candidate.token)) {
      continue
    }
    uniqueSymbols.set(candidate.token, {
      key: `token-${candidate.token}`,
      label: candidate.label,
      token: candidate.token,
    })
    if (uniqueSymbols.size >= 6) {
      break
    }
  }

  const symbols = Array.from(uniqueSymbols.values())
  const defaultSymbolKey = symbols[0]?.key || `token-${INDEX_INSTRUMENTS.NIFTY}`
  return { symbols, defaultSymbolKey }
}

/**
 * Builds a `Stock` (plus order-form fields) for the home chart quick order bar.
 * Prefers the first watchlist row that matches `chartSymbol.token`; otherwise falls back to
 * `instrumentId` of the form `NSE_EQ-{token}` so `normalizeOrderFormStockData` derives the token.
 */
export function resolveStockForHomeChartSymbol(
  chartSymbol: HomeChartSymbol,
  watchlists: any[] | null | undefined,
): Stock & { token?: number } {
  const token = chartSymbol.token
  for (const watchlist of watchlists || []) {
    for (const item of watchlist?.items || []) {
      const itemToken = normalizeLookupToken(item?.token)
      if (itemToken !== token) {
        continue
      }
      const rawSymbol =
        typeof item?.symbol === "string" && item.symbol.trim() ? item.symbol.trim() : chartSymbol.label
      const rawName =
        typeof item?.name === "string" && item.name.trim() ? item.name.trim() : chartSymbol.label
      const normalizedInstrumentId =
        typeof item?.instrumentId === "string" && item.instrumentId.trim()
          ? item.instrumentId.trim().toUpperCase()
          : undefined
      const instrumentId = normalizedInstrumentId ?? `NSE_EQ-${token}`
      const rowId =
        typeof item?.watchlistItemId === "string" && item.watchlistItemId.trim()
          ? item.watchlistItemId.trim()
          : typeof item?.id === "string" && item.id.trim()
            ? item.id.trim()
            : chartSymbol.key
      const segment =
        typeof item?.segment === "string" && item.segment.trim()
          ? item.segment.trim().toUpperCase()
          : typeof item?.exchange === "string" && item.exchange.trim()
            ? item.exchange.trim().toUpperCase()
            : "NSE_EQ"
      return {
        id: rowId,
        symbol: rawSymbol,
        name: rawName,
        instrumentId,
        segment,
        strikePrice: typeof item?.strikePrice === "number" ? item.strikePrice : undefined,
        optionType: typeof item?.optionType === "string" ? item.optionType : undefined,
        expiry: typeof item?.expiry === "string" ? item.expiry : undefined,
        lotSize: typeof item?.lotSize === "number" ? item.lotSize : undefined,
        token,
      }
    }
  }

  return {
    id: chartSymbol.key,
    symbol: chartSymbol.label,
    name: chartSymbol.label,
    instrumentId: `NSE_EQ-${token}`,
    segment: "NSE_EQ",
    token,
  }
}

export function buildHomeMoversUniverse(
  tickerItems: HomeTickerItem[],
  watchlists: any[] | null | undefined,
): HomeTickerItem[] {
  const uniqueByToken = new Map<number, HomeTickerItem>()
  for (const tickerItem of tickerItems) {
    uniqueByToken.set(tickerItem.token, tickerItem)
  }

  for (const watchlist of watchlists || []) {
    for (const item of watchlist?.items || []) {
      const token = normalizeLookupToken(item?.token)
      if (token === null || uniqueByToken.has(token)) {
        continue
      }
      const symbolLabel = normalizeLookupSymbol(item?.symbol) || normalizeLookupSymbol(item?.name)
      uniqueByToken.set(token, {
        label: symbolLabel || `TOKEN-${token}`,
        token,
      })
      if (uniqueByToken.size >= 20) {
        return Array.from(uniqueByToken.values())
      }
    }
  }

  return Array.from(uniqueByToken.values())
}

export function summarizeHomeMarketStats(rows: TickerWidgetRow[]): HomeMarketStatsSummary {
  let advances = 0
  let declines = 0
  let unchanged = 0
  let totalChangePct = 0
  let bestPerformer: TickerWidgetRow | null = null
  let worstPerformer: TickerWidgetRow | null = null

  for (const row of rows || []) {
    const changePct = Number.isFinite(row.changePct) ? row.changePct : 0
    totalChangePct += changePct
    if (changePct > 0) {
      advances += 1
    } else if (changePct < 0) {
      declines += 1
    } else {
      unchanged += 1
    }
    if (!bestPerformer || changePct > bestPerformer.changePct) {
      bestPerformer = row
    }
    if (!worstPerformer || changePct < worstPerformer.changePct) {
      worstPerformer = row
    }
  }

  const averageChangePct = rows.length > 0 ? totalChangePct / rows.length : 0
  return {
    advances,
    declines,
    unchanged,
    averageChangePct,
    bestPerformer,
    worstPerformer,
  }
}
