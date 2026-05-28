/**
 * File:        components/trading/widgets/watchlist-obsidian-chart-shell.tsx
 * Module:      Trading · Chart Shell
 * Purpose:     Enterprise trading chart drawer — full self-contained chrome:
 *              Bloomberg-style header with live pulse dot, 10 TF pills, MA/EMA
 *              indicator bar, drawing tools, fullscreen overlay, OHLC glass
 *              overlay, and Buy/Sell action bar. Fully adapts to light/dark mode.
 *
 * Exports:
 *   - WatchlistObsidianChartShell(props)      — full chart shell
 *   - WatchlistObsidianChartShellProps        — prop contract
 *
 * Depends on:
 *   - @/components/trading/widgets/instrument-candle-chart — InstrumentCandleChart + types
 *   - @/components/trading/widgets/instrument-chart-drawing — DrawingTool
 *   - @/components/trading/widgets/trading-chart-timeframes — TRADING_CHART_TIMEFRAMES
 *   - lucide-react                                             — icons
 *   - next-themes (useTheme)                                   — theme detection
 *
 * Side-effects:
 *   - none (all state is local; buy/sell fires callback only)
 *
 * Key invariants:
 *   - layout="flex" — RSI pane hidden in shell
 *   - Fullscreen uses CSS fixed positioning — no browser fullscreen API
 *   - data-vaul-no-drag on TF bar and chart area prevents Vaul intercepting
 *   - buy/sell bar lives inside the shell — parent wires onBuy/onSell callbacks
 *   - buy/sell is fire-only (quick action) — opens order screen for precision
 *   - Theme-adaptive: uses CSS vars `--terminal-up/dn/glow/glass` + oklch vars
 *
 * Read order:
 *   1. Props + helpers (formatTradingPrice, formatCompact)
 *   2. Theme hooks + accent color helpers
 *   3. Sub-components: TrendLineIcon, ConnectionPulse, IndicatorPill, BuySellBar
 *   4. State declarations
 *   5. Fullscreen overlay branch
 *   6. Normal drawer branch
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-11
 */

"use client"

import React, { useCallback, useEffect, useState, useMemo } from "react"
import {
  Activity, ChevronLeft, SlidersHorizontal, Trash2,
  RotateCcw, Minus, Maximize2, Minimize2, X, TrendingUp, TrendingDown,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useMarketDataLive } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import {
  type MarketQuoteLike,
  resolveDisplayPriceFromQuote,
  resolveQuoteFromMap,
} from "@/lib/market-data/utils/quote-lookup"
import { resolveMarketWidgetLivePriceForInstrument } from "@/components/trading/widgets/market-widget-number-utils"
import type { DrawingTool } from "@/components/trading/widgets/instrument-chart-drawing"
import type { ChartIndicatorConfig } from "@/components/trading/widgets/instrument-candle-chart"
import {
  InstrumentCandleChart,
  type InstrumentCandleTarget,
  type InstrumentChartOhlcDisplay,
} from "@/components/trading/widgets/instrument-candle-chart"
import { TRADING_CHART_TIMEFRAMES } from "@/components/trading/widgets/trading-chart-timeframes"

export type WatchlistObsidianChartShellProps = {
  instrument: InstrumentCandleTarget
  symbol: string
  name?: string
  onClose: () => void
  onBuy?: (instrument: InstrumentCandleTarget, ltp: number) => void
  onSell?: (instrument: InstrumentCandleTarget, ltp: number) => void
  headerRight?: React.ReactNode
  className?: string
}

function formatTradingPrice(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—"
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(2)
}

const MA_COLORS = ["#f59e0b", "#a78bfa", "#fb923c"] as const
const EMA_COLORS = ["#34d399", "#f472b6", "#facc15", "#60a5fa"] as const
const MA_OPTIONS = [9, 20, 50] as const
const EMA_OPTIONS = [9, 20, 50, 200] as const

// ─── Trend line icon ──────────────────────────────────────────────────────────
function TrendLineIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <line x1="1" y1="13" x2="13" y2="1" />
      <circle cx="1" cy="13" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13" cy="1" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

// ─── Live connection pulse dot ────────────────────────────────────────────────
function ConnectionPulse({ dot, label }: { dot: string; label: string }) {
  const isLive = dot === "bg-emerald-500"
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <span className={cn("block h-1.5 w-1.5 rounded-full", dot)} />
        {isLive && (
          <span
            className={cn("absolute inset-0 block animate-ping rounded-full bg-emerald-500 opacity-60")}
            style={{ animationDuration: "2s" }}
          />
        )}
      </div>
      <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

// ─── Indicator pill button ───────────────────────────────────────────────────
function IndicatorPill({
  label,
  active,
  color,
  onToggle,
}: {
  label: string
  active: boolean
  color: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-center gap-0.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold transition-all duration-150",
        active
          ? ""
          : "border-border/30 text-muted-foreground/40 hover:border-border/60 hover:text-muted-foreground/70",
      )}
      style={active ? { color, borderColor: `${color}60`, backgroundColor: `${color}12` } : {}}
    >
      <span style={{ color: active ? color : undefined }}>{label}</span>
      {active && <span className="opacity-50" style={{ color }}>✕</span>}
    </button>
  )
}

// ─── Buy / Sell action bar ───────────────────────────────────────────────────
function BuySellBar({
  ltp,
  onBuy,
  onSell,
  isUp,
}: {
  ltp: number | null
  onBuy?: () => void
  onSell?: () => void
  isUp: boolean
}) {
  return (
    <div className="flex shrink-0 gap-2 border-t border-border px-4 py-3 bg-card/50">
      {/* Sell */}
      <button
        type="button"
        onClick={onSell}
        className={cn(
          "group relative flex flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border py-3.5 transition-all duration-200",
          "bg-gradient-to-b from-rose-950/60 via-rose-900/30 to-rose-950/60",
          "border-rose-500/40 hover:border-rose-500/70",
          "hover:scale-[1.02] active:scale-[0.98]",
          "shadow-sm",
        )}
        style={{
          boxShadow: "0 0 20px -4px rgba(239,68,68,0.15), inset 0 1px 0 rgba(239,68,68,0.2)",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-rose-500/60 to-transparent" />
        <div className="flex items-center gap-1">
          <TrendingDown size={11} className="text-rose-500" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-rose-500">
            Sell
          </span>
        </div>
        <span className="font-mono text-sm font-bold tabular-nums text-rose-400">
          {ltp != null ? `₹${formatTradingPrice(ltp)}` : "—"}
        </span>
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-rose-500/20 to-transparent" />
      </button>

      {/* Buy */}
      <button
        type="button"
        onClick={onBuy}
        className={cn(
          "group relative flex flex-1 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border py-3.5 transition-all duration-200",
          "bg-gradient-to-b from-emerald-950/60 via-emerald-900/30 to-emerald-950/60",
          "border-emerald-500/40 hover:border-emerald-500/70",
          "hover:scale-[1.02] active:scale-[0.98]",
          "shadow-sm",
        )}
        style={{
          boxShadow: "0 0 20px -4px rgba(16,217,150,0.15), inset 0 1px 0 rgba(16,217,150,0.2)",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />
        <div className="flex items-center gap-1">
          <TrendingUp size={11} className="text-emerald-500" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-emerald-500">
            Buy
          </span>
        </div>
        <span className="font-mono text-sm font-bold tabular-nums text-emerald-400">
          {ltp != null ? `₹${formatTradingPrice(ltp)}` : "—"}
        </span>
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
      </button>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export function WatchlistObsidianChartShell({
  instrument,
  symbol,
  name,
  onClose,
  onBuy,
  onSell,
  headerRight,
  className,
}: WatchlistObsidianChartShellProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const { isConnected, quotes } = useMarketDataLive()
  const connectionLabel =
    isConnected === "connected" ? "LIVE" : isConnected === "connecting" ? "SYNC" : "OFF"
  const connectionDot =
    isConnected === "connected"
      ? "bg-emerald-500"
      : isConnected === "connecting"
        ? "bg-amber-500"
        : "bg-red-500"

  // ── Timeframe ──────────────────────────────────────────────────────────────
  const [timeframe, setTimeframe] = useState<string>("5m")

  // ── Indicators ─────────────────────────────────────────────────────────────
  const [showIndicators, setShowIndicators] = useState(false)
  const [activeMa, setActiveMa] = useState<number[]>([20])
  const [activeEma, setActiveEma] = useState<number[]>([50, 200])
  const indicatorConfig = useMemo<ChartIndicatorConfig>(() => ({
    ma: activeMa,
    ema: activeEma,
    rsi: false,
  }), [activeMa, activeEma])

  // ── Drawing ────────────────────────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<DrawingTool>("none")
  const [zoomResetKey, setZoomResetKey] = useState(0)
  const [clearDrawingsKey, setClearDrawingsKey] = useState(0)

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── OHLC ────────────────────────────────────────────────────────────────────
  const [ohlc, setOhlc] = useState<InstrumentChartOhlcDisplay | null>(null)
  const onOhlcDisplay = useCallback((next: InstrumentChartOhlcDisplay) => {
    setOhlc(next)
  }, [])

  // ── Live data ──────────────────────────────────────────────────────────────
  const quote = resolveQuoteFromMap(quotes as Record<string, MarketQuoteLike> | undefined, {
    token: instrument.token,
    instrumentId: instrument.instrumentId ?? null,
  })
  const liveLtp = resolveMarketWidgetLivePriceForInstrument(
    quotes as Record<string, MarketQuoteLike> | undefined,
    { token: instrument.token, instrumentId: instrument.instrumentId ?? null },
  )
  const displayLtp = liveLtp ?? (quote != null ? resolveDisplayPriceFromQuote(quote, 0) : null)
  const previousClose = quote != null ? (quote.prev_close_price as number) ?? 0 : 0
  const changePct =
    displayLtp != null && previousClose > 0 ? ((displayLtp - previousClose) / previousClose) * 100 : 0
  const isUp = changePct >= 0

  // Accent colors — use terminal semantic tokens
  const upColor = "var(--terminal-up, #10D996)"
  const dnColor = "var(--terminal-dn, #FF3B5C)"
  const upGlow = "var(--terminal-up-glow, rgba(16,217,150,0.15))"
  const dnGlow = "var(--terminal-dn-glow, rgba(255,59,92,0.15))"
  const glassBg = "var(--terminal-glass, rgba(0,0,0,0.6))"

  // Surface text colors — readable in both modes
  const surfaceFg = isDark ? "text-white/90" : "text-foreground"
  const surfaceFgDim = isDark ? "text-white/40" : "text-muted-foreground"
  const surfaceBorder = isDark ? "border-white/10" : "border-border"
  const surfaceBorderActive = isDark ? "border-white/20" : "border-primary/30"
  const surfaceBgDim = isDark ? "bg-white/5" : "bg-muted/20"
  const priceCardBg = isDark
    ? "bg-gradient-to-br from-card/90 to-card/70"
    : "bg-gradient-to-br from-card to-muted/10"
  const priceBadgeBg = isUp
    ? isDark ? "bg-emerald-500/10" : "bg-emerald-50"
    : isDark ? "bg-rose-500/10" : "bg-rose-50"
  const priceBadgeText = isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
  const priceBadgeIcon = isUp ? "text-emerald-600 dark:text-emerald-500" : "text-rose-600 dark:text-rose-500"

  // ─────────────────────────────────────────────────────────────────────────────
  // FULLSCREEN OVERLAY
  // ─────────────────────────────────────────────────────────────────────────────
  if (isFullscreen) {
    const fullscreenBg = isDark
      ? "linear-gradient(160deg, oklch(0.08 0 0) 0%, oklch(0.1 0 0) 50%, oklch(0.08 0 0) 100%)"
      : "linear-gradient(160deg, oklch(0.98 0 0) 0%, oklch(0.96 0 0) 50%, oklch(0.98 0 0) 100%)"

    return (
      <div
        className="fixed inset-0 z-[9999] flex flex-col"
        style={{ background: fullscreenBg }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className={cn(
          "flex items-center justify-between border-b px-4 py-2.5",
          isDark ? "border-white/8" : "border-border",
        )}>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                surfaceBorder,
                `hover:${surfaceBgDim}`,
              )}
              aria-label="Exit fullscreen"
            >
              <Minimize2 size={14} className={surfaceFgDim} />
            </button>

            <div className="flex flex-col">
              <span className={cn("font-mono text-base font-bold tracking-tight", surfaceFg)}>{symbol}</span>
              {name && (
                <span className={cn("font-mono text-[10px]", surfaceFgDim)}>{name}</span>
              )}
            </div>

            {/* Price + Change card */}
            <div className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5",
              priceCardBg,
              isDark ? "border-white/8" : "border-border",
            )}>
              <span className={cn("font-mono text-xl font-bold tabular-nums", priceBadgeText)}>
                {displayLtp != null ? formatTradingPrice(displayLtp) : "—"}
              </span>
              <div className={cn("flex items-center gap-1 rounded px-1.5 py-0.5", priceBadgeBg)}>
                {isUp
                  ? <TrendingUp size={11} className={priceBadgeIcon} />
                  : <TrendingDown size={11} className={priceBadgeIcon} />
                }
                <span className={cn("font-mono text-[11px] font-semibold tabular-nums", priceBadgeText)}>
                  {previousClose > 0 ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ConnectionPulse dot={connectionDot} label={connectionLabel} />
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                surfaceBorder,
              )}
            >
              <X size={14} className={surfaceFgDim} />
            </button>
          </div>
        </div>

        {/* ── TF bar ────────────────────────────────────────────────────────── */}
        <div className={cn(
          "flex items-center gap-3 border-b px-4 py-1.5",
          isDark ? "border-white/8" : "border-border",
        )} data-vaul-no-drag>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5">
            {TRADING_CHART_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "shrink-0 rounded-md border px-3 py-1.5 font-mono text-[11px] font-semibold transition-all duration-150",
                  timeframe === tf
                    ? cn("border-primary/40 bg-primary/15 text-primary shadow-sm")
                    : cn(`${surfaceBorder} ${surfaceFgDim} hover:${surfaceBorderActive} hover:${surfaceFg}`),
                )}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Drawing tools */}
          <div className={cn("flex shrink-0 items-center gap-1 border-l pl-3", isDark ? "border-white/8" : "border-border")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setActiveTool((t: DrawingTool) => t === "trendline" ? "none" : "trendline")}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-all",
                    activeTool === "trendline"
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                      : cn(`${surfaceBorder} ${surfaceFgDim}`),
                  )}
                >
                  <TrendLineIcon size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Trend line</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setActiveTool((t: DrawingTool) => t === "horizontal" ? "none" : "horizontal")}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-all",
                    activeTool === "horizontal"
                      ? "border-blue-400/60 bg-blue-400/10 text-blue-400"
                      : cn(`${surfaceBorder} ${surfaceFgDim}`),
                  )}
                >
                  <Minus size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Horizontal level</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => { setClearDrawingsKey(k => k + 1); setActiveTool("none") }}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-all",
                    surfaceBorder, surfaceFgDim,
                  )}
                >
                  <Trash2 size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Clear all</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setZoomResetKey(k => k + 1)}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-all",
                    surfaceBorder, surfaceFgDim,
                  )}
                >
                  <RotateCcw size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Reset view</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── Chart ─────────────────────────────────────────────────────── */}
        <div className="relative min-h-0 flex-1" data-vaul-no-drag>
          <InstrumentCandleChart
            instrument={instrument}
            layout="flex"
            onOhlcDisplay={onOhlcDisplay}
            timeframe={timeframe}
            indicators={indicatorConfig}
            activeTool={activeTool}
            zoomResetKey={zoomResetKey}
            clearDrawingsKey={clearDrawingsKey}
            className="h-full w-full"
          />
          {ohlc && (
            <div
              className="pointer-events-none absolute left-3 top-3 z-10 flex gap-4 rounded-xl border px-4 py-2.5 font-mono text-xs backdrop-blur-md"
              style={{
                background: glassBg,
                borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
              }}
            >
              {(["O", "H", "L", "C", "V"] as const).map((label) => {
                const val = ohlc[label.toLowerCase() as keyof typeof ohlc] as number
                return (
                  <div key={label} className="flex flex-col items-center gap-0.5">
                    <span className={cn("text-[9px] font-semibold uppercase tracking-widest", surfaceFgDim)}>{label}</span>
                    <span className={cn(
                      "font-bold tabular-nums",
                      label === "H" ? "text-emerald-500" : label === "L" ? "text-rose-500" : surfaceFg,
                    )}>
                      {label === "V" ? (val > 0 ? formatCompact(val) : "—") : formatTradingPrice(val)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Buy/Sell bar ────────────────────────────────────────────────── */}
        <BuySellBar
          ltp={displayLtp}
          onBuy={() => onBuy?.(instrument, displayLtp ?? 0)}
          onSell={() => onSell?.(instrument, displayLtp ?? 0)}
          isUp={isUp}
        />
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NORMAL (DRAWER) MODE
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden bg-card", className)}>

      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      <div className={cn(
        "flex flex-wrap items-center gap-2 border-b px-3 py-2",
        isDark ? "border-white/8" : "border-border",
      )}>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-all",
            surfaceBorder,
          )}
          aria-label="Back"
        >
          <ChevronLeft className={cn("h-4 w-4", surfaceFg)} />
        </button>

        {/* Symbol + name */}
        <div className="min-w-0 flex-1">
          <span className={cn("font-mono text-sm font-bold tracking-tight", surfaceFg)}>{symbol}</span>
          {name && (
            <span className={cn("ml-2 hidden font-mono text-[10px] sm:inline", surfaceFgDim)}>{name}</span>
          )}
        </div>

        {/* Price + Change pill */}
        <div className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-1.5",
          priceCardBg,
          isDark ? "border-white/8" : "border-border",
        )}>
          <span className={cn("font-mono text-base font-bold tabular-nums", priceBadgeText)}>
            {displayLtp != null ? formatTradingPrice(displayLtp) : "—"}
          </span>
          <div className={cn("flex items-center gap-1 rounded px-1.5 py-0.5", priceBadgeBg)}>
            {isUp
              ? <TrendingUp size={10} className={priceBadgeIcon} />
              : <TrendingDown size={10} className={priceBadgeIcon} />
            }
            <span className={cn("font-mono text-[10px] font-semibold tabular-nums", priceBadgeText)}>
              {previousClose > 0 ? `${isUp ? "+" : ""}${changePct.toFixed(2)}%` : "—"}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setIsFullscreen(v => !v)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg border transition-all",
                  surfaceBorder,
                )}
                aria-label="Fullscreen"
              >
                <Maximize2 size={13} className={surfaceFgDim} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Fullscreen</TooltipContent>
          </Tooltip>
          <ConnectionPulse dot={connectionDot} label={connectionLabel} />
          {headerRight}
        </div>
      </div>

      {/* ── TF bar ─────────────────────────────────────────────────────────── */}
      <div className={cn(
        "flex items-center gap-2 border-b px-3 py-1.5",
        isDark ? "border-white/8" : "border-border",
      )} data-vaul-no-drag>
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5">
          {TRADING_CHART_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={cn(
                "shrink-0 rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold transition-all duration-150",
                timeframe === tf
                  ? "border-primary/40 bg-primary/15 text-primary shadow-sm"
                  : cn(`${surfaceBorder} ${surfaceFgDim} hover:${surfaceBorderActive} hover:${surfaceFg}`),
              )}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Indicators toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setShowIndicators(v => !v)}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs transition-colors",
                showIndicators
                  ? cn("border-primary/30 bg-primary/10 text-primary")
                  : cn(`${surfaceBorder} ${surfaceFgDim}`),
              )}
              aria-label="Indicators"
              aria-pressed={showIndicators}
            >
              <Activity size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{showIndicators ? "Hide indicators" : "Indicators"}</TooltipContent>
        </Tooltip>

        {/* Drawing toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setActiveTool((t: DrawingTool) => t === "trendline" ? "none" : "trendline")}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs transition-all",
                activeTool === "trendline"
                  ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                  : activeTool === "horizontal"
                    ? "border-blue-400/60 bg-blue-400/10 text-blue-400"
                    : cn(`${surfaceBorder} ${surfaceFgDim}`),
              )}
              aria-label="Drawing tools"
            >
              <SlidersHorizontal size={13} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {activeTool === "none" ? "Drawing tools" : activeTool === "trendline" ? "Exit trend line" : "Exit horizontal"}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* ── Indicator + Drawing pill bar ──────────────────────────────────── */}
      {showIndicators && (
        <div className={cn(
          "flex flex-wrap items-center gap-2 border-b px-3 py-1.5",
          isDark ? "border-white/8" : "border-border",
        )}>
          <span className={cn("font-mono text-[9px] font-semibold uppercase tracking-widest", surfaceFgDim)}>MA</span>
          {MA_OPTIONS.map((period, i) => (
            <IndicatorPill
              key={period}
              label={`MA(${period})`}
              active={activeMa.includes(period)}
              color={MA_COLORS[i]}
              onToggle={() => setActiveMa(prev =>
                prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period].sort(),
              )}
            />
          ))}

          <span className={cn("ml-2 font-mono text-[9px] font-semibold uppercase tracking-widest", surfaceFgDim)}>EMA</span>
          {EMA_OPTIONS.map((period, i) => (
            <IndicatorPill
              key={period}
              label={`EMA(${period})`}
              active={activeEma.includes(period)}
              color={EMA_COLORS[i]}
              onToggle={() => setActiveEma(prev =>
                prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period].sort(),
              )}
            />
          ))}

          {/* Drawing tools */}
          <span className={cn("ml-3 h-4 w-px", isDark ? "bg-white/10" : "bg-border")} />
          <span className={cn("font-mono text-[9px] font-semibold uppercase tracking-widest", surfaceFgDim)}>Draw</span>
          {([
            { tool: "trendline" as DrawingTool, icon: <TrendLineIcon size={11} />, tip: "Trend line", color: "amber" },
            { tool: "horizontal" as DrawingTool, icon: <Minus size={11} />, tip: "Horizontal level", color: "blue" },
          ] as const).map(({ tool, icon, tip, color }) => (
            <Tooltip key={tool}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setActiveTool((t: DrawingTool) => t === tool ? "none" : tool)}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded border text-xs transition-all",
                    activeTool === tool
                      ? color === "amber"
                        ? "border-amber-400/60 bg-amber-400/10 text-amber-400"
                        : "border-blue-400/60 bg-blue-400/10 text-blue-400"
                      : cn(`${surfaceBorder} ${surfaceFgDim}`),
                  )}
                  aria-label={tip}
                >
                  {icon}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{tip}</TooltipContent>
            </Tooltip>
          ))}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => { setClearDrawingsKey(k => k + 1); setActiveTool("none") }}
                className={cn("flex h-6 w-6 items-center justify-center rounded border text-xs transition-all", surfaceBorder, surfaceFgDim)}
                aria-label="Clear drawings"
              >
                <Trash2 size={11} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear all</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setZoomResetKey(k => k + 1)}
                className={cn("flex h-6 w-6 items-center justify-center rounded border text-xs transition-all", surfaceBorder, surfaceFgDim)}
                aria-label="Reset view"
              >
                <RotateCcw size={11} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Reset view</TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* ── Chart area ─────────────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1" data-vaul-no-drag>
        <InstrumentCandleChart
          instrument={instrument}
          layout="flex"
          onOhlcDisplay={onOhlcDisplay}
          timeframe={timeframe}
          indicators={indicatorConfig}
          activeTool={activeTool}
          zoomResetKey={zoomResetKey}
          clearDrawingsKey={clearDrawingsKey}
          className="h-full min-h-[260px] w-full sm:min-h-[340px]"
        />
        {ohlc && (
          <div
            className="pointer-events-none absolute left-2 top-2 z-10 flex gap-3 rounded-xl border px-3 py-2 font-mono text-[10px] backdrop-blur-md"
            style={{
              background: glassBg,
              borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
            }}
          >
            {(["O", "H", "L", "C"] as const).map((label) => {
              const val = ohlc[label.toLowerCase() as keyof typeof ohlc] as number
              return (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <span className={cn("text-[9px] font-semibold uppercase tracking-widest", surfaceFgDim)}>{label}</span>
                  <span className={cn(
                    "font-bold tabular-nums",
                    label === "H" ? "text-emerald-500" : label === "L" ? "text-rose-500" : surfaceFg,
                  )}>
                    {formatTradingPrice(val)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Buy/Sell action bar ────────────────────────────────────────────── */}
      <BuySellBar
        ltp={displayLtp}
        onBuy={() => onBuy?.(instrument, displayLtp ?? 0)}
        onSell={() => onSell?.(instrument, displayLtp ?? 0)}
        isUp={isUp}
      />

    </div>
  )
}
