# Watchlist Chart Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `WatchlistObsidianChartShell` from a basic chart viewer to a full enterprise-grade trading chart with live indicator toggles, drawing tools, and a polished Bloomberg-style terminal aesthetic.

**Architecture:** State lives in the shell (active indicators, drawing tool, zoom/clear counters) and flows to `InstrumentCandleChart` via `indicators`, `activeTool`, `zoomResetKey`, `clearDrawingsKey` props. The chart handles all computation/rendering; the shell provides the control chrome. All enhancements reuse existing dependencies — `lightweight-charts` v5 already provides everything needed.

**Tech Stack:** React, TypeScript, Tailwind, `lightweight-charts` v5, `InstrumentCandleChart`, `instrument-chart-indicators`, `instrument-chart-drawing`

---

## File Structure

| File | Role |
|------|------|
| `components/trading/widgets/watchlist-obsidian-chart-shell.tsx` | **Modify** — add indicator bar, drawing toolbar, fullscreen toggle, all state + wiring to chart |
| `components/trading/widgets/instrument-candle-chart.tsx` | **Read-only** — already has full indicator + drawing support |
| `components/trading/widgets/instrument-chart-drawing.ts` | **Read-only** — `DrawingTool` type already exported |

---

## Tasks

### Task 1: Add Indicator Bar (MA/EMA Toggles)

Enable the Activity button to toggle an indicator pill bar below the TF row. Pills reflect current `ChartIndicatorConfig` state. "Add" opens a popover to add/remove periods.

**Files:**
- Modify: `components/trading/widgets/watchlist-obsidian-chart-shell.tsx`

- [ ] **Step 1: Add indicator state to WatchlistObsidianChartShell**

After line 70 (`const [timeframe, setTimeframe] = useState<string>("5m")`), add:

```tsx
// Indicator state — mirrors ChartIndicatorConfig shape
const [activeMa, setActiveMa] = useState<number[]>([20])
const [activeEma, setActiveEma] = useState<number[]>([50, 200])

// Build ChartIndicatorConfig from state
const indicatorConfig: ChartIndicatorConfig = useMemo(() => ({
  ma: activeMa,
  ema: activeEma,
  rsi: false,  // RSI pane only renders in layout="terminal"
}), [activeMa, activeEma])
```

Add to imports from `instrument-candle-chart.tsx`:
```tsx
type ChartIndicatorConfig
```

Add `useMemo` to imports from React.

- [ ] **Step 2: Replace the disabled Activity button with active state**

In the TF bar section (lines 160–174), replace the disabled Activity button:

```tsx
<button
  type="button"
  onClick={() => setShowIndicators(v => !v)}
  className={cn(
    "flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-colors",
    showIndicators
      ? "border-primary/50 bg-primary/15 text-primary"
      : "border-border/50 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
  )}
  aria-label="Indicators"
  aria-pressed={showIndicators}
>
  <Activity size={13} />
</button>
```

- [ ] **Step 3: Add indicator pill bar below TF bar (before chart div)**

After the TF bar `</div>` at line 191, add conditional indicator bar:

```tsx
{showIndicators && (
  <div className="flex flex-wrap items-center gap-1.5 border-b border-border/10 bg-muted/10 px-2 py-1.5">
    <span className="mr-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">MA</span>
    {[9, 20, 50].map(period => {
      const active = activeMa.includes(period)
      const colors = ["#f59e0b", "#a78bfa", "#fb923c"]
      const color = colors[[9, 20, 50].indexOf(period) % colors.length]
      return (
        <button
          key={period}
          type="button"
          onClick={() => setActiveMa(prev =>
            prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period].sort()
          )}
          className={cn(
            "flex items-center gap-0.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold transition-all",
            active
              ? "border-current text-current"
              : "border-border/50 text-muted-foreground/50 hover:border-border/80 hover:text-muted-foreground"
          )}
          style={active ? { color, borderColor: color } : {}}
        >
          <span style={{ color: active ? color : undefined }}>MA({period})</span>
          {active && <span className="opacity-60">✕</span>}
        </button>
      )
    })}

    <span className="ml-2 mr-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">EMA</span>
    {[9, 20, 50, 200].map(period => {
      const active = activeEma.includes(period)
      const colors = ["#34d399", "#f472b6", "#facc15", "#60a5fa"]
      const color = colors[[9, 20, 50, 200].indexOf(period) % colors.length]
      return (
        <button
          key={period}
          type="button"
          onClick={() => setActiveEma(prev =>
            prev.includes(period) ? prev.filter(p => p !== period) : [...prev, period].sort()
          )}
          className={cn(
            "flex items-center gap-0.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold transition-all",
            active
              ? "border-current text-current"
              : "border-border/50 text-muted-foreground/50 hover:border-border/80 hover:text-muted-foreground"
          )}
          style={active ? { color, borderColor: color } : {}}
        >
          <span style={{ color: active ? color : undefined }}>EMA({period})</span>
          {active && <span className="opacity-60">✕</span>}
        </button>
      )
    })}
  </div>
)}
```

- [ ] **Step 4: Pass indicator config to InstrumentCandleChart**

In the chart render (line 200), update the `indicators` prop:

```tsx
indicators={indicatorConfig}
```

- [ ] **Step 5: Verify build**

Run: `npm run type-check 2>&1 | head -30`
Expected: No new type errors from watchlist-obsidian-chart-shell.tsx

---

### Task 2: Add Drawing Toolbar

Replace the disabled SlidersHorizontal button with active drawing controls. Add Trend Line, Horizontal Level, and Clear All buttons.

**Files:**
- Modify: `components/trading/widgets/watchlist-obsidian-chart-shell.tsx`

- [ ] **Step 1: Add drawing state**

After indicator state, add:

```tsx
import type { DrawingTool } from "@/components/trading/widgets/instrument-chart-drawing"

const [activeTool, setActiveTool] = useState<DrawingTool>("none")
const [zoomResetKey, setZoomResetKey] = useState(0)
const [clearDrawingsKey, setClearDrawingsKey] = useState(0)
```

- [ ] **Step 2: Replace disabled SlidersHorizontal button with active controls**

In the TF bar section (lines 175–189), replace the disabled drawing button with:

```tsx
<div className="flex shrink-0 gap-1 border-l border-border/40 pl-2">
  {/* Drawing tools */}
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={() => setActiveTool(t => t === "trendline" ? "none" : "trendline")}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-all",
          activeTool === "trendline"
            ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
            : "border-border/50 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
        aria-label="Trend line"
        aria-pressed={activeTool === "trendline"}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <line x1="1" y1="13" x2="13" y2="1" />
          <circle cx="1" cy="13" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="13" cy="1" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom">Trend line</TooltipContent>
  </Tooltip>

  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={() => setActiveTool(t => t === "horizontal" ? "none" : "horizontal")}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-md border text-xs transition-all",
          activeTool === "horizontal"
            ? "border-blue-500/60 bg-blue-500/15 text-blue-400"
            : "border-border/50 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        )}
        aria-label="Horizontal level"
        aria-pressed={activeTool === "horizontal"}
      >
        <Minus size={13} />
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom">Horizontal level</TooltipContent>
  </Tooltip>

  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={() => { setClearDrawingsKey(k => k + 1); setActiveTool("none") }}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        aria-label="Clear drawings"
      >
        <Trash2 size={13} />
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom">Clear all</TooltipContent>
  </Tooltip>

  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={() => setZoomResetKey(k => k + 1)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        aria-label="Reset zoom"
      >
        <RotateCcw size={13} />
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom">Reset view</TooltipContent>
  </Tooltip>
</div>
```

Add to imports from lucide-react: `Trash2`, `RotateCcw`, `Minus`.

- [ ] **Step 3: Pass drawing props to InstrumentCandleChart**

In the chart render, add the drawing-related props:

```tsx
<InstrumentCandleChart
  instrument={instrument}
  layout="flex"
  onOhlcDisplay={onOhlcDisplay}
  timeframe={timeframe}
  indicators={indicatorConfig}
  activeTool={activeTool}
  zoomResetKey={zoomResetKey}
  clearDrawingsKey={clearDrawingsKey}
  className="h-full min-h-[240px] w-full sm:min-h-[320px]"
/>
```

- [ ] **Step 4: Verify build**

Run: `npm run type-check 2>&1 | grep -A3 "watchlist-obsidian-chart-shell\|error"`
Expected: No type errors. If errors exist, fix inline.

---

### Task 3: Fullscreen Toggle

Add a fullscreen/maximize button to expand the chart to full screen with a fixed overlay. No browser fullscreen API — pure CSS positioning.

**Files:**
- Modify: `components/trading/widgets/watchlist-obsidian-chart-shell.tsx`

- [ ] **Step 1: Add fullscreen state**

```tsx
const [isFullscreen, setIsFullscreen] = useState(false)
```

- [ ] **Step 2: Add fullscreen button to header bar**

Find the header section where `headerRight` is placed (line ~127). Add a fullscreen button before `headerRight`:

```tsx
<div className="flex shrink-0 items-center gap-1">
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={() => setIsFullscreen(v => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
      >
        {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </button>
    </TooltipTrigger>
    <TooltipContent side="bottom">{isFullscreen ? "Exit" : "Fullscreen"}</TooltipContent>
  </Tooltip>
</div>
```

Add to lucide imports: `Maximize2`, `Minimize2`.

- [ ] **Step 3: Wrap the chart area with fullscreen overlay**

Find the outer div at line 94. Add conditional fullscreen wrapper. The simplest approach: wrap the ENTIRE shell content in a conditional fixed overlay when fullscreen is active:

At line 94, replace the outer div:

```tsx
{isFullscreen ? (
  <div
    className="fixed inset-0 z-[9999] flex flex-col bg-background"
    style={{ backdropFilter: "blur(2px)" }}
  >
    {/* Fullscreen header */}
    <div className="flex items-center justify-between border-b border-border/20 px-4 py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsFullscreen(false)}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-foreground hover:bg-muted/60"
          aria-label="Exit fullscreen"
        >
          <Minimize2 size={15} />
        </button>
        <span className="font-mono text-sm font-bold">{symbol}</span>
        <span className={cn("font-mono text-xs font-semibold tabular-nums", accentClass)}>
          {displayLtp != null ? formatTradingPrice(displayLtp) : "—"}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setIsFullscreen(false)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        aria-label="Close"
      >
        <X size={15} />
      </button>
    </div>
    {/* Fullscreen chart area — contains all bars + chart */}
    <div className="flex flex-1 flex-col overflow-hidden" style={{ height: "calc(100vh - 48px)" }}>
      {/* Inline copy of symbol bar, TF bar, indicator bar, chart — re-rendered in fullscreen */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
        {/* TF bar */}
        <div className="flex items-center gap-1 border-b border-border/10 bg-muted/15 px-3 py-2">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {TRADING_CHART_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "shrink-0 rounded px-3 py-1.5 font-mono text-xs font-semibold transition-colors",
                  timeframe === tf
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {tf}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1 border-l border-border/40 pl-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setActiveTool(t => t === "trendline" ? "none" : "trendline")}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-all",
                    activeTool === "trendline"
                      ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
                      : "border-border/50 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <line x1="1" y1="13" x2="13" y2="1" />
                  </svg>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Trend line</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setActiveTool(t => t === "horizontal" ? "none" : "horizontal")}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-all",
                    activeTool === "horizontal"
                      ? "border-blue-500/60 bg-blue-500/15 text-blue-400"
                      : "border-border/50 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
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
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:bg-muted/60"
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
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-border/50 text-muted-foreground hover:bg-muted/60"
                >
                  <RotateCcw size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Reset view</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Chart — large, full height */}
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
            <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-border/40 bg-background/90 px-3 py-2 font-mono text-xs shadow-sm backdrop-blur-sm">
              {(["O", "H", "L", "C"] as const).map((label) => (
                <div key={label} className="flex items-baseline gap-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={cn("tabular-nums font-semibold", label === "H" && "text-emerald-500", label === "L" && "text-red-500")}>
                    {formatTradingPrice(ohlc[label.toLowerCase() as keyof typeof ohlc] as number)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
) : (
  /* Normal — existing shell content */
  <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden bg-background text-foreground", className)}>
    {/* ... existing content ... */}
  </div>
)}
```

- [ ] **Step 4: Verify build**

Run: `npm run type-check 2>&1 | grep -A3 "watchlist-obsidian-chart-shell\|error"`
Expected: Clean compile.

---

### Task 4: Visual Polish — Bloomberg-Style Header

Upgrade the header bar with a refined aesthetic: live connection pulse dot, bid/ask spread display, richer LTP card, better iconography.

**Files:**
- Modify: `components/trading/widgets/watchlist-obsidian-chart-shell.tsx`

- [ ] **Step 1: Add bid/ask to the header**

The header already shows LTP + change%. Add spread below it. After line 88 (`const previousClose = ...`), compute bid/ask:

```tsx
const spread = quote != null
  ? (() => {
      const bid = parseNonNegativeMarketNumber(quote.bid_price as unknown)
      const ask = parseNonNegativeMarketNumber(quote.ask_price as unknown)
      if (bid != null && ask != null && ask > bid) return ask - bid
      return null
    })()
  : null
```

In the header price display section, add spread info after the change% badge:

```tsx
<span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
  {spread != null ? `±${formatTradingPrice(spread)}` : "—"}
</span>
```

- [ ] **Step 2: Improve TF bar visual hierarchy**

Replace the TF bar section with enhanced styling:

```tsx
{/* TF bar */}
<div
  className="flex items-center gap-2 border-b border-border/15 bg-[--chart-bg,#0a0a0e]/50 px-3 py-1.5"
  data-vaul-no-drag
>
  <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-none">
    {TRADING_CHART_TIMEFRAMES.map((tf) => (
      <button
        key={tf}
        type="button"
        onClick={() => setTimeframe(tf)}
        className={cn(
          "shrink-0 rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wide transition-all duration-150",
          timeframe === tf
            ? "border-primary/40 bg-primary/15 text-primary shadow-sm"
            : "border-border/40 text-muted-foreground/70 hover:border-border/80 hover:bg-muted/40 hover:text-foreground",
        )}
      >
        {tf}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 3: Run full type check + lint**

Run: `npm run type-check && npm run lint -- --quiet 2>&1 | tail -20`
Expected: Type-check passes, lint warnings are pre-existing (not new).

---

### Task 5: Final Integration — Verify all wiring in TradingDashboard

Confirm the chart drawer in TradingDashboard correctly passes instrument props that the chart needs.

**Files:**
- Read: `components/trading/TradingDashboard.tsx` lines 1450–1511

- [ ] **Step 1: Verify prop coverage**

The current DrawerContent renders `WatchlistObsidianChartShell` with these props:
- `instrument.instrumentKey` ✓
- `instrument.token` ✓
- `instrument.instrumentId` ✓
- `instrument.seedBasePrice` ✓
- `symbol` ✓
- `name` ✓
- `onClose` ✓
- `headerRight` ✓
- `className` ✓

All required props are present. No changes needed.

- [ ] **Step 2: Check the WatchlistItemCard chart drawer**

The WatchlistItemCard also renders `WatchlistObsidianChartShell` in a Drawer. Verify it passes the same props:

From grep results at line ~642: `<Drawer open={showChartDrawer} ...>`. Read the relevant section to confirm full prop coverage.

Run: `grep -n "WatchlistObsidianChartShell\|instrumentKey\|token" components/watchlist/WatchlistItemCard.tsx | head -20`

If the WatchlistItemCard's shell is missing `instrument.token` or `instrumentId`, add them.

---

### Task 6: Dev Server Test & Polish

Run the dev server, open the chart drawer, and verify all features work.

**Files:**
- No file changes — verification only

- [ ] **Step 1: Start dev server**

Run: `cd /home/amansharma/Desktop/DevOPS/Trading/tradingpro-platform && npm run dev`

- [ ] **Step 2: Manual verification checklist**

1. Open watchlist → click a stock → click "View chart" button
2. Chart drawer slides in from left — full screen
3. Symbol bar shows: symbol, company name, LTP, change%, spread
4. Connection dot pulses green (Live)
5. TF bar: all 10 timeframes (1m, 3m, 5m...1W) clickable
6. Click 5m → chart re-fetches and re-renders
7. Click Activity button → indicator pill bar appears below TF bar
8. Click MA(20) pill → line appears on chart (amber color)
9. Click EMA(50) pill → line appears (yellow color)
10. Click EMA(200) pill → line appears (blue color)
11. Click SlidersHorizontal → drawing toolbar activates
12. Click Trend Line → cursor changes to crosshair → click-drag on chart → trend line drawn
13. Click Horizontal Level → click on chart → level extends across chart with price label
14. Right-click on trend line → it deletes
15. Click Trash2 → all drawings clear, tool resets to none
16. Click RotateCcw → chart resets to fit content
17. Click Maximize2 → chart expands to full screen overlay
18. Click minimize/exit → returns to drawer mode
19. Hover chart → OHLC overlay updates in real-time

Fix any issues found. Run `npm run type-check` after any changes.

- [ ] **Step 3: Commit**

```bash
git add components/trading/widgets/watchlist-obsidian-chart-shell.tsx components/trading/TradingDashboard.tsx
git status --short
git diff --cached --stat
git commit -m "$(cat <<'EOF'
feat(watchlist-chart): enterprise chart with indicators, drawing tools, fullscreen

- Enable MA(9/20/50) and EMA(9/20/50/200) indicator pills with live toggle
- Add drawing toolbar: trend line, horizontal level, clear all, zoom reset
- Fullscreen overlay mode with pure CSS (no browser API)
- Bloomberg-style header with bid/ask spread display
- Wire all props to InstrumentCandleChart (indicators, activeTool, zoom/clear keys)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```