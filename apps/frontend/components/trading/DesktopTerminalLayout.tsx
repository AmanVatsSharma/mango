/**
 * File:        components/trading/DesktopTerminalLayout.tsx
 * Module:      components/trading
 * Purpose:     Unified 3-column desktop trading terminal for lg+ viewports.
 *              Left: TerminalWatchlist · Center: TerminalChartPane + TerminalBottomBar
 *              Right: TerminalOrderTicket when a stock is selected, else TerminalRightPanel fallback.
 *              All three columns are user-resizable (horizontal outer ResizablePanelGroup)
 *              and the center is further split into chart + bottom bar (vertical nested group).
 *              Mobile layout in TradingDashboard is completely untouched —
 *              this component is only rendered inside a `hidden lg:block` wrapper.
 *
 * Exports:
 *   - DesktopTerminalLayout(props) — full-height dark terminal shell
 *
 * Depends on:
 *   - @/components/trading/widgets/terminal-watchlist — dark left-rail watchlist
 *   - @/components/trading/widgets/terminal-chart-pane — dark chart panel with symbol header
 *   - @/components/trading/widgets/terminal-right-panel — right fallback panel (no stock selected)
 *   - @/components/trading/widgets/terminal-order-ticket — right panel when stock is selected
 *   - @/components/trading/widgets/terminal-bottom-bar — positions/orders/history bar below chart
 *   - @/components/risk/RiskMonitor — compact risk banner
 *   - @/components/ui/resizable — ResizablePanelGroup/Panel/Handle for draggable split
 *   - @/lib/hooks/use-prisma-watchlist — SWR watchlist data (deduplicated)
 *   - @/lib/hooks/use-home-dashboard-config — SWR chart config for fallback symbols
 *   - @/lib/hooks/use-position-history — SWR closed-position history for History tab
 *   - @/lib/market-data/utils/quote-lookup — quote resolution for index strip
 *
 * Side-effects:
 *   - SWR fetches for watchlist + home config (both deduplicated with TradingHome on mobile)
 *
 * Key invariants:
 *   - Height = 100vh − header (3.5rem) = calc(100vh - 3.5rem); all columns overflow-y-auto
 *   - Never rendered below lg breakpoint
 *   - activeItem state is owned locally — TradingDashboard only hears about final order submission
 *   - onQuickBuy / onQuickSell bypass the ticker and open OrderDialog directly in parent
 *   - Index strip removed — NIFTY/BNIFTY tickers are shown in the dark desktop header instead
 *   - Panel sizes are percentages (react-resizable-panels v4 convention), not pixels
 *   - Each ResizablePanel child must have h-full/height:100% to fill the allocated space
 *   - Panel layouts persist in localStorage via useDefaultLayout (two keys):
 *       desktop-terminal-columns-v4 — watchlist/center/order widths (pixel defaults)
 *       desktop-terminal-center-v2  — chart/bottom heights (percent defaults)
 *     Bump the -vN suffix if panel ids or count change, to invalidate stale saved layouts.
 *   - Side rails have pixel minSize pinned at the pre-resizable fixed widths
 *     (watchlist 300px, order 340px) — this guarantees the terminal can never feel
 *     thinner than the original non-resizable layout, regardless of saved state.
 *     defaults (340 / 380) sit slightly above the floor for breathing room.
 *     maxSize stays percentage-based ("40%") to keep layout balance on wide monitors.
 *   - CRITICAL: All size props MUST be unit-suffixed strings in v4. A bare number
 *     like maxSize={40} is parsed as PIXELS, not percent (v4 breaking change from v3).
 *     v1 shipped numeric maxSize which clamped the side rails to 40px wide. Always
 *     pass "40%" / "320px" / "65%" — never bare numbers.
 *
 * Read order:
 *   1. DesktopTerminalLayoutProps — data contract
 *   2. watchlistItemToStock — WatchlistItemData → Stock adapter
 *   3. DesktopTerminalLayout — layout + local state
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-23
 */

"use client"

import React, { useMemo, useState, useCallback } from "react"
// useMarketDataLive (NOT useMarketData) — this layout only consumes the live
// {quotes, subscriptionErrorsByToken, isConnected, isLoading, error} fields. The
// stable context (config, subscribe/unsubscribe, marketDisplayUi, etc.) is owned
// by widgets that actually need it (drawers, search) — subscribing to it here
// would re-render the whole 3-column terminal whenever a config refresh lands.
import { useMarketDataLive } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { useDefaultLayout } from "react-resizable-panels"
import { TerminalWatchlist } from "@/components/trading/widgets/terminal-watchlist"
import { TerminalChartPane } from "@/components/trading/widgets/terminal-chart-pane"
import { TerminalRightPanel, AccountSummaryStrip } from "@/components/trading/widgets/terminal-right-panel"
import { TerminalOrderPanel } from "@/components/trading/widgets/terminal-order-panel"
import { TerminalBottomBar } from "@/components/trading/widgets/terminal-bottom-bar"
import { RiskMonitor } from "@/components/risk/RiskMonitor"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

// SSR-safe localStorage reference — undefined on the server, window.localStorage in the browser.
// Passed to useDefaultLayout; when undefined the hook skips persistence and falls back to defaults.
const browserLocalStorage =
  typeof window !== "undefined" ? window.localStorage : undefined
import { useEnhancedWatchlists } from "@/lib/hooks/use-prisma-watchlist"
import { useHomeDashboardConfig } from "@/lib/hooks/use-home-dashboard-config"
import { usePositionHistory } from "@/lib/hooks/use-position-history"
import {
  buildHomeChartSymbols,
  buildHomeTickerItemsFromConfig,
} from "@/components/trading/widgets/home-widget-data-utils"
import {
  resolveQuoteFromMap,
  resolveDisplayPriceFromQuote,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"
import type { PnLData, Stock } from "@/types/trading"
import type { WatchlistItemData } from "@/lib/hooks/use-prisma-watchlist"

// ── WatchlistItemData → Stock adapter ─────────────────────────
function watchlistItemToStock(item: WatchlistItemData): Stock {
  return {
    id: item.id,
    symbol: item.symbol,
    name: item.name ?? item.symbol,
    instrumentId: item.instrumentId,
    segment: item.segment ?? item.exchange ?? undefined,
    lotSize: item.lotSize ?? undefined,
  }
}

interface DesktopTerminalLayoutProps {
  positions: any[]
  positionsPnLMeta: any
  orders: any[]
  session: any
  portfolio: any
  pnl: PnLData
  onQuickBuy: (stock: Stock) => void
  onQuickSell: (stock: Stock) => void
  optimisticClosePosition?: (id: string) => void
  refreshPositions?: () => Promise<void>
  onPositionUpdate: () => void
  positionsMarketFeedStatus: "connected" | "connecting" | "snapshot" | "offline"
  tradingAccountId?: string
  health: { lastRefreshAt: number | null }
}

export function DesktopTerminalLayout({
  positions,
  orders,
  session,
  portfolio,
  pnl,
  onQuickBuy,
  onQuickSell,
  onPositionUpdate,
}: DesktopTerminalLayoutProps) {
  const userId = (session?.user as any)?.id as string | undefined
  const { quotes, subscriptionErrorsByToken } = useMarketDataLive()

  // ── Local selection state — no prop-drilling to parent ──────────
  const [activeItem, setActiveItem] = useState<WatchlistItemData | null>(null)
  const [orderSide, setOrderSide] = useState<"BUY" | "SELL">("BUY")

  const { watchlists } = useEnhancedWatchlists(userId)
  const { config: homeConfig } = useHomeDashboardConfig()
  const { history: closedPositionHistory } = usePositionHistory(userId)

  // ── Panel size persistence (localStorage, SSR-safe) ──────────────
  // Two independent layouts: outer horizontal (watchlist | center | order)
  // and inner vertical (chart / bottom bar). Each keyed by a stable id.
  // NOTE: outer key is -v2 because v1 shipped with percent defaults that
  // compressed the side rails on sub-1920px viewports. Bumping invalidates
  // stale saved layouts so the new pixel-based defaults take effect.
  const outerLayout = useDefaultLayout({
    id: "desktop-terminal-columns-v4",
    panelIds: ["watchlist", "center", "order"],
    storage: browserLocalStorage,
  })
  const centerLayout = useDefaultLayout({
    id: "desktop-terminal-center-v2",
    panelIds: ["chart", "bottom"],
    storage: browserLocalStorage,
  })

  const tickerItems = useMemo(
    () => buildHomeTickerItemsFromConfig(homeConfig.tickerTapeSymbols, watchlists),
    [homeConfig.tickerTapeSymbols, watchlists],
  )

  const chartConfig = useMemo(
    () => buildHomeChartSymbols(homeConfig, watchlists, tickerItems),
    [homeConfig, watchlists, tickerItems],
  )

  const availableMargin: number = Number(portfolio?.account?.availableMargin ?? 0)
  const usedMargin: number = Number(portfolio?.account?.usedMargin ?? 0)
  const balance: number = Number(
    portfolio?.account?.balance ??
    portfolio?.account?.walletBalance ??
    portfolio?.account?.totalBalance ??
    (availableMargin + usedMargin)
  )

  // Resolve live LTP for the order ticket header
  const activeStockLtp = useMemo(() => {
    if (!activeItem) return null
    const token = parsePositiveIntegerMarketNumber(activeItem.token)
    const quote = resolveQuoteFromMap(quotes, {
      token: token ?? undefined,
      uirId: activeItem.uirId,
      instrumentId: activeItem.instrumentId,
    })
    return quote ? resolveDisplayPriceFromQuote(quote, 0) || null : null
  }, [activeItem, quotes])

  const activeStock = useMemo(
    () => (activeItem ? watchlistItemToStock(activeItem) : null),
    [activeItem],
  )

  // ── Watchlist handlers ───────────────────────────────────────────
  const handleSelectItem = useCallback((item: WatchlistItemData) => {
    setActiveItem(item)
    setOrderSide("BUY")
  }, [])

  const handleWatchlistQuickBuy = useCallback(
    (item: WatchlistItemData) => onQuickBuy(watchlistItemToStock(item)),
    [onQuickBuy],
  )

  const handleWatchlistQuickSell = useCallback(
    (item: WatchlistItemData) => onQuickSell(watchlistItemToStock(item)),
    [onQuickSell],
  )

  const handleClearTicket = useCallback(() => {
    setActiveItem(null)
    setOrderSide("BUY")
  }, [])

  return (
    <div
      style={{
        height: "calc(100vh - 3.5rem)",
        maxHeight: "calc(100vh - 3.5rem)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--terminal-bg)",
      }}
    >
      {/* ── Risk monitor — compact inline banner ── */}
      <div style={{ flexShrink: 0 }}>
        <RiskMonitor compact />
      </div>

      {/* ── 3-column terminal body — horizontal resizable split ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <ResizablePanelGroup
          id="desktop-terminal-columns-v4"
          orientation="horizontal"
          defaultLayout={outerLayout.defaultLayout}
          onLayoutChanged={outerLayout.onLayoutChanged}
        >

          {/* ── LEFT: Watchlist rail ── default 340px, never below 300px (= pre-resizable fixed width), never above 40% ── */}
          <ResizablePanel id="watchlist" defaultSize="340px" minSize="300px" maxSize="40%">
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <TerminalWatchlist
                quotes={quotes}
                selectedInstrumentId={activeItem?.instrumentId ?? null}
                onSelectItem={handleSelectItem}
                onQuickBuy={handleWatchlistQuickBuy}
                onQuickSell={handleWatchlistQuickSell}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── CENTER: Dark chart + bottom positions bar — takes remaining space; min 480px to keep chart readable ── */}
          <ResizablePanel id="center" minSize="480px">
            <ResizablePanelGroup
              id="desktop-terminal-center-v2"
              orientation="vertical"
              defaultLayout={centerLayout.defaultLayout}
              onLayoutChanged={centerLayout.onLayoutChanged}
            >
              <ResizablePanel id="chart" defaultSize="65%" minSize="20%">
                <TerminalChartPane
                  defaultSymbols={chartConfig.symbols}
                  defaultSymbolKey={chartConfig.defaultSymbolKey}
                  activeItem={activeItem}
                  quotes={quotes}
                />
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel id="bottom" defaultSize="35%" minSize="20%">
                <TerminalBottomBar
                  positions={positions ?? []}
                  orders={orders ?? []}
                  quotes={quotes}
                  totalPnL={pnl.totalPnL}
                  dayPnL={pnl.dayPnL}
                  onQuickBuy={onQuickBuy}
                  onQuickSell={onQuickSell}
                  closedPositionHistory={closedPositionHistory}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* ── RIGHT: Order ticket (stock selected) or fallback positions/orders ── default 380px, never below 340px (= pre-resizable fixed width), never above 40% ── */}
          <ResizablePanel id="order" defaultSize="380px" minSize="340px" maxSize="40%">
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {/* Active content — order ticket or positions/orders tabs */}
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
                {activeStock ? (
                  <TerminalOrderPanel
                    stock={activeStock}
                    ltp={activeStockLtp}
                    initialSide={orderSide}
                    portfolio={portfolio}
                    session={session}
                    onOrderPlaced={onPositionUpdate}
                    onClear={handleClearTicket}
                  />
                ) : (
                  <TerminalRightPanel
                    positions={positions ?? []}
                    orders={orders ?? []}
                    quotes={quotes}
                    onQuickBuy={onQuickBuy}
                    onQuickSell={onQuickSell}
                    availableMargin={availableMargin}
                    usedMargin={usedMargin}
                    totalPnL={pnl.totalPnL}
                    dayPnL={pnl.dayPnL}
                    balance={balance}
                  />
                )}
              </div>

              {/* Account summary — always pinned at bottom regardless of active panel */}
              <AccountSummaryStrip
                balance={balance}
                equity={balance + pnl.totalPnL}
                totalPnL={pnl.totalPnL}
                dayPnL={pnl.dayPnL}
                availableMargin={availableMargin}
                usedMargin={usedMargin}
              />
            </div>
          </ResizablePanel>

        </ResizablePanelGroup>
      </div>
    </div>
  )
}
