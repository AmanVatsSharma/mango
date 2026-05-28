/**
 * @file trading-home-number-utils.ts
 * @module components/trading
 * @description Strict numeric normalization helpers for TradingHome portfolio and heatmap data shaping.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  parseFiniteMarketNumber,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"

export interface TradingHomePortfolioSummaryInput {
  portfolio?: any
  pnl?: {
    totalPnL?: unknown
    dayPnL?: unknown
  } | null
}

export interface TradingHomePortfolioSummary {
  totalPnL: number
  dayPnL: number
  invested: number
  currentValue: number
  returnsNumber: number
  buyingPower: number
  usedMargin: number
  marginPercent: number
  netLiq: number
}

export interface TradingHomeHeatmapItem {
  label: string
  token: number
}

export function buildTradingHomePortfolioSummary(
  input: TradingHomePortfolioSummaryInput,
): TradingHomePortfolioSummary {
  const totalPnL = parseFiniteMarketNumber(input.pnl?.totalPnL) ?? 0
  const dayPnL = parseFiniteMarketNumber(input.pnl?.dayPnL) ?? 0
  const invested =
    parseFiniteMarketNumber(input.portfolio?.account?.balance) ??
    parseFiniteMarketNumber(input.portfolio?.account?.totalValue) ??
    0

  const currentValue = invested + totalPnL
  const returnsNumber = invested > 0 ? (totalPnL / invested) * 100 : 0
  
  const buyingPower = parseFiniteMarketNumber(input.portfolio?.account?.availableMargin) ?? invested
  const usedMargin = parseFiniteMarketNumber(input.portfolio?.account?.usedMargin) ?? 0
  const marginPercent = buyingPower + usedMargin > 0 ? (usedMargin / (buyingPower + usedMargin)) * 100 : 0
  const netLiq = buyingPower + usedMargin + totalPnL

  return {
    totalPnL,
    dayPnL,
    invested,
    currentValue,
    returnsNumber,
    buyingPower,
    usedMargin,
    marginPercent,
    netLiq,
  }
}

export function buildTradingHomeWatchlistHeatmapItems(watchlists: any[] | null | undefined): TradingHomeHeatmapItem[] {
  const uniqueByToken = new Map<number, TradingHomeHeatmapItem>()
  for (const watchlist of watchlists || []) {
    for (const item of watchlist?.items || []) {
      const token = parsePositiveIntegerMarketNumber(item?.token)
      if (token === null) {
        continue
      }
      if (!uniqueByToken.has(token)) {
        const symbol = typeof item?.symbol === "string" ? item.symbol.trim() : ""
        const name = typeof item?.name === "string" ? item.name.trim() : ""
        uniqueByToken.set(token, {
          label: symbol || name || "—",
          token,
        })
      }
    }
  }
  return Array.from(uniqueByToken.values())
}
