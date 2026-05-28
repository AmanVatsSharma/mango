"use client"

/**
 * File:        components/trading/order-drawer/WatchlistOrderDrawer.tsx
 * Module:      Trading · Watchlist Order Drawer
 * Purpose:     Orchestrator for the Kite-inspired 3-stage watchlist→order flow.
 *              Owns the state machine (closed | peek | expanded | order), wires the bottom-sheet snap
 *              points, subscribes to the live quote, and mounts the full-screen OrderScreen overlay.
 *
 * Stages:
 *   - closed        → nothing visible; component is mounted only when isOpen
 *   - peek (0.5)    → Kite "preview" — symbol + LTP + Buy/Sell + secondary actions
 *   - expanded(0.95)→ same, plus 5-row market depth + Day's range + OHLC strip
 *   - order         → full-screen OrderScreen layer above the drawer (drawer remains under, hidden)
 *
 * Exports:
 *   - WatchlistOrderDrawer (default + named) — top-level controlled component
 *   - WatchlistOrderDrawerProps
 *
 * Depends on:
 *   - vaul (Drawer.* primitives) — bottom sheet with native snap points
 *   - lib/market-data/providers/WebSocketMarketDataProvider — live quote subscription
 *   - lib/market-data/utils/quote-lookup — stable subscription key resolution (mirrors OrderDialog)
 *   - ./DrawerStockHeader, ./DrawerPeekActions, ./DrawerMarketDepth, ./OrderScreen
 *
 * Side-effects:
 *   - Subscribes / unsubscribes to "ltp" stream + "full" depth stream while open (auto-cleaned on unmount).
 *
 * Key invariants:
 *   - When the user is on the OrderScreen (stage === "order") we keep the underlying drawer open at the
 *     LAST snap they were at. That way Back from the order screen returns to expanded (if they had dragged
 *     up) or peek (if they hadn't), preserving context.
 *   - Drawer.onOpenChange(false) is treated as a HARD close (not "go back") — so the user explicitly
 *     dismissing the drawer also dismisses any order screen above it.
 *   - We use shouldScaleBackground={false} because the dashboard underneath has its own scroll containers
 *     that get visually broken by the scale-down animation.
 *
 * Read order:
 *   1. WatchlistOrderDrawerProps — public surface
 *   2. Stage state machine (useReducer would be overkill; useState with a union string is enough)
 *   3. Live quote subscription effect
 *   4. JSX — drawer + AnimatePresence(orderScreen)
 *
 * Author:      Aman Sharma
 * Last-updated: 2026-04-29
 */

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"
import { AnimatePresence } from "framer-motion"
import {
  useMarketDataStable,
  useMarketDataLive,
} from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import {
  normalizeSubscriptionKey,
  resolveSubscriptionIdentity,
  resolveQuoteFromMap,
} from "@/lib/market-data/utils/quote-lookup"
import { cn } from "@/lib/utils"
import { DrawerStockHeader } from "./DrawerStockHeader"
import { DrawerPeekActions } from "./DrawerPeekActions"
import { DrawerMarketDepth } from "./DrawerMarketDepth"
import { OrderScreen } from "./OrderScreen"
import { QuickOrderOverlay } from "./QuickOrderOverlay"

type Stage = "closed" | "peek" | "expanded" | "order"

const SNAP_PEEK = 0.5 as const
const SNAP_EXPANDED = 0.95 as const
const SNAP_POINTS = [SNAP_PEEK, SNAP_EXPANDED] as const

export interface WatchlistOrderDrawerProps {
  /** True when a stock has been selected from the watchlist; the drawer mounts and animates in. */
  isOpen: boolean
  /** Selected stock — null when closed. */
  stock: any | null
  /** When the user dismisses the entire flow (drawer drag-down or order-screen back when at peek). */
  onClose: () => void
  /** Account / portfolio data threaded into the order form. */
  portfolio: any | null
  session?: any
  /** Fired after a successful order submission so the dashboard can refresh positions/orders. */
  onOrderPlaced: () => void
  /** Optional: fired from QuickOrderOverlay with orderId metadata for PersistentOrderCard */
  onOrderPlacedWithMeta?: (meta: { orderId: string; symbol: string; side: "BUY" | "SELL"; quantity: number }) => void
  /** Optional secondary-action handlers — passed through to DrawerPeekActions. */
  onViewChart?: (stock: any) => void
  onOptionChain?: (stock: any) => void
  onSetAlert?: (stock: any) => void
  onAddNotes?: (stock: any) => void
  onCreateGTT?: (stock: any) => void
}

export function WatchlistOrderDrawer({
  isOpen,
  stock,
  onClose,
  portfolio,
  session,
  onOrderPlaced,
  onOrderPlacedWithMeta,
  onViewChart,
  onOptionChain,
  onSetAlert,
  onAddNotes,
  onCreateGTT,
}: WatchlistOrderDrawerProps) {
  // Drawer snap point — controlled so we can restore it after returning from the order screen.
  const [activeSnap, setActiveSnap] = React.useState<number | string | null>(SNAP_PEEK)
  // Stage-level state: peek/expanded are derived from activeSnap, but "order" is a layer above.
  const [orderSide, setOrderSide] = React.useState<"BUY" | "SELL" | null>(null)

  // Reset snap each time the drawer reopens so a new instrument always starts at peek.
  React.useEffect(() => {
    if (isOpen) {
      setActiveSnap(SNAP_PEEK)
      setOrderSide(null)
      setQuickOrderDirection(null)
    }
  }, [isOpen, stock?.instrumentId, stock?.symbol])

  // Live quote subscription — we need market depth in expanded view, so request "full" mode.
  // Stable hook owns subscribe/unsubscribe (no re-render churn); live hook gives us the tick stream.
  const { subscribe, unsubscribe, warmupQuote } = useMarketDataStable()
  const { quotes, isConnected: wsConnected } = useMarketDataLive()
  const subscriptionKeys = React.useMemo<(string | number)[]>(() => {
    if (!stock) return []
    const identity = resolveSubscriptionIdentity({
      token: stock.token,
      uirId: stock.uirId,
      instrumentId: stock.instrumentId,
      exchange: stock.exchange,
      segment: stock.segment,
      canonicalSymbol: stock.canonicalSymbol,
    })
    if (identity.subscriptionKey == null) return []
    const key =
      typeof identity.subscriptionKey === "string"
        ? normalizeSubscriptionKey(identity.subscriptionKey)
        : identity.subscriptionKey
    return [key]
  }, [stock?.token, stock?.uirId, stock?.instrumentId, stock?.exchange, stock?.segment, stock?.canonicalSymbol])

  React.useEffect(() => {
    if (!isOpen || subscriptionKeys.length === 0) return
    if (wsConnected !== "connected") return
    subscribe(subscriptionKeys, "full")
    // Trading-d5m: kick the 3-phase warmupQuote in parallel with the
    // subscribe. For instruments that aren't in any active watchlist (e.g.
    // user opened the drawer from a chart, screener, or search result),
    // the live quotes map has no prior tick — the order form would render
    // the stale catalog ltp for 1-5s until the first WS tick lands.
    // warmupQuote does a tiered REST fallback + retry-subscribe so the
    // form has a usable price within ~1s. Best-effort — failures don't
    // block the subscribe path. Only ask for the first key (the canonical
    // identity); secondary forms are cheap rebroadcasts.
    const primaryKey = subscriptionKeys[0]
    if (primaryKey != null) {
      void warmupQuote(primaryKey).catch(() => {
        // best-effort warmup; the subscribe above is the durable path
      })
    }
    return () => {
      unsubscribe(subscriptionKeys, "full")
    }
  }, [isOpen, subscribe, subscriptionKeys, unsubscribe, warmupQuote, wsConnected])

  // Pull the live quote out of the WS map.
  // The quotes map is keyed by numeric token strings ("26000"), but subscriptionKeys may hold
  // exchange-qualified strings ("NSE_EQ-26000"). resolveQuoteFromMap handles both.
  const liveQuote = React.useMemo(() => {
    if (!stock || !quotes) return null
    return (resolveQuoteFromMap(quotes as any, {
      token: stock.token,
      uirId: stock.uirId,
      instrumentId: stock.instrumentId ?? null,
    }) as any) ?? null
  }, [quotes, stock?.token, stock?.uirId, stock?.instrumentId])

  const ltp: number | null = liveQuote?.last_trade_price ?? stock?.ltp ?? null
  const prevClose: number | null =
    liveQuote?.prev_close_price ?? liveQuote?.close ?? stock?.close ?? stock?.prev_close_price ?? null
  const change: number | null = ltp != null && prevClose != null ? ltp - prevClose : stock?.change ?? null
  const changePercent: number | null =
    ltp != null && prevClose != null && prevClose !== 0
      ? ((ltp - prevClose) / prevClose) * 100
      : stock?.changePercent ?? null

  const depth = liveQuote?.market_depth ?? null
  const ohlc = {
    open: liveQuote?.open ?? null,
    prevClose,
    volume: liveQuote?.volume ?? null,
  }
  const dayRange = {
    low: liveQuote?.low ?? null,
    high: liveQuote?.high ?? null,
    ltp,
    prevClose,
  }

  // Synthesised best bid / ask — same idea WatchlistItemCard uses (LTP × small spread). The watchlist
  // pulls a per-card random spread from `/api/admin/market-controls/spread-config`; here we use a fixed
  // 0.05% half-spread as a lightweight default so the drawer's depth ladder always has values matching
  // what the user sees in the watchlist row. Real broker depth (when available via `market_depth`) wins.
  const SYNTHETIC_HALF_SPREAD = 0.0005
  const bestBid =
    ltp != null && Number.isFinite(ltp) && ltp > 0
      ? Number((ltp * (1 - SYNTHETIC_HALF_SPREAD)).toFixed(2))
      : null
  const bestAsk =
    ltp != null && Number.isFinite(ltp) && ltp > 0
      ? Number((ltp * (1 + SYNTHETIC_HALF_SPREAD)).toFixed(2))
      : null

  const isExpanded = activeSnap === SNAP_EXPANDED

  // Quick order overlay state — activated from peek-state Buy/Sell; null = not open
  const [quickOrderDirection, setQuickOrderDirection] = React.useState<"BUY" | "SELL" | null>(null)

  // Action wiring
  // Peek Buy/Sell → open QuickOrderOverlay inline; tap "Advanced" from there → full OrderScreen
  // Snap to expanded when quick panel opens so SwipeToConfirm is always visible
  const handleBuy = () => { setQuickOrderDirection("BUY"); setOrderSide(null); setActiveSnap(SNAP_EXPANDED) }
  const handleSell = () => { setQuickOrderDirection("SELL"); setOrderSide(null); setActiveSnap(SNAP_EXPANDED) }
  const handleOrderClose = () => setOrderSide(null) // back to drawer
  const handleOrderPlaced = () => {
    onOrderPlaced()
    setOrderSide(null)
    onClose()
  }

  const handleDrawerOpenChange = (open: boolean) => {
    if (!open) {
      setOrderSide(null)
      onClose()
    }
  }

  // Bind the secondary actions to the current stock so handlers receive the symbol context.
  const bind = (h?: (s: any) => void) => (h && stock ? () => h(stock) : undefined)

  if (!isOpen || !stock) {
    // Still allow OrderScreen to play out its exit animation if it was open. AnimatePresence handles it.
    return <AnimatePresence>{null}</AnimatePresence>
  }

  return (
    <>
      <DrawerPrimitive.Root
        open={isOpen && orderSide === null}
        onOpenChange={handleDrawerOpenChange}
        snapPoints={SNAP_POINTS as unknown as (number | string)[]}
        activeSnapPoint={activeSnap}
        setActiveSnapPoint={setActiveSnap}
        shouldScaleBackground={false}
      >
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <DrawerPrimitive.Content
            className={cn(
              // h-[97vh] (not max-h) so vaul's snap-point math (translate = (1-snap)*viewportH) maps
              // to a drawer surface that fills the viewport — content overflow is handled by the inner
              // scroll container, not by shrinking the drawer. With max-h, short content collapsed the
              // drawer to ~490px and the 50% snap pushed it almost entirely off-screen.
              "fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[97vh] w-full max-w-md flex-col rounded-t-2xl border-t border-border bg-background shadow-2xl outline-none sm:max-w-lg lg:max-w-xl",
            )}
          >
            <DrawerPrimitive.Title className="sr-only">
              {stock?.symbol ?? "Stock"} order entry
            </DrawerPrimitive.Title>
            <DrawerPrimitive.Description className="sr-only">
              Buy, sell, or view depth for {stock?.symbol ?? "the selected instrument"}.
            </DrawerPrimitive.Description>
            {/* Drag handle */}
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" />

            {/* Sticky stock header — visible at every snap */}
            <DrawerStockHeader
              symbol={stock.symbol ?? "—"}
              exchange={stock.exchange}
              ltp={ltp}
              change={change}
              changePercent={changePercent}
              holdingsQty={stock.holdingsQty ?? null}
              logo_url={stock.logo_url ?? null}
              compact={isExpanded}
            />

            <div className="border-b border-border" />

            {/* Scroll surface — the only scrollable region inside the drawer */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <DrawerPeekActions
                onBuy={handleBuy}
                onSell={handleSell}
                onViewChart={bind(onViewChart)}
                onOptionChain={bind(onOptionChain)}
                onSetAlert={bind(onSetAlert)}
                onAddNotes={bind(onAddNotes)}
                onCreateGTT={bind(onCreateGTT)}
                isOptionable={Boolean(stock?.segment) && stock.segment !== "MCX"}
                comingSoon={{
                  alert: !onSetAlert,
                  notes: !onAddNotes,
                  gtt: !onCreateGTT,
                  options: !onOptionChain,
                }}
              />

              {/* Quick order overlay — appears within peek card, no expansion needed */}
              {quickOrderDirection !== null && (
                <QuickOrderOverlay
                  symbol={stock.symbol ?? ""}
                  instrumentId={stock.instrumentId ?? null}
                  token={stock.token ?? null}
                  exchange={stock.exchange ?? null}
                  segment={stock.segment ?? null}
                  direction={quickOrderDirection}
                  feedPrice={ltp ?? stock.ltp ?? 0}
                  availableMargin={portfolio?.account?.availableMargin ?? 0}
                  lotSize={stock.lotSize ?? 1}
                  onPlaced={(meta) => {
                    setQuickOrderDirection(null)
                    onOrderPlacedWithMeta?.(meta)
                    onOrderPlaced()
                    onClose()
                  }}
                  onAdvanced={() => {
                    setOrderSide(quickOrderDirection)
                    setQuickOrderDirection(null)
                  }}
                  session={session}
                  tradingAccountId={portfolio?.account?.id}
                />
              )}

              {/* Expanded-only content — render at peek too so dragging up reveals smoothly */}
              <DrawerMarketDepth
                depth={depth ?? undefined}
                bestBid={bestBid}
                bestAsk={bestAsk}
                dayRange={dayRange}
                ohlc={ohlc}
              />
            </div>
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>

      {/* Full-screen order layer — animates in from the right */}
      <AnimatePresence>
        {orderSide && (
          <OrderScreen
            key={`${stock?.instrumentId ?? stock?.symbol}-${orderSide}`}
            stock={stock}
            side={orderSide}
            portfolio={portfolio}
            session={session}
            onClose={handleOrderClose}
            onOrderPlaced={handleOrderPlaced}
          />
        )}
      </AnimatePresence>
    </>
  )
}

export default WatchlistOrderDrawer
