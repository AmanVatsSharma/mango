/**
 * File:        components/trading/TradingHome.tsx
 * Module:      Trading · Home Tab
 * Purpose:     Premium mobile-first home tab: NIFTY chart, funds, markets, watchlist preview,
 *              positions, sector heatmap, alerts, events, news, options peek, and more.
 *
 * Exports:
 *   - TradingHome(props) → JSX  — main home tab component
 *
 * Depends on:
 *   - @/components/trading/widgets/price-chart — real NIFTY candle chart (WebSocket-backed)
 *   - @/components/trading/widgets/top-movers-widget — gainers/losers
 *   - @/lib/hooks/use-prisma-watchlist — live watchlist data
 *   - @/lib/hooks/use-home-dashboard-config — per-user widget config
 *   - @/lib/market-data/utils/instrumentMapper — INDEX_INSTRUMENTS token map
 *
 * Side-effects:
 *   - Subscribes to WebSocket market data via PriceChart / TickerBar children
 *   - Fetches user watchlists and home config on mount
 *
 * Key invariants:
 *   - PriceChart is locked to NIFTY (single-symbol) on the home tab — symbol picker is hidden
 *   - New sections (sectors, alerts, events, news, options) use deterministic mock data;
 *     real feeds can replace them incrementally without layout changes
 *   - Desktop (lg+) keeps the full chart+heatmap+screener grid below the new mobile layout
 *
 * Read order:
 *   1. Static data constants (NSE_INDICES, SECTORS, ALERTS, EVENTS, NEWS, RECENT, OPT_CHAIN)
 *   2. Atomic sub-components (HomeClock, MarketStatus, Sparkline)
 *   3. Section components (HomeWelcomeCard, HomeFundsStrip, HomeMarketOverview, etc.)
 *   4. TradingHome — main export, composes all sections
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-09
 */

"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowRight,
  Bell,
  Eye,
  EyeOff,
  SlidersHorizontal,
  Zap,
  TrendingUp,
  TrendingDown,
  Download,
  Upload,
  BarChart2,
  Terminal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PnLData, Stock } from "@/types/trading"
import { getMarketSession, refreshMarketForceClosedFromServer } from "@/lib/hooks/market-timing"
import { PriceChart } from "@/components/trading/widgets/price-chart"
import { MarketHeatmap } from "@/components/trading/widgets/market-heatmap"
import { ScreenerLite } from "@/components/trading/widgets/screener-lite"
import { TopMoversWidget } from "@/components/trading/widgets/top-movers-widget"
import { MarketStatsWidget } from "@/components/trading/widgets/market-stats-widget"
import { HomeCustomizationDialog } from "@/components/trading/widgets/home-customization-dialog"
import { AccountMetricsBar } from "@/components/trading/widgets/account-metrics-bar"
import { TimeAndSales } from "@/components/trading/widgets/time-and-sales"
import { useEnhancedWatchlists } from "@/lib/hooks/use-prisma-watchlist"
import { useHomeDashboardConfig } from "@/lib/hooks/use-home-dashboard-config"
import { toast } from "@/hooks/use-toast"
import {
  buildTradingHomePortfolioSummary,
  buildTradingHomeWatchlistHeatmapItems,
} from "@/components/trading/trading-home-number-utils"
import {
  buildHomeMoversUniverse,
  buildHomeTickerItemsFromConfig,
} from "@/components/trading/widgets/home-widget-data-utils"
import { INDEX_INSTRUMENTS } from "@/lib/market-data/utils/instrumentMapper"

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradingHomeProps {
  userName?: string
  session?: any
  portfolio?: any
  pnl?: PnLData
  onQuickBuy?: (stock: Stock) => void
  onQuickSell?: (stock: Stock) => void
  marketSession?: "open" | "pre-open" | "closed"
}

type AssetTab = "NSE" | "FX" | "CRYPTO"

// ─── Static mock data (matching designer's final dataset) ─────────────────────

const NSE_INDICES = [
  { sym: "NIFTY 50",  v: 22847.35, p: +0.63, up: true  },
  { sym: "BANKNIFTY", v: 48213.60, p: -0.64, up: false },
  { sym: "SENSEX",    v: 75321.90, p: +0.59, up: true  },
  { sym: "NIFTY IT",  v: 37842.15, p: +0.58, up: true  },
]
const FX_PAIRS = [
  { sym: "EUR/USD", v: 1.0842,  p: +0.21, up: true  },
  { sym: "GBP/USD", v: 1.2641,  p: -0.14, up: false },
  { sym: "USD/INR", v: 83.64,   p: +0.22, up: true  },
  { sym: "USD/JPY", v: 156.82,  p: -0.27, up: false },
]
const CRYPTO_LIST = [
  { sym: "BTC/USDT", v: 67423.50, p: +2.78, up: true  },
  { sym: "ETH/USDT", v: 3521.80,  p: -1.35, up: false },
  { sym: "SOL/USDT", v: 172.45,   p: +4.12, up: true  },
  { sym: "BNB/USDT", v: 598.20,   p: +1.94, up: true  },
]

const WL_DATA: Record<AssetTab, { sym: string; exSeg: string; v: number; p: number; up: boolean }[]> = {
  NSE: [
    { sym: "RELIANCE",  exSeg: "NSE", v: 2847.50, p: +1.33, up: true  },
    { sym: "TCS",       exSeg: "NSE", v: 3621.15, p: -0.79, up: false },
    { sym: "HDFCBANK",  exSeg: "NSE", v: 1712.30, p: +0.84, up: true  },
    { sym: "INFY",      exSeg: "NSE", v: 1423.75, p: -1.81, up: false },
    { sym: "NIFTY-FUT", exSeg: "NSE", v: 22901.0,  p: +0.62, up: true  },
  ],
  FX: [
    { sym: "EUR/USD", exSeg: "FX", v: 1.0842, p: +0.21, up: true  },
    { sym: "GBP/USD", exSeg: "FX", v: 1.2641, p: -0.14, up: false },
    { sym: "USD/INR", exSeg: "FX", v: 83.64,  p: +0.22, up: true  },
    { sym: "AUD/USD", exSeg: "FX", v: 0.6523, p: -0.31, up: false },
  ],
  CRYPTO: [
    { sym: "BTC/USDT", exSeg: "CRYPTO", v: 67423.50, p: +2.78, up: true  },
    { sym: "ETH/USDT", exSeg: "CRYPTO", v: 3521.80,  p: -1.35, up: false },
    { sym: "SOL/USDT", exSeg: "CRYPTO", v: 172.45,   p: +4.12, up: true  },
    { sym: "BNB/USDT", exSeg: "CRYPTO", v: 598.20,   p: +1.94, up: true  },
  ],
}

const MOCK_POSITIONS = [
  { sym: "RELIANCE", asset: "NSE", dir: "LONG",  qty: 5,    avg: 2800,  ltp: 2847.50, pnl: +237.50, pct: +1.69 },
  { sym: "BTC/USDT", asset: "CRY", dir: "LONG",  qty: 0.05, avg: 65100, ltp: 67423.5, pnl: +116.18, pct: +3.57 },
  { sym: "TCS",      asset: "NSE", dir: "SHORT", qty: 2,    avg: 3650,  ltp: 3621.15, pnl:  +57.70, pct: +0.79 },
  { sym: "HDFCBANK", asset: "NSE", dir: "LONG",  qty: 10,   avg: 1730,  ltp: 1712.30, pnl: -177.00, pct: -1.02 },
]

const SECTORS = [
  { name: "IT",      p: +1.84, w: 22 },
  { name: "Banks",   p: +0.72, w: 18 },
  { name: "Auto",    p: +2.41, w: 11 },
  { name: "Energy",  p: -0.63, w: 14 },
  { name: "Pharma",  p: +1.12, w: 8  },
  { name: "FMCG",    p: -0.34, w: 9  },
  { name: "Metals",  p: -1.78, w: 7  },
  { name: "Realty",  p: +3.05, w: 5  },
  { name: "Telecom", p: -0.21, w: 6  },
]

const MOCK_ALERTS = [
  { sym: "RELIANCE", cond: "crosses above", px: "2,850",  active: true,  asset: "NSE" },
  { sym: "BTC/USDT", cond: "falls below",   px: "67,000", active: true,  asset: "CRY" },
  { sym: "NIFTY 50", cond: "crosses above", px: "22,950", active: false, asset: "NSE" },
]

const EVENTS = [
  { date: "12", day: "MON", kind: "EARNINGS", sym: "TCS",       label: "Q4 Results",    time: "After close",  tone: "cyan"   },
  { date: "13", day: "TUE", kind: "DIVIDEND", sym: "ITC",       label: "₹6.25 / share", time: "Ex-date",      tone: "green"  },
  { date: "14", day: "WED", kind: "EARNINGS", sym: "INFY",      label: "Q4 Results",    time: "Pre-market",   tone: "cyan"   },
  { date: "15", day: "THU", kind: "EXPIRY",   sym: "NIFTY",     label: "Weekly F&O",    time: "15:30 IST",    tone: "amber"  },
  { date: "16", day: "FRI", kind: "IPO",      sym: "GRT JEWEL", label: "IPO opens",     time: "09:30 IST",    tone: "indigo" },
]

const NEWS_ITEMS = [
  { tag: "RELIANCE", tone: "cyan",   ttl: "Reliance Jio crosses 480M subscribers, ARPU climbs to ₹201",           src: "Mint",         t: "14m" },
  { tag: "BTC",      tone: "amber",  ttl: "Bitcoin breaks ₹56L mark as ETF inflows hit 4-week high",              src: "Bloomberg",    t: "32m" },
  { tag: "NIFTY",    tone: "cyan",   ttl: "Nifty closes at fresh ATH; banks lead, IT lags ahead of Infy results", src: "ET Markets",   t: "1h"  },
  { tag: "INFY",     tone: "cyan",   ttl: "Infosys expected to guide 4–7% revenue growth for FY27: brokerages",   src: "Moneycontrol", t: "2h"  },
  { tag: "EUR/USD",  tone: "indigo", ttl: "ECB hints at June cut; euro slips to two-week low against dollar",     src: "Reuters",      t: "3h"  },
]

const RECENT_TRADED = [
  { sym: "RELIANCE",  asset: "NSE", v: 2847.50, p: +1.33, up: true  },
  { sym: "NIFTY-FUT", asset: "NSE", v: 22901.0,  p: +0.62, up: true  },
  { sym: "BTC/USDT",  asset: "CRY", v: 67423.5, p: +2.78, up: true  },
  { sym: "EUR/USD",   asset: "FX",  v: 1.0842,  p: +0.21, up: true  },
  { sym: "TCS",       asset: "NSE", v: 3621.15, p: -0.79, up: false },
]

const OPT_CHAIN = (() => {
  const spot = 22901
  const strikes = [22800, 22850, 22900, 22950, 23000]
  let seed = 42
  const rng = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  return strikes.map((k) => ({
    k,
    ceOI: Math.round(180 - Math.abs(k - spot) * 0.06 + (k <= spot ? 40 : -20) + rng() * 30),
    peOI: Math.round(180 - Math.abs(k - spot) * 0.06 + (k >= spot ? 40 : -20) + rng() * 30),
    ceLtp: Math.max(2, +(spot - k + 80 + (rng() * 20 - 10)).toFixed(2)),
    peLtp: Math.max(2, +(k - spot + 80 + (rng() * 20 - 10)).toFixed(2)),
    ceChg: +(rng() * 8 - 2).toFixed(1),
    peChg: +(rng() * 8 - 2).toFixed(1),
  }))
})()

const MOCK_ORDERS = [
  { sym: "NIFTY APR", asset: "NSE", side: "BUY",  qty: 50,   px: "22,850", st: "OPEN",     t: "09:32" },
  { sym: "HDFCBANK",  asset: "NSE", side: "SELL", qty: 10,   px: "1,720",  st: "EXECUTED", t: "10:14" },
  { sym: "BTC/USDT",  asset: "CRY", side: "BUY",  qty: 0.01, px: "66,800", st: "EXECUTED", t: "11:02" },
  { sym: "EUR/USD",   asset: "FX",  side: "SELL", qty: 5000, px: "1.0860", st: "PENDING",  t: "11:41" },
]

// Fixed NIFTY symbol config — locks the home chart to a single instrument
const NIFTY_CHART_SYMBOL = [{ key: "NSE:NIFTY", label: "NIFTY 50", token: INDEX_INSTRUMENTS.NIFTY }]

// ─── Atomic helpers ───────────────────────────────────────────────────────────

/** Isolated clock — owns its own 1s interval so parent doesn't re-render */
const HomeClock = React.memo(() => {
  const [t, setT] = useState(() =>
    new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
  )
  useEffect(() => {
    const id = window.setInterval(
      () => setT(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })),
      1000,
    )
    return () => window.clearInterval(id)
  }, [])
  return <span suppressHydrationWarning>{t} IST</span>
})
HomeClock.displayName = "HomeClock"

const MarketStatus: React.FC<{ marketSession?: "open" | "pre-open" | "closed" }> = ({ marketSession }) => {
  const [local, setLocal] = useState<"open" | "pre-open" | "closed">(getMarketSession)
  useEffect(() => {
    if (marketSession !== undefined) return
    const tick = () => void refreshMarketForceClosedFromServer().then(() => setLocal(getMarketSession()))
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [marketSession])
  const s = marketSession ?? local
  const isOpen = s === "open"
  const isPre  = s === "pre-open"
  return (
    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] uppercase font-bold tracking-wider
      ${isOpen ? "text-green-400 bg-green-400/10 border-green-400/20"
               : isPre ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
               : "text-red-400 bg-red-400/10 border-red-400/20"}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-green-400 animate-pulse shadow-[0_0_6px_#4ade80]" : isPre ? "bg-yellow-400" : "bg-red-400"}`} />
      {isOpen ? "Live" : isPre ? "Pre-Open" : "Closed"}
    </div>
  )
}

/** Mini sparkline SVG — deterministic up/down shape */
const Sparkline: React.FC<{ up: boolean; w?: number; h?: number }> = ({ up, w = 54, h = 22 }) => {
  const pts = useMemo(() => {
    const b = up
      ? [40, 41, 39, 43, 41, 45, 43, 47, 44, 49, 46, 51]
      : [51, 49, 46, 48, 44, 46, 42, 44, 40, 42, 38, 40]
    const mn = Math.min(...b), mx = Math.max(...b), rng = mx - mn || 1
    return b.map((v, i) => `${(i / (b.length - 1)) * w},${h - ((v - mn) / rng) * h}`).join(" ")
  }, [up, w, h])
  const col = up ? "#4ade80" : "#f87171"
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" className="flex-shrink-0">
      <defs>
        <linearGradient id={`sp-${up ? "u" : "d"}-${w}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.3" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#sp-${up ? "u" : "d"}-${w})`} />
      <polyline points={pts} stroke={col} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** Section label + "See all" row */
const SectionHeader: React.FC<{
  label: string
  badge?: React.ReactNode
  action?: string
  onAction?: () => void
}> = ({ label, badge, action, onAction }) => (
  <div className="flex items-center justify-between mb-2.5 px-4">
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">{label}</span>
      {badge}
    </div>
    {action && (
      <button onClick={onAction} className="text-[10.5px] font-semibold text-cyan-400 flex items-center gap-0.5 hover:text-cyan-300 transition-colors">
        {action} <ArrowRight className="w-3 h-3" />
      </button>
    )}
  </div>
)

/** Glass card wrapper */
const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <div className={`bg-white/90 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] shadow-sm dark:shadow-none rounded-[18px] backdrop-blur-xl ${className}`}>
    {children}
  </div>
)

/** Infinite-scroll ticker marquee — NSE + FX + CRYPTO strip */
const HomeTickerMarquee: React.FC = React.memo(() => {
  const TICKER_ITEMS = useMemo(() => {
    const all = [
      ...NSE_INDICES,
      ...FX_PAIRS,
      ...CRYPTO_LIST.slice(0, 2),
    ]
    return [...all, ...all] // doubled: seamless CSS loop
  }, [])

  const fmtV = (sym: string, v: number) =>
    sym.includes("/") && v < 100 ? v.toFixed(4) : v.toLocaleString("en-IN", { minimumFractionDigits: 2 })

  return (
    <div className="overflow-hidden h-[30px] flex items-center border-b border-border/50 dark:border-white/[0.05] bg-background/95 dark:bg-[oklch(0.08_0_0/0.97)] backdrop-blur-md flex-shrink-0 sticky top-0 z-40">
      <div
        className="inline-flex items-center"
        style={{ animation: "home-ticker 32s linear infinite", willChange: "transform" }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.animationPlayState = "paused" }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.animationPlayState = "running" }}
      >
        {TICKER_ITEMS.map((it, i) => (
          <div
            key={i}
            className="flex items-center gap-[7px] px-4 border-r border-slate-200/60 dark:border-white/[0.04] h-[30px] flex-shrink-0 whitespace-nowrap"
          >
            <span className="font-mono font-semibold text-[10.5px] text-muted-foreground tracking-[.02em]">{it.sym}</span>
            <span className="font-mono font-bold text-[10.5px] text-foreground">{fmtV(it.sym, it.v)}</span>
            <span className={`text-[10px] font-bold ${it.up ? "text-green-500 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
              {it.up ? "▲" : "▼"}{Math.abs(it.p).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
})
HomeTickerMarquee.displayName = "HomeTickerMarquee"

// ─── Section components ───────────────────────────────────────────────────────

const HomeWelcomeCard: React.FC<{
  displayName: string
  marketSession?: "open" | "pre-open" | "closed"
  portfolio?: any
  pnl?: PnLData
  masked: boolean
}> = React.memo(({ displayName, marketSession, portfolio, pnl, masked }) => {
  const { dayPnL } = useMemo(() => buildTradingHomePortfolioSummary({ portfolio, pnl }), [portfolio, pnl])
  const initials = displayName.slice(0, 1).toUpperCase()
  return (
    <div className="mx-3.5 mt-1 rounded-[18px] overflow-hidden relative border border-cyan-400/20 dark:border-cyan-400/[0.16] bg-gradient-to-br from-cyan-50/80 via-white/60 to-indigo-50/40 dark:from-cyan-400/[0.08] dark:via-transparent dark:to-indigo-400/[0.05]">
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle,rgba(99,102,241,.10),transparent 70%)" }} />
      <div className="flex items-center gap-3 p-4 relative">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-base"
          style={{ background: "linear-gradient(135deg,#22D3EE,#6366F1)", boxShadow: "0 0 14px rgba(34,211,238,.3)" }}>
          {initials}
        </div>
        {/* Greeting */}
        <div className="flex-1 min-w-0">
          <p className="text-[10.5px] font-medium text-muted-foreground/75 mb-0.5 tracking-[0.02em]">
            Good {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 17 ? "Afternoon" : "Evening"},
          </p>
          <p className="text-[17px] font-bold text-foreground leading-tight tracking-[-0.01em] truncate">{displayName}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <MarketStatus marketSession={marketSession} />
            <span className="text-[10px] font-mono text-muted-foreground/60"><HomeClock /></span>
          </div>
        </div>
        {/* Funds snapshot */}
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0 relative">
          <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-muted-foreground/60">Day P&amp;L</span>
          <span className={`font-mono font-bold text-[13px] ${masked ? "blur-md select-none" : ""} transition-all ${dayPnL >= 0 ? "text-green-400" : "text-red-400"}`}>
            {dayPnL >= 0 ? "+" : ""}₹{Math.abs(dayPnL).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  )
})
HomeWelcomeCard.displayName = "HomeWelcomeCard"

const HomeFundsStrip: React.FC<{ portfolio?: any; pnl?: PnLData; masked: boolean }> = React.memo(({ portfolio, pnl, masked }) => {
  const { totalPnL, dayPnL, currentValue } = useMemo(
    () => buildTradingHomePortfolioSummary({ portfolio, pnl }),
    [portfolio, pnl],
  )
  const items = [
    { label: "Available",   value: `₹${currentValue.toLocaleString("en-IN")}`, color: "text-cyan-400"  },
    { label: "Margin Used", value: `₹${Math.abs(totalPnL * 0.3).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, color: "text-amber-300" },
    { label: "Day P&L",     value: `${dayPnL >= 0 ? "+" : ""}₹${Math.abs(dayPnL).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, color: dayPnL >= 0 ? "text-green-400" : "text-red-400" },
  ]
  return (
    <div className="flex gap-2.5 px-3.5">
      {items.map((it) => (
        <div key={it.label} className="flex-1 bg-white/80 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] shadow-sm dark:shadow-none rounded-[12px] p-2.5 text-center">
          <p className={`font-mono font-bold text-[12px] mb-1 ${it.color} ${masked ? "blur-md select-none" : ""} transition-all`}>
            {it.value}
          </p>
          <p className="text-[9px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/50">{it.label}</p>
        </div>
      ))}
    </div>
  )
})
HomeFundsStrip.displayName = "HomeFundsStrip"

const HomeInsightCard: React.FC = React.memo(() => (
  <div className="px-3.5">
    <div className="flex items-center gap-3 rounded-[14px] p-3 border border-indigo-400/20 dark:border-indigo-400/[0.18] bg-gradient-to-r from-indigo-50/80 to-cyan-50/40 dark:from-indigo-400/[0.08] dark:to-cyan-400/[0.04]">
      <div className="w-8 h-8 rounded-[10px] bg-indigo-400/15 flex items-center justify-center flex-shrink-0">
        <Zap className="w-4 h-4 text-indigo-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11.5px] font-bold text-foreground mb-0.5">Portfolio outperforming NIFTY</p>
        <p className="text-[10px] text-muted-foreground/80">+1.93% vs benchmark +0.63% — RELIANCE, BTC leading</p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
    </div>
  </div>
))
HomeInsightCard.displayName = "HomeInsightCard"

const HomeMarketOverview: React.FC = React.memo(() => {
  const [tab, setTab] = useState<AssetTab>("NSE")
  const dataMap: Record<AssetTab, typeof NSE_INDICES> = { NSE: NSE_INDICES, FX: FX_PAIRS, CRYPTO: CRYPTO_LIST }
  const list = dataMap[tab]
  const fmtV = (v: number, t: AssetTab) =>
    t === "FX" ? v.toFixed(4) : t === "CRYPTO" ? v.toLocaleString("en-US", { minimumFractionDigits: 2 }) : v.toLocaleString("en-IN", { minimumFractionDigits: 2 })
  return (
    <div>
      <SectionHeader
        label="Markets"
        action="All"
        badge={
          <div className="flex gap-1">
            {(["NSE", "FX", "CRYPTO"] as AssetTab[]).map((a) => (
              <button key={a} onClick={() => setTab(a)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold border transition-all ${
                  tab === a
                    ? a === "NSE"    ? "bg-cyan-400/15 text-cyan-400 border-cyan-400/20 shadow-[0_0_12px_rgba(34,211,238,.15)]"
                    : a === "FX"     ? "bg-indigo-400/15 text-indigo-400 border-indigo-400/20"
                    : "bg-amber-300/12 text-amber-300 border-amber-300/20"
                    : "bg-slate-100 dark:bg-white/[0.04] text-muted-foreground/60 border-slate-200 dark:border-white/[0.06]"
                }`}>
                {a}
              </button>
            ))}
          </div>
        }
      />
      <div className="flex gap-2.5 overflow-x-auto px-3.5 pb-0.5 [&::-webkit-scrollbar]:hidden scroll-smooth">
        {list.map((it, i) => (
          <div key={it.sym}
            className="flex-shrink-0 min-w-[130px] bg-white/80 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] shadow-sm dark:shadow-none rounded-[12px] p-3 cursor-pointer active:scale-[.975] transition-transform">
            <p className="text-[10px] font-semibold text-muted-foreground/75 mb-1.5 whitespace-nowrap">{it.sym}</p>
            <p className="font-mono font-bold text-[13.5px] text-foreground mb-2 tracking-[-0.01em]">{fmtV(it.v, tab)}</p>
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold ${it.up ? "text-green-400" : "text-red-400"}`}>
                {it.up ? "+" : ""}{it.p.toFixed(2)}%
              </span>
              <Sparkline up={it.up} w={40} h={20} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
HomeMarketOverview.displayName = "HomeMarketOverview"

const HomeQuickActions: React.FC = React.memo(() => {
  const acts = [
    { icon: Download,   label: "Deposit",  color: "text-green-400",  bg: "bg-green-400/10"  },
    { icon: Upload,     label: "Withdraw", color: "text-amber-300",  bg: "bg-amber-300/10"  },
    { icon: BarChart2,  label: "Reports",  color: "text-indigo-400", bg: "bg-indigo-400/10" },
    { icon: Terminal,   label: "Console",  color: "text-cyan-400",   bg: "bg-cyan-400/10"   },
  ]
  return (
    <div className="px-3.5">
      <div className="grid grid-cols-4 gap-2.5">
        {acts.map((a) => (
          <button key={a.label}
            className="flex flex-col items-center gap-2 cursor-pointer active:scale-95 transition-transform group">
            <div className={`w-12 h-12 rounded-[16px] ${a.bg} border border-slate-200 dark:border-white/[0.06] flex items-center justify-center dark:group-hover:border-white/15 transition-colors`}>
              <a.icon className={`w-5 h-5 ${a.color}`} />
            </div>
            <span className={`text-[10px] font-semibold ${a.color} opacity-80`}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
})
HomeQuickActions.displayName = "HomeQuickActions"

const HomeWatchlistPreview: React.FC<{ masked: boolean; watchlists?: any[] | null }> = React.memo(({ masked, watchlists }) => {
  const [tab, setTab] = useState<AssetTab>("NSE")
  const list = WL_DATA[tab]
  const fmtV = (v: number, t: AssetTab) =>
    t === "FX" ? v.toFixed(4) : t === "CRYPTO" ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
  const chipCls: Record<AssetTab, string> = {
    NSE:    "bg-cyan-400/12 text-cyan-300",
    FX:     "bg-indigo-400/12 text-indigo-300",
    CRYPTO: "bg-amber-300/12 text-amber-300",
  }
  return (
    <div>
      <SectionHeader
        label="Watchlist"
        action="Full list"
        badge={
          <div className="flex gap-1">
            {(["NSE", "FX", "CRYPTO"] as AssetTab[]).map((a) => (
              <button key={a} onClick={() => setTab(a)}
                className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-bold border transition-all ${
                  tab === a
                    ? a === "NSE"    ? "bg-cyan-400/15 text-cyan-400 border-cyan-400/20"
                    : a === "FX"     ? "bg-indigo-400/15 text-indigo-400 border-indigo-400/20"
                    : "bg-amber-300/12 text-amber-300 border-amber-300/20"
                    : "bg-slate-100 dark:bg-white/[0.03] text-muted-foreground/50 border-slate-200 dark:border-white/[0.05]"
                }`}>
                {a}
              </button>
            ))}
          </div>
        }
      />
      <div className="mx-3.5">
        <GlassCard className="overflow-hidden">
          {/* Header row */}
          <div className="flex items-center px-3.5 py-2 border-b border-slate-100 dark:border-white/[0.05]">
            <span className="flex-1 text-[9px] font-bold uppercase tracking-[.08em] text-muted-foreground/50">Instrument</span>
            <span className="w-20 text-right text-[9px] font-bold uppercase tracking-[.08em] text-muted-foreground/50">Price</span>
            <span className="w-12 text-right text-[9px] font-bold uppercase tracking-[.08em] text-muted-foreground/50">24H</span>
          </div>
          {list.map((it, i) => (
            <div key={it.sym}
              className={`flex items-center gap-2 px-3.5 py-2.5 cursor-pointer active:opacity-75 transition-opacity ${i < list.length - 1 ? "border-b border-slate-100 dark:border-white/[0.04]" : ""}`}>
              <div className={`w-[3px] h-7 rounded-full flex-shrink-0 ${it.up ? "bg-green-400" : "bg-red-400"}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-mono font-bold text-[12px] text-foreground">{it.sym}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-px rounded-[4px] ${chipCls[tab]}`}>{it.exSeg}</span>
                </div>
                <Sparkline up={it.up} w={48} h={16} />
              </div>
              <div className={`w-20 text-right font-mono font-bold text-[12px] text-foreground ${masked ? "blur-md select-none" : ""} transition-all`}>
                {fmtV(it.v, tab)}
              </div>
              <div className={`w-12 text-right font-mono font-bold text-[11px] ${it.up ? "text-green-400" : "text-red-400"}`}>
                {it.up ? "+" : ""}{it.p.toFixed(2)}%
              </div>
            </div>
          ))}
          <div className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 border-t border-slate-100 dark:border-white/[0.05] cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
            <span className="text-[10.5px] font-semibold text-muted-foreground/60">+ Add symbol</span>
          </div>
        </GlassCard>
      </div>
    </div>
  )
})
HomeWatchlistPreview.displayName = "HomeWatchlistPreview"

const HomePositionsPreview: React.FC<{ masked: boolean }> = React.memo(({ masked }) => {
  const totalPnl = MOCK_POSITIONS.reduce((s, p) => s + p.pnl, 0)
  const assetDot: Record<string, string> = { NSE: "bg-cyan-400", CRY: "bg-amber-300", FX: "bg-indigo-400" }
  return (
    <div>
      <SectionHeader
        label="Positions"
        action="All"
        badge={
          <span className={`font-mono text-[9.5px] font-bold px-2 py-px rounded-[5px] ${masked ? "blur-sm" : ""} ${totalPnl >= 0 ? "bg-green-400/10 text-green-400" : "bg-red-400/10 text-red-400"}`}>
            {totalPnl >= 0 ? "+" : ""}₹{Math.abs(totalPnl).toFixed(0)} P&amp;L
          </span>
        }
      />
      <div className="flex flex-col gap-2 px-3.5">
        {MOCK_POSITIONS.map((p, i) => (
          <div key={i} className="bg-white/80 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] shadow-sm dark:shadow-none rounded-[12px] px-3.5 py-3 flex items-center gap-2.5 cursor-pointer active:scale-[.98] transition-transform">
            <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${p.dir === "LONG" ? "bg-green-400/10 border border-green-400/18" : "bg-red-400/10 border border-red-400/18"}`}>
              {p.dir === "LONG"
                ? <TrendingUp className="w-4 h-4 text-green-400" />
                : <TrendingDown className="w-4 h-4 text-red-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="font-mono font-bold text-[12.5px] text-foreground">{p.sym}</span>
                <span className={`text-[9px] font-bold px-1.5 py-px rounded-[4px] border ${p.dir === "LONG" ? "bg-green-400/10 border-green-400/20 text-green-400" : "bg-red-400/10 border-red-400/20 text-red-400"}`}>{p.dir}</span>
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${assetDot[p.asset] ?? "bg-muted-foreground/40"}`} />
              </div>
              <p className="text-[10px] text-muted-foreground/60">Qty {p.qty} · Avg <span className="font-mono">{p.avg.toLocaleString("en-IN")}</span></p>
            </div>
            <div className={`text-right ${masked ? "blur-md select-none" : ""} transition-all`}>
              <p className="font-mono font-bold text-[12px] text-foreground mb-0.5">{p.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</p>
              <p className={`font-mono font-bold text-[11px] ${p.pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                {p.pnl >= 0 ? "+" : ""}₹{Math.abs(p.pnl).toFixed(2)}{" "}
                <span className="opacity-60">({p.pct >= 0 ? "+" : ""}{p.pct.toFixed(2)}%)</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})
HomePositionsPreview.displayName = "HomePositionsPreview"

const HomeSectorHeatmap: React.FC = React.memo(() => {
  const [tf, setTf] = useState("1D")
  const adv = SECTORS.filter((s) => s.p >= 0).length
  const dec = SECTORS.length - adv
  const tone = (p: number) => {
    const a = Math.min(Math.abs(p) / 3.5, 1)
    return p >= 0
      ? { bg: `rgba(74,222,128,${0.08 + a * 0.3})`, border: `rgba(74,222,128,${0.18 + a * 0.35})`, text: "#86efac" }
      : { bg: `rgba(248,113,113,${0.08 + a * 0.3})`, border: `rgba(248,113,113,${0.18 + a * 0.35})`, text: "#fca5a5" }
  }
  return (
    <div>
      <SectionHeader
        label="Sectors"
        badge={
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9px] font-bold text-green-400 bg-green-400/10 px-1.5 py-px rounded-[4px]">{adv} ▲</span>
            <span className="font-mono text-[9px] font-bold text-red-400 bg-red-400/10 px-1.5 py-px rounded-[4px]">{dec} ▼</span>
            <div className="flex gap-1">
              {["1D", "1W", "1M"].map((t) => (
                <button key={t} onClick={() => setTf(t)}
                  className={`px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all ${tf === t ? "bg-muted dark:bg-white/10 text-foreground border-border dark:border-white/15" : "bg-slate-100 dark:bg-white/[0.03] text-muted-foreground/50 border-slate-200 dark:border-white/[0.05]"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        }
      />
      <div className="px-3.5 grid grid-cols-6 gap-1.5" style={{ gridAutoRows: "minmax(44px,auto)" }}>
        {SECTORS.map((s) => {
          const t = tone(s.p)
          const span = Math.min(Math.max(1, Math.round(s.w / 4)), 3)
          return (
            <div key={s.name}
              className="rounded-[10px] p-2 flex flex-col justify-between cursor-pointer active:scale-[.97] transition-transform"
              style={{ gridColumn: `span ${span}`, background: t.bg, border: `1px solid ${t.border}`, minHeight: s.w >= 14 ? 60 : 44 }}>
              <p className="text-[10px] font-bold text-gray-900 dark:text-foreground leading-tight">{s.name}</p>
              <div className="flex justify-between items-end mt-1">
                <span className="font-mono text-[8px] font-semibold text-gray-500 dark:text-muted-foreground/60">{s.w}%</span>
                <span className="font-mono font-bold text-[10.5px]" style={{ color: t.text }}>
                  {s.p >= 0 ? "+" : ""}{s.p.toFixed(2)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
HomeSectorHeatmap.displayName = "HomeSectorHeatmap"

const HomePriceAlerts: React.FC = React.memo(() => {
  const [alerts, setAlerts] = useState(MOCK_ALERTS)
  const toggle = useCallback((i: number) => {
    setAlerts((prev) => prev.map((a, j) => (j === i ? { ...a, active: !a.active } : a)))
  }, [])
  const assetDot: Record<string, string> = { NSE: "#22d3ee", CRY: "#fcd34d", FX: "#818cf8" }
  return (
    <div>
      <SectionHeader
        label="Price Alerts"
        badge={<span className="font-mono text-[9.5px] font-bold text-muted-foreground/60">{alerts.filter((a) => a.active).length}/{alerts.length} live</span>}
        action="+ New"
      />
      <div className="mx-3.5">
        <GlassCard className="overflow-hidden">
          {alerts.map((a, i) => (
            <div key={i}
              className={`flex items-center gap-2.5 px-3.5 py-3 ${i < alerts.length - 1 ? "border-b border-slate-100 dark:border-white/[0.04]" : ""}`}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: assetDot[a.asset] ?? "#fff", boxShadow: `0 0 6px ${assetDot[a.asset] ?? "#fff"}` }} />
              <div className="flex-1 min-w-0">
                <p className="font-mono font-bold text-[12px] text-foreground mb-0.5">{a.sym}</p>
                <p className="text-[10px] text-muted-foreground/65">{a.cond} <span className="font-mono font-bold text-muted-foreground">{a.px}</span></p>
              </div>
              {/* Toggle */}
              <button onClick={() => toggle(i)}
                className={`relative w-8 h-[18px] rounded-full flex-shrink-0 transition-all ${a.active ? "" : "bg-slate-200 dark:bg-white/[0.07]"}`}
                style={a.active ? { background: "rgba(74,222,128,.35)" } : undefined}
                aria-checked={a.active}>
                <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all ${a.active ? "" : "bg-slate-300 dark:bg-white/30"}`}
                  style={{
                    left: a.active ? "calc(100% - 16px)" : "2px",
                    background: a.active ? "#4ade80" : undefined,
                    boxShadow: a.active ? "0 0 6px rgba(74,222,128,.5)" : "none",
                    ...(!a.active ? {} : {}),
                  }} />
              </button>
            </div>
          ))}
        </GlassCard>
      </div>
    </div>
  )
})
HomePriceAlerts.displayName = "HomePriceAlerts"

const HomeEventsCalendar: React.FC = React.memo(() => {
  const toneMap: Record<string, { bg: string; border: string; text: string }> = {
    cyan:   { bg: "rgba(34,211,238,.1)",  border: "rgba(34,211,238,.2)",  text: "#22d3ee" },
    green:  { bg: "rgba(74,222,128,.1)",  border: "rgba(74,222,128,.2)",  text: "#4ade80" },
    amber:  { bg: "rgba(252,211,77,.1)",  border: "rgba(252,211,77,.2)",  text: "#fcd34d" },
    indigo: { bg: "rgba(129,140,248,.1)", border: "rgba(129,140,248,.2)", text: "#818cf8" },
  }
  return (
    <div>
      <SectionHeader
        label="This Week"
        badge={<span className="font-mono text-[9.5px] font-bold text-muted-foreground/60">{EVENTS.length} events</span>}
        action="Calendar"
      />
      <div className="flex gap-2.5 overflow-x-auto px-3.5 pb-0.5 [&::-webkit-scrollbar]:hidden">
        {EVENTS.map((e, i) => {
          const t = toneMap[e.tone]
          return (
            <div key={i} className="flex-shrink-0 min-w-[148px] bg-white/80 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] shadow-sm dark:shadow-none rounded-[12px] p-3 flex flex-col gap-2 cursor-pointer active:scale-[.975] transition-transform">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-bold text-muted-foreground/60 tracking-[.08em]">{e.day}</p>
                  <p className="font-mono font-bold text-[20px] text-foreground leading-none tracking-[-0.02em]">{e.date}</p>
                </div>
                <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-[4px]"
                  style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.text }}>
                  {e.kind}
                </span>
              </div>
              <div>
                <p className="font-mono font-bold text-[11px] text-foreground mb-0.5">{e.sym}</p>
                <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">{e.label}</p>
                <p className="font-mono text-[9px] text-muted-foreground/60">{e.time}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
HomeEventsCalendar.displayName = "HomeEventsCalendar"

const HomeNewsRail: React.FC = React.memo(() => {
  const toneMap: Record<string, { bg: string; text: string }> = {
    cyan:   { bg: "rgba(34,211,238,.12)",  text: "#67e8f9" },
    amber:  { bg: "rgba(252,211,77,.12)",  text: "#fcd34d" },
    indigo: { bg: "rgba(129,140,248,.12)", text: "#a5b4fc" },
  }
  return (
    <div>
      <SectionHeader
        label="News for you"
        badge={
          <div className="flex items-center gap-1.5">
            <span className="w-[5px] h-[5px] rounded-full bg-red-400" style={{ boxShadow: "0 0 6px #f87171" }} />
            <span className="font-mono text-[9.5px] font-bold text-muted-foreground/60">LIVE</span>
          </div>
        }
        action="All"
      />
      <div className="mx-3.5">
        <GlassCard className="overflow-hidden">
          {NEWS_ITEMS.map((n, i) => {
            const t = toneMap[n.tone]
            return (
              <div key={i}
                className={`flex gap-3 px-3.5 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors ${i < NEWS_ITEMS.length - 1 ? "border-b border-slate-100 dark:border-white/[0.04]" : ""}`}>
                <div className="w-11 h-11 rounded-[10px] flex items-center justify-center flex-shrink-0"
                  style={{ background: t.bg, border: `1px solid ${t.bg}` }}>
                  <span className="font-mono text-[8.5px] font-bold text-center leading-tight px-0.5" style={{ color: t.text }}>
                    {n.tag.length > 6 ? n.tag.slice(0, 6) : n.tag}
                  </span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <p className="text-[12px] font-semibold text-foreground/90 leading-[1.35] line-clamp-2">{n.ttl}</p>
                  <div className="flex items-center gap-2 text-[10px] font-semibold text-muted-foreground/60">
                    <span>{n.src}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                    <span className="font-mono">{n.t} ago</span>
                  </div>
                </div>
              </div>
            )
          })}
        </GlassCard>
      </div>
    </div>
  )
})
HomeNewsRail.displayName = "HomeNewsRail"

const HomeRecentlyTraded: React.FC<{ masked: boolean }> = React.memo(({ masked }) => {
  const assetDot: Record<string, string> = { NSE: "#22d3ee", CRY: "#fcd34d", FX: "#818cf8" }
  const fmt = (it: typeof RECENT_TRADED[0]) =>
    it.asset === "FX" ? it.v.toFixed(4)
    : it.asset === "CRY" ? `$${it.v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
    : `₹${it.v.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
  return (
    <div>
      <SectionHeader label="Recently Traded" action="Search" />
      <div className="flex gap-2 overflow-x-auto px-3.5 pb-0.5 [&::-webkit-scrollbar]:hidden">
        {RECENT_TRADED.map((r, i) => (
          <div key={i} className="flex-shrink-0 min-w-[118px] bg-white/80 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] shadow-sm dark:shadow-none rounded-[12px] p-2.5 flex flex-col gap-1.5 cursor-pointer active:scale-[.975] transition-transform">
            <div className="flex items-center gap-1.5">
              <span className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: assetDot[r.asset] ?? "#fff" }} />
              <span className="font-mono font-bold text-[11px] text-foreground truncate">{r.sym}</span>
            </div>
            <p className={`font-mono font-bold text-[12px] text-foreground ${masked ? "blur-md select-none" : ""} transition-all`}>{fmt(r)}</p>
            <p className={`font-mono font-bold text-[10.5px] ${r.up ? "text-green-400" : "text-red-400"}`}>
              {r.up ? "+" : ""}{r.p.toFixed(2)}%
            </p>
          </div>
        ))}
      </div>
    </div>
  )
})
HomeRecentlyTraded.displayName = "HomeRecentlyTraded"

const HomeOptionChainPeek: React.FC = React.memo(() => {
  const spot = 22901
  const maxOI = Math.max(...OPT_CHAIN.flatMap((r) => [r.ceOI, r.peOI]))
  return (
    <div>
      <SectionHeader
        label="NIFTY Options"
        badge={
          <span className="font-mono text-[9.5px] font-bold text-foreground bg-muted dark:bg-white/[0.06] px-2 py-px rounded-[5px]">
            Spot {spot.toLocaleString("en-IN")}
          </span>
        }
        action="Chain"
      />
      <div className="mx-3.5">
        <GlassCard className="overflow-hidden">
          {/* Header */}
          <div className="grid px-3 py-2 border-b border-slate-100 dark:border-white/[0.05] text-[8.5px] font-bold uppercase tracking-[.08em] text-muted-foreground/50"
            style={{ gridTemplateColumns: "1fr 60px 1fr" }}>
            <div className="flex justify-between"><span>CE OI</span><span className="text-green-400">CALL</span></div>
            <div className="text-center">Strike</div>
            <div className="flex justify-between"><span className="text-red-400">PUT</span><span>PE OI</span></div>
          </div>
          {OPT_CHAIN.map((r, i) => {
            const atm = Math.abs(r.k - spot) <= 25
            return (
              <div key={r.k}
                className={`grid items-center px-3 py-2.5 ${i < OPT_CHAIN.length - 1 ? "border-b border-slate-100 dark:border-white/[0.04]" : ""} ${atm ? "bg-cyan-400/[0.06]" : ""}`}
                style={{ gridTemplateColumns: "1fr 60px 1fr", gap: "6px" }}>
                {/* CE */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex-1 relative h-3.5 bg-slate-100 dark:bg-white/[0.04] rounded-[3px] overflow-hidden">
                    <div className="absolute right-0 top-0 bottom-0 rounded-[3px]"
                      style={{ width: `${(r.ceOI / maxOI) * 100}%`, background: "linear-gradient(90deg,transparent,rgba(74,222,128,.4))" }} />
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 font-mono text-[9px] font-bold text-muted-foreground/75">{r.ceOI}K</span>
                  </div>
                  <div className="min-w-[44px] text-right">
                    <p className="font-mono font-bold text-[11px] text-foreground">{r.ceLtp.toFixed(1)}</p>
                    <p className={`font-mono text-[8.5px] font-bold ${r.ceChg >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {r.ceChg >= 0 ? "+" : ""}{r.ceChg}%
                    </p>
                  </div>
                </div>
                {/* Strike */}
                <div className="text-center">
                  <p className={`font-mono font-bold text-[12px] ${atm ? "text-cyan-400" : "text-foreground"}`}>{r.k}</p>
                  {atm && <p className="text-[7px] font-bold text-cyan-400 tracking-[.1em] mt-px">ATM</p>}
                </div>
                {/* PE */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="min-w-[44px]">
                    <p className="font-mono font-bold text-[11px] text-foreground">{r.peLtp.toFixed(1)}</p>
                    <p className={`font-mono text-[8.5px] font-bold ${r.peChg >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {r.peChg >= 0 ? "+" : ""}{r.peChg}%
                    </p>
                  </div>
                  <div className="flex-1 relative h-3.5 bg-slate-100 dark:bg-white/[0.04] rounded-[3px] overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 rounded-[3px]"
                      style={{ width: `${(r.peOI / maxOI) * 100}%`, background: "linear-gradient(90deg,rgba(248,113,113,.4),transparent)" }} />
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 font-mono text-[9px] font-bold text-muted-foreground/75">{r.peOI}K</span>
                  </div>
                </div>
              </div>
            )
          })}
        </GlassCard>
      </div>
    </div>
  )
})
HomeOptionChainPeek.displayName = "HomeOptionChainPeek"

const HomeOrdersPreview: React.FC = React.memo(() => {
  const stStyle: Record<string, React.CSSProperties> = {
    OPEN:     { backgroundColor: "rgba(34,211,238,.1)",  color: "#67e8f9" },
    EXECUTED: { backgroundColor: "rgba(74,222,128,.1)",  color: "#4ade80" },
    PENDING:  { backgroundColor: "rgba(252,211,77,.1)",  color: "#fcd34d" },
  }
  const stLabel: Record<string, string> = { OPEN: "OPEN", EXECUTED: "DONE", PENDING: "PEND" }
  const assetGlow: Record<string, string> = { NSE: "#22d3ee", CRY: "#fcd34d", FX: "#818cf8" }
  return (
    <div>
      <SectionHeader label="Orders" action="Order Book" />
      <div className="mx-3.5">
        <GlassCard className="overflow-hidden">
          {MOCK_ORDERS.map((o, i) => (
            <div key={i}
              className={`flex items-center gap-2.5 px-3.5 py-3 ${i < MOCK_ORDERS.length - 1 ? "border-b border-slate-100 dark:border-white/[0.04]" : ""}`}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: assetGlow[o.asset] ?? "#fff", boxShadow: `0 0 6px ${assetGlow[o.asset] ?? "#fff"}` }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-mono font-bold text-[12px] text-foreground">{o.sym}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-px rounded-[4px] border ${o.side === "BUY" ? "bg-green-400/10 border-green-400/20 text-green-400" : "bg-red-400/10 border-red-400/20 text-red-400"}`}>
                    {o.side}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 font-mono">Qty {o.qty} · {o.px}</p>
              </div>
              <div className="text-right">
                <span className="block text-[9px] font-bold px-1.5 py-px rounded-[4px] mb-1"
                  style={stStyle[o.st]}>
                  {stLabel[o.st]}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground/50">{o.t}</span>
              </div>
            </div>
          ))}
        </GlassCard>
      </div>
    </div>
  )
})
HomeOrdersPreview.displayName = "HomeOrdersPreview"

// ─── Main export ──────────────────────────────────────────────────────────────

export const TradingHome: React.FC<TradingHomeProps> = ({
  userName,
  session,
  portfolio,
  pnl,
  onQuickBuy,
  onQuickSell,
  marketSession,
}) => {
  const displayName = userName || session?.user?.name || "Trader"
  const [masked, setMasked] = useState(false)
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false)
  const userId = session?.user?.id as string | undefined

  const { watchlists } = useEnhancedWatchlists(userId)
  const {
    config: homeConfig,
    isSaving: isHomeConfigSaving,
    hasUserOverride,
    saveUserOverride,
    resetUserOverride,
  } = useHomeDashboardConfig()

  const tickerItems = useMemo(
    () => buildHomeTickerItemsFromConfig(homeConfig.tickerTapeSymbols, watchlists),
    [homeConfig.tickerTapeSymbols, watchlists],
  )

  const moversUniverse = useMemo(
    () => buildHomeMoversUniverse(tickerItems, watchlists),
    [tickerItems, watchlists],
  )

  const heatmapItems = useMemo(() => {
    const wlItems = buildTradingHomeWatchlistHeatmapItems(watchlists).slice(0, 8)
    const merged = [...moversUniverse, ...wlItems]
    const map = new Map<number, { label: string; token: number }>()
    for (const item of merged) {
      if (!map.has(item.token)) map.set(item.token, item)
      if (map.size >= 12) break
    }
    return Array.from(map.values())
  }, [moversUniverse, watchlists])

  const handleSaveCustomization = async (nextConfig: typeof homeConfig) => {
    const result = await saveUserOverride(nextConfig)
    toast(result.success
      ? { title: "Saved", description: "Your Home widget preferences are now active." }
      : { title: "Unable to Save", description: result.error, variant: "destructive" })
    return result.success
  }

  const handleResetCustomization = async () => {
    const result = await resetUserOverride()
    toast(result.success
      ? { title: "Reset Complete", description: "Your Home tab now follows admin defaults." }
      : { title: "Unable to Reset", description: result.error, variant: "destructive" })
    return result.success
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-24 lg:pb-8">

      {/* ── Ticker tape ─────────────────────────────────── */}
      {homeConfig.enabledWidgets.tickerTape && (
        <HomeTickerMarquee />
      )}

      {/* ── Top action bar ───────────────────────────────── */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        {/* Mask toggle */}
        <button
          onClick={() => setMasked((v) => !v)}
          className="w-8 h-8 rounded-[10px] bg-muted dark:bg-white/[0.05] border border-border dark:border-white/[0.08] flex items-center justify-center cursor-pointer hover:bg-muted/70 dark:hover:bg-white/[0.08] transition-colors"
          aria-label="Toggle value masking">
          {masked ? <EyeOff className="w-3.5 h-3.5 text-muted-foreground/85" /> : <Eye className="w-3.5 h-3.5 text-muted-foreground/85" />}
        </button>
        {/* Notification bell */}
        <button className="w-8 h-8 rounded-[10px] bg-muted dark:bg-white/[0.05] border border-border dark:border-white/[0.08] flex items-center justify-center cursor-pointer hover:bg-muted/70 dark:hover:bg-white/[0.08] transition-colors relative"
          aria-label="Notifications">
          <Bell className="w-3.5 h-3.5 text-muted-foreground/85" />
          <span className="absolute top-[7px] right-[7px] w-[5px] h-[5px] bg-red-400 rounded-full border border-background" style={{ boxShadow: "0 0 5px #f87171" }} />
        </button>
        <div className="flex-1" />
        {/* Customize */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsCustomizationOpen(true)}
          className="h-8 rounded-[10px] text-[10px] text-muted-foreground/75 hover:text-foreground hover:bg-muted dark:hover:bg-white/[0.06] border border-border dark:border-white/[0.07] px-2.5 gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Customize
        </Button>
      </div>

      {/* ── Mobile scroll feed ───────────────────────────── */}
      <div className="flex flex-col gap-5 lg:hidden">

        {/* 1. Welcome card */}
        <HomeWelcomeCard displayName={displayName} marketSession={marketSession} portfolio={portfolio} pnl={pnl} masked={masked} />

        {/* 2. NIFTY live candle chart — minimalist view, no trade bar */}
        <div className="mx-3.5 rounded-[20px] overflow-hidden border border-border dark:border-white/[0.08]" style={{ minHeight: 280 }}>
          <PriceChart
            symbols={NIFTY_CHART_SYMBOL}
            defaultSymbolKey="NSE:NIFTY"
            watchlists={watchlists}
          />
        </div>

        {/* 3. Funds strip */}
        <HomeFundsStrip portfolio={portfolio} pnl={pnl} masked={masked} />

        {/* 4. AI insight chip */}
        <HomeInsightCard />

        {/* 5. Market overview — NSE / FX / CRYPTO */}
        <HomeMarketOverview />

        {/* 6. Quick actions */}
        <HomeQuickActions />

        {/* 7. Watchlist preview */}
        <HomeWatchlistPreview masked={masked} watchlists={watchlists} />

        {/* 8. Positions preview */}
        <HomePositionsPreview masked={masked} />

        {/* 9. Sector heatmap */}
        <HomeSectorHeatmap />

        {/* 10. Price alerts */}
        <HomePriceAlerts />

        {/* 11. Top movers */}
        {homeConfig.enabledWidgets.topMovers && (
          <div className="px-3.5">
            <SectionHeader label="Top Movers" />
            <TopMoversWidget items={moversUniverse} />
          </div>
        )}

        {/* 12. Events calendar */}
        <HomeEventsCalendar />

        {/* 13. News */}
        <HomeNewsRail />

        {/* 14. Recently traded */}
        <HomeRecentlyTraded masked={masked} />

        {/* 15. NIFTY options peek */}
        <HomeOptionChainPeek />

        {/* 16. Orders preview */}
        <HomeOrdersPreview />

      </div>

      {/* ── Desktop grid (lg+) ──────────────────────────── */}
      <div className="hidden lg:block px-5 pb-8">

        {/* Desktop welcome + funds */}
        <div className="grid grid-cols-12 gap-4 mb-5">
          <div className="col-span-8">
            <HomeWelcomeCard displayName={displayName} marketSession={marketSession} portfolio={portfolio} pnl={pnl} masked={masked} />
          </div>
          <div className="col-span-4 flex flex-col justify-center">
            <HomeFundsStrip portfolio={portfolio} pnl={pnl} masked={masked} />
          </div>
        </div>

        {homeConfig.enabledWidgets.accountMetricsBar && (
          <div className="rounded-xl overflow-hidden mb-4">
            <AccountMetricsBar portfolio={portfolio} pnl={pnl} />
          </div>
        )}

        {/* Desktop workspace grid */}
        <div className="grid grid-cols-12 gap-4 auto-rows-min">
          <div className="col-span-8 flex flex-col gap-4">
            {homeConfig.enabledWidgets.chart && (
              <div className="min-h-[560px] rounded-xl overflow-hidden border border-border dark:border-white/[0.08]">
                <PriceChart
                  symbols={NIFTY_CHART_SYMBOL}
                  defaultSymbolKey="NSE:NIFTY"
                  watchlists={watchlists}
                  onQuickBuy={onQuickBuy}
                  onQuickSell={onQuickSell}
                />
              </div>
            )}
            {homeConfig.enabledWidgets.heatmap && (
              <div className="rounded-xl overflow-hidden">
                <MarketHeatmap items={heatmapItems} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <HomeEventsCalendar />
              <HomeNewsRail />
            </div>
          </div>
          <div className="col-span-4 flex flex-col gap-4">
            {homeConfig.enabledWidgets.timeAndSales && (
              <div className="h-[300px] rounded-xl overflow-hidden shadow-sm">
                <TimeAndSales />
              </div>
            )}
            {homeConfig.enabledWidgets.screener && <div className="rounded-xl overflow-hidden"><ScreenerLite /></div>}
            {homeConfig.enabledWidgets.topMovers && <div className="rounded-xl overflow-hidden"><TopMoversWidget items={moversUniverse} /></div>}
            {homeConfig.enabledWidgets.marketStats && <div className="rounded-xl overflow-hidden"><MarketStatsWidget items={moversUniverse} /></div>}
            <HomeSectorHeatmap />
            <HomePriceAlerts />
            <HomeOptionChainPeek />
          </div>
        </div>
      </div>

      <HomeCustomizationDialog
        open={isCustomizationOpen}
        onOpenChange={setIsCustomizationOpen}
        config={homeConfig}
        hasUserOverride={hasUserOverride}
        isSaving={isHomeConfigSaving}
        onSave={handleSaveCustomization}
        onReset={handleResetCustomization}
      />
    </div>
  )
}

export default TradingHome
