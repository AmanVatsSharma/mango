/**
 * @file server-cached-quote.ts
 * @module market-data
 * @description Shared shape for server-side cached LTP ticks (workers, Redis mirror) — avoids import cycles with `market-quote-redis`.
 * @author StockTrade
 * @created 2026-03-30
 */

export type ServerCachedQuote = {
  instrumentToken: number
  last_trade_price: number
  /**
   * Typically prev close for day PnL (often provided as OHLC close).
   */
  prev_close_price?: number
  close?: number
  receivedAt: number
  upstreamTimestamp?: string
}
