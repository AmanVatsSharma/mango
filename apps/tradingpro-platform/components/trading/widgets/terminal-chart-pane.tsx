/**
 * File:        components/trading/widgets/terminal-chart-pane.tsx
 * Module:      Trading · Terminal Chart Pane
 * Purpose:     Enterprise-grade chart panel for the desktop trading terminal — Bloomberg-style
 *              header with symbol, LTP, delta, OHLC strip, timeframe pills, indicator toggles,
 *              drawing tools, zoom reset, and fullscreen.
 *
 * Exports:
 *   - TerminalChartPane(props)     — full-height chart panel with toolbar
 *   - TerminalChartPaneProps       — prop contract
 *
 * Depends on:
 *   - @/components/trading/widgets/instrument-candle-chart   — InstrumentCandleChart + config types
 *   - @/components/trading/widgets/desktop-trading-chart-panel — DesktopTradingChartSymbol
 *   - @/lib/market-data/utils/quote-lookup                   — resolveQuoteFromMap etc.
 *   - @/lib/hooks/use-prisma-watchlist                       — WatchlistItemData
 *   - lucide-react                                           — toolbar icons
 *
 * Side-effects:
 *   - Calls document.requestFullscreen / document.exitFullscreen on user interaction
 *
 * Key invariants:
 *   - zoomResetKey and clearDrawingsKey start at 0 (ignored by chart) and increment on action
 *   - Indicator pills reflect ChartIndicatorConfig; removing a period filters the array
 *   - fullscreenchange event syncs isFullscreen state
 *   - paneRef targets the outermost div so fullscreen covers the whole panel
 *
 * Read order:
 *   1. TerminalChartPaneProps — data contract
 *   2. State + refs
 *   3. Header rendering (3 rows)
 *   4. InstrumentCandleChart render
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-10
 */

"use client"

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import {
  Maximize2, Minimize2, RotateCcw, Trash2, TrendingUp, Minus, MousePointer2,
} from "lucide-react"
import {
  InstrumentCandleChart,
  type InstrumentChartKind,
  type InstrumentChartOhlcDisplay,
  type ChartIndicatorConfig,
  DEFAULT_INDICATORS,
} from "@/components/trading/widgets/instrument-candle-chart"
import type { DrawingTool } from "@/components/trading/widgets/instrument-chart-drawing"
import type { DesktopTradingChartSymbol } from "@/components/trading/widgets/desktop-trading-chart-panel"
import {
  resolveQuoteFromMap,
  resolveDisplayPriceFromQuote,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"
import type { WatchlistItemData } from "@/lib/hooks/use-prisma-watchlist"

export interface TerminalChartPaneProps {
  defaultSymbols: DesktopTradingChartSymbol[]
  defaultSymbolKey?: string
  activeItem?: WatchlistItemData | null
  quotes: Record<string, any> | undefined
}

const TERMINAL_TFS = ["1m", "5m", "15m", "30m", "1H", "1D", "1W"] as const

const fmtPrice = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ─── Pill sub-component ────────────────────────────────────────────────────────

function IndicatorPill({
  label, active, color, onRemove, onAdd,
}: { label: string; active: boolean; color: string; onRemove: () => void; onAdd: () => void }) {
  return active ? (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: "2px 6px 2px 8px",
        borderRadius: 4,
        background: `${color}20`,
        border: `1px solid ${color}50`,
        fontSize: 10,
        fontWeight: 700,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      <button
        onClick={onRemove}
        style={{ border: 0, background: "none", cursor: "pointer", padding: 0, color, display: "flex", lineHeight: 1 }}
      >
        <Trash2 size={9} />
      </button>
    </div>
  ) : (
    <button
      onClick={onAdd}
      style={{
        border: `1px dashed ${color}40`,
        background: "transparent",
        cursor: "pointer",
        padding: "2px 7px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        color: `${color}60`,
        whiteSpace: "nowrap",
      }}
    >
      + {label}
    </button>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function TerminalChartPane({
  defaultSymbols,
  defaultSymbolKey,
  activeItem,
  quotes,
}: TerminalChartPaneProps) {
  const paneRef = useRef<HTMLDivElement>(null)

  const [timeframe, setTimeframe] = useState<string>("15m")
  const [chartType] = useState<InstrumentChartKind>("candle")
  const [ohlc, setOhlc] = useState<InstrumentChartOhlcDisplay | null>(null)
  const [indicators, setIndicators] = useState<ChartIndicatorConfig>({ ...DEFAULT_INDICATORS })
  const [activeTool, setActiveTool] = useState<DrawingTool>("none")
  const [zoomResetKey, setZoomResetKey] = useState(0)
  const [clearDrawingsKey, setClearDrawingsKey] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const onOhlcDisplay = useCallback((next: InstrumentChartOhlcDisplay) => {
    setOhlc(next)
  }, [])

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      paneRef.current?.requestFullscreen().catch(() => {/* ignore unsupported */ })
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  // ── Resolve display data ─────────────────────────────────────────────────────
  const fallbackSymbol = useMemo(
    () =>
      (defaultSymbolKey ? defaultSymbols.find((s) => s.key === defaultSymbolKey) : undefined) ??
      defaultSymbols[0] ?? null,
    [defaultSymbols, defaultSymbolKey],
  )

  const { displaySymbol, displaySubtitle, instrument, ltp, changePct, changeAmt } = useMemo(() => {
    if (activeItem) {
      const token = parsePositiveIntegerMarketNumber(activeItem.token)
      const quote = resolveQuoteFromMap(quotes, { token: token ?? undefined, instrumentId: activeItem.instrumentId })
      const resolvedLtp = quote ? resolveDisplayPriceFromQuote(quote, 0) || null : null
      const ltpVal = resolvedLtp ?? (activeItem.ltp > 0 ? activeItem.ltp : null)
      const close = activeItem.close
      const cpct = ltpVal && close && close > 0 ? ((ltpVal - close) / close) * 100 : null
      const camt = ltpVal && close ? ltpVal - close : null
      const seg = (activeItem.segment ?? activeItem.exchange ?? "NSE").toUpperCase()
      const lot = activeItem.lotSize && activeItem.lotSize > 1 ? ` · Lot ${activeItem.lotSize}` : ""
      return {
        displaySymbol: activeItem.symbol,
        displaySubtitle: `${seg} · Equity${lot}`,
        instrument: { instrumentKey: activeItem.instrumentId, token: token ?? activeItem.token, instrumentId: activeItem.instrumentId, seedBasePrice: ltpVal },
        ltp: ltpVal,
        changePct: cpct,
        changeAmt: camt,
      }
    }

    if (!fallbackSymbol) {
      return { displaySymbol: "—", displaySubtitle: "NSE · Equity", instrument: null, ltp: null, changePct: null, changeAmt: null }
    }

    const quote = resolveQuoteFromMap(quotes, { token: fallbackSymbol.token, instrumentId: null })
    const ltpVal = quote ? resolveDisplayPriceFromQuote(quote, 0) || null : null
    const prevClose = quote != null ? (parsePositiveIntegerMarketNumber((quote as any)?.prev_close_price) ?? 0) : 0
    const cpct = ltpVal && prevClose > 0 ? ((ltpVal - prevClose) / prevClose) * 100 : null
    const camt = ltpVal && prevClose ? ltpVal - prevClose : null

    return {
      displaySymbol: fallbackSymbol.label,
      displaySubtitle: "NSE · Equity",
      instrument: { instrumentKey: fallbackSymbol.key, token: fallbackSymbol.token, instrumentId: null as string | null, seedBasePrice: ltpVal },
      ltp: ltpVal,
      changePct: cpct,
      changeAmt: camt,
    }
  }, [activeItem, fallbackSymbol, quotes])

  const isUp = changePct != null ? changePct >= 0 : null
  const upColor = "var(--terminal-up, #10D996)"
  const dnColor = "var(--terminal-dn, #FF3B5C)"
  const priceColor = isUp === null ? "var(--terminal-text)" : isUp ? upColor : dnColor
  const priceGlow = isUp === null ? "none" : isUp ? "0 0 14px var(--terminal-up-glow, rgba(16,217,150,.40))" : "0 0 14px var(--terminal-dn-glow, rgba(255,59,92,.40))"

  // ── Shared pill/button styles ────────────────────────────────────────────────
  const toolBtnBase: React.CSSProperties = {
    border: "1px solid var(--terminal-border)",
    background: "transparent",
    cursor: "pointer",
    borderRadius: 4,
    padding: "3px 8px",
    fontSize: 10,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: 4,
    transition: "background 80ms, color 80ms, border-color 80ms",
  }

  return (
    <div
      ref={paneRef}
      style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--terminal-bg)", overflow: "hidden" }}
    >
      {/* ── Header ── */}
      <div style={{ borderBottom: "1px solid var(--terminal-border)", flexShrink: 0, background: "var(--terminal-surface)" }}>

        {/* Row 1: Symbol + TF pills + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 6px" }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: "var(--terminal-text)", lineHeight: 1, letterSpacing: "-0.4px" }}>
            {displaySymbol}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, color: "var(--terminal-text-muted)", letterSpacing: "0.08em",
            textTransform: "uppercase", background: "var(--terminal-surface-hi)", padding: "2px 6px",
            borderRadius: 3, border: "1px solid var(--terminal-separator, rgba(255,255,255,.06))",
          }}>
            {displaySubtitle}
          </span>

          <div style={{ flex: 1 }} />

          {/* Timeframe pills */}
          <div style={{ display: "flex", gap: 2, background: "var(--terminal-bg)", padding: 2, borderRadius: 6, border: "1px solid var(--terminal-border)" }}>
            {TERMINAL_TFS.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                style={{
                  border: 0,
                  background: timeframe === tf ? "var(--terminal-accent, #22D3EE)" : "transparent",
                  color: timeframe === tf ? "#0A0A0A" : "var(--terminal-text-muted)",
                  padding: "4px 10px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "background 80ms, color 80ms",
                  letterSpacing: "0.02em",
                }}
                onMouseEnter={(e) => { if (timeframe !== tf) (e.currentTarget as HTMLElement).style.color = "var(--terminal-text)" }}
                onMouseLeave={(e) => { if (timeframe !== tf) (e.currentTarget as HTMLElement).style.color = "var(--terminal-text-muted)" }}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Zoom reset */}
          <button
            onClick={() => setZoomResetKey((k) => k + 1)}
            title="Reset zoom"
            style={{ ...toolBtnBase, color: "var(--terminal-text-muted)", padding: "4px 6px" }}
          >
            <RotateCcw size={12} />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            style={{ ...toolBtnBase, color: "var(--terminal-text-muted)", padding: "4px 6px" }}
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        </div>

        {/* Row 2: Price + delta + OHLC strip */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14, padding: "4px 16px 8px",
          fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums",
        }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: priceColor, lineHeight: 1, textShadow: priceGlow, transition: "color 200ms, text-shadow 200ms" }}>
            {ltp != null ? fmtPrice(ltp) : "—"}
          </span>

          {changePct != null && changeAmt != null && (
            <div style={{
              display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 4,
              background: isUp ? "var(--terminal-up-dim, rgba(16,217,150,.10))" : "var(--terminal-dn-dim, rgba(255,59,92,.10))",
              border: `1px solid ${isUp ? "rgba(16,217,150,.20)" : "rgba(255,59,92,.20)"}`,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: priceColor }}>{isUp ? "▲" : "▼"}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: priceColor }}>{changeAmt >= 0 ? "+" : ""}{fmtPrice(changeAmt)}</span>
              <span style={{ fontSize: 11, color: priceColor, opacity: 0.8 }}>({changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%)</span>
            </div>
          )}

          {ohlc && (
            <div style={{
              display: "flex", gap: 10, padding: "3px 10px", borderRadius: 4,
              background: "var(--terminal-surface-hi)", border: "1px solid var(--terminal-separator, rgba(255,255,255,.06))",
              fontSize: 11, color: "var(--terminal-text-muted)", marginLeft: 4,
            }}>
              <span>O <strong style={{ color: "var(--terminal-text)", fontWeight: 600 }}>{fmtPrice(ohlc.o)}</strong></span>
              <span>H <strong style={{ color: upColor, fontWeight: 600 }}>{fmtPrice(ohlc.h)}</strong></span>
              <span>L <strong style={{ color: dnColor, fontWeight: 600 }}>{fmtPrice(ohlc.l)}</strong></span>
              <span>C <strong style={{ color: "var(--terminal-text)", fontWeight: 600 }}>{fmtPrice(ohlc.c)}</strong></span>
            </div>
          )}
        </div>

        {/* Row 3: Indicator pills + drawing toolbar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "5px 16px 8px",
          borderTop: "1px solid var(--terminal-border)",
          overflowX: "auto",
        }}>
          {/* Indicator pills */}
          {[9, 20].map((p, i) => (
            <IndicatorPill
              key={`ma${p}`}
              label={`MA${p}`}
              active={indicators.ma.includes(p)}
              color={["#f59e0b", "#a78bfa"][i] ?? "#f59e0b"}
              onRemove={() => setIndicators((prev) => ({ ...prev, ma: prev.ma.filter((x) => x !== p) }))}
              onAdd={() => setIndicators((prev) => ({ ...prev, ma: [...prev.ma.filter((x) => x !== p), p].sort((a, b) => a - b) }))}
            />
          ))}

          {[21].map((p, i) => (
            <IndicatorPill
              key={`ema${p}`}
              label={`EMA${p}`}
              active={indicators.ema.includes(p)}
              color={["#34d399"][i] ?? "#34d399"}
              onRemove={() => setIndicators((prev) => ({ ...prev, ema: prev.ema.filter((x) => x !== p) }))}
              onAdd={() => setIndicators((prev) => ({ ...prev, ema: [...prev.ema.filter((x) => x !== p), p].sort((a, b) => a - b) }))}
            />
          ))}

          <IndicatorPill
            label="RSI(14)"
            active={indicators.rsi}
            color="#3b82f6"
            onRemove={() => setIndicators((prev) => ({ ...prev, rsi: false }))}
            onAdd={() => setIndicators((prev) => ({ ...prev, rsi: true }))}
          />

          <div style={{ flex: 1, minWidth: 12 }} />

          {/* Drawing tool buttons */}
          {(["none", "trendline", "horizontal"] as const).map((tool) => {
            const isActive = activeTool === tool
            return (
              <button
                key={tool}
                onClick={() => setActiveTool(tool)}
                title={tool === "none" ? "Select (no drawing)" : tool === "trendline" ? "Draw trend line" : "Draw horizontal level"}
                style={{
                  ...toolBtnBase,
                  color: isActive ? "var(--terminal-accent, #22D3EE)" : "var(--terminal-text-muted)",
                  borderColor: isActive ? "var(--terminal-accent, #22D3EE)" : "var(--terminal-border)",
                  background: isActive ? "rgba(34,211,238,.08)" : "transparent",
                }}
              >
                {tool === "none" && <><MousePointer2 size={11} /> <span>Select</span></>}
                {tool === "trendline" && <><TrendingUp size={11} /> <span>Trend</span></>}
                {tool === "horizontal" && <><Minus size={11} /> <span>Horiz</span></>}
              </button>
            )
          })}

          <button
            onClick={() => setClearDrawingsKey((k) => k + 1)}
            title="Clear all drawings"
            style={{ ...toolBtnBase, color: "var(--terminal-text-muted)" }}
          >
            <Trash2 size={11} /> <span>Clear</span>
          </button>
        </div>
      </div>

      {/* ── Chart body ── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
        {instrument ? (
          <InstrumentCandleChart
            instrument={instrument}
            layout="terminal"
            chartType={chartType}
            onOhlcDisplay={onOhlcDisplay}
            className="h-full"
            timeframe={timeframe}
            indicators={indicators}
            activeTool={activeTool}
            zoomResetKey={zoomResetKey}
            clearDrawingsKey={clearDrawingsKey}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "var(--terminal-text-muted)" }}>
            <span style={{ fontSize: 20, opacity: 0.3 }}>◈</span>
            <span style={{ fontSize: 12 }}>Select a symbol from the watchlist</span>
          </div>
        )}
      </div>
    </div>
  )
}
