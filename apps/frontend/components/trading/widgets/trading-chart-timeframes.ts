/**
 * @file trading-chart-timeframes.ts
 * @module components/trading/widgets
 * @description Shared timeframe labels for trading home charts (Obsidian `TIMEFRAMES` parity).
 * @author StockTrade
 * @created 2026-03-28
 *
 * Notes:
 * - `[SonuRamTODO]` Wire selection to bar step / historical resolution when backend supports it.
 */

/** Same order/labels as Obsidian `lib/mockData.js` `TIMEFRAMES`. */
export const TRADING_CHART_TIMEFRAMES = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1H",
  "4H",
  "1D",
  "1W",
  "1M",
] as const

export type TradingChartTimeframeId = (typeof TRADING_CHART_TIMEFRAMES)[number]
