/**
 * @file watchlist-card-number-utils.ts
 * @module components/watchlist
 * @description Strict numeric helpers for WatchlistItemCard price and chart-seed calculations.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  parseNonNegativeMarketNumber,
  resolveDisplayPriceFromQuote,
  type MarketQuoteLike,
} from "@/lib/market-data/utils/quote-lookup"

export interface WatchlistCardPriceMetricsInput {
  item: {
    ltp?: unknown
    close?: unknown
  }
  quote?: (MarketQuoteLike & { prev_close_price?: unknown }) | null
}

export interface WatchlistCardPriceMetrics {
  ltp: number
  prevClose: number
  change: number
  changePercent: number
  isPositive: boolean
  chartSeedPrice: number
}

export function resolveWatchlistCardPriceMetrics(
  input: WatchlistCardPriceMetricsInput,
): WatchlistCardPriceMetrics {
  const ltp = resolveDisplayPriceFromQuote(input.quote, input.item.ltp)
  const safeLtp = Number.isFinite(ltp) ? ltp : 0
  const prevClose =
    parseNonNegativeMarketNumber((input.quote as any)?.prev_close_price) ??
    parseNonNegativeMarketNumber(input.item.close) ??
    safeLtp
  const change = safeLtp - prevClose
  const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0
  const chartSeedPrice = Math.max(prevClose, 1)

  return {
    ltp: safeLtp,
    prevClose,
    change,
    changePercent: Number.isFinite(changePercent) ? changePercent : 0,
    isPositive: change >= 0,
    chartSeedPrice,
  }
}
