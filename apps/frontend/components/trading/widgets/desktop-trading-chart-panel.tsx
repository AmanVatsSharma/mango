/**
 * @file desktop-trading-chart-panel.tsx
 * @module components/trading/widgets
 * @description Obsidian-style desktop trading-home chart shell: toolbar (symbol, LTP, TF, Candles/Line), OHLC overlay, tall terminal chart.
 * @author StockTrade
 * @created 2026-03-28
 *
 * Notes:
 * - Timeframe list: `TRADING_CHART_TIMEFRAMES` from `trading-chart-timeframes.ts` (shared with mobile home chart).
 * - Timeframe buttons are UI state only until multi-resolution history exists; see `[SonuRamTODO]`.
 * - Indicators / Drawing / maximize / refresh are non-functional placeholders (tooltip: coming soon).
 */

"use client"

import React, { useCallback, useMemo, useState } from "react"
import {
  Activity,
  ChartCandlestick,
  LineChart,
  Maximize2,
  RefreshCw,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react"
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
  type InstrumentChartKind,
  type InstrumentChartOhlcDisplay,
} from "@/components/trading/widgets/instrument-candle-chart"
import { TRADING_CHART_TIMEFRAMES } from "@/components/trading/widgets/trading-chart-timeframes"

/** @deprecated Prefer `TRADING_CHART_TIMEFRAMES` from `trading-chart-timeframes.ts`. */
export const TRADING_DESKTOP_CHART_TIMEFRAMES = TRADING_CHART_TIMEFRAMES

export type DesktopTradingChartSymbol = {
  key: string
  label: string
  token: number
}

type DesktopTradingChartPanelProps = {
  symbols: DesktopTradingChartSymbol[]
  defaultSymbolKey?: string
}

function formatTradingPrice(n: number): string {
  if (!Number.isFinite(n)) {
    return "—"
  }
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatVolumeK(n: number): string {
  if (!Number.isFinite(n) || n <= 0) {
    return "—"
  }
  return `${(n / 1000).toFixed(0)}K`
}

function PlaceholderToolButton({
  label,
  icon: Icon,
  className,
}: {
  label: string
  // LucideIcon is the canonical icon type exported by lucide-react. The
  // previous `React.ComponentType<{ className?; size? }>` was too strict — the
  // icons are actually ForwardRefExoticComponent with a wider prop surface, so
  // assigning Activity / SlidersHorizontal here was a TS error every build.
  icon: LucideIcon
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <button
            type="button"
            disabled
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground opacity-60",
              className,
            )}
          >
            <Icon size={13} className="shrink-0" />
            {label}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">Coming soon</TooltipContent>
    </Tooltip>
  )
}

export function DesktopTradingChartPanel({ symbols, defaultSymbolKey }: DesktopTradingChartPanelProps) {
  const { isConnected, quotes } = useMarketDataLive()
  const [selectedKey, setSelectedKey] = useState<string>(() => defaultSymbolKey ?? symbols[0]?.key ?? "")
  const [timeframe, setTimeframe] = useState<string>("5m")
  const [chartType, setChartType] = useState<InstrumentChartKind>("candle")
  const [ohlc, setOhlc] = useState<InstrumentChartOhlcDisplay | null>(null)

  const onOhlcDisplay = useCallback((next: InstrumentChartOhlcDisplay) => {
    setOhlc(next)
  }, [])

  const selected = useMemo(
    () => symbols.find((s) => s.key === selectedKey) ?? symbols[0],
    [symbols, selectedKey],
  )

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

  return (
    <div
      className={cn(
        "flex h-full min-h-[520px] flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border/10 bg-muted/20 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Select value={selectedKey} onValueChange={setSelectedKey}>
            <SelectTrigger className="h-8 w-[160px] shrink-0 border-border/60 bg-background/80 text-xs font-bold">
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
          <div className="flex items-baseline gap-2 font-mono text-xs">
            <span className={cn("font-bold tabular-nums", accentClass)}>
              {displayLtp != null ? formatTradingPrice(displayLtp) : "—"}
            </span>
            <span className={cn("tabular-nums", accentClass)}>
              {previousClose > 0 ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
            </span>
          </div>
        </div>

        <div className="hidden h-4 w-px bg-border/60 sm:block" aria-hidden />

        <div className="flex max-w-full flex-1 flex-wrap items-center gap-0.5 sm:max-w-[55%] lg:max-w-none">
          {TRADING_DESKTOP_CHART_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors",
                timeframe === tf
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="hidden h-4 w-px bg-border/60 md:block" aria-hidden />

        <div className="flex flex-wrap items-center gap-0.5">
          <button
            type="button"
            onClick={() => setChartType("candle")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              chartType === "candle"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <ChartCandlestick size={13} className="shrink-0" />
            Candles
          </button>
          <button
            type="button"
            onClick={() => setChartType("line")}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
              chartType === "line"
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/50",
            )}
          >
            <LineChart size={13} className="shrink-0" />
            Line
          </button>
          <PlaceholderToolButton label="Indicators" icon={Activity} />
          <PlaceholderToolButton label="Drawing" icon={SlidersHorizontal} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", connectionDot)} aria-hidden />
            {connectionLabel}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <button
                  type="button"
                  disabled
                  className="rounded-md border border-border/50 p-1.5 text-muted-foreground opacity-60"
                  aria-label="Maximize chart"
                >
                  <Maximize2 size={14} />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">Coming soon</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <button
                  type="button"
                  disabled
                  className="rounded-md border border-border/50 p-1.5 text-muted-foreground opacity-60"
                  aria-label="Refresh chart"
                >
                  <RefreshCw size={14} />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">Coming soon</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 bg-background/20">
        {selected ? (
          <>
            <InstrumentCandleChart
              instrument={instrument}
              layout="terminal"
              chartType={chartType}
              onOhlcDisplay={onOhlcDisplay}
              timeframe={timeframe}
              className="h-full min-h-[480px]"
            />
            {ohlc && (
              <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-border/40 bg-background/85 px-2 py-1.5 font-mono text-[10px] shadow-sm backdrop-blur-sm">
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
                <div className="flex items-baseline gap-1">
                  <span className="text-muted-foreground">VOL</span>
                  <span className="tabular-nums font-semibold text-muted-foreground">{formatVolumeK(ohlc.v)}</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-[480px] items-center justify-center text-sm text-muted-foreground">Select a symbol</div>
        )}
      </div>
    </div>
  )
}
