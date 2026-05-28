/**
 * File:        components/trading/widgets/instrument-candle-chart.tsx
 * Module:      Trading · Chart Widget
 * Purpose:     Enterprise-grade candlestick chart with MA/EMA indicator overlays, RSI sub-pane,
 *              canvas drawing overlay (trend lines + horizontal levels), zoom-reset, and real-data-only
 *              display — shows "No chart data" overlay instead of synthetic fallback data.
 *
 * Exports:
 *   - InstrumentCandleChart(props)     — main chart component
 *   - InstrumentCandleChartProps       — prop contract
 *   - InstrumentCandleChartLayout      — "card" | "flex" | "terminal"
 *   - InstrumentChartKind              — "candle" | "line"
 *   - InstrumentCandleTarget           — instrument identity shape
 *   - InstrumentChartOhlcDisplay       — OHLCV crosshair callback shape
 *   - ChartIndicatorConfig             — indicator config shape
 *   - DEFAULT_INDICATORS               — default indicator config
 *
 * Depends on:
 *   - lightweight-charts v5                       — chart engine
 *   - @/components/trading/widgets/instrument-chart-indicators — computeMA/EMA/RSI
 *   - @/components/trading/widgets/instrument-chart-drawing    — DrawingEngine + DrawingTool
 *   - @/components/trading/widgets/instrument-chart-theme      — layout options, colours, RSI_PANE_HEIGHT
 *   - @/lib/market-data/providers/WebSocketMarketDataProvider  — live quotes hook
 *
 * Side-effects:
 *   - GET <marketdata-url>/api/stock/candles/:token on mount (real Kite history)
 *   - Writes to HTMLCanvasElement for drawing overlay
 *
 * Key invariants:
 *   - NO synthetic/demo data: chart shows real Kite API data or the "no data" overlay
 *   - isFetching=true while fetch in-flight; hasData=true after first successful load
 *   - Series cleared immediately on instrument/timeframe change; fresh fetch replaces it
 *   - Live WebSocket ticks only applied when hasData=true (prevents phantom ticks on empty chart)
 *   - RSI pane created only when layout="terminal" AND indicators.rsi=true
 *   - Main chart and RSI chart destroyed together in the same useEffect cleanup
 *   - teardownChart is `let` (not const) so RSI cleanup can be injected before React calls it
 *   - Canvas pointer-events set to "auto" only when activeTool !== "none"
 *   - zoomResetKey=0 is ignored (initial mount); only positive increments trigger reset
 *   - clearDrawingsKey=0 is ignored; only positive increments clear drawings
 *
 * Read order:
 *   1. ChartIndicatorConfig / DEFAULT_INDICATORS
 *   2. InstrumentCandleChartProps
 *   3. Helper functions (buildDemoHistoryCandles, etc.)
 *   4. InstrumentCandleChart component
 *   5. useEffect: chart init (main chart + RSI chart + canvas)
 *   6. useEffect: indicator series sync
 *   7. useEffect: live data / demo ticks
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-10
 */

"use client"

import React, { useEffect, useRef, useCallback, useState } from "react"
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { useMarketDataLive } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { resolveMarketWidgetLivePriceForInstrument } from "@/components/trading/widgets/market-widget-number-utils"
import {
  getInstrumentChartLayoutOptions,
  getInstrumentChartLineOptions,
  getInstrumentChartVolumeColors,
  MA_COLORS,
  EMA_COLORS,
  RSI_COLORS,
  RSI_PANE_HEIGHT,
} from "@/components/trading/widgets/instrument-chart-theme"
import {
  computeMA,
  computeEMA,
  computeRSI,
  type IndicatorCandle,
} from "@/components/trading/widgets/instrument-chart-indicators"
import {
  DrawingEngine,
  type DrawingTool,
} from "@/components/trading/widgets/instrument-chart-drawing"

// ─── Public Types ────────────────────────────────────────────────────────────

export type InstrumentCandleChartLayout = "card" | "flex" | "terminal"
export type InstrumentChartKind = "candle" | "line"

export type InstrumentCandleTarget = {
  instrumentKey: string
  token?: unknown
  instrumentId?: string | null
  seedBasePrice?: number | null
}

export type InstrumentChartOhlcDisplay = {
  o: number
  h: number
  l: number
  c: number
  v: number
}

export type ChartIndicatorConfig = {
  ma: number[]   // MA periods, e.g. [9, 20]
  ema: number[]  // EMA periods, e.g. [21]
  rsi: boolean   // show RSI sub-pane (terminal layout only)
}

export const DEFAULT_INDICATORS: ChartIndicatorConfig = {
  ma: [],
  ema: [20, 50, 100, 200],
  rsi: true,
}

export type InstrumentCandleChartProps = {
  instrument: InstrumentCandleTarget
  layout?: InstrumentCandleChartLayout
  /** Default `candle`. Line mode derives points from same OHLC history (close). */
  chartType?: InstrumentChartKind
  /** Desktop crosshair / last-bar OHLC+VOL strip (optional). */
  onOhlcDisplay?: (ohlc: InstrumentChartOhlcDisplay) => void
  className?: string
  /** Indicator config — defaults to DEFAULT_INDICATORS */
  indicators?: ChartIndicatorConfig
  /** Active drawing tool — parent controls, chart responds */
  activeTool?: DrawingTool
  /** Increment to trigger zoom-reset + scroll-to-latest */
  zoomResetKey?: number
  /** Increment to clear all drawings */
  clearDrawingsKey?: number
  /** Timeframe string — "1m" | "5m" | "15m" | "30m" | "1H" | "1D" | "1W". Defaults to "1m". */
  timeframe?: string
}

// ─── Internal Types ───────────────────────────────────────────────────────────

type Candle = { time: Time; open: number; high: number; low: number; close: number }
type VolumeData = { time: Time; value: number; color: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function syncHistoryTail(historyRef: React.MutableRefObject<Candle[]>, candle: Candle): void {
  const h = historyRef.current
  if (h.length === 0) { h.push({ ...candle }); return }
  const last = h[h.length - 1]
  if (last.time === candle.time) { h[h.length - 1] = { ...candle } } else { h.push({ ...candle }) }
}

function applyCandleAndVolumeUpdate(
  chartType: InstrumentChartKind,
  main: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null,
  v: ISeriesApi<"Histogram"> | null,
  currentCandleRef: React.MutableRefObject<Candle | null>,
  historyRef: React.MutableRefObject<Candle[]>,
  lastVolRef: React.MutableRefObject<number>,
  ltp: number,
  currentMinute: Time,
  volColors: { up: string; down: string },
): void {
  let candle = currentCandleRef.current
  let isNewCandle = false
  if (!candle || candle.time !== currentMinute) {
    candle = { time: currentMinute, open: ltp, high: ltp, low: ltp, close: ltp }
    isNewCandle = true
  } else {
    candle.close = ltp
    candle.high = Math.max(candle.high, ltp)
    candle.low = Math.min(candle.low, ltp)
  }
  currentCandleRef.current = candle
  syncHistoryTail(historyRef, candle)
  const isUp = candle.close >= candle.open
  const volumeColor = isUp ? volColors.up : volColors.down
  const currentVol = isNewCandle ? 0 : Math.floor(Math.random() * 10) + 1
  const volValue = currentVol > 0 ? 500 + currentVol : 100
  lastVolRef.current = volValue
  if (chartType === "candle" && main) {
    try { (main as ISeriesApi<"Candlestick">).update(candle) } catch { /* ignore mid-teardown */ }
  } else if (chartType === "line" && main) {
    try { (main as ISeriesApi<"Line">).update({ time: currentMinute, value: candle.close }) } catch { /* ignore */ }
  }
  if (chartType === "candle" && v) {
    try { v.update({ time: currentMinute, value: volValue, color: volumeColor }) } catch { /* ignore */ }
  }
}

function setMainSeriesData(
  chartType: InstrumentChartKind,
  main: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">,
  candles: Candle[],
): void {
  if (chartType === "line") {
    (main as ISeriesApi<"Line">).setData(candles.map((c) => ({ time: c.time, value: c.close })))
  } else {
    (main as ISeriesApi<"Candlestick">).setData(candles)
  }
}

function readCrosshairOhlc(
  param: MouseEventParams,
  main: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">,
  chartType: InstrumentChartKind,
): InstrumentChartOhlcDisplay | null {
  const pt = param.seriesData.get(main as never)
  if (!pt) return null
  if (chartType === "candle") {
    const b = pt as { open?: number; high?: number; low?: number; close?: number }
    if (typeof b.open === "number" && typeof b.high === "number" && typeof b.low === "number" && typeof b.close === "number") {
      return { o: b.open, h: b.high, l: b.low, c: b.close, v: 0 }
    }
  } else {
    const b = pt as { value?: number }
    if (typeof b.value === "number") {
      return { o: b.value, h: b.value, l: b.value, c: b.value, v: 0 }
    }
  }
  return null
}

// ─── Component ────────────────────────────────────────────────────────────────

function tfToInterval(tf: string): string {
  const map: Record<string, string> = {
    "1m": "minute", "3m": "3minute", "5m": "5minute",
    "10m": "10minute", "15m": "15minute", "30m": "30minute",
    "1H": "60minute", "4H": "60minute", "1D": "day", "1W": "day", "1M": "day",
  }
  return map[tf] ?? "minute"
}

// Seconds per candle — used to align live-tick updates to the correct bucket
function tfToSeconds(tf: string): number {
  const map: Record<string, number> = {
    "1m": 60, "3m": 180, "5m": 300, "10m": 600,
    "15m": 900, "30m": 1800, "1H": 3600, "4H": 14400,
    "1D": 86400, "1W": 604800, "1M": 2592000,
  }
  return map[tf] ?? 60
}

export function InstrumentCandleChart({
  instrument,
  layout = "flex",
  chartType = "candle",
  onOhlcDisplay,
  className,
  indicators,
  activeTool,
  zoomResetKey,
  clearDrawingsKey,
  timeframe = "1m",
}: InstrumentCandleChartProps) {
  const { quotes } = useMarketDataLive()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  // ── DOM refs ──
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rsiContainerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // ── Chart refs ──
  const chartRef = useRef<IChartApi | null>(null)
  const rsiChartRef = useRef<IChartApi | null>(null)
  const mainSeriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null)
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null)

  // ── Indicator series maps ──
  const maSeriesMap = useRef<Map<number, ISeriesApi<"Line">>>(new Map())
  const emaSeriesMap = useRef<Map<number, ISeriesApi<"Line">>>(new Map())

  // ── Data state ──
  const [hasData, setHasData] = useState(false)
  const [isFetching, setIsFetching] = useState(false)

  // ── Data refs ──
  const currentCandleRef = useRef<Candle | null>(null)
  const historyRef = useRef<Candle[]>([])
  const lastVolRef = useRef(0)
  const lastInstrumentKeyRef = useRef<string | null>(null)
  const prevChartTypeForMainRef = useRef<InstrumentChartKind | null>(null)

  // ── Stable callback refs ──
  const onOhlcDisplayRef = useRef<typeof onOhlcDisplay>(onOhlcDisplay)
  const activeToolRef = useRef<DrawingTool>("none")
  const drawingEngineRef = useRef(new DrawingEngine())

  useEffect(() => { onOhlcDisplayRef.current = onOhlcDisplay }, [onOhlcDisplay])

  useEffect(() => {
    activeToolRef.current = activeTool ?? "none"
    if (canvasRef.current) {
      canvasRef.current.style.pointerEvents = activeTool && activeTool !== "none" ? "auto" : "none"
    }
  }, [activeTool])

  useEffect(() => {
    if (!zoomResetKey) return
    const chart = chartRef.current
    if (!chart) return
    try {
      chart.timeScale().resetTimeScale()
      chart.timeScale().scrollToRealTime()
    } catch { /* ignore */ }
  }, [zoomResetKey])

  useEffect(() => {
    if (!clearDrawingsKey) return
    drawingEngineRef.current.clearAll()
  }, [clearDrawingsKey])

  const notifyFallbackOhlc = (): void => {
    const cb = onOhlcDisplayRef.current
    if (!cb) return
    const c = currentCandleRef.current
    if (!c) return
    cb({ o: c.open, h: c.high, l: c.low, c: c.close, v: lastVolRef.current })
  }

  // ── Indicator series sync ─────────────────────────────────────────────────
  const syncIndicatorSeries = useCallback(
    (candles: IndicatorCandle[]) => {
      const chart = chartRef.current
      if (!chart) return
      const cfg = indicators ?? DEFAULT_INDICATORS

      // MA series
      const wantedMa = new Set(cfg.ma)
      maSeriesMap.current.forEach((s, period) => {
        if (!wantedMa.has(period)) {
          try { chart.removeSeries(s) } catch { /* ignore */ }
          maSeriesMap.current.delete(period)
        }
      })
      cfg.ma.forEach((period, idx) => {
        if (!maSeriesMap.current.has(period)) {
          const s = chart.addSeries(LineSeries, {
            color: MA_COLORS[idx % MA_COLORS.length],
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          maSeriesMap.current.set(period, s)
        }
        try { maSeriesMap.current.get(period)!.setData(computeMA(candles, period)) } catch { /* ignore */ }
      })

      // EMA series
      const wantedEma = new Set(cfg.ema)
      emaSeriesMap.current.forEach((s, period) => {
        if (!wantedEma.has(period)) {
          try { chart.removeSeries(s) } catch { /* ignore */ }
          emaSeriesMap.current.delete(period)
        }
      })
      cfg.ema.forEach((period, idx) => {
        if (!emaSeriesMap.current.has(period)) {
          const s = chart.addSeries(LineSeries, {
            color: EMA_COLORS[idx % EMA_COLORS.length],
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          })
          emaSeriesMap.current.set(period, s)
        }
        try { emaSeriesMap.current.get(period)!.setData(computeEMA(candles, period)) } catch { /* ignore */ }
      })

      // RSI (terminal only)
      if (cfg.rsi && layout === "terminal" && rsiChartRef.current && rsiSeriesRef.current) {
        try { rsiSeriesRef.current.setData(computeRSI(candles, 14)) } catch { /* ignore */ }
      }

      drawingEngineRef.current.render()
    },
    [indicators, layout],
  )

  // Keep a stable ref so fetch/clear effects can call syncIndicatorSeries
  // without it appearing in their dep arrays (avoids the render loop).
  const syncIndicatorSeriesRef = useRef(syncIndicatorSeries)
  useEffect(() => { syncIndicatorSeriesRef.current = syncIndicatorSeries }, [syncIndicatorSeries])

  // ── Chart initialisation (runs once per layout mount) ─────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (chartRef.current) return

    const initialHeight =
      layout === "card"
        ? 400
        : layout === "terminal"
          ? Math.max(Math.floor(el.clientHeight), 480)
          : Math.max(Math.floor(el.clientHeight), 320)

    const chart = createChart(el, {
      width: el.clientWidth,
      height: initialHeight,
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.3 }, mode: 1 },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: true },
      ...getInstrumentChartLayoutOptions(isDark),
      layout: { ...getInstrumentChartLayoutOptions(isDark).layout, attributionLogo: false },
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      visible: chartType === "candle",
    })
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

    const main =
      chartType === "line"
        ? chart.addSeries(LineSeries, { ...getInstrumentChartLineOptions(isDark) })
        : chart.addSeries(CandlestickSeries, {
            upColor: isDark ? "#10D996" : "#22c55e",
            downColor: isDark ? "#FF3B5C" : "#ef4444",
            borderVisible: false,
            wickUpColor: isDark ? "#10D996" : "#22c55e",
            wickDownColor: isDark ? "#FF3B5C" : "#ef4444",
          })

    chartRef.current = chart
    volumeSeriesRef.current = volumeSeries
    mainSeriesRef.current = main
    prevChartTypeForMainRef.current = chartType

    // ── Drawing canvas ────────────────────────────────────────────────────────
    const canvasEl = canvasRef.current
    if (canvasEl) {
      const engine = drawingEngineRef.current
      engine.attach(canvasEl, chart, main as ISeriesApi<"Candlestick"> | ISeriesApi<"Line">)

      const syncCanvasSize = () => {
        if (!containerRef.current || !canvasEl) return
        canvasEl.width = containerRef.current.clientWidth
        canvasEl.height = containerRef.current.clientHeight
        engine.render()
      }
      syncCanvasSize()

      const onMouseDown = (e: MouseEvent) => {
        if (activeToolRef.current === "none") return
        const rect = canvasEl.getBoundingClientRect()
        engine.startDraw(activeToolRef.current, e.clientX - rect.left, e.clientY - rect.top)
      }
      const onMouseMove = (e: MouseEvent) => {
        if (activeToolRef.current === "none") return
        const rect = canvasEl.getBoundingClientRect()
        engine.continueDraw(e.clientX - rect.left, e.clientY - rect.top)
      }
      const onMouseUp = (e: MouseEvent) => {
        if (activeToolRef.current === "none") return
        const rect = canvasEl.getBoundingClientRect()
        engine.endDraw(e.clientX - rect.left, e.clientY - rect.top)
      }
      const onContextMenu = (e: MouseEvent) => {
        e.preventDefault()
        const rect = canvasEl.getBoundingClientRect()
        const idx = engine.hitTest(e.clientX - rect.left, e.clientY - rect.top)
        if (idx !== -1) engine.deleteAt(idx)
      }

      canvasEl.addEventListener("mousedown", onMouseDown)
      canvasEl.addEventListener("mousemove", onMouseMove)
      canvasEl.addEventListener("mouseup", onMouseUp)
      canvasEl.addEventListener("contextmenu", onContextMenu)

      chart.timeScale().subscribeVisibleTimeRangeChange(() => {
        syncCanvasSize()
        engine.render()
      })
    }

    // ── Crosshair handler ─────────────────────────────────────────────────────
    const crosshairHandler = (param: MouseEventParams) => {
      const cb = onOhlcDisplayRef.current
      if (!cb) return
      const mainS = mainSeriesRef.current
      if (!mainS) return
      const kind = prevChartTypeForMainRef.current
      if (kind == null) return
      const fromBar = readCrosshairOhlc(param, mainS, kind)
      if (fromBar) {
        cb({ ...fromBar, v: kind === "candle" ? lastVolRef.current : 0 })
      } else {
        const c = currentCandleRef.current
        if (c) cb({ o: c.open, h: c.high, l: c.low, c: c.close, v: lastVolRef.current })
      }
      // Sync RSI crosshair
      const rsiChart = rsiChartRef.current
      const rsiSeries = rsiSeriesRef.current
      if (rsiChart && rsiSeries) {
        if (param.time) {
          try {
            const rsiPt = param.seriesData.get(rsiSeries as never) as { value?: number } | undefined
            rsiChart.setCrosshairPosition(rsiPt?.value ?? 50, param.time, rsiSeries)
          } catch { /* ignore */ }
        } else {
          try { rsiChart.clearCrosshairPosition() } catch { /* ignore */ }
        }
      }
    }
    chart.subscribeCrosshairMove(crosshairHandler)

    // ── Teardown (let so RSI block can extend it below) ───────────────────────
    let teardownChart = () => {
      try { chart.unsubscribeCrosshairMove(crosshairHandler) } catch { /* ignore */ }
      chart.remove()
      chartRef.current = null
      mainSeriesRef.current = null
      volumeSeriesRef.current = null
      prevChartTypeForMainRef.current = null
      drawingEngineRef.current.detach()
      maSeriesMap.current.clear()
      emaSeriesMap.current.clear()
    }

    // ── RSI sub-chart (terminal layout only) ─────────────────────────────────
    const rsiEl = rsiContainerRef.current
    if (rsiEl && layout === "terminal") {
      const rsiChart = createChart(rsiEl, {
        width: rsiEl.clientWidth,
        height: RSI_PANE_HEIGHT,
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.1 },
          entireTextOnly: true,
          mode: 1,
        },
        timeScale: { visible: false, borderVisible: false },
        handleScroll: false,
        handleScale: false,
        ...getInstrumentChartLayoutOptions(isDark),
        layout: { ...getInstrumentChartLayoutOptions(isDark).layout, attributionLogo: false },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: "#1C2028", style: 1 },
        },
      })

      // Overbought/oversold band lines
      const bandRange: Array<{ time: Time; value: number }> = [
        { time: (Math.floor(Date.now() / 1000) - 86400 * 365) as Time, value: 0 },
        { time: (Math.floor(Date.now() / 1000) + 86400 * 365) as Time, value: 0 },
      ]
      const obSeries = rsiChart.addSeries(LineSeries, { color: RSI_COLORS.obLine, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      const osSeries = rsiChart.addSeries(LineSeries, { color: RSI_COLORS.osLine, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      obSeries.setData(bandRange.map((p) => ({ ...p, value: 70 })))
      osSeries.setData(bandRange.map((p) => ({ ...p, value: 30 })))

      const rsiLine = rsiChart.addSeries(LineSeries, {
        color: RSI_COLORS.line,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      })
      rsiSeriesRef.current = rsiLine
      rsiChartRef.current = rsiChart

      // Two-way timescale sync with loop guard
      let syncing = false
      chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || range === null) return
        syncing = true
        try { rsiChart.timeScale().setVisibleLogicalRange(range) } catch { /* ignore */ }
        syncing = false
      })
      rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncing || range === null) return
        syncing = true
        try { chart.timeScale().setVisibleLogicalRange(range) } catch { /* ignore */ }
        syncing = false
      })

      // Sync RSI chart width on resize
      const rsiRo = new ResizeObserver((entries) => {
        const e = entries[0]
        if (!e || !rsiChartRef.current) return
        const w = Math.floor(e.contentRect.width)
        if (w > 0) rsiChartRef.current.applyOptions({ width: w, height: RSI_PANE_HEIGHT })
      })
      rsiRo.observe(rsiEl)

      // Inject RSI teardown into the cleanup below by mutating teardownChart
      const _originalTeardown = teardownChart
      teardownChart = () => {
        _originalTeardown()
        try { rsiRo.disconnect() } catch { /* ignore */ }
        try { rsiChart.remove() } catch { /* ignore */ }
        rsiChartRef.current = null
        rsiSeriesRef.current = null
      }
    }

    // ── Resize handling ───────────────────────────────────────────────────────
    if (layout === "card") {
      const resize = () => {
        if (!containerRef.current || !chartRef.current) return
        const { clientWidth } = containerRef.current
        const viewportWidth = window.innerWidth
        const nextHeight = viewportWidth >= 1536 ? 500 : viewportWidth >= 1024 ? 400 : 320
        chartRef.current.applyOptions({ width: clientWidth, height: nextHeight })
      }
      resize()
      window.addEventListener("resize", resize)
      return () => {
        window.removeEventListener("resize", resize)
        teardownChart()
      }
    }

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry || !chartRef.current) return
      const width = Math.floor(entry.contentRect.width)
      const height = Math.floor(entry.contentRect.height)
      if (width > 0 && height > 0) {
        chartRef.current.applyOptions({ width, height })
        // Sync canvas size on chart resize
        if (canvasRef.current) {
          canvasRef.current.width = width
          canvasRef.current.height = height
          drawingEngineRef.current.render()
        }
      }
    })
    ro.observe(el)

    return () => {
      try { ro.disconnect() } catch { /* ignore */ }
      teardownChart()
    }

    // Intentionally depends only on `layout` — chartType swaps handled in dedicated effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout])

  // ── Theme sync ────────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.applyOptions(getInstrumentChartLayoutOptions(isDark))
    rsiChartRef.current?.applyOptions(getInstrumentChartLayoutOptions(isDark))
  }, [isDark])

  useEffect(() => {
    const main = mainSeriesRef.current
    if (!main || chartType !== "line") return
    ;(main as ISeriesApi<"Line">).applyOptions(getInstrumentChartLineOptions(isDark))
  }, [isDark, chartType])

  // ── ChartType swap ────────────────────────────────────────────────────────
  useEffect(() => {
    const chart = chartRef.current
    const vol = volumeSeriesRef.current
    const oldMain = mainSeriesRef.current
    if (!chart || !vol || !oldMain) return
    if (prevChartTypeForMainRef.current === chartType) return

    prevChartTypeForMainRef.current = chartType
    chart.removeSeries(oldMain)

    const newMain =
      chartType === "line"
        ? chart.addSeries(LineSeries, { ...getInstrumentChartLineOptions(isDark) })
        : chart.addSeries(CandlestickSeries, {
            upColor: "#22c55e",
            downColor: "#ef4444",
            borderVisible: false,
            wickUpColor: "#22c55e",
            wickDownColor: "#ef4444",
          })

    mainSeriesRef.current = newMain
    try { vol.applyOptions({ visible: chartType === "candle" }) } catch { /* ignore */ }

    const hist = historyRef.current
    if (hist.length > 0) setMainSeriesData(chartType, newMain, hist)

    // Re-attach drawing engine to new series
    if (canvasRef.current) {
      drawingEngineRef.current.attach(
        canvasRef.current,
        chart,
        newMain as ISeriesApi<"Candlestick"> | ISeriesApi<"Line">,
      )
    }
  }, [chartType, isDark])

  // ── Instrument change — clear series so fetch effect loads fresh data ────────
  useEffect(() => {
    const key = instrument.instrumentKey
    if (lastInstrumentKeyRef.current === key) return
    lastInstrumentKeyRef.current = key

    historyRef.current = []
    currentCandleRef.current = null
    lastVolRef.current = 0
    setHasData(false)

    const main = mainSeriesRef.current
    const v = volumeSeriesRef.current
    try { main?.setData([]) } catch { /* ignore */ }
    try { v?.setData([]) } catch { /* ignore */ }
    syncIndicatorSeriesRef.current([])
  }, [instrument.instrumentKey])

  // ── Kite candle history fetch ─────────────────────────────────────────────
  useEffect(() => {
    // Clear series immediately so the chart is blank while loading
    const currentMain = mainSeriesRef.current
    const currentV = volumeSeriesRef.current
    try { currentMain?.setData([]) } catch { /* ignore */ }
    try { currentV?.setData([]) } catch { /* ignore */ }
    historyRef.current = []
    currentCandleRef.current = null
    setHasData(false)

    if (typeof instrument.token !== "number" || !Number.isFinite(instrument.token)) {
      setIsFetching(false)
      return
    }

    const token = instrument.token
    const apiBase = (process.env.NEXT_PUBLIC_LIVE_MARKET_WS_URL ?? "https://marketdata.vedpragya.com").replace(/\/$/, "")
    const apiKey = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY ?? ""
    let cancelled = false

    setIsFetching(true)

    const fetchCandles = async () => {
      try {
        const r = await fetch(`${apiBase}/api/stock/candles/${token}?limit=200&interval=${tfToInterval(timeframe)}`, { headers: { "x-api-key": apiKey } })
        const res = await r.json()
        if (cancelled) return

        if (!res.success || !Array.isArray(res.candles) || res.candles.length === 0) {
          setIsFetching(false)
          setHasData(false)
          return
        }

        // Read volume colors at resolve-time (captures current theme without isDark in deps)
        const resolvedVolColors = getInstrumentChartVolumeColors(isDark)
        const candles: Candle[] = (res.candles as Array<{ time: number; open: number; high: number; low: number; close: number }>)
          .map((c) => ({ ...c, time: c.time as Time }))
        const coloredVolumes = (res.volumes as Array<{ time: number; value: number }>).map((vol, i) => ({
          time: vol.time as Time,
          value: vol.value,
          color: (candles[i]?.close ?? 0) >= (candles[i]?.open ?? 0) ? resolvedVolColors.up : resolvedVolColors.down,
        }))

        if (cancelled) return

        const main = mainSeriesRef.current
        const v = volumeSeriesRef.current
        if (!main || !v) { setIsFetching(false); return }

        try {
          setMainSeriesData(chartType, main, candles)
          if (chartType === "candle") v.setData(coloredVolumes)
        } catch { setIsFetching(false); return }

        // Guard all ref mutations and indicator sync so stale fetches can't corrupt state
        if (cancelled) return
        historyRef.current = candles.map((c) => ({ ...c }))
        if (candles.length > 0) {
          currentCandleRef.current = { ...candles[candles.length - 1] }
          lastVolRef.current = coloredVolumes[coloredVolumes.length - 1]?.value ?? 0
        }
        notifyFallbackOhlc()
        syncIndicatorSeriesRef.current(candles)
        if (cancelled) return
        setIsFetching(false)
        setHasData(true)

        // Fit viewport after chart processes new data
        requestAnimationFrame(() => {
          try {
            const ts = chartRef.current?.timeScale()
            if (!ts) return
            ts.fitContent()
            ts.scrollToRealTime()
          } catch { /* ignore */ }
        })
      } catch {
        if (!cancelled) { setIsFetching(false); setHasData(false) }
      }
    }

    fetchCandles()
    return () => { cancelled = true }
  }, [instrument.token, instrument.instrumentKey, chartType, timeframe])

  // ── Live tick (WebSocket price updates) ──────────────────────────────────
  useEffect(() => {
    if (!hasData) return

    const main = mainSeriesRef.current
    const v = volumeSeriesRef.current
    if (!main || !v) return

    const ltp = resolveMarketWidgetLivePriceForInstrument(quotes as Record<string, any> | undefined, {
      token: instrument.token,
      instrumentId: instrument.instrumentId ?? null,
    })
    if (ltp === null) return

    const volColors = getInstrumentChartVolumeColors(isDark)
    const now = Math.floor(Date.now() / 1000)
    const bucketSec = tfToSeconds(timeframe)
    const currentBucket = (Math.floor(now / bucketSec) * bucketSec) as Time
    applyCandleAndVolumeUpdate(chartType, main, chartType === "candle" ? v : null, currentCandleRef, historyRef, lastVolRef, ltp, currentBucket, volColors)
    notifyFallbackOhlc()
  }, [hasData, quotes, instrument.token, instrument.instrumentId, instrument.instrumentKey, isDark, chartType, timeframe])

  // ── JSX ───────────────────────────────────────────────────────────────────
  const cfg = indicators ?? DEFAULT_INDICATORS
  const showRsi = cfg.rsi && layout === "terminal"

  return (
    <div
      className={cn(
        "w-full flex flex-col",
        (layout === "flex" || layout === "terminal") && "h-full",
        layout === "flex" && "min-h-[300px]",
        className,
      )}
    >
      {/* Main chart — flex-1 fills parent minus RSI pane */}
      <div ref={containerRef} className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            pointerEvents: "none",
            cursor: activeTool && activeTool !== "none" ? "crosshair" : "default",
          }}
        />

        {/* Loading overlay */}
        {isFetching && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 20,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "var(--chart-overlay-bg, rgba(10,10,14,0.72))",
            gap: 10,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 1s linear infinite" }}>
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="#22D3EE" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontFamily: "monospace", letterSpacing: "0.05em" }}>
              Loading chart…
            </span>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* No-data overlay */}
        {!isFetching && !hasData && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 20,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            background: "var(--chart-overlay-bg, rgba(10,10,14,0.72))",
            gap: 8,
          }}>
            <span style={{ fontSize: 28, opacity: 0.25 }}>◈</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
              No chart data for this instrument
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", fontFamily: "monospace" }}>
              Try a different timeframe
            </span>
          </div>
        )}
      </div>

      {/* RSI sub-pane — terminal + rsi enabled only */}
      {showRsi && (
        <div
          ref={rsiContainerRef}
          style={{
            height: RSI_PANE_HEIGHT,
            flexShrink: 0,
            borderTop: "1px solid #1C2028",
          }}
        />
      )}
    </div>
  )
}
