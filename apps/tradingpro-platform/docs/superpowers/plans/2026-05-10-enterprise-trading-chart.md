# Enterprise Trading Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `InstrumentCandleChart` with MA/EMA overlays, RSI sub-pane, trend-line + horizontal-level drawing tools, and add indicator bar + drawing toolbar to both desktop (`TerminalChartPane`) and mobile (`MobileTradingChartPanel`).

**Architecture:** Two new pure-logic files handle indicator math and drawing state; `instrument-candle-chart.tsx` gains new props and renders indicator `LineSeries` on the main chart plus a synced RSI `createChart()` below; both wrappers grow a toolbar that owns UI state and passes it down as props.

**Tech Stack:** `lightweight-charts` v5 (already installed), React refs/effects, HTML5 Canvas overlay for drawings.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `components/trading/widgets/instrument-chart-indicators.ts` | Pure MA/EMA/RSI math — no React |
| **Create** | `components/trading/widgets/instrument-chart-drawing.ts` | DrawingEngine class — canvas + hit-test |
| **Modify** | `components/trading/widgets/instrument-chart-theme.ts` | Add indicator colour palette |
| **Modify** | `components/trading/widgets/instrument-candle-chart.tsx` | New props + indicator series + RSI chart + canvas overlay |
| **Modify** | `components/trading/widgets/terminal-chart-pane.tsx` | Indicator bar, drawing toolbar, fullscreen, zoom reset |
| **Modify** | `components/trading/widgets/mobile-trading-chart-panel.tsx` | Enable indicator + draw buttons, compact pills |
| **Create** | `tests/trading/instrument-chart-indicators.test.ts` | MA/EMA/RSI math tests |

---

## Task 1 — Indicator Math Utility

**Files:**
- Create: `components/trading/widgets/instrument-chart-indicators.ts`
- Test: `tests/trading/instrument-chart-indicators.test.ts`

- [ ] **Step 1.1 — Write the failing test first**

Create `tests/trading/instrument-chart-indicators.test.ts`:

```typescript
import {
  computeMA,
  computeEMA,
  computeRSI,
  type IndicatorCandle,
} from "@/components/trading/widgets/instrument-chart-indicators"

function makeCandles(closes: number[]): IndicatorCandle[] {
  return closes.map((c, i) => ({ time: (1000 + i * 60) as any, open: c, high: c, low: c, close: c }))
}

describe("computeMA", () => {
  it("returns empty array when candles < period", () => {
    expect(computeMA(makeCandles([1, 2]), 5)).toEqual([])
  })

  it("computes correct 3-period MA", () => {
    const result = computeMA(makeCandles([10, 20, 30, 40]), 3)
    expect(result).toHaveLength(2)
    expect(result[0].value).toBeCloseTo(20, 5)
    expect(result[1].value).toBeCloseTo(30, 5)
  })
})

describe("computeEMA", () => {
  it("returns empty array when candles < period", () => {
    expect(computeEMA(makeCandles([1, 2]), 5)).toEqual([])
  })

  it("first EMA value equals SMA of first `period` bars", () => {
    const result = computeEMA(makeCandles([10, 20, 30, 40]), 3)
    expect(result[0].value).toBeCloseTo(20, 5)
  })

  it("subsequent EMA applies smoothing factor", () => {
    const result = computeEMA(makeCandles([10, 20, 30, 40]), 3)
    // k = 2/(3+1) = 0.5; ema1 = 40*0.5 + 20*0.5 = 30
    expect(result[1].value).toBeCloseTo(30, 5)
  })
})

describe("computeRSI", () => {
  it("returns empty array when candles <= period", () => {
    expect(computeRSI(makeCandles([1, 2, 3]), 14)).toEqual([])
  })

  it("returns RSI=100 for all-gain sequence", () => {
    const candles = makeCandles([...Array(15)].map((_, i) => i + 1))
    const result = computeRSI(candles, 14)
    expect(result[0].value).toBeCloseTo(100, 0)
  })

  it("returns RSI=0 for all-loss sequence", () => {
    const candles = makeCandles([...Array(15)].map((_, i) => 15 - i))
    const result = computeRSI(candles, 14)
    expect(result[0].value).toBeCloseTo(0, 0)
  })
})
```

- [ ] **Step 1.2 — Run test to confirm failure**

```bash
cd tradingpro-platform
npx jest --config jest.config.cjs tests/trading/instrument-chart-indicators.test.ts --forceExit
```
Expected: `Cannot find module '@/components/trading/widgets/instrument-chart-indicators'`

- [ ] **Step 1.3 — Implement `instrument-chart-indicators.ts`**

Create `components/trading/widgets/instrument-chart-indicators.ts`:

```typescript
/**
 * File:        components/trading/widgets/instrument-chart-indicators.ts
 * Module:      Trading · Chart Indicators
 * Purpose:     Pure math functions for MA, EMA, and RSI indicators — no React, no side effects.
 *
 * Exports:
 *   - IndicatorCandle                            — minimal candle shape required by all functions
 *   - computeMA(candles, period) → LineData[]    — simple moving average of close prices
 *   - computeEMA(candles, period) → LineData[]   — exponential moving average (Wilder smoothing k=2/(n+1))
 *   - computeRSI(candles, period) → LineData[]   — Wilder RSI, values 0–100
 *
 * Depends on:
 *   - lightweight-charts — LineData type only (no runtime import)
 *
 * Side-effects:
 *   - none
 *
 * Key invariants:
 *   - All functions return [] when candles.length < minimum required (period or period+1 for RSI)
 *   - RSI avgLoss=0 edge case returns value 100 (no losses → overbought)
 *   - time values are copied verbatim from input candles (no conversion)
 *
 * Read order:
 *   1. IndicatorCandle — input shape
 *   2. computeMA — simplest, reference implementation
 *   3. computeEMA — builds on MA seed
 *   4. computeRSI — two-pass Wilder smoothing
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-10
 */

import type { LineData, Time } from "lightweight-charts"

export type IndicatorCandle = {
  time: Time
  open: number
  high: number
  low: number
  close: number
}

/** Simple moving average of close prices. Returns [] when candles.length < period. */
export function computeMA(candles: IndicatorCandle[], period: number): LineData[] {
  if (candles.length < period) return []
  const result: LineData[] = []
  let windowSum = candles.slice(0, period).reduce((s, c) => s + c.close, 0)
  result.push({ time: candles[period - 1].time, value: windowSum / period })
  for (let i = period; i < candles.length; i++) {
    windowSum += candles[i].close - candles[i - period].close
    result.push({ time: candles[i].time, value: windowSum / period })
  }
  return result
}

/** Exponential moving average. Seed = SMA of first `period` bars; k = 2/(period+1). Returns [] when candles.length < period. */
export function computeEMA(candles: IndicatorCandle[], period: number): LineData[] {
  if (candles.length < period) return []
  const k = 2 / (period + 1)
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  const result: LineData[] = [{ time: candles[period - 1].time, value: ema }]
  for (let i = period; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k)
    result.push({ time: candles[i].time, value: ema })
  }
  return result
}

/**
 * Wilder RSI (period-bar). Returns [] when candles.length <= period.
 * Uses Wilder smoothing: avgGain = (prevAvgGain*(period-1) + gain) / period.
 */
export function computeRSI(candles: IndicatorCandle[], period: number): LineData[] {
  if (candles.length <= period) return []

  const gains: number[] = []
  const losses: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close
    gains.push(diff > 0 ? diff : 0)
    losses.push(diff < 0 ? -diff : 0)
  }

  let avgGain = gains.slice(0, period).reduce((s, v) => s + v, 0) / period
  let avgLoss = losses.slice(0, period).reduce((s, v) => s + v, 0) / period

  const result: LineData[] = []

  const pushRsi = (time: Time, ag: number, al: number) => {
    const rsi = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
    result.push({ time, value: rsi })
  }

  pushRsi(candles[period].time, avgGain, avgLoss)

  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period
    pushRsi(candles[i + 1].time, avgGain, avgLoss)
  }

  return result
}
```

- [ ] **Step 1.4 — Run tests to confirm they pass**

```bash
npx jest --config jest.config.cjs tests/trading/instrument-chart-indicators.test.ts --forceExit
```
Expected: all 6 tests pass.

- [ ] **Step 1.5 — Commit**

```bash
git add components/trading/widgets/instrument-chart-indicators.ts tests/trading/instrument-chart-indicators.test.ts
git commit -m "feat(chart): add MA/EMA/RSI indicator math utilities with tests"
```

---

## Task 2 — Drawing Engine

**Files:**
- Create: `components/trading/widgets/instrument-chart-drawing.ts`

- [ ] **Step 2.1 — Create `instrument-chart-drawing.ts`**

```typescript
/**
 * File:        components/trading/widgets/instrument-chart-drawing.ts
 * Module:      Trading · Chart Drawing
 * Purpose:     Manages user-drawn chart annotations (trend lines, horizontal levels) on a
 *              canvas overlay. Converts between pixel coordinates and price/time using the
 *              lightweight-charts API.
 *
 * Exports:
 *   - DrawingTool                               — "none" | "trendline" | "horizontal"
 *   - TrendLineDrawing, HorizontalDrawing       — drawing data shapes
 *   - Drawing                                   — union type
 *   - DrawingEngine                             — class: attach, startDraw, continueDraw, endDraw, render, hitTest, deleteAt, clearAll
 *
 * Depends on:
 *   - lightweight-charts — IChartApi, ISeriesApi for coordinate conversion
 *
 * Side-effects:
 *   - Writes to a provided HTMLCanvasElement 2D context
 *
 * Key invariants:
 *   - Coordinate conversion returns null when time/price is out of visible range — skip rendering
 *   - hit-test tolerance is ±6px from the drawn line
 *   - render() is safe to call at any time (no draw in progress required)
 *
 * Read order:
 *   1. DrawingTool / Drawing types
 *   2. DrawingEngine.attach()
 *   3. DrawingEngine.startDraw / continueDraw / endDraw
 *   4. DrawingEngine.render()
 *
 * Author:      BharatERP
 * Last-updated: 2026-05-10
 */

import type { IChartApi, ISeriesApi, Time } from "lightweight-charts"

export type DrawingTool = "none" | "trendline" | "horizontal"

export type PriceTimePoint = { price: number; time: number }

export type TrendLineDrawing = {
  kind: "trendline"
  start: PriceTimePoint
  end: PriceTimePoint
  color: string
}

export type HorizontalDrawing = {
  kind: "horizontal"
  price: number
  color: string
}

export type Drawing = TrendLineDrawing | HorizontalDrawing

const TREND_COLOR = "#fbbf24"
const HORIZ_COLOR = "#3b82f6"
const HIT_TOLERANCE = 6

function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(px - x1, py - y1)
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

export class DrawingEngine {
  private drawings: Drawing[] = []
  private inProgress: { tool: DrawingTool; start: PriceTimePoint } | null = null
  private canvas: HTMLCanvasElement | null = null
  private chart: IChartApi | null = null
  private series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null = null

  attach(
    canvas: HTMLCanvasElement,
    chart: IChartApi,
    series: ISeriesApi<"Candlestick"> | ISeriesApi<"Line">,
  ): void {
    this.canvas = canvas
    this.chart = chart
    this.series = series
  }

  detach(): void {
    this.canvas = null
    this.chart = null
    this.series = null
  }

  private pixelToPoint(px: number, py: number): PriceTimePoint | null {
    if (!this.chart || !this.series) return null
    const time = this.chart.timeScale().coordinateToTime(px)
    const price = this.series.coordinateToPrice(py)
    if (time == null || price == null) return null
    return { price, time: time as number }
  }

  startDraw(tool: DrawingTool, px: number, py: number): void {
    if (tool === "none") return
    const pt = this.pixelToPoint(px, py)
    if (!pt) return
    this.inProgress = { tool, start: pt }
  }

  continueDraw(px: number, py: number): void {
    if (!this.inProgress) return
    this.render(px, py)
  }

  endDraw(px: number, py: number): void {
    if (!this.inProgress) return
    const { tool, start } = this.inProgress
    this.inProgress = null

    if (tool === "trendline") {
      const end = this.pixelToPoint(px, py)
      if (!end) { this.render(); return }
      this.drawings.push({ kind: "trendline", start, end, color: TREND_COLOR })
    } else if (tool === "horizontal") {
      this.drawings.push({ kind: "horizontal", price: start.price, color: HORIZ_COLOR })
    }
    this.render()
  }

  /** Re-render all committed drawings, plus optional in-progress line ending at (tempX, tempY). */
  render(tempX?: number, tempY?: number): void {
    const canvas = this.canvas
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (const d of this.drawings) {
      if (d.kind === "trendline") {
        const x1 = this.chart!.timeScale().timeToCoordinate(d.start.time as Time)
        const y1 = this.series!.priceToCoordinate(d.start.price)
        const x2 = this.chart!.timeScale().timeToCoordinate(d.end.time as Time)
        const y2 = this.series!.priceToCoordinate(d.end.price)
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue
        this.drawLine(ctx, x1, y1, x2, y2, d.color, false)
        this.drawEndpoint(ctx, x1, y1, d.color)
        this.drawEndpoint(ctx, x2, y2, d.color)
      } else {
        const y = this.series!.priceToCoordinate(d.price)
        if (y == null) continue
        this.drawHorizontal(ctx, y, d.price, d.color)
      }
    }

    if (this.inProgress && tempX != null && tempY != null) {
      const { tool, start } = this.inProgress
      const x1 = this.chart!.timeScale().timeToCoordinate(start.time as Time)
      const y1 = this.series!.priceToCoordinate(start.price)
      if (x1 != null && y1 != null) {
        if (tool === "trendline") {
          this.drawLine(ctx, x1, y1, tempX, tempY, TREND_COLOR, true)
        } else if (tool === "horizontal") {
          this.drawHorizontal(ctx, y1, start.price, HORIZ_COLOR)
        }
      }
    }
  }

  private drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, dashed: boolean): void {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.setLineDash(dashed ? [5, 3] : [])
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.restore()
  }

  private drawHorizontal(ctx: CanvasRenderingContext2D, y: number, price: number, color: string): void {
    const w = this.canvas!.width
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([3, 4])
    ctx.globalAlpha = 0.75
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w - 64, y) // stop before price scale (~64px)
    ctx.stroke()
    // Price label
    ctx.fillStyle = color
    ctx.globalAlpha = 0.9
    ctx.font = "9px 'IBM Plex Mono', monospace"
    ctx.fillText(price.toFixed(2), 6, y - 3)
    ctx.restore()
  }

  private drawEndpoint(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.save()
    ctx.fillStyle = color
    ctx.globalAlpha = 0.9
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  /** Returns index of the drawing hit at pixel (px, py), or -1 if none. */
  hitTest(px: number, py: number): number {
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i]
      if (d.kind === "trendline") {
        const x1 = this.chart!.timeScale().timeToCoordinate(d.start.time as Time)
        const y1 = this.series!.priceToCoordinate(d.start.price)
        const x2 = this.chart!.timeScale().timeToCoordinate(d.end.time as Time)
        const y2 = this.series!.priceToCoordinate(d.end.price)
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue
        if (pointToSegmentDist(px, py, x1, y1, x2, y2) <= HIT_TOLERANCE) return i
      } else {
        const y = this.series!.priceToCoordinate(d.price)
        if (y == null) continue
        if (Math.abs(py - y) <= HIT_TOLERANCE) return i
      }
    }
    return -1
  }

  deleteAt(index: number): void {
    this.drawings.splice(index, 1)
    this.render()
  }

  clearAll(): void {
    this.drawings = []
    this.inProgress = null
    this.render()
  }

  getDrawings(): readonly Drawing[] {
    return this.drawings
  }
}
```

- [ ] **Step 2.2 — Run type check**

```bash
cd tradingpro-platform && npm run type-check 2>&1 | grep "instrument-chart-drawing" | head -20
```
Expected: no errors mentioning this file.

- [ ] **Step 2.3 — Commit**

```bash
git add components/trading/widgets/instrument-chart-drawing.ts
git commit -m "feat(chart): add DrawingEngine for canvas-based trend line and horizontal level annotations"
```

---

## Task 3 — Theme Indicator Colors

**Files:**
- Modify: `components/trading/widgets/instrument-chart-theme.ts`

- [ ] **Step 3.1 — Add indicator palette exports**

In `components/trading/widgets/instrument-chart-theme.ts`, append after the existing `getInstrumentChartLineOptions` function:

```typescript
/** Colour for each MA period. Index 0 = first period in config, cycling if needed. */
export const MA_COLORS = ["#f59e0b", "#a78bfa", "#fb923c", "#38bdf8"] as const

/** Colour for each EMA period. */
export const EMA_COLORS = ["#34d399", "#f472b6", "#facc15", "#60a5fa"] as const

/** RSI line colour and band fills. */
export const RSI_COLORS = {
  line: "#3b82f6",
  obZone: "rgba(239,68,68,0.05)",   // overbought (70+)
  osZone: "rgba(34,197,94,0.05)",   // oversold (30-)
  obLine: "rgba(239,68,68,0.4)",
  osLine: "rgba(34,197,94,0.4)",
  midLine: "#1e293b",
} as const

export const RSI_PANE_HEIGHT = 88 // px — fixed height for the RSI sub-chart
```

- [ ] **Step 3.2 — Type check**

```bash
npm run type-check 2>&1 | grep "instrument-chart-theme" | head -10
```
Expected: no errors.

- [ ] **Step 3.3 — Commit**

```bash
git add components/trading/widgets/instrument-chart-theme.ts
git commit -m "feat(chart): add indicator colour palette and RSI pane height constant"
```

---

## Task 4 — Extend `InstrumentCandleChart` — Props + Indicator Series + RSI Pane

**Files:**
- Modify: `components/trading/widgets/instrument-candle-chart.tsx`

This task rewrites the component in three additive passes. Read the full current file before starting.

### 4a — New prop types and refs

- [ ] **Step 4a.1 — Add new imports and types at top of file**

After the existing imports block (line 36), add:

```typescript
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
import {
  MA_COLORS,
  EMA_COLORS,
  RSI_COLORS,
  RSI_PANE_HEIGHT,
} from "@/components/trading/widgets/instrument-chart-theme"
```

- [ ] **Step 4a.2 — Add `ChartIndicatorConfig` type and extend `InstrumentCandleChartProps`**

After the existing `InstrumentCandleChartProps` type (line 57–65), add `ChartIndicatorConfig` and update the props type:

```typescript
export type ChartIndicatorConfig = {
  ma: number[]   // MA periods, e.g. [9, 20]
  ema: number[]  // EMA periods, e.g. [21]
  rsi: boolean   // show RSI sub-pane (terminal layout only)
}

export const DEFAULT_INDICATORS: ChartIndicatorConfig = {
  ma: [9, 20],
  ema: [21],
  rsi: true,
}
```

Then extend `InstrumentCandleChartProps` to add three new optional fields **after** the existing `className` field:

```typescript
  /** Indicator config — defaults to DEFAULT_INDICATORS when undefined */
  indicators?: ChartIndicatorConfig
  /** Active drawing tool — parent controls, chart responds */
  activeTool?: DrawingTool
  /** Increment this number to trigger a zoom-reset + scroll-to-latest */
  zoomResetKey?: number
```

- [ ] **Step 4a.3 — Add new refs inside the component function body**

After the existing `const prevChartTypeForMainRef = ...` line, add:

```typescript
  // Indicator series refs — keyed by period
  const maSeriesMap = useRef<Map<number, ISeriesApi<"Line">>>(new Map())
  const emaSeriesMap = useRef<Map<number, ISeriesApi<"Line">>>(new Map())
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null)
  // RSI chart — separate createChart() instance synced to main
  const rsiContainerRef = useRef<HTMLDivElement | null>(null)
  const rsiChartRef = useRef<IChartApi | null>(null)
  // Drawing overlay
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingEngineRef = useRef(new DrawingEngine())
  // Stable ref for activeTool so event handlers always read latest value
  const activeToolRef = useRef<DrawingTool>("none")
```

- [ ] **Step 4a.4 — Add a useEffect to keep `activeToolRef` in sync**

After the existing `useEffect(() => { onOhlcDisplayRef.current = onOhlcDisplay }, [onOhlcDisplay])` block:

```typescript
  useEffect(() => {
    activeToolRef.current = activeTool ?? "none"
    // Update canvas pointer-events based on drawing mode
    if (canvasRef.current) {
      canvasRef.current.style.pointerEvents = activeTool && activeTool !== "none" ? "auto" : "none"
    }
  }, [activeTool])
```

### 4b — Indicator series management effect

- [ ] **Step 4b.1 — Add `syncIndicatorSeries` helper inside the component**

Add this function right before the `return` statement (after all useEffects):

```typescript
  // Helper: sync MA/EMA series on chart to match the current indicators config.
  // Called after history updates. Idempotent — series that already exist are reused.
  const syncIndicatorSeries = React.useCallback(
    (candles: IndicatorCandle[]) => {
      const chart = chartRef.current
      if (!chart) return
      const cfg = indicators ?? DEFAULT_INDICATORS

      // ── MA series ──
      const wantedMa = new Set(cfg.ma)
      // Remove series for periods no longer in config
      for (const [period, s] of maSeriesMap.current) {
        if (!wantedMa.has(period)) {
          try { chart.removeSeries(s) } catch { /* ignore */ }
          maSeriesMap.current.delete(period)
        }
      }
      // Add / update series for wanted periods
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
        const data = computeMA(candles, period)
        maSeriesMap.current.get(period)!.setData(data)
      })

      // ── EMA series ──
      const wantedEma = new Set(cfg.ema)
      for (const [period, s] of emaSeriesMap.current) {
        if (!wantedEma.has(period)) {
          try { chart.removeSeries(s) } catch { /* ignore */ }
          emaSeriesMap.current.delete(period)
        }
      }
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
        const data = computeEMA(candles, period)
        emaSeriesMap.current.get(period)!.setData(data)
      })

      // ── RSI ──
      if (cfg.rsi && layout === "terminal") {
        if (rsiChartRef.current && rsiSeriesRef.current) {
          const rsiData = computeRSI(candles, 14)
          try { rsiSeriesRef.current.setData(rsiData) } catch { /* ignore */ }
        }
      }

      // Re-render drawing overlay after data changes
      drawingEngineRef.current.render()
    },
    [indicators, layout],
  )
```

- [ ] **Step 4b.2 — Call `syncIndicatorSeries` at end of the seeding effect**

In the seeding `useEffect` (the one that calls `buildDemoHistoryCandles` and `setMainSeriesData`), append after the existing `notifyFallbackOhlc()` call:

```typescript
      syncIndicatorSeries(candles)
```

- [ ] **Step 4b.3 — Call `syncIndicatorSeries` at end of the Kite history fetch effect**

In the `fetchCandles` async function (the useEffect that fetches real Kite data), append after `notifyFallbackOhlc()`:

```typescript
        syncIndicatorSeries(candles)
```

### 4c — RSI chart creation and zoom-reset

- [ ] **Step 4c.1 — Add RSI chart creation inside the main chart initialization useEffect**

Inside the main `useEffect` that creates the chart (the one with `if (chartRef.current) return`), just after `chartRef.current = chart`, add:

```typescript
    // ── RSI sub-chart (terminal layout only) ──
    const rsiEl = rsiContainerRef.current
    if (rsiEl && layout === "terminal") {
      const rsiChart = createChart(rsiEl, {
        width: rsiEl.clientWidth,
        height: RSI_PANE_HEIGHT,
        rightPriceScale: {
          borderVisible: false,
          scaleMargins: { top: 0.1, bottom: 0.1 },
          entireTextOnly: true,
        },
        timeScale: { visible: false, borderVisible: false },
        handleScroll: false,
        handleScale: false,
        ...getInstrumentChartLayoutOptions(isDark),
        grid: {
          vertLines: { visible: false },
          horzLines: { color: "#1C2028", style: 1 },
        },
      })

      // Overbought/oversold band lines
      const ob = rsiChart.addSeries(LineSeries, {
        color: RSI_COLORS.obLine,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      const os = rsiChart.addSeries(LineSeries, {
        color: RSI_COLORS.osLine,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      // Seed band lines with a wide time range so they always span the chart
      const bandTimes = [
        { time: (Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 365) as Time },
        { time: (Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365) as Time },
      ]
      ob.setData(bandTimes.map((t) => ({ ...t, value: 70 })))
      os.setData(bandTimes.map((t) => ({ ...t, value: 30 })))

      const rsiLine = rsiChart.addSeries(LineSeries, {
        color: RSI_COLORS.line,
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      })
      rsiSeriesRef.current = rsiLine
      rsiChartRef.current = rsiChart

      // ── Timescale sync (main ↔ RSI, guarded against infinite loop) ──
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

      // ── Crosshair sync (main → RSI) ──
      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !rsiLine) { 
          try { rsiChart.clearCrosshairPosition() } catch { /* ignore */ }
          return
        }
        const pt = param.seriesData.get(rsiLine as never) as { value?: number } | undefined
        const val = pt?.value ?? 50
        try { rsiChart.setCrosshairPosition(val, param.time, rsiLine) } catch { /* ignore */ }
      })

      // ── Sync RSI chart size on resize ──
      const rsiRo = new ResizeObserver((entries) => {
        const e = entries[0]
        if (!e || !rsiChartRef.current) return
        const w = Math.floor(e.contentRect.width)
        if (w > 0) rsiChartRef.current.applyOptions({ width: w, height: RSI_PANE_HEIGHT })
      })
      rsiRo.observe(rsiEl)

      // Add RSI cleanup to teardownChart — append to existing teardown pattern
      const originalTeardown = teardownChart
      // Override teardown to also kill RSI chart
      ;(teardownChart as any) = () => {
        originalTeardown()
        try { rsiRo.disconnect() } catch { /* ignore */ }
        try { rsiChart.remove() } catch { /* ignore */ }
        rsiChartRef.current = null
        rsiSeriesRef.current = null
      }
    }
```

**NOTE:** The `teardownChart` variable is defined inside the useEffect. This override pattern replaces its body with one that also tears down the RSI chart. The existing cleanup `return () => { ... teardownChart() }` at the bottom of the effect then calls the overridden version.

- [ ] **Step 4c.2 — Add zoom-reset useEffect**

After the existing theme-sync useEffect:

```typescript
  useEffect(() => {
    if (!zoomResetKey || zoomResetKey === 0) return
    const chart = chartRef.current
    if (!chart) return
    try {
      chart.timeScale().resetTimeScale()
      chart.timeScale().scrollToRealTime()
    } catch { /* ignore */ }
  }, [zoomResetKey])
```

### 4d — Drawing canvas overlay + updated JSX

- [ ] **Step 4d.1 — Wire canvas mouse events inside the main initialization useEffect**

After the `crosshairHandler` registration (`chart.subscribeCrosshairMove(crosshairHandler)`), add:

```typescript
    // ── Drawing canvas overlay setup ──
    const canvasEl = canvasRef.current
    if (canvasEl) {
      const engine = drawingEngineRef.current

      const syncCanvasSize = () => {
        if (!containerRef.current || !canvasEl) return
        canvasEl.width = containerRef.current.clientWidth
        canvasEl.height = containerRef.current.clientHeight
        engine.render()
      }
      syncCanvasSize()

      const onMouseDown = (e: MouseEvent) => {
        const tool = activeToolRef.current
        if (tool === "none") return
        const rect = canvasEl.getBoundingClientRect()
        engine.startDraw(tool, e.clientX - rect.left, e.clientY - rect.top)
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

      // Re-render drawings on chart scroll/zoom
      chart.timeScale().subscribeVisibleTimeRangeChange(() => engine.render())

      // Attach engine to chart (do after chart is created so series ref exists)
      // Note: mainSeriesRef is set just before this — attach after series assignment below.
    }
```

Then immediately after `mainSeriesRef.current = main` (where the series is assigned), add:

```typescript
    // Attach drawing engine now that both chart and series exist
    if (canvasRef.current) {
      drawingEngineRef.current.attach(canvasRef.current, chart, main as any)
    }
```

- [ ] **Step 4d.2 — Replace the component return JSX**

Replace the existing `return (...)` block:

```tsx
  return (
    <div
      className={cn(
        "w-full flex flex-col",
        (layout === "flex" || layout === "terminal") && "h-full",
        layout === "flex" && "min-h-[300px]",
        className,
      )}
    >
      {/* Main chart — flex-1 so it fills parent minus RSI pane */}
      <div ref={containerRef} className="relative flex-1 min-h-0">
        {/* Drawing canvas — absolutely positioned over chart, pointer-events managed by activeToolRef effect */}
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 10,
            pointerEvents: "none",
          }}
        />
      </div>

      {/* RSI sub-pane — terminal layout only */}
      {(indicators?.rsi ?? DEFAULT_INDICATORS.rsi) && layout === "terminal" && (
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
```

- [ ] **Step 4d.3 — Update the file header**

Update `@updated` date to `2026-05-10` and add the new props/dependencies to the file header JSDoc.

- [ ] **Step 4d.4 — Type check**

```bash
npm run type-check 2>&1 | grep -E "instrument-candle-chart|error TS" | head -30
```
Fix any type errors before committing. Common fixes:
- `teardownChart` reassignment: declare as `let teardownChart = () => { ... }` instead of `const`
- `main as any` when attaching to DrawingEngine: acceptable since DrawingEngine accepts both series types

- [ ] **Step 4d.5 — Commit**

```bash
git add components/trading/widgets/instrument-candle-chart.tsx
git commit -m "feat(chart): add MA/EMA indicator series, RSI sub-pane, canvas drawing overlay, zoom-reset"
```

---

## Task 5 — Desktop `TerminalChartPane` Upgrade

**Files:**
- Modify: `components/trading/widgets/terminal-chart-pane.tsx`

- [ ] **Step 5.1 — Add new imports**

After the existing imports block, add:

```typescript
import { TRADING_CHART_TIMEFRAMES } from "@/components/trading/widgets/trading-chart-timeframes"
import {
  DEFAULT_INDICATORS,
  type ChartIndicatorConfig,
} from "@/components/trading/widgets/instrument-candle-chart"
import type { DrawingTool } from "@/components/trading/widgets/instrument-chart-drawing"
import { MA_COLORS, EMA_COLORS } from "@/components/trading/widgets/instrument-chart-theme"
```

- [ ] **Step 5.2 — Add new state inside `TerminalChartPane`**

After `const [ohlc, setOhlc] = useState<InstrumentChartOhlcDisplay | null>(null)`, add:

```typescript
  const [indicators, setIndicators] = useState<ChartIndicatorConfig>(DEFAULT_INDICATORS)
  const [activeTool, setActiveTool] = useState<DrawingTool>("none")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [zoomResetKey, setZoomResetKey] = useState(0)
  const [chartType, setChartType] = useState<InstrumentChartKind>("candle")
```

**Note:** Remove the existing `const [chartType] = useState<InstrumentChartKind>("candle")` line (it was `const`, not settable).

- [ ] **Step 5.3 — Replace `TERMINAL_TFS` constant**

Remove the line `const TERMINAL_TFS = ["1m", "5m", "15m", "1H", "1D", "1W"] as const` — we now use the imported `TRADING_CHART_TIMEFRAMES`.

- [ ] **Step 5.4 — Add indicator toggle helpers**

After the `onOhlcDisplay` callback, add:

```typescript
  const toggleMA = useCallback((period: number) => {
    setIndicators((prev) => {
      const has = prev.ma.includes(period)
      return { ...prev, ma: has ? prev.ma.filter((p) => p !== period) : [...prev.ma, period] }
    })
  }, [])

  const toggleEMA = useCallback((period: number) => {
    setIndicators((prev) => {
      const has = prev.ema.includes(period)
      return { ...prev, ema: has ? prev.ema.filter((p) => p !== period) : [...prev.ema, period] }
    })
  }, [])

  const toggleRSI = useCallback(() => {
    setIndicators((prev) => ({ ...prev, rsi: !prev.rsi }))
  }, [])

  const handleDrawTool = useCallback((tool: DrawingTool) => {
    setActiveTool((prev) => (prev === tool ? "none" : tool))
  }, [])
```

- [ ] **Step 5.5 — Replace the full JSX return**

Replace the existing `return (...)` with:

```tsx
  const paneStyle: React.CSSProperties = isFullscreen
    ? { position: "fixed", inset: 0, zIndex: 9999, background: "var(--terminal-bg)" }
    : { display: "flex", flexDirection: "column", height: "100%", background: "var(--terminal-bg)", overflow: "hidden" }

  return (
    <div style={paneStyle}>

      {/* ── Row 1: Symbol + TF pills + chart type + actions ── */}
      <div style={{ borderBottom: "1px solid var(--terminal-border)", flexShrink: 0, background: "var(--terminal-surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px 6px", flexWrap: "wrap" }}>
          {/* Symbol name */}
          <span style={{ fontSize: 20, fontWeight: 800, color: "var(--terminal-text)", lineHeight: 1, letterSpacing: "-0.4px" }}>
            {displaySymbol}
          </span>
          {/* Exchange badge */}
          <span style={{ fontSize: 9, fontWeight: 700, color: "var(--terminal-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", background: "var(--terminal-surface-hi)", padding: "2px 6px", borderRadius: 3, border: "1px solid var(--terminal-separator, rgba(255,255,255,.06))" }}>
            {displaySubtitle}
          </span>
          <div style={{ flex: 1 }} />
          {/* Timeframe pills */}
          <div style={{ display: "flex", gap: 2, background: "var(--terminal-bg)", padding: 2, borderRadius: 6, border: "1px solid var(--terminal-border)" }}>
            {TRADING_CHART_TIMEFRAMES.map((tf) => (
              <button key={tf} onClick={() => setTimeframe(tf)} style={{ border: 0, background: timeframe === tf ? "var(--terminal-accent, #22D3EE)" : "transparent", color: timeframe === tf ? "#0A0A0A" : "var(--terminal-text-muted)", padding: "4px 9px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", transition: "background 80ms, color 80ms", letterSpacing: "0.02em" }}>
                {tf}
              </button>
            ))}
          </div>
          {/* Chart type */}
          <button
            onClick={() => setChartType((t) => t === "candle" ? "line" : "candle")}
            style={{ border: "1px solid var(--terminal-border)", background: "transparent", color: "var(--terminal-text-muted)", padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: 700, cursor: "pointer" }}
          >
            {chartType === "candle" ? "🕯 Candle" : "📈 Line"}
          </button>
          {/* Zoom reset */}
          <button onClick={() => setZoomResetKey((k) => k + 1)} title="Reset zoom" style={{ border: "1px solid var(--terminal-border)", background: "transparent", color: "var(--terminal-text-muted)", padding: "4px 8px", borderRadius: 5, fontSize: 11, cursor: "pointer" }}>
            ↺
          </button>
          {/* Fullscreen */}
          <button onClick={() => setIsFullscreen((f) => !f)} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} style={{ border: "1px solid var(--terminal-border)", background: isFullscreen ? "var(--terminal-accent, #22D3EE)" : "transparent", color: isFullscreen ? "#0A0A0A" : "var(--terminal-text-muted)", padding: "4px 8px", borderRadius: 5, fontSize: 11, cursor: "pointer" }}>
            {isFullscreen ? "✕" : "⛶"}
          </button>
        </div>

        {/* ── Row 2: Price + delta + OHLC strip ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "4px 16px 8px", fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums" }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: priceColor, lineHeight: 1, textShadow: priceGlow, transition: "color 200ms, text-shadow 200ms" }}>
            {ltp != null ? fmtPrice(ltp) : "—"}
          </span>
          {changePct != null && changeAmt != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 4, background: isUp ? "var(--terminal-up-dim, rgba(16,217,150,.10))" : "var(--terminal-dn-dim, rgba(255,59,92,.10))", border: `1px solid ${isUp ? "rgba(16,217,150,.20)" : "rgba(255,59,92,.20)"}` }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: priceColor }}>{isUp ? "▲" : "▼"}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: priceColor }}>{changeAmt >= 0 ? "+" : ""}{fmtPrice(changeAmt)}</span>
              <span style={{ fontSize: 11, color: priceColor, opacity: 0.8 }}>({changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%)</span>
            </div>
          )}
          {ohlc && (
            <div style={{ display: "flex", gap: 10, padding: "3px 10px", borderRadius: 4, background: "var(--terminal-surface-hi)", border: "1px solid var(--terminal-separator, rgba(255,255,255,.06))", fontSize: 11, color: "var(--terminal-text-muted)", marginLeft: 4 }}>
              <span>O <strong style={{ color: "var(--terminal-text)", fontWeight: 600 }}>{fmtPrice(ohlc.o)}</strong></span>
              <span>H <strong style={{ color: upColor, fontWeight: 600 }}>{fmtPrice(ohlc.h)}</strong></span>
              <span>L <strong style={{ color: dnColor, fontWeight: 600 }}>{fmtPrice(ohlc.l)}</strong></span>
              <span>C <strong style={{ color: "var(--terminal-text)", fontWeight: 600 }}>{fmtPrice(ohlc.c)}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* ── Indicator bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", background: "var(--terminal-surface)", borderBottom: "1px solid var(--terminal-border)", flexShrink: 0, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: "var(--terminal-text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 4 }}>Indicators</span>
        {/* MA pills */}
        {[9, 20, 50].map((period, idx) => {
          const active = indicators.ma.includes(period)
          return (
            <button key={`ma-${period}`} onClick={() => toggleMA(period)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${active ? "var(--terminal-border)" : "transparent"}`, background: active ? "rgba(255,255,255,0.05)" : "transparent", color: active ? MA_COLORS[idx % MA_COLORS.length] : "var(--terminal-text-muted)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: MA_COLORS[idx % MA_COLORS.length], display: "inline-block" }} />
              MA({period})
              {active && <span style={{ color: "var(--terminal-text-muted)", fontSize: 10, marginLeft: 2 }}>✕</span>}
            </button>
          )
        })}
        {/* EMA pills */}
        {[21].map((period, idx) => {
          const active = indicators.ema.includes(period)
          return (
            <button key={`ema-${period}`} onClick={() => toggleEMA(period)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${active ? "var(--terminal-border)" : "transparent"}`, background: active ? "rgba(255,255,255,0.05)" : "transparent", color: active ? EMA_COLORS[idx % EMA_COLORS.length] : "var(--terminal-text-muted)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: EMA_COLORS[idx % EMA_COLORS.length], display: "inline-block" }} />
              EMA({period})
              {active && <span style={{ color: "var(--terminal-text-muted)", fontSize: 10, marginLeft: 2 }}>✕</span>}
            </button>
          )
        })}
        {/* RSI pill */}
        <button onClick={toggleRSI} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 4, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${indicators.rsi ? "var(--terminal-border)" : "transparent"}`, background: indicators.rsi ? "rgba(255,255,255,0.05)" : "transparent", color: indicators.rsi ? "#3b82f6" : "var(--terminal-text-muted)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3b82f6", display: "inline-block" }} />
          RSI(14)
          {indicators.rsi && <span style={{ color: "var(--terminal-text-muted)", fontSize: 10, marginLeft: 2 }}>✕</span>}
        </button>
      </div>

      {/* ── Drawing toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 16px", background: "var(--terminal-surface)", borderBottom: "1px solid var(--terminal-border)", flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: "var(--terminal-text-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 6 }}>Draw</span>
        {(["trendline", "horizontal"] as DrawingTool[]).map((tool) => (
          <button key={tool} onClick={() => handleDrawTool(tool)} style={{ padding: "3px 10px", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${activeTool === tool ? "#2563eb" : "var(--terminal-border)"}`, background: activeTool === tool ? "#1e3a5f" : "transparent", color: activeTool === tool ? "#60a5fa" : "var(--terminal-text-muted)" }}>
            {tool === "trendline" ? "↗ Trend Line" : "— Horizontal"}
          </button>
        ))}
        <div style={{ width: 1, height: 14, background: "var(--terminal-border)", margin: "0 4px" }} />
        <button
          onClick={() => { /* clearAll signal — handled via activeTool "none" reset + we need a clearAllKey */ }}
          style={{ padding: "3px 10px", borderRadius: 5, fontSize: 10, fontWeight: 600, cursor: "pointer", border: "1px solid #3f1111", background: "transparent", color: "#ef4444" }}
        >
          ✕ Clear All
        </button>
        {activeTool !== "none" && (
          <span style={{ fontSize: 9, color: "var(--terminal-text-muted)", marginLeft: 6 }}>Click to place · Right-click to delete</span>
        )}
      </div>

      {/* ── Chart body ── */}
      <div style={{ flex: 1, position: "relative", minHeight: 0, overflow: "hidden" }}>
        {instrument ? (
          <InstrumentCandleChart
            instrument={instrument}
            layout="terminal"
            chartType={chartType}
            onOhlcDisplay={onOhlcDisplay}
            indicators={indicators}
            activeTool={activeTool}
            zoomResetKey={zoomResetKey}
            className="h-full"
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
```

**Note on "Clear All":** The clear-all button needs to communicate with the `DrawingEngine` inside `InstrumentCandleChart`. The cleanest way: add a `clearDrawingsKey?: number` prop to `InstrumentCandleChart` (increment it in TerminalChartPane), and inside the chart have a useEffect that calls `drawingEngineRef.current.clearAll()` when it changes. Add this prop + effect in the same edit pass.

- [ ] **Step 5.6 — Add `clearDrawingsKey` prop to `InstrumentCandleChart`**

In `instrument-candle-chart.tsx`, add to `InstrumentCandleChartProps`:

```typescript
  /** Increment to clear all drawings */
  clearDrawingsKey?: number
```

Add the useEffect inside the component:

```typescript
  useEffect(() => {
    if (!clearDrawingsKey) return
    drawingEngineRef.current.clearAll()
  }, [clearDrawingsKey])
```

Then in `TerminalChartPane`, add state and wire Clear All:

```typescript
  const [clearDrawingsKey, setClearDrawingsKey] = useState(0)
```

Change the Clear All button's `onClick`:
```typescript
onClick={() => { setActiveTool("none"); setClearDrawingsKey((k) => k + 1) }}
```

Pass to `InstrumentCandleChart`:
```tsx
clearDrawingsKey={clearDrawingsKey}
```

- [ ] **Step 5.7 — Update file header, type check, and commit**

```bash
npm run type-check 2>&1 | grep -E "terminal-chart-pane|error TS" | head -20
```

```bash
git add components/trading/widgets/terminal-chart-pane.tsx components/trading/widgets/instrument-candle-chart.tsx
git commit -m "feat(chart): add enterprise toolbar to TerminalChartPane — indicator bar, drawing tools, fullscreen, zoom reset"
```

---

## Task 6 — Mobile `MobileTradingChartPanel` Upgrade

**Files:**
- Modify: `components/trading/widgets/mobile-trading-chart-panel.tsx`

The mobile panel already has disabled `Activity` and `SlidersHorizontal` buttons (lines 206–237). We enable them and add compact indicator pills below the TF bar. Mobile supports horizontal level only (touch-friendly), and MA/EMA/RSI overlays.

- [ ] **Step 6.1 — Add imports**

After the existing imports, add:

```typescript
import {
  DEFAULT_INDICATORS,
  type ChartIndicatorConfig,
} from "@/components/trading/widgets/instrument-candle-chart"
import type { DrawingTool } from "@/components/trading/widgets/instrument-chart-drawing"
import { MA_COLORS, EMA_COLORS } from "@/components/trading/widgets/instrument-chart-theme"
```

- [ ] **Step 6.2 — Add new state**

After `const [ohlc, setOhlc] = useState<InstrumentChartOhlcDisplay | null>(null)`, add:

```typescript
  const [indicators, setIndicators] = useState<ChartIndicatorConfig>(DEFAULT_INDICATORS)
  const [activeTool, setActiveTool] = useState<DrawingTool>("none")
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false)
  const [clearDrawingsKey, setClearDrawingsKey] = useState(0)
  const [zoomResetKey, setZoomResetKey] = useState(0)
```

- [ ] **Step 6.3 — Add toggle helpers**

After `const onOhlcDisplay` callback, add:

```typescript
  const toggleMA = (period: number) =>
    setIndicators((prev) => ({
      ...prev,
      ma: prev.ma.includes(period) ? prev.ma.filter((p) => p !== period) : [...prev.ma, period],
    }))

  const toggleEMA = (period: number) =>
    setIndicators((prev) => ({
      ...prev,
      ema: prev.ema.includes(period) ? prev.ema.filter((p) => p !== period) : [...prev.ema, period],
    }))

  const toggleRSI = () => setIndicators((prev) => ({ ...prev, rsi: !prev.rsi }))

  const toggleDrawTool = (tool: DrawingTool) =>
    setActiveTool((prev) => (prev === tool ? "none" : tool))
```

- [ ] **Step 6.4 — Replace the two disabled toolbar buttons**

Find and replace the two `<Tooltip>` blocks (lines ~206–237) that contain disabled `Activity` and `SlidersHorizontal` buttons:

```tsx
          {/* Indicator toggle */}
          <button
            type="button"
            onClick={() => setShowIndicatorPanel((v) => !v)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md border border-border/50 transition-colors",
              showIndicatorPanel
                ? "border-primary/60 bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60",
            )}
            aria-label="Indicators"
          >
            <Activity size={13} />
          </button>
          {/* Horizontal level draw */}
          <button
            type="button"
            onClick={() => toggleDrawTool("horizontal")}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md border border-border/50 transition-colors",
              activeTool === "horizontal"
                ? "border-primary/60 bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/60",
            )}
            aria-label="Draw horizontal level"
          >
            <SlidersHorizontal size={13} />
          </button>
```

- [ ] **Step 6.5 — Add compact indicator panel below TF bar**

After the closing `</div>` of the TF bar section, add:

```tsx
      {/* Compact indicator panel — shown when showIndicatorPanel is true */}
      {showIndicatorPanel && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border/10 bg-muted/10 px-2 py-1.5">
          {[9, 20].map((period, idx) => {
            const active = indicators.ma.includes(period)
            return (
              <button
                key={`ma-${period}`}
                type="button"
                onClick={() => toggleMA(period)}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors",
                  active ? "bg-background/60 border border-border/60" : "text-muted-foreground",
                )}
                style={{ color: active ? MA_COLORS[idx % MA_COLORS.length] : undefined }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: MA_COLORS[idx % MA_COLORS.length] }}
                />
                MA{period}
              </button>
            )
          })}
          {[21].map((period, idx) => {
            const active = indicators.ema.includes(period)
            return (
              <button
                key={`ema-${period}`}
                type="button"
                onClick={() => toggleEMA(period)}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors",
                  active ? "bg-background/60 border border-border/60" : "text-muted-foreground",
                )}
                style={{ color: active ? EMA_COLORS[idx % EMA_COLORS.length] : undefined }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: EMA_COLORS[idx % EMA_COLORS.length] }}
                />
                EMA{period}
              </button>
            )
          })}
          <button
            type="button"
            onClick={toggleRSI}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors",
              indicators.rsi ? "bg-background/60 border border-border/60 text-blue-500" : "text-muted-foreground",
            )}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
            RSI
          </button>
          {activeTool !== "none" && (
            <button
              type="button"
              onClick={() => { setActiveTool("none"); setClearDrawingsKey((k) => k + 1) }}
              className="ml-auto rounded px-2 py-0.5 font-mono text-[10px] text-red-500"
            >
              ✕ Clear
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 6.6 — Pass new props to `InstrumentCandleChart`**

Find the `<InstrumentCandleChart` usage in the mobile panel (currently at ~line 244) and add the new props:

```tsx
            <InstrumentCandleChart
              instrument={instrument}
              layout="card"
              onOhlcDisplay={onOhlcDisplay}
              indicators={{ ...indicators, rsi: false }}
              activeTool={activeTool}
              zoomResetKey={zoomResetKey}
              clearDrawingsKey={clearDrawingsKey}
              className="h-full w-full"
            />
```

**Note:** `rsi: false` on mobile because `layout="card"` doesn't show the RSI pane (terminal-only per spec). MA/EMA still overlay the candles.

- [ ] **Step 6.7 — Update file header, type check, and commit**

```bash
npm run type-check 2>&1 | grep -E "mobile-trading-chart-panel|error TS" | head -20
git add components/trading/widgets/mobile-trading-chart-panel.tsx
git commit -m "feat(chart): enable indicators and horizontal drawing tool on mobile chart panel"
```

---

## Task 7 — Verify, Mirror, and Push

- [ ] **Step 7.1 — Full type check and lint**

```bash
cd tradingpro-platform
npm run type-check 2>&1 | grep "error TS" | head -20
npm run lint 2>&1 | grep -E "error|warning" | head -20
```
All errors must be resolved before continuing.

- [ ] **Step 7.2 — Run indicator tests**

```bash
npx jest --config jest.config.cjs tests/trading/instrument-chart-indicators.test.ts --forceExit
```
Expected: 6/6 pass.

- [ ] **Step 7.3 — Verify sync diff**

```bash
diff -rq ../tradingpro-platform/ ../TradeBazaar/ \
  | grep -vE '(Dockerfile|docker-compose|node_modules|\.next|Branding)'
```
Note which files differ — those are the files we changed that need mirroring.

- [ ] **Step 7.4 — Mirror to TradeBazaar**

```bash
CHANGED_FILES=(
  "components/trading/widgets/instrument-chart-indicators.ts"
  "components/trading/widgets/instrument-chart-drawing.ts"
  "components/trading/widgets/instrument-chart-theme.ts"
  "components/trading/widgets/instrument-candle-chart.tsx"
  "components/trading/widgets/terminal-chart-pane.tsx"
  "components/trading/widgets/mobile-trading-chart-panel.tsx"
)

for f in "${CHANGED_FILES[@]}"; do
  cp "tradingpro-platform/$f" "TradeBazaar/$f"
done
```

```bash
cd ../TradeBazaar
git add components/trading/widgets/instrument-chart-indicators.ts \
        components/trading/widgets/instrument-chart-drawing.ts \
        components/trading/widgets/instrument-chart-theme.ts \
        components/trading/widgets/instrument-candle-chart.tsx \
        components/trading/widgets/terminal-chart-pane.tsx \
        components/trading/widgets/mobile-trading-chart-panel.tsx
git commit -m "mirror(chart): enterprise trading chart upgrade [from tradingpro-platform]"
```

- [ ] **Step 7.5 — Push both repos**

```bash
cd ../tradingpro-platform && git pull --rebase && git push
cd ../TradeBazaar && git pull --rebase && git push
git status  # must show "up to date with origin"
```

- [ ] **Step 7.6 — Close the beads issues**

```bash
bd close <issue-id>
```

---

## Self-Review Checklist

| Spec requirement | Task covering it |
|---|---|
| MA(9), MA(20), EMA(21) overlays | Task 1 (math), Task 4b (series) |
| RSI(14) sub-pane with 70/30 bands | Task 1 (math), Task 4c (RSI chart) |
| Trend line drawing | Task 2 (engine), Task 4d (canvas) |
| Horizontal level drawing | Task 2 (engine), Task 4d (canvas) |
| Right-click to delete drawings | Task 4d (contextmenu handler) |
| Clear All drawings button | Task 5.6 (clearDrawingsKey prop) |
| Fullscreen button | Task 5.5 (isFullscreen state + fixed CSS) |
| Zoom reset button | Task 4c (zoomResetKey effect), Task 5 (button) |
| Full timeframe set (1m→1M) | Task 5.3 (TRADING_CHART_TIMEFRAMES) |
| Candle/Line chart type switcher | Task 5.5 (setChartType) |
| Mobile indicator panel | Task 6.5 (showIndicatorPanel) |
| Mobile drawing (horizontal) | Task 6.4 (horizontal tool button) |
| RSI hidden on mobile | Task 6.6 (rsi: false) |
| TradeBazaar mirror | Task 7.4 |
