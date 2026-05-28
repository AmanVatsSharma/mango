# Enterprise Trading Chart — Design Spec

**Date:** 2026-05-10  
**Status:** Approved  
**Scope:** `instrument-candle-chart.tsx` + surrounding files in `components/trading/widgets/`

---

## Problem

The current trading candle chart (`instrument-candle-chart.tsx`) uses `lightweight-charts` v5 for basic candlestick + volume + line rendering, but has no technical indicators, no drawing tools, no indicator control UI, and no fullscreen/zoom controls. It reads as a basic prototype, not an enterprise trading terminal.

---

## Goal

Upgrade the trading chart to a full enterprise-grade terminal chart on par with professional trading platforms — indicators, RSI sub-pane, drawing tools, and polished toolbar controls — all within the existing `lightweight-charts` v5 dependency (no new chart library).

---

## Feature Set (Approved)

### 1. Technical Indicators
- **MA(9), MA(20), MA(50)** — simple moving averages rendered as `LineSeries` on the main pane
- **EMA(21)** — exponential moving average, same pane
- **RSI(14)** — rendered in a dedicated sub-pane below the main chart, with 70/30 overbought/oversold bands
- All indicators togglable via the indicator bar (add / remove pills)
- Legend overlay inside the chart showing live values for each active indicator

### 2. Drawing Tools
- **Trend Line** — click to set start, click to set end; rendered on a transparent canvas overlay
- **Horizontal Level** — click a price; extends full chart width with price label on right axis
- Right-click any drawing to delete it
- "Clear All" button in the drawing toolbar

### 3. Toolbar Controls
- **Timeframes:** 1m, 3m, 5m, 15m, 30m, 1H, 4H, 1D, 1W (currently limited subset, expand to full set)
- **Chart type:** Candlestick / Line toggle (already exists, keep)
- **Fullscreen button:** expands chart wrapper to `position:fixed; inset:0; z-index:9999`
- **Zoom Reset button:** calls `chart.timeScale().resetTimeScale()` + scroll to latest bar

### 4. OHLCV Strip
- Always-visible O/H/L/C/V row above the chart area
- Updates on crosshair move; falls back to latest bar when crosshair is off chart

### 5. Layout
```
┌─────────────────────────────────────────────────────┐
│ [Symbol] [Price] [Change%] │ [TF pills] │ [Type▾] [↺Reset] [⛶Full] │
├─────────────────────────────────────────────────────┤
│ Indicators: [MA(9)✕] [MA(20)✕] [EMA(21)✕] [RSI(14)✕] [＋Add] │
├─────────────────────────────────────────────────────┤
│ Draw: [↗TrendLine] [—HorizLevel] │ [✕ClearAll]     │
├─────────────────────────────────────────────────────┤
│ O: 22,289  H: 22,398  L: 22,261  C: 22,347  V: 18.4M │
├─────────────────────────────────────────────────────┤
│                                                     │
│          Main Pane — candles + MA/EMA lines         │
│          + drawing overlay canvas                   │
│                                                     │
├─────────────────────────────────────────────────────┤
│          RSI(14) sub-pane (80px) — 70/30 bands      │
├─────────────────────────────────────────────────────┤
│          Time axis                                  │
└─────────────────────────────────────────────────────┘
```

---

## Architecture

### Files to Create

#### `components/trading/widgets/instrument-chart-indicators.ts`
Pure computation utilities — no React, no side effects.
- `computeMA(candles: Candle[], period: number): LineData[]`
- `computeEMA(candles: Candle[], period: number): LineData[]`
- `computeRSI(candles: Candle[], period: number): LineData[]`
Returns arrays in `lightweight-charts` `LineData` format (`{ time, value }`).

#### `components/trading/widgets/instrument-chart-drawing.ts`
Drawing state + canvas renderer — no React.
- `DrawingTool` type: `'none' | 'trendline' | 'horizontal'`
- `Drawing` type: `TrendLineDrawing | HorizontalDrawing`
- `DrawingEngine` class:
  - Holds active drawings array
  - `startDraw(tool, point)` / `continueDraw(point)` / `endDraw(point)` state machine
  - `renderAll(ctx, chart)` — converts price/time → pixel coords and draws on canvas
  - `hitTest(point)` → drawing index (for right-click delete)
  - `clearAll()`

### Files to Modify

#### `components/trading/widgets/instrument-candle-chart.tsx` (684 lines → ~900 lines)
Add:
- `indicators` prop: `{ ma: number[], ema: number[], rsi: boolean }` (default: `{ ma: [9, 20], ema: [21], rsi: true }`)
- `drawingTool` prop: `DrawingTool`
- Second `createChart()` for the RSI pane (separate DOM node, synced time scale)
- `LineSeries` per MA period, per EMA period (added to main chart)
- `LineSeries` for RSI (added to RSI chart)
- Canvas overlay `<canvas>` absolutely positioned over main pane — forwards mouse events to `DrawingEngine`
- Crosshair sync: RSI chart crosshair follows main chart crosshair
- Time scale sync: RSI chart scroll follows main chart scroll
- `onOhlcDisplay` already exists — keep as-is

#### `components/trading/widgets/terminal-chart-pane.tsx` (364 lines → ~480 lines)
Add:
- Indicator bar UI (pills with ✕, `+ Add` button opens a small popover with period options)
- Drawing toolbar UI (Trend Line, Horizontal Level, Clear All buttons)
- State: `activeIndicators`, `activeTool`, managed here, passed as props to `InstrumentCandleChart`
- Fullscreen state: `isFullscreen` — wraps the chart wrapper in a fixed overlay when true
- Zoom Reset: button that calls a ref callback on the chart

#### `components/trading/widgets/instrument-chart-theme.ts` (already exists)
Add:
- Indicator color palette: MA(9) `#f59e0b`, MA(20) `#a78bfa`, MA(50) `#fb923c`, EMA(21) `#34d399`
- RSI pane color: `#3b82f6`
- RSI overbought/oversold band fills

---

## Data Flow

```
TerminalChartPane
  │  state: activeIndicators[], activeTool, isFullscreen
  │  props → InstrumentCandleChart
  │
  └──► InstrumentCandleChart
         │  receives: indicators, drawingTool
         │
         ├── instrument-chart-indicators.ts  (compute MA/EMA/RSI from candle history)
         ├── instrument-chart-drawing.ts     (DrawingEngine on canvas overlay)
         ├── Main chart (createChart)        (candles + MA/EMA series)
         └── RSI chart  (createChart)        (RSI line + 70/30 bands, synced timescale)
```

---

## Key Invariants

- **No new npm packages.** All computation done in-app; no indicator library added. `lightweight-charts` v5 is already installed.
- **RSI chart syncs with main chart:** crosshair move and time scale scroll events are forwarded from main → RSI chart.
- **Drawing canvas sits above the chart div** (`position:absolute; pointer-events:none` during non-draw mode, `auto` during draw mode to capture mouse).
- **Fullscreen uses `position:fixed; inset:0; z-index:9999`** on the chart wrapper, no `requestFullscreen` API (avoids browser permission quirks).
- **Indicator computation runs whenever candle history updates** (inside the `useEffect` that already processes candle data).
- **`layout="terminal"` and `layout="card"` both supported** — indicators/drawing UI only shown in terminal layout; card layout stays minimal.
- **Theme-aware:** indicator colors defined in `instrument-chart-theme.ts`, respect dark/light via `useTheme`.

---

## Error Handling

- If RSI period > candle count, RSI pane shows empty (no crash).
- If drawing canvas context unavailable (SSR), skip canvas init.
- If `chart.timeScale().resetTimeScale()` throws, catch silently.

---

## Out of Scope

- MACD, Bollinger Bands, VWAP (not selected by user)
- Rectangle zones, Fibonacci, text labels (not selected)
- Screenshot / export (not selected)
- Indicator settings dialog (period customization beyond preset options)
- Multi-pane layout (more than 2 panes)
- Mobile chart panel (`mobile-trading-chart-panel.tsx`) — unchanged
