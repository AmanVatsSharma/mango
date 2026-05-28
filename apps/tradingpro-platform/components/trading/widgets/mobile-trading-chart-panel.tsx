/**
 * File:        components/trading/widgets/mobile-trading-chart-panel.tsx
 * Module:      Trading · Mobile Chart Panel
 * Purpose:     Obsidian-mobile-style home chart (below `lg`): symbol row, scrollable TF bar,
 *              collapsible indicator pills, horizontal drawing tool, OHLC strip, optional SELL/BUY bar.
 *
 * Exports:
 *   - MobileTradingChartPanel(props) — mobile chart with indicator + drawing support
 *
 * Depends on:
 *   - @/components/trading/widgets/instrument-candle-chart — InstrumentCandleChart + ChartIndicatorConfig
 *   - @/components/trading/widgets/instrument-chart-drawing — DrawingTool
 *   - @/components/trading/widgets/trading-chart-timeframes — TRADING_CHART_TIMEFRAMES
 *   - lucide-react — Activity, SlidersHorizontal icons
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - RSI is always false in mobile indicators (card layout doesn't support RSI pane)
 *   - Activity button toggles showIndicatorBar (pill visibility)
 *   - SlidersHorizontal button toggles activeTool between "horizontal" and "none"
 *   - timeframe passed to InstrumentCandleChart (triggers re-fetch on change)
 *
 * Read order:
 *   1. State declarations — timeframe, indicators, activeTool
 *   2. TF bar + indicator bar JSX
 *   3. InstrumentCandleChart render with all new props
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-10
 */

"use client"

import React, { useCallback, useMemo, useState } from "react"
import { Activity, SlidersHorizontal } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useMarketDataLive } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import {
  type MarketQuoteLike,
  resolveDisplayPriceFromQuote,
  resolveQuoteFromMap,
  parseNonNegativeMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"
import { resolveMarketWidgetLivePriceForInstrument } from "@/components/trading/widgets/market-widget-number-utils"
import {
  InstrumentCandleChart,
  DEFAULT_INDICATORS,
  type InstrumentChartOhlcDisplay,
  type ChartIndicatorConfig,
} from "@/components/trading/widgets/instrument-candle-chart"
import type { DrawingTool } from "@/components/trading/widgets/instrument-chart-drawing"
import { TRADING_CHART_TIMEFRAMES } from "@/components/trading/widgets/trading-chart-timeframes"
import { resolveStockForHomeChartSymbol, type HomeChartSymbol } from "@/components/trading/widgets/home-widget-data-utils"
import type { Stock } from "@/types/trading"

type MobileTradingChartPanelProps = {
  symbols: HomeChartSymbol[]
  defaultSymbolKey?: string
  watchlists: any[] | null | undefined
  onQuickBuy?: (stock: Stock) => void
  onQuickSell?: (stock: Stock) => void
}

function formatTradingPrice(n: number): string {
  if (!Number.isFinite(n)) {
    return "—"
  }
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatRupeePrice(n: number | null): string {
  if (n == null || !Number.isFinite(n)) {
    return "—"
  }
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function MobileTradingChartPanel({
  symbols,
  defaultSymbolKey,
  watchlists,
  onQuickBuy,
  onQuickSell,
}: MobileTradingChartPanelProps) {
  const { isConnected, quotes } = useMarketDataLive()
  const [selectedKey, setSelectedKey] = useState<string>(() => defaultSymbolKey ?? symbols[0]?.key ?? "")
  const [timeframe, setTimeframe] = useState<string>("5m")
  const [ohlc, setOhlc] = useState<InstrumentChartOhlcDisplay | null>(null)
  const [showIndicatorBar, setShowIndicatorBar] = useState(false)
  const [indicators, setIndicators] = useState<ChartIndicatorConfig>({ ...DEFAULT_INDICATORS, rsi: false })
  const [activeTool, setActiveTool] = useState<DrawingTool>("none")

  const onOhlcDisplay = useCallback((next: InstrumentChartOhlcDisplay) => {
    setOhlc(next)
  }, [])

  const selected = useMemo(
    () => symbols.find((s) => s.key === selectedKey) ?? symbols[0],
    [symbols, selectedKey],
  )

  const stockForOrder = useMemo(() => {
    if (!selected) {
      return null
    }
    return resolveStockForHomeChartSymbol(selected, watchlists)
  }, [selected, watchlists])

  const instrument = useMemo(
    () => ({
      instrumentKey: selected?.key ?? "",
      token: selected?.token,
      instrumentId: null as string | null,
      seedBasePrice: null as number | null,
    }),
    [selected?.key, selected?.token],
  )

  const quote = useMemo(() => {
    if (!selected) {
      return null
    }
    return resolveQuoteFromMap(quotes as Record<string, MarketQuoteLike> | undefined, {
      token: selected.token,
      instrumentId: null,
    })
  }, [quotes, selected])

  const liveLtp = useMemo(() => {
    if (!selected) {
      return null
    }
    return resolveMarketWidgetLivePriceForInstrument(quotes as Record<string, MarketQuoteLike> | undefined, {
      token: selected.token,
      instrumentId: null,
    })
  }, [quotes, selected])

  const displayLtp = liveLtp ?? (quote != null ? resolveDisplayPriceFromQuote(quote, 0) : null)
  const previousClose = quote != null ? parseNonNegativeMarketNumber(quote.prev_close_price as unknown) ?? 0 : 0
  const changePct =
    displayLtp != null && previousClose > 0 ? ((displayLtp - previousClose) / previousClose) * 100 : 0
  const isUp = changePct >= 0
  const accentClass = isUp ? "text-emerald-500" : "text-red-500"

  const connectionLabel =
    isConnected === "connected" ? "Live" : isConnected === "connecting" ? "Connecting" : "Offline"
  const connectionDot =
    isConnected === "connected" ? "bg-emerald-500" : isConnected === "connecting" ? "bg-amber-500" : "bg-red-500"

  const showTradeBar = Boolean(onQuickBuy || onQuickSell)
  const tradePriceLabel = formatRupeePrice(displayLtp)

  const handleQuickSellClick = () => {
    if (!stockForOrder || !onQuickSell) {
      return
    }
    onQuickSell(stockForOrder as Stock)
  }

  const handleQuickBuyClick = () => {
    if (!stockForOrder || !onQuickBuy) {
      return
    }
    onQuickBuy(stockForOrder as Stock)
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-[400px] flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm",
      )}
    >
      {/* Symbol row (Obsidian chart-sym-bar) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/10 px-3 py-2">
        <Select value={selectedKey} onValueChange={setSelectedKey}>
          <SelectTrigger className="h-9 min-w-[120px] max-w-[42%] shrink-0 border-border/60 bg-background/80 text-xs font-bold">
            <SelectValue placeholder="Symbol" />
          </SelectTrigger>
          <SelectContent>
            {symbols.map((s) => (
              <SelectItem key={s.key} value={s.key} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-bold text-foreground">{selected?.label ?? "—"}</div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">Home chart</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn("font-mono text-xs font-bold tabular-nums", accentClass)}>
            {displayLtp != null ? formatTradingPrice(displayLtp) : "—"}
          </span>
          <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums", accentClass)}>
            {previousClose > 0 ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
          </span>
        </div>
        <div className="ml-auto hidden items-center gap-1.5 text-[9px] font-mono text-muted-foreground sm:flex">
          <span>Spd: —</span>
          <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", connectionDot)} aria-hidden />
            {connectionLabel}
          </div>
        </div>
      </div>

      {/* TF bar — horizontal scroll */}
      <div className="flex items-center gap-1 border-b border-border/10 bg-muted/15 px-2 py-1.5">
        <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto pb-0.5">
          {/* [SonuRamTODO] Wire timeframe to bar step / historical resolution when backend supports it. */}
          {TRADING_CHART_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={cn(
                "shrink-0 rounded px-2 py-1 font-mono text-[10px] font-semibold transition-colors",
                timeframe === tf
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {tf}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 gap-1 border-l border-border/40 pl-2">
          <button
            type="button"
            onClick={() => setShowIndicatorBar((v) => !v)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
              showIndicatorBar
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground hover:bg-muted/60",
            )}
            aria-label="Indicators"
          >
            <Activity size={13} />
          </button>
          <button
            type="button"
            onClick={() => setActiveTool((t) => (t === "horizontal" ? "none" : "horizontal"))}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
              activeTool === "horizontal"
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground hover:bg-muted/60",
            )}
            aria-label="Draw horizontal level"
          >
            <SlidersHorizontal size={13} />
          </button>
        </div>
      </div>

      {/* Indicator pill bar (collapsible) */}
      {showIndicatorBar && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/10 bg-muted/10 px-3 py-2">
          {([20, 50, 100, 200] as const).map((p, i) => {
            const active = indicators.ema.includes(p)
            const colors = [
              "text-emerald-400 border-emerald-400/40 bg-emerald-400/10",
              "text-pink-400 border-pink-400/40 bg-pink-400/10",
              "text-yellow-400 border-yellow-400/40 bg-yellow-400/10",
              "text-blue-400 border-blue-400/40 bg-blue-400/10",
            ]
            return (
              <button
                key={`ema${p}`}
                type="button"
                onClick={() => setIndicators((prev) => ({
                  ...prev,
                  ema: active ? prev.ema.filter((x) => x !== p) : [...prev.ema, p].sort((a, b) => a - b),
                }))}
                className={cn(
                  "rounded border px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors",
                  active ? colors[i] : "border-border/40 text-muted-foreground/50",
                )}
              >
                EMA{p}
              </button>
            )
          })}
        </div>
      )}

      {/* Chart + OHLC (mobile: O H L C only) */}
      <div className="relative min-h-0 flex-1 bg-background/20">
        {selected ? (
          <>
            <InstrumentCandleChart
              instrument={instrument}
              layout="card"
              onOhlcDisplay={onOhlcDisplay}
              className="h-full w-full"
              timeframe={timeframe}
              indicators={indicators}
              activeTool={activeTool}
            />
            {ohlc && (
              <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-border/40 bg-background/90 px-2 py-1.5 font-mono text-[10px] shadow-sm backdrop-blur-sm">
                {(
                  [
                    ["O", ohlc.o],
                    ["H", ohlc.h],
                    ["L", ohlc.l],
                    ["C", ohlc.c],
                  ] as const
                ).map(([label, val]) => (
                  <div key={label} className="flex items-baseline gap-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span
                      className={cn(
                        "tabular-nums font-semibold",
                        label === "H" && "text-emerald-500",
                        label === "L" && "text-red-500",
                      )}
                    >
                      {formatTradingPrice(val)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
            Select a symbol
          </div>
        )}
      </div>

      {showTradeBar && selected && stockForOrder && (
        <div className="grid grid-cols-2 gap-2 border-t border-border/10 bg-muted/20 p-2">
          <button
            type="button"
            onClick={handleQuickSellClick}
            disabled={!onQuickSell}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-lg border border-red-500/30 bg-red-500/10 py-2.5 text-red-600 transition-colors active:scale-[0.98] dark:text-red-400",
              !onQuickSell && "pointer-events-none opacity-40",
            )}
          >
            <span className="text-[11px] font-bold uppercase tracking-wide">▼ Sell</span>
            <span className="font-mono text-xs font-semibold tabular-nums">{tradePriceLabel}</span>
          </button>
          <button
            type="button"
            onClick={handleQuickBuyClick}
            disabled={!onQuickBuy}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-emerald-600 transition-colors active:scale-[0.98] dark:text-emerald-400",
              !onQuickBuy && "pointer-events-none opacity-40",
            )}
          >
            <span className="text-[11px] font-bold uppercase tracking-wide">▲ Buy</span>
            <span className="font-mono text-xs font-semibold tabular-nums">{tradePriceLabel}</span>
          </button>
        </div>
      )}
    </div>
  )
}
