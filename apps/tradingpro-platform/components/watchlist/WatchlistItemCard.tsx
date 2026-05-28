/**
 * File:        components/watchlist/WatchlistItemCard.tsx
 * Module:      Components · Watchlist · Item Card
 * Purpose:     Swipeable watchlist row with Bloomberg-style price column (LTP primary, change
 *              pill with ▲/▼ + absolute + % secondary) and expandable chart drawer.
 *
 * Exports:
 *   - WatchlistItemCard(props: WatchlistItemCardProps) — the card component
 *   - WatchlistItemCardProps — prop shape
 *
 * Depends on:
 *   - @/lib/hooks/use-prisma-watchlist — WatchlistItemData type (SWR/REST hook)
 *   - @/components/watchlist/watchlist-card-number-utils — resolveWatchlistCardPriceMetrics
 *   - @/components/watchlist/search-result-card — getInstrumentMeta, formatPrice, formatExpiry
 *   - @/lib/market-display/bid-ask-spread-config.schema — synthetic spread config
 *
 * Side-effects:
 *   - SWR fetch to /api/admin/market-controls/spread-config (spread config)
 *
 * Key invariants:
 *   - isFutureKind includes "commodity" so MCX futures show expiry; expiryLabel is empty for
 *     spot instruments so the guard never fires falsely.
 *   - Price column: price stacks above change pill (Bloomberg hierarchy, not side-by-side).
 *   - ▲/▼ (U+25B2/U+25BC) are solid Unicode triangles — visually filled unlike the Δ letter.
 *
 * Read order:
 *   1. WatchlistItemCardProps — prop shape
 *   2. WatchlistItemCard — main component (layout starts at the return statement)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

"use client"

import React, { useState, useRef, useEffect, useMemo } from "react"
import Image from "next/image"
import useSWR from "swr"
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  // TrendingUp / TrendingDown removed when the price-change indicator was
  // replaced by the Δ glyph (commit a7873a9). They were unused after that.
  Trash2,
  Bell,
  BellOff,
  Loader2,
  MoreVertical,
  Activity,
  X,
  ArrowDown,
  ArrowUp,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import type { WatchlistItemData } from "@/lib/hooks/use-prisma-watchlist"
import { WatchlistObsidianChartShell } from "@/components/trading/widgets/watchlist-obsidian-chart-shell"
import { Drawer, DrawerContent, DrawerClose } from "@/components/ui/drawer"
import { formatExpiryDateIST } from "@/lib/date-utils"
import { resolveWatchlistCardPriceMetrics } from "@/components/watchlist/watchlist-card-number-utils"
import {
  formatCompactExpiry,
  formatStrikePrice,
  getDaysUntilExpiry,
  isMCXInstrument,
  isSegmentFuturesOrCommodity,
  isSegmentOption,
} from "@/lib/market-data/instrument-summary"
import { getInstrumentMeta, formatPrice, formatExpiry } from "@/components/watchlist/search-result-card"
import {
  parseBidAskSpreadConfigJson,
  pickRandomSpread,
  type BidAskSpreadConfigV1,
} from "@/lib/market-display/bid-ask-spread-config.schema"

const spreadConfigFetcher = (url: string) =>
  fetch(url, { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => parseBidAskSpreadConfigJson(d?.data ?? null))

interface MarketDepth {
  bid: Array<{ price: number; quantity: number }>
  ask: Array<{ price: number; quantity: number }>
}

interface OHLCData {
  open: number
  high: number
  low: number
  close: number
  volume: number
  turnover: number
}

interface ExtendedQuote {
  last_trade_price: number
  prev_close_price: number
  day_high?: number
  day_low?: number
  day_change?: number
  day_change_percent?: number
  market_depth?: MarketDepth
  ohlc?: OHLCData
}

interface WatchlistItemCardProps {
  item: WatchlistItemData
  quote?: ExtendedQuote
  isSnapshotPrice?: boolean
  isPriceDisplayable?: boolean
  isRefreshingPrice?: boolean
  onSelect?: (item: WatchlistItemData & { change: number; changePercent: number }) => void
  onEdit?: (item: WatchlistItemData) => void
  onRemove?: (itemId: string) => Promise<void>
  onToggleAlert?: (itemId: string, enabled: boolean, price?: number) => Promise<void>
  onQuickBuy?: (item: WatchlistItemData & { change: number; changePercent: number }) => void
  onQuickSell?: (item: WatchlistItemData & { change: number; changePercent: number }) => void
  isRemoving?: boolean
  className?: string
}

function LogoAvatar({ src }: { src: string }) {
  const [errored, setErrored] = useState(false)
  if (errored) return null
  return (
    <div className="relative h-8 w-8 shrink-0 rounded-full overflow-hidden bg-muted/40 border border-border/30">
      <Image
        src={src}
        alt=""
        fill
        sizes="32px"
        className="object-contain p-0.5"
        onError={() => setErrored(true)}
      />
    </div>
  )
}

const SWIPE_THRESHOLD = 80
const DELETE_ACTION_WIDTH = 70

export function WatchlistItemCard({
  item,
  quote,
  isSnapshotPrice = false,
  isPriceDisplayable = true,
  isRefreshingPrice = false,
  onSelect,
  onEdit,
  onRemove,
  onToggleAlert,
  onQuickBuy,
  onQuickSell,
  isRemoving = false,
  className,
}: WatchlistItemCardProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [showChartDrawer, setShowChartDrawer] = useState(false)

  const handleChartDrawerChange = (openState: boolean) => {
    if (!openState) {
      console.info("📊 [WATCHLIST-CHART] Drawer dismissed", {
        symbol: item.symbol,
        watchlistItemId: item.watchlistItemId
      })
    }
    setShowChartDrawer(openState)
  }
  
  const x = useMotionValue(0)
  const opacity = useTransform(x, [-200, -SWIPE_THRESHOLD, 0], [0.8, 1, 1])
  const scale = useTransform(x, [-200, -SWIPE_THRESHOLD, 0], [0.95, 1, 1])

  // Calculate price data (prefer display_price for UI)
  const { ltp, prevClose, change, changePercent, isPositive, chartSeedPrice } =
    resolveWatchlistCardPriceMetrics({ item, quote })

  // --- Tick flash ---
  const prevPriceRef = React.useRef<number | null>(null)
  const [tickClass, setTickClass] = React.useState<"tick-flash-up" | "tick-flash-down" | "">("")
  const flashTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  React.useEffect(() => {
    const prev = prevPriceRef.current
    prevPriceRef.current = ltp
    if (prev === null || prev === ltp) return
    setTickClass(ltp > prev ? "tick-flash-up" : "tick-flash-down")
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = setTimeout(() => setTickClass(""), 420)
  }, [ltp])
  React.useEffect(() => () => { if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current) }, [])


  // Determine instrument type (shared rules with statements/orders formatting). Only the
  // shapes still consumed below are kept — `isEquity` was previously used to render the
  // generic EQ badge, which is now driven by getInstrumentMeta() further down.
  const isFutures = isSegmentFuturesOrCommodity(item.segment, item.optionType ?? null)
  const isOption = isSegmentOption(item.segment, item.optionType ?? null)
  const isMCX = isMCXInstrument(item.exchange, item.segment)

  // Asset-aware visual + price-format meta — same classifier the search card uses, so the
  // watchlist row, the search drawer, and any future picker all share one visual language.
  const meta = getInstrumentMeta({
    exchange: item.exchange,
    segment: item.segment,
    instrumentType: (item as any).instrumentType ?? undefined,
    assetClass: (item as any).assetClass ?? undefined,
    optionType: item.optionType ?? null,
    canonicalSymbol: (item as any).canonicalSymbol ?? undefined,
    isDerivative: (item as any).isDerivative ?? undefined,
  })
  const hasLiveSubscriptionIssue = Boolean((item as any)?.hasLiveSubscriptionIssue)
  const liveSubscriptionWarning =
    typeof (item as any)?.liveSubscriptionWarning === "string"
      ? (item as any).liveSubscriptionWarning
      : "Live quote stream unavailable for this instrument."
  // Keep one display policy: hide numeric price when quote is stale beyond 60s.
  const showLivePrice = !hasLiveSubscriptionIssue && isPriceDisplayable

  // Synthetic bid/ask — random spread re-picked whenever spreadConfig changes so admin
  // edits flow through to the watchlist on tab focus / network reconnect. Redis pub/sub
  // invalidation ensures admin saves propagate immediately to all open watchlist cards.
  const { data: spreadConfig, mutate: mutateSpreadConfig } = useSWR<BidAskSpreadConfigV1>(
    "/api/admin/market-controls/spread-config",
    spreadConfigFetcher,
    {
      revalidateOnFocus: true,
      focusThrottleInterval: 60_000,
      revalidateOnReconnect: true,
      dedupingInterval: 5_000,
    },
  )

  // Subscribe to Redis pub/sub so admin spread changes propagate without tab focus.
  useEffect(() => {
    let unsub: (() => void) | undefined
    import("@/lib/market-control/market-control-pubsub")
      .then(({ subscribeConfigChanged }) =>
        subscribeConfigChanged(() => { void mutateSpreadConfig() })
      )
      .then((fn) => { unsub = fn })
      .catch(() => {})
    return () => { unsub?.() }
  }, [mutateSpreadConfig])
  const lockedSpreadRef = useRef<number>(0)
  /** State mirror of lockedSpreadRef so useMemo reacts when spread is first set. */
  const [lockedSpreadPct, setLockedSpreadPct] = useState<number>(0)
  useEffect(() => {
    if (!spreadConfig) return
    const seg = (item.segment || item.exchange || "NSE").toUpperCase()
    const spread = pickRandomSpread(spreadConfig, seg)
    lockedSpreadRef.current = spread
    setLockedSpreadPct(spread)
  }, [spreadConfig, item.segment, item.exchange])
  const cardBidAsk = useMemo(() => {
    if (!showLivePrice || ltp <= 0 || lockedSpreadPct <= 0) return null
    const half = lockedSpreadPct / 2 / 100
    return {
      bid: Number((ltp * (1 - half)).toFixed(2)),
      ask: Number((ltp * (1 + half)).toFixed(2)),
    }
  }, [showLivePrice, ltp, lockedSpreadPct])
  
  // Get expiry info
  const expiryDate = item.expiry ? formatCompactExpiry(item.expiry) : ''
  const daysUntilExpiry = getDaysUntilExpiry(item.expiry)
  const isNearExpiry = daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry >= 0

  const expiryLabel = formatExpiry(item.expiry)
  const strikeNum = item.strikePrice ?? null

  const kind = meta.kind
  const isOptionKind = kind === "fno-opt-ce" || kind === "fno-opt-pe"
  // Commodity futures resolve to "commodity" kind; expiryLabel is already empty for spot instruments
  // so the `{expiryLabel && isFutureKind}` guard won't fire falsely for non-derivative commodities.
  const isFutureKind = kind === "fno-fut" || kind === "commodity"

  const composedTitle = (() => {
    if (isOptionKind && strikeNum !== null) {
      const opt = kind === "fno-opt-ce" ? "CE" : "PE"
      return `${item.symbol} ${strikeNum.toLocaleString("en-IN", { maximumFractionDigits: 0 })} ${opt}`
    }
    if (isFutureKind) {
      return expiryLabel ? `${item.symbol} ${expiryLabel}` : item.symbol
    }
    return item.symbol
  })()

  const tertiary: string = (() => {
    if (isOptionKind && strikeNum !== null) {
      const strikeFmt = `Strike ₹${strikeNum.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
      return item.lotSize ? `${strikeFmt} · Lot ${item.lotSize}` : strikeFmt
    }
    if (isFutureKind) {
      return item.lotSize ? `Lot ${item.lotSize}` : (item.name || "")
    }
    return item.name || ""
  })()

  // Pre-compute deterministic mock chart data so the mini and advanced charts stay in sync.
  // IMPORTANT: this seed must stay stable across live LTP ticks; otherwise the chart will rebuild every tick.
  // Stable baseline for mini mock series and candle seed price; live LTP updates come from market data inside `InstrumentCandleChart`.
  const chartInstrument = useMemo(
    () => ({
      instrumentKey: item.instrumentId || item.symbol || item.watchlistItemId || "watchlist",
      token: item.token,
      instrumentId: item.instrumentId ?? null,
      seedBasePrice: chartSeedPrice,
    }),
    [item.instrumentId, item.symbol, item.watchlistItemId, item.token, chartSeedPrice],
  )

  const handleDragStart = () => {
    setIsDragging(true)
  }

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false)
    
    if (info.offset.x < -SWIPE_THRESHOLD) {
      setShowActions(true)
      x.set(-DELETE_ACTION_WIDTH)
    } else {
      setShowActions(false)
      x.set(0)
    }
  }

  const handleQuickAction = async (action: 'remove' | 'alert') => {
    if (isAnimating) return
    
    setIsAnimating(true)
    
    try {
      const itemId = (item as any)?.watchlistItemId || (item as any)?.id
      if (!itemId) {
        return
      }
      switch (action) {
        case 'remove':
          if (onRemove) await onRemove(itemId)
          break
        case 'alert':
          if (onToggleAlert) {
            const enabled = !item.alertPrice
            await onToggleAlert(itemId, enabled, enabled ? ltp : undefined)
          }
          break
      }
    } catch (error) {
      console.error(`Error in ${action}:`, error)
    } finally {
      setIsAnimating(false)
      setShowActions(false)
      x.set(0)
    }
  }

  const buildOrderPayload = () => {
    const watchlistItemId = (item as any)?.watchlistItemId || (item as any)?.id || null
    const safeChange = Number.isFinite(change) ? change : 0
    const safeChangePercent = Number.isFinite(changePercent) ? changePercent : 0
    const safeLtp = showLivePrice && Number.isFinite(ltp) ? ltp : 0
    const stockId =
      typeof (item as any)?.stockId === "string" && (item as any).stockId.trim()
        ? (item as any).stockId.trim()
        : null
    const normalizedToken = Number.isFinite((item as any)?.token) ? Number((item as any).token) : undefined
    const normalizedInstrumentId =
      typeof (item as any)?.instrumentId === "string" && (item as any).instrumentId.trim()
        ? (item as any).instrumentId.trim().toUpperCase()
        : undefined
    const normalizedExchange =
      typeof (item as any)?.exchange === "string" && (item as any).exchange.trim()
        ? (item as any).exchange.trim().toUpperCase()
        : undefined
    const normalizedSegment =
      typeof (item as any)?.segment === "string" && (item as any).segment.trim()
        ? (item as any).segment.trim().toUpperCase()
        : normalizedExchange
    const safePayloadId =
      typeof watchlistItemId === "string" && watchlistItemId.trim()
        ? watchlistItemId
        : typeof (item as any)?.id === "string"
          ? (item as any).id
          : ""
    return {
      ...item,
      id: safePayloadId,
      stockId,
      watchlistItemId,
      token: normalizedToken,
      instrumentId: normalizedInstrumentId,
      exchange: normalizedExchange,
      segment: normalizedSegment,
      ltp: safeLtp,
      change: safeChange,
      changePercent: safeChangePercent,
    }
  }

  const openOrderDrawer = () => {
    const payload = buildOrderPayload()
    if (!payload || (!(payload as any).symbol && !(payload as any).instrumentId && !(payload as any).token)) {
      return
    }
    // Prefer onSelect when provided — that's the watchlist→peek/expanded/order drawer path.
    // Fall back to onQuickBuy / onQuickSell only when no onSelect is wired (e.g. legacy chart trade bar).
    if (onSelect) {
      onSelect(payload)
      return
    }
    if (onQuickBuy) {
      onQuickBuy(payload)
      return
    }
    if (onQuickSell) {
      onQuickSell(payload)
    }
  }

  const handleCardClick = () => {
    if (!isDragging && !showActions) {
      openOrderDrawer()
    }
  }

  const openAdvancedChart = (e: React.MouseEvent) => {
    e.stopPropagation()
    console.info("📊 [WATCHLIST-CHART] Opening advanced drawer", {
      symbol: item.symbol,
      watchlistItemId: item.watchlistItemId,
      ltp
    })
    setShowChartDrawer(true)
  }
  const closeAdvancedChart = () => {
    console.info("📊 [WATCHLIST-CHART] Closing advanced drawer", {
      symbol: item.symbol,
      watchlistItemId: item.watchlistItemId
    })
    setShowChartDrawer(false)
  }

  const handleChartTradeSell = (e: React.MouseEvent) => {
    e.stopPropagation()
    const payload = buildOrderPayload()
    if (!(payload as any)?.symbol && !(payload as any)?.instrumentId && !(payload as any)?.token) {
      return
    }
    if (!onQuickSell) return
    closeAdvancedChart()
    onQuickSell(payload as WatchlistItemData & { change: number; changePercent: number })
  }

  const handleChartTradeBuy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const payload = buildOrderPayload()
    if (!(payload as any)?.symbol && !(payload as any)?.instrumentId && !(payload as any)?.token) {
      return
    }
    if (!onQuickBuy) return
    closeAdvancedChart()
    onQuickBuy(payload as WatchlistItemData & { change: number; changePercent: number })
  }

  const showChartTradeBar = Boolean(onQuickBuy || onQuickSell)
  const chartTradePriceLabel = showLivePrice ? (formatPrice(ltp, meta.priceFormat) ?? "—") : "—"

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Swipe Delete Background - RIGHT SIDE */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute inset-y-0 right-0 flex items-center justify-center bg-gradient-to-l from-red-500 to-red-600 z-10 rounded-xl w-20 shadow-lg"
          >
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleQuickAction('remove')}
              className="h-full w-full p-0 text-white hover:bg-red-700 rounded-xl"
              disabled={isAnimating || isRemoving}
            >
              {isRemoving ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Trash2 className="h-6 w-6" />
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Card */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -DELETE_ACTION_WIDTH, right: 0 }}
        dragElastic={0.1}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        style={{ x, opacity, scale }}
        className="relative z-20 bg-card"
      >
        <Card
          onClick={handleCardClick}
          className={cn(
            "group relative cursor-pointer overflow-hidden",
            "bg-card/60 border border-border/30",
            "hover:bg-card hover:border-border/70 hover:shadow-[0_2px_12px_rgba(0,0,0,0.18)]",
            "active:scale-[0.985] transition-all duration-100",
            "rounded-2xl",
            isDragging && "shadow-xl scale-[1.02]",
            showActions && "shadow-lg"
          )}
        >
          {/* Left accent stripe — kind-coloured, signals asset class at-a-glance.
              Same pattern as SearchResultCard so the watchlist row visually matches the
              search drawer. */}
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-2 bottom-2 w-[3px] rounded-full opacity-90 pointer-events-none",
              meta.accent.stripe,
            )}
          />

          <div className="flex items-center gap-3 pl-4 pr-3 py-3 w-full">
            {/* ── Company logo (optional) ── */}
            {item.logo_url && <LogoAvatar src={item.logo_url} />}

            {/* ── Body ── */}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              {/* Primary row: title + type badge + status indicators */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[14px] font-semibold text-foreground leading-tight truncate">
                  {composedTitle}
                </span>
                {meta.typeBadge && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 text-[9px] px-1.5 h-[18px] font-bold tracking-wider border",
                      meta.accent.badge,
                    )}
                  >
                    {meta.typeBadge}
                  </Badge>
                )}
                {/* Status indicators */}
                <div className="flex items-center gap-1 shrink-0 ml-1">
                  {item.alertPrice && <Bell className="h-3 w-3 text-yellow-500 shrink-0" />}
                  {hasLiveSubscriptionIssue && (
                    <span className="text-[10px] text-amber-600 font-medium">NO LIVE</span>
                  )}
                  {isRefreshingPrice && !hasLiveSubscriptionIssue && (
                    <span className="text-[10px] text-blue-600 font-medium">↻</span>
                  )}
                  {isSnapshotPrice && !isRefreshingPrice && !hasLiveSubscriptionIssue && (
                    <span className="text-[9px] font-mono font-black text-amber-600" title="Snapshot quote">S</span>
                  )}
                </div>
              </div>

              {/* Secondary row: exchange · type · expiry */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground leading-tight">
                <span className={cn("font-semibold tracking-wide", meta.accent.text)}>{meta.exchangeLabel}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="font-medium tracking-wide">{meta.assetWord}</span>
                {expiryLabel && (isFutureKind || isOptionKind) && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className={cn("font-mono", isNearExpiry ? "text-red-500" : "")}>
                      {expiryLabel} {isNearExpiry && daysUntilExpiry !== null && `(${daysUntilExpiry}d)`}
                    </span>
                  </>
                )}
              </div>

              {/* Tertiary row: company name OR strike/lot */}
              {tertiary && (
                <div className="text-[10.5px] text-muted-foreground/75 leading-tight truncate">
                  {tertiary}
                </div>
              )}
            </div>

            {/* ── Price column — Bloomberg hierarchy: LTP primary, change pill secondary ── */}
            <div className="shrink-0 min-w-[90px] text-right flex flex-col items-end gap-1">
              {/* LTP — primary; tickClass adds green/red flash on each tick */}
              <span className={cn("text-[15px] font-bold font-mono tabular-nums text-foreground leading-none", tickClass)}>
                {showLivePrice ? (formatPrice(ltp, meta.priceFormat) ?? "--") : "--"}
              </span>

              {/* Change pill — ▲/▼ solid triangle + absolute change + % */}
              {showLivePrice ? (
                <div className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-[2px] leading-none",
                  "text-[10px] font-mono tabular-nums font-semibold",
                  isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400",
                )}>
                  <span aria-hidden className="text-[8px]">{isPositive ? "▲" : "▼"}</span>
                  <span>{isPositive ? "+" : ""}{change.toFixed(2)}</span>
                  <span className="opacity-40">·</span>
                  <span>{isPositive ? "+" : ""}{changePercent.toFixed(2)}%</span>
                </div>
              ) : (
                <span
                  className={cn(
                    "inline-flex items-center text-[9px] font-bold tracking-[0.06em] px-1.5 h-[18px] rounded",
                    "bg-muted/60 text-muted-foreground/80 border border-border/50",
                  )}
                >
                  {isRefreshingPrice ? "REFRESHING" : "STALE"}
                </span>
              )}

              {/* Bid/Ask */}
              {showLivePrice && cardBidAsk && (
                <div className="flex items-center justify-end gap-1 font-mono text-[9px] whitespace-nowrap opacity-70">
                  <span className="text-rose-400 font-semibold">B</span>
                  <span className="text-rose-400 tabular-nums">{cardBidAsk.bid.toFixed(1)}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-emerald-400 font-semibold">A</span>
                  <span className="text-emerald-400 tabular-nums">{cardBidAsk.ask.toFixed(1)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Loading Overlay */}
          <AnimatePresence>
            {isRemoving && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-white/90 dark:bg-gray-900/90 flex items-center justify-center z-30 rounded-xl"
              >
                <div className="flex items-center gap-2 text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">Removing...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
        {/* Left-side Drawer for Full Chart */}
        <Drawer open={showChartDrawer} onOpenChange={handleChartDrawerChange} direction="left">
          <DrawerContent className="data-[vaul-drawer-direction=left]:h-screen data-[vaul-drawer-direction=left]:w-screen data-[vaul-drawer-direction=left]:max-w-none data-[vaul-drawer-direction=left]:rounded-none data-[vaul-drawer-direction=left]:border-0 px-0 pb-0">
            <div className="flex h-full flex-col bg-background text-foreground">
              <WatchlistObsidianChartShell
                instrument={chartInstrument}
                symbol={item.symbol ?? "—"}
                name={item.name}
                onClose={closeAdvancedChart}
                onBuy={() => { closeAdvancedChart(); onQuickBuy?.(buildOrderPayload() as any) }}
                onSell={() => { closeAdvancedChart(); onQuickSell?.(buildOrderPayload() as any) }}
                className="min-h-0 flex-1"
              />
            </div>
          </DrawerContent>
        </Drawer>
      </motion.div>
    </div>
  )
}

function areWatchlistItemCardPropsEqual(
  prev: WatchlistItemCardProps,
  next: WatchlistItemCardProps,
): boolean {
  if (prev.item.id !== next.item.id) return false
  if (prev.isRemoving !== next.isRemoving) return false
  if (prev.isSnapshotPrice !== next.isSnapshotPrice) return false
  if (prev.isPriceDisplayable !== next.isPriceDisplayable) return false
  if (prev.isRefreshingPrice !== next.isRefreshingPrice) return false
  // Only re-render when the price data visibly changes
  if (prev.quote?.last_trade_price !== next.quote?.last_trade_price) return false
  if (prev.quote?.day_change_percent !== next.quote?.day_change_percent) return false
  if (prev.quote?.day_change !== next.quote?.day_change) return false
  // Handler refs — callers should useCallback to keep these stable
  if (prev.onQuickBuy !== next.onQuickBuy) return false
  if (prev.onQuickSell !== next.onQuickSell) return false
  return true
}

export default React.memo(WatchlistItemCard, areWatchlistItemCardPropsEqual)
