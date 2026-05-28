/**
 * @file TradingDashboard.tsx
 * @module components/trading
 * @description Main trading dashboard page UI (tabs, header, dialogs) backed by realtime providers.
 * @author StockTrade
 * @created 2026-01-24
 * @updated 2026-04-21
 * @updated 2026-05-07 — Skeleton gate: hasRenderedOnceRef so dashboard skeleton only shows on first cold-load, never on tab-return refetch flicker.
 * @updated 2026-05-07 — Memoize pnl object (single ref → child memo holds), drop dead anyRefreshing effect, scalar-only deps for dev-debug effect.
 * @updated 2026-05-08 — Render SSE-feed banners (reconnecting / dead-with-Reconnect-now button) so the dashboard surfaces the new connection_dead state from the shared SSE manager.
 */

"use client"

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react"
import Link from "next/link"
import { TrendingUp, Wallet, FileText, Eye, Loader2, RefreshCcw, Activity, WifiOff, AlertCircle, Home, Maximize2, Minimize2 } from "lucide-react"
import { useSession, signOut } from "next-auth/react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"
import { useMarketData } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import { WebSocketMarketDataProvider } from "@/lib/market-data/providers/WebSocketMarketDataProvider"
import dynamic from "next/dynamic"
import { ErrorBoundary } from "@/components/error-boundary"
import { Drawer, DrawerContent } from "@/components/ui/drawer"
import { X } from "lucide-react"

// Heavy interactive surfaces — only render after a user gesture (open dialog/drawer/chart),
// or live in the header but aren't load-bearing for first interaction. Wave 2 lazy-loads
// each so the initial /dashboard chunk doesn't ship them.
const OrderDialog = dynamic(
  () => import("@/components/OrderDialog").then((m) => ({ default: m.OrderDialog })),
  { ssr: false },
)
const WatchlistOrderDrawer = dynamic(
  () => import("@/components/trading/order-drawer").then((m) => ({ default: m.WatchlistOrderDrawer })),
  { ssr: false },
)
import { FeedStatusBanner } from "@/components/trading/FeedStatusBanner"
import { PersistentOrderCard } from "@/components/trading/order-drawer/PersistentOrderCard"
const DesktopTerminalLayout = dynamic(
  () => import("@/components/trading/DesktopTerminalLayout").then((m) => ({ default: m.DesktopTerminalLayout })),
  { ssr: false, loading: () => (
    <div className="space-y-3 px-1 pt-2">
      <div className="h-10 rounded-xl bg-muted/40 animate-pulse" />
      <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
    </div>
  ) },
)
const WatchlistObsidianChartShell = dynamic(
  () => import("@/components/trading/widgets/watchlist-obsidian-chart-shell").then((m) => ({ default: m.WatchlistObsidianChartShell })),
  { ssr: false },
)

function TabErrorFallback({ tab }: { tab: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      <AlertCircle className="h-8 w-8" />
      <p className="text-sm font-medium capitalize">Something went wrong in the {tab} tab.</p>
      <p className="text-xs">Switch to another tab or refresh the page.</p>
    </div>
  )
}

// Tab-panel skeletons shown while each chunk downloads (first visit only — cached after)
const TabSkeleton = () => (
  <div className="space-y-3 px-1 pt-2">
    <div className="h-10 rounded-xl bg-muted/40 animate-pulse" />
    <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
    <div className="h-32 rounded-xl bg-muted/40 animate-pulse" />
  </div>
)

// Dynamic tab-panel imports — each loads its JS chunk on first use, then stays cached
const TradingHome = dynamic(
  () => import("@/components/trading/TradingHome").then((m) => ({ default: m.TradingHome })),
  { loading: () => <TabSkeleton />, ssr: false },
)
const WatchlistManager = dynamic(
  () => import("@/components/watchlist/WatchlistManager").then((m) => ({ default: m.WatchlistManager })),
  { loading: () => <TabSkeleton />, ssr: false },
)
const OrderManagement = dynamic(
  () => import("@/components/order-management").then((m) => ({ default: m.OrderManagement })),
  { loading: () => <TabSkeleton />, ssr: false },
)
const PositionTracking = dynamic(
  () => import("@/components/position-tracking").then((m) => ({ default: m.PositionTrackingMemo })),
  { loading: () => <TabSkeleton />, ssr: false },
)
const Account = dynamic(
  () => import("@/components/Account").then((m) => ({ default: m.Account })),
  { loading: () => <TabSkeleton />, ssr: false },
)
// Header-resident widgets that aren't load-bearing for the LCP — defer their chunks
// so the dashboard shell can paint before they download.
const RiskMonitor = dynamic(
  () => import("@/components/risk/RiskMonitor").then((m) => ({ default: m.RiskMonitor })),
  { ssr: false, loading: () => <div className="h-7 w-16 rounded bg-muted/30 animate-pulse" /> },
)
const NotificationBell = dynamic(
  () => import("@/components/notifications/NotificationBell").then((m) => ({ default: m.NotificationBell })),
  { ssr: false, loading: () => <div className="h-8 w-8 rounded-full bg-muted/30 animate-pulse" /> },
)
import { AccountMenu } from "@/components/trading/AccountMenu"
import { TradingRealtimeProvider, useTradingRealtime } from "@/components/trading/realtime/trading-realtime-provider"
import { usePositionHistory } from "@/lib/hooks/use-position-history"
import { getMarketSession, refreshMarketForceClosedFromServer } from "@/lib/hooks/market-timing"
import { formatTimeIST, getCurrentISTDate } from "@/lib/date-utils"
import {
  computeTradingDashboardPnL,
  resolveIndexDisplayState,
  resolveIndexQuote,
  resolveIndexTokenCandidate,
} from "@/components/trading/trading-dashboard-number-utils"
import { resolveDisplayQuoteSnapshot } from "@/lib/market-data/utils/quote-lookup"
import { BRAND_IDENTITY, BRAND_ASSETS } from "@/Branding"
import { ThemeToggle } from "@/components/console/theme-toggle"
import { buildRouteWithQuery, getAppRoute, getAuthRoute } from "@/lib/branding-routes"
import {
  clearDashboardLoadRecoveryCounter,
  DASHBOARD_LOAD_STUCK_MS,
  prepareDashboardLoadRecoveryReload,
} from "@/lib/navigation/dashboard-load-recovery"
import { clearDashboardErrorRecoveryCounter } from "@/lib/navigation/dashboard-error-recovery"
import { useIsDesktop } from "@/lib/hooks/use-is-desktop"
import type {
  TradingDashboardProps,
  TabConfig,
  PnLData,
  IndexData,
  Stock,
  StockSelectHandler,
  OrderUpdateHandler,
  PositionUpdateHandler,
  WatchlistUpdateHandler,
  RefreshHandler,
  RetryHandler,
  OrderDialogCloseHandler,
  OrderPlacedHandler,
  IndexDisplayProps,
  LoadingScreenProps,
  ErrorScreenProps
} from "@/types/trading"

// Constants
const VALID_TAB_IDS = ["home", "watchlist", "orders", "positions", "account"] as const
type DashboardTabId = (typeof VALID_TAB_IDS)[number]

const TAB_CONFIGS: TabConfig[] = [
  { id: "home", icon: Home, label: "Home" },
  { id: "watchlist", icon: Eye, label: "Watchlist" },
  { id: "orders", icon: FileText, label: "Orders" },
  { id: "positions", icon: TrendingUp, label: "Positions" },
  { id: "account", icon: Wallet, label: "Account" },
]

const TAB_DESCRIPTIONS: Record<"home" | "watchlist" | "orders" | "positions" | "account", string> = {
  home: "Market pulse, portfolio snapshot, and trading opportunities.",
  watchlist: "Track symbols, react quickly, and place orders in one flow.",
  orders: "Monitor all order activity with clear execution visibility.",
  positions: "Manage open risk with real-time P&L and protection controls.",
  account: "Review balance, funds, profile, and account-level settings.",
}

const INDEX_CONFIGS: IndexData[] = [
  { name: "NIFTY 50", instrumentId: "NSE_EQ-26571" },
  { name: "BANK NIFTY", instrumentId: "NSE_EQ-26575" },
]

const INDEX_QUOTE_MAX_AGE_MS = 5_000
const INDEX_DISPLAY_QUOTE_MAX_AGE_MS = 60_000

/**
 * Picks the message shown on the redirect-to-login loading screen.
 *
 * Two distinct states land here:
 *   - isStaleSession = false → a normal logout / unauthenticated visit.
 *       User knows why they're going to login; a short reassurance is enough.
 *   - isStaleSession = true  → a stale/corrupt session is being cleared
 *       (signOut() is running in parallel). User did NOT explicitly log out,
 *       so the message should acknowledge the state change without alarming them.
 *
 * TODO (Aman): implement — pick wording that fits StockTrade's tone.
 *   Keep both messages short (≤ 60 chars) and reassuring, never technical.
 */
const getRedirectMessage = (isStaleSession: boolean): string => {
  // TODO: replace with your chosen wording for each branch.
  return isStaleSession
    ? "Your session has expired. Redirecting to sign in..."
    : "Redirecting to sign in..."
}

// Loading Component
const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = "Please wait to rock and trade.." }) => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/20 p-4">
    <Card className="w-full max-w-md border-border/60 bg-card/85 shadow-sm backdrop-blur-md">
      <CardContent className="flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <TrendingUp className="h-4 w-4" />
        </div>
        <h1 className="mb-2 text-xl font-semibold text-foreground">{BRAND_IDENTITY.names.full}</h1>
        <p className="mb-5 text-sm text-muted-foreground">{message}</p>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </CardContent>
    </Card>
  </div>
)

// Error Component
const ErrorScreen: React.FC<ErrorScreenProps> = ({ error, onRetry }) => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background via-background to-muted/20 p-4">
    <Card className="w-full max-w-md border-destructive/30 bg-card/90 shadow-sm">
      <CardContent className="flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-destructive text-destructive-foreground">
          <AlertCircle className="h-4 w-4" />
        </div>
        <h1 className="mb-2 text-xl font-semibold text-foreground">Error Loading Dashboard</h1>
        <p className="mb-6 max-w-md text-sm text-muted-foreground">{error}</p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        )}
      </CardContent>
    </Card>
  </div>
)

// Lightweight skeleton to improve perceived performance while realtime data loads
const DashboardSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="h-20 rounded-xl bg-muted/40 animate-pulse" />
    <div className="h-44 rounded-xl bg-muted/40 animate-pulse" />
    <div className="h-44 rounded-xl bg-muted/40 animate-pulse" />
  </div>
)

// Index Component - compact chip: NAME · ₹PRICE · ±CHG%
// compact=true: bare price+% only, no pill/border — for mobile header
const IndexDisplay: React.FC<IndexDisplayProps> = React.memo(({
  name,
  instrumentId,
  quotes,
  isLoading,
  connectionState = "disconnected",
  marketSession = "open",
  compact = false,
}) => {
  const token = useMemo(() => resolveIndexTokenCandidate(instrumentId), [instrumentId])
  const quote = resolveIndexQuote(quotes as Record<string, any> | undefined, { token, instrumentId })

  useEffect(() => {
    if (quote && token && process.env.NODE_ENV === "development") {
      console.debug(`📊 [INDEX-DISPLAY] ${name} quote update`, {
        instrumentId, token,
        price: quote.last_trade_price,
        displayPrice: (quote as any)?.display_price,
      })
    }
  }, [quote, name, instrumentId, token])

  const shortName = name === "BANK NIFTY" ? "BNIFTY" : name.split(" ")[0]

  const quoteSnapshot = quote ? resolveDisplayQuoteSnapshot({
    quote,
    liveMaxAgeMs: INDEX_QUOTE_MAX_AGE_MS,
    displayMaxAgeMs: marketSession === "closed" ? 0 : INDEX_DISPLAY_QUOTE_MAX_AGE_MS,
  }) : null

  const showDisplayPrice = quoteSnapshot?.hasQuote && (marketSession === "closed" || quoteSnapshot.isDisplayable)

  // ── Compact mode (mobile header) ──
  if (compact) {
    if (!showDisplayPrice) {
      return <span className="text-xs font-mono text-muted-foreground/50 tabular-nums">--</span>
    }
    const { price, change } = resolveIndexDisplayState({ quote: quote! })
    const displayPrice = Number.isFinite(price) && price > 0 ? price : quoteSnapshot!.uiPrice ?? 0
    const isUp = change >= 0
    return (
      <div className={`flex items-center gap-1 ${isUp ? "text-emerald-500" : "text-rose-500"}`}>
        <span className="text-[13px] font-mono font-bold tabular-nums leading-none">
          {displayPrice.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </span>
        <span className="text-[10px] font-semibold tabular-nums leading-none flex items-center gap-0.5">
          <span aria-hidden className="text-[8px]">{isUp ? "▲" : "▼"}</span>{Math.abs(change).toFixed(1)}%
        </span>
      </div>
    )
  }

  // ── Full pill mode (sm+ header) ──
  if (!quote) {
    if (isLoading || connectionState === "connecting") {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/30 border border-border/30">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{shortName}</span>
        </div>
      )
    }
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/20 border border-border/30 opacity-60">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{shortName}</span>
        <span className="text-xs font-mono text-muted-foreground">--</span>
      </div>
    )
  }

  const showLive = connectionState === "connected" && quoteSnapshot!.isFresh && marketSession === "open"

  if (!showDisplayPrice) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/20 border border-border/30 opacity-70">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{shortName}</span>
        <span className="text-xs font-mono text-muted-foreground">--</span>
      </div>
    )
  }

  const { price, change } = resolveIndexDisplayState({ quote })
  const displayPrice = Number.isFinite(price) && price > 0 ? price : quoteSnapshot!.uiPrice ?? 0
  const isUp = change >= 0

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-sm transition-all duration-200 hover:scale-[1.02] ${
      isUp
        ? "bg-emerald-500/8 border-emerald-500/20 hover:bg-emerald-500/12"
        : "bg-rose-500/8 border-rose-500/20 hover:bg-rose-500/12"
    }`}>
      {showLive && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" style={{ animationDuration: "2s" }} />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
        </span>
      )}
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{shortName}</span>
      <span className={`text-[13px] font-mono font-bold tabular-nums ${isUp ? "text-emerald-500 dark:text-emerald-400" : "text-rose-500 dark:text-rose-400"}`}>
        {displayPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span className={`text-[10px] font-semibold tabular-nums flex items-center gap-0.5 ${isUp ? "text-emerald-500/80 dark:text-emerald-400/80" : "text-rose-500/80 dark:text-rose-400/80"}`}>
        <span aria-hidden className="text-[8px]">{isUp ? "▲" : "▼"}</span>{Math.abs(change).toFixed(2)}%
      </span>
    </div>
  )
})

IndexDisplay.displayName = "IndexDisplay"

// Main Trading Dashboard Component
const TradingDashboard: React.FC = () => {
  const {
    userId,
    session,
    orders,
    positions,
    positionsPnLMeta,
    account: realtimeAccountData,
    tradingAccountId,
    optimisticClosePosition,
    refreshPositions,
    refreshAll,
    forceReconnectSse,
    health,
    error: realtimeError,
    pnl: apiPnL,
    isLoading: isRealtimeLoading,
  } = useTradingRealtime()
  const sseDead = health.sseState === "dead"
  const sseReconnecting = health.sseState === "reconnecting"

  const isDesktop = useIsDesktop()

  // URL-based tab: read from ?tab= so refresh keeps the tab; navigation via Link
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const tabFromUrl: DashboardTabId =
    tabParam && VALID_TAB_IDS.includes(tabParam as DashboardTabId) ? (tabParam as DashboardTabId) : "home"

  // Optimistic tab state: update immediately on click for instant feel, then sync from URL (e.g. back/forward)
  const [activeTabOverride, setActiveTabOverride] = useState<DashboardTabId | null>(null)
  useEffect(() => {
    setActiveTabOverride(null)
  }, [tabParam])
  const currentTab: DashboardTabId = activeTabOverride ?? tabFromUrl

  /** Plain primary clicks use programmatic replace so ?tab= always updates above sticky/main stacking. */
  const handleDesktopTabClick = useCallback(
    (id: DashboardTabId, e: React.MouseEvent<HTMLAnchorElement>) => {
      setActiveTabOverride(id)
      const href = buildRouteWithQuery(pathname, id === "home" ? {} : { tab: id })
      const isPlainPrimary =
        e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
      if (isPlainPrimary) {
        e.preventDefault()
        void router.replace(href, { scroll: false })
      }
    },
    [pathname, router],
  )

  // State
  const [orderDialogOpen, setOrderDialogOpen] = useState(false)
  const [selectedStockForOrder, setSelectedStockForOrder] = useState<Stock | null>(null)
  const [orderInitialSide, setOrderInitialSide] = useState<"BUY" | "SELL" | null>(null)
  // Kite-inspired peek/expanded/order drawer state — used only for the watchlist row-tap path.
  // Quick-buy/sell entry points keep using the legacy OrderDialog so other surfaces stay untouched.
  const [watchlistDrawerStock, setWatchlistDrawerStock] = useState<Stock | null>(null)
  const [chartDrawerStock, setChartDrawerStock] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Persistent order card — tracks the most recently placed order from QuickOrderOverlay
  const [lastOrderId, setLastOrderId] = useState<string | null>(null)
  const [lastOrderSummary, setLastOrderSummary] = useState<{
    symbol: string; side: "BUY" | "SELL"; quantity: number
  } | null>(null)

  // Data hooks - Use only realtime hooks to avoid duplicate fetching
  // All hooks use SWR with deduplication, so same API calls are cached
  const {
    quotes,
    subscriptionErrorsByToken,
    isLoading: isQuotesLoading,
    isConnected: wsConnectionState,
    reconnect,
  } = useMarketData()

  // Closed position history — SSE-driven, used by the mobile History sub-tab in PositionTracking
  const { history: closedPositionHistory } = usePositionHistory(userId)

  // Check if WebSocket is connected (for market data)
  const isWebSocketConnected = wsConnectionState === 'connected'
  const isWebSocketConnecting = wsConnectionState === "connecting"
  const isWebSocketError = wsConnectionState === "error"
  const hasCachedQuoteData = Object.keys((quotes as Record<string, unknown>) || {}).length > 0
  const isSnapshotMode = !isWebSocketConnected && hasCachedQuoteData
  const positionsMarketFeedStatus: "connected" | "connecting" | "snapshot" | "offline" =
    isWebSocketConnected
      ? "connected"
      : isWebSocketConnecting
        ? "connecting"
        : isSnapshotMode
          ? "snapshot"
          : "offline"
  const [marketSession, setMarketSession] = useState<"open" | "pre-open" | "closed">("open")
  const [currentIstTime, setCurrentIstTime] = useState<Date | null>(null)
  const [lastWorkspaceRefreshAt, setLastWorkspaceRefreshAt] = useState<Date | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const userInitials = useMemo(() => {
    const name = session?.user?.name ?? ""
    return name.split(" ").map((n: string) => n[0] ?? "").join("").toUpperCase().slice(0, 2) || "TB"
  }, [session?.user?.name])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener("fullscreenchange", onFsChange)
    return () => document.removeEventListener("fullscreenchange", onFsChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    // Initialize client-only time state (deferred to avoid SSR/hydration mismatch)
    setCurrentIstTime(getCurrentISTDate())
    setLastWorkspaceRefreshAt(getCurrentISTDate())

    const tickMarketSession = () => {
      void refreshMarketForceClosedFromServer().then(() => {
        setMarketSession(getMarketSession())
      })
    }
    tickMarketSession()
    // 60s is sufficient — market session changes at most once per day (open/close boundary)
    const marketSessionTimer = window.setInterval(tickMarketSession, 60000)

    const istClockTimer = window.setInterval(() => {
      setCurrentIstTime(getCurrentISTDate())
    }, 30000)

    return () => {
      window.clearInterval(marketSessionTimer)
      window.clearInterval(istClockTimer)
    }
  }, [])

  // Portfolio data structure for compatibility
  const portfolio = useMemo(() => {
    if (!realtimeAccountData) return null
    return {
      account: {
        id: realtimeAccountData.id,
        totalValue: realtimeAccountData.balance || (realtimeAccountData.availableMargin + realtimeAccountData.usedMargin),
        availableMargin: realtimeAccountData.availableMargin,
        usedMargin: realtimeAccountData.usedMargin,
        balance: realtimeAccountData.balance,
        client_id: realtimeAccountData.clientId || ""
      }
    }
  }, [realtimeAccountData])

  const accountUnified = portfolio

  // Error handling
  useEffect(() => {
    if (realtimeError) {
      setError(realtimeError.message || "An error occurred while loading trading data")
    } else {
      setError(null)
    }
  }, [realtimeError])

  // Event handlers
  const handleSelectStock: StockSelectHandler = useCallback((stock: Stock) => {
    // Watchlist row tap → Kite-style 3-stage drawer (peek → expanded → full order screen).
    setWatchlistDrawerStock(stock)
  }, [])

  const handleCloseWatchlistDrawer = useCallback(() => {
    setWatchlistDrawerStock(null)
  }, [])

  const handleViewChart = useCallback((stock: any) => {
    setChartDrawerStock(stock)
  }, [])

  const handleCloseChartDrawer = useCallback(() => {
    setChartDrawerStock(null)
  }, [])

  const handleQuickBuy = useCallback((stock: Stock) => {
    setSelectedStockForOrder(stock)
    setOrderInitialSide("BUY")
    setOrderDialogOpen(true)
  }, [])

  const handleQuickSell = useCallback((stock: Stock) => {
    setSelectedStockForOrder(stock)
    setOrderInitialSide("SELL")
    setOrderDialogOpen(true)
  }, [])

  const handleRefreshAllData: RefreshHandler = useCallback(async () => {
    try {
      reconnect()
      await refreshAll()
      setLastWorkspaceRefreshAt(getCurrentISTDate())
    } catch (err) {
      toast({ 
        title: "Refresh Failed", 
        description: "Failed to refresh trading data. Please try again.",
        variant: "destructive"
      })
    }
  }, [refreshAll, reconnect])

  const handleRetry: RetryHandler = useCallback(() => {
    setError(null)
    handleRefreshAllData()
  }, [handleRefreshAllData])

  const handleCloseOrderDialog: OrderDialogCloseHandler = useCallback(() => {
    setOrderDialogOpen(false)
    setSelectedStockForOrder(null)
    setOrderInitialSide(null)
  }, [])

  // Called by TerminalOrderTicket "Preview Order" — opens OrderDialog without clearing the ticker selection
  const handleOpenOrderDialogFromTicket = useCallback((stock: Stock, side: "BUY" | "SELL") => {
    setSelectedStockForOrder(stock)
    setOrderInitialSide(side)
    setOrderDialogOpen(true)
  }, [])

  // Called by TerminalOrderTicket "×" — deselects the inline ticket
  const handleClearSelectedStock = useCallback(() => {
    setSelectedStockForOrder(null)
    setOrderInitialSide(null)
  }, [])

  const handleOrderPlaced: OrderPlacedHandler = useCallback(async () => {
    await refreshAll()
  }, [refreshAll])

  const handleOrderPlacedWithMeta = useCallback(
    async (meta: { orderId: string; symbol: string; side: "BUY" | "SELL"; quantity: number }) => {
      setLastOrderId(meta.orderId)
      setLastOrderSummary({ symbol: meta.symbol, side: meta.side, quantity: meta.quantity })
      await refreshAll()
    },
    [refreshAll]
  )

  // P&L calculations.
  // `pnlObject` is a stable {totalPnL, dayPnL} reference — passed to TradingHome and
  // DesktopTerminalLayout as a single prop so children can rely on referential equality
  // for memoization. Inline `{ totalPnL, dayPnL }` literals at the JSX call sites would
  // create a fresh object every parent render and bust child memo on every realtime tick.
  const pnlObject: PnLData = useMemo(() => {
    if (!positions?.length) return apiPnL

    // Hybrid-smart: prefer live quote-derived PnL for smooth UI, fallback to server snapshot values.
    return computeTradingDashboardPnL({
      positions,
      quotes: quotes as Record<string, any> | undefined,
      fallback: apiPnL,
      pnlMeta: positionsPnLMeta,
    })
  }, [positions, quotes, apiPnL, positionsPnLMeta])
  const { totalPnL, dayPnL } = pnlObject

  // Loading state (do not block UI render; use only for subtle indicators)
  const anyLoading = isQuotesLoading

  // Debug logging (only in development).
  // Deps are scalars derived from the realtime arrays — not the arrays themselves —
  // so this effect doesn't fire on every tick (which would pollute the console at
  // realtime-feed cadence and trigger an extra commit phase per render).
  const ordersCount = orders?.length ?? 0
  const positionsCount = positions?.length ?? 0
  const hasRealtimeAccount = !!realtimeAccountData
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('TradingDashboard Debug:', {
        tradingAccountId,
        realtimeOrders: ordersCount,
        realtimePositions: positionsCount,
        hasRealtimeAccount,
        currentTab,
        anyLoading,
        error,
      })
    }
  }, [tradingAccountId, ordersCount, positionsCount, hasRealtimeAccount, currentTab, anyLoading, error])

  const hasAnyData = (orders?.length || 0) > 0 || (positions?.length || 0) > 0 || !!realtimeAccountData

  // Show the dashboard skeleton ONLY during the very first cold-load. Once any of the realtime
  // hooks has settled (loading flips to false) — even with empty data — we mark the dashboard as
  // "rendered" and never show the full-page skeleton again. This prevents the "tabs go blank
  // white when I return to the browser tab" report: a focus-revalidation flips isLoading back
  // to true, and without this gate the whole page would re-skeleton instead of showing inline
  // tab content (which has its own per-tab skeletons / empty states).
  const hasRenderedOnceRef = useRef(false)
  useEffect(() => {
    if (!hasRenderedOnceRef.current && !isRealtimeLoading) {
      hasRenderedOnceRef.current = true
    }
  }, [isRealtimeLoading])
  const shouldShowDashboardSkeleton =
    !hasRenderedOnceRef.current && !hasAnyData && isRealtimeLoading
  const desktopWorkspaceStats = useMemo(() => {
    const normalizeCurrency = (value: unknown): number => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : 0
    }

    const pendingOrders = (orders || []).filter((order) => String((order as any)?.status || "").toUpperCase() === "PENDING").length
    const activePositions = (positions || []).filter((position) => {
      const quantity = Number((position as any)?.quantity ?? 0)
      const isClosed = Boolean((position as any)?.isClosed)
      return quantity !== 0 && !isClosed
    }).length
    const availableMargin = normalizeCurrency(realtimeAccountData?.availableMargin)
    const balance = normalizeCurrency(realtimeAccountData?.balance)

    return {
      pendingOrders,
      activePositions,
      availableMargin,
      balance,
    }
  }, [orders, positions, realtimeAccountData])

  const tabBadgeCounts = useMemo<Partial<Record<TabConfig["id"], number>>>(() => {
    return {
      orders: desktopWorkspaceStats.pendingOrders,
      positions: desktopWorkspaceStats.activePositions,
    }
  }, [desktopWorkspaceStats])

  const activeTabSequenceLabel = useMemo(() => {
    const currentIndex = TAB_CONFIGS.findIndex((tab) => tab.id === currentTab)
    const normalizedIndex = currentIndex >= 0 ? currentIndex + 1 : 1
    return `${normalizedIndex}/${TAB_CONFIGS.length}`
  }, [currentTab])

  // If we have zero data and a realtime error, show the full error screen.
  // Otherwise, show a non-blocking banner so the user can keep trading with cached data.
  if (error && !hasAnyData) {
    return <ErrorScreen error={error} onRetry={handleRetry} />
  }

  // Render content based on current tab
  const renderContent = () => {
    switch (currentTab) {
      case "home":
        return (
          <ErrorBoundary key="home" fallback={<TabErrorFallback tab="home" />}>
            <div className="space-y-4">
              <RiskMonitor />
              <TradingHome
                userName={session?.user?.name ?? undefined}
                session={session}
                portfolio={portfolio}
                pnl={pnlObject}
                onQuickBuy={handleQuickBuy}
                onQuickSell={handleQuickSell}
                marketSession={marketSession}
              />
            </div>
          </ErrorBoundary>
        )
      case "watchlist":
        return (
          <ErrorBoundary key="watchlist" fallback={<TabErrorFallback tab="watchlist" />}>
            <FeedStatusBanner />
            <WatchlistManager
              quotes={quotes as any}
              subscriptionErrorsByToken={subscriptionErrorsByToken as any}
              onSelectStock={handleSelectStock}
              onQuickBuy={handleQuickBuy}
              onQuickSell={handleQuickSell}
            />
          </ErrorBoundary>
        )
      case "orders":
        return (
          <ErrorBoundary key="orders" fallback={<TabErrorFallback tab="orders" />}>
            <OrderManagement
              orders={orders}
              onOrderUpdate={handleRefreshAllData}
            />
          </ErrorBoundary>
        )
      case "positions":
        return (
          <ErrorBoundary key="positions" fallback={<TabErrorFallback tab="positions" />}>
            <div className="space-y-4 pb-20 lg:pb-8">
              <RiskMonitor compact={false} />
              <PositionTracking
                positions={positions}
                quotes={quotes}
                pnlMeta={positionsPnLMeta}
                optimisticClosePosition={optimisticClosePosition}
                refreshPositions={refreshPositions}
                onPositionUpdate={handleRefreshAllData}
                marketFeedStatus={positionsMarketFeedStatus}
                lastPositionsSyncAtMs={health.lastRefreshAt}
                tradingAccountId={tradingAccountId ?? undefined}
                closedPositionHistory={closedPositionHistory}
              />
            </div>
          </ErrorBoundary>
        )
      case "account":
        return (
          <ErrorBoundary key="account" fallback={<TabErrorFallback tab="account" />}>
            <Account
              portfolio={accountUnified}
              user={session?.user}
              onUpdate={handleRefreshAllData}
            />
          </ErrorBoundary>
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 font-sans">
      {/* ── DESKTOP HEADER (lg+) — Bloomberg-grade terminal header ── */}
      <header
        className="hidden lg:flex sticky top-0 z-40 w-full items-center"
        style={{
          height: 52,
          padding: "0 16px",
          gap: 0,
          background: "var(--terminal-surface)",
          borderBottom: "1px solid var(--terminal-border)",
        }}
      >
        {/* ── Logo block ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, paddingRight: 20, borderRight: "1px solid var(--terminal-separator)" }}>
          <img
            src={BRAND_ASSETS.logos.mark}
            alt={BRAND_IDENTITY.names.short}
            style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, objectFit: "contain" }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--terminal-text)", lineHeight: 1.1, letterSpacing: "-0.3px" }}>
              {BRAND_IDENTITY.names.short}
            </span>
            <span style={{ fontSize: 9, fontWeight: 600, color: "var(--terminal-text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", lineHeight: 1.2 }}>
              Console
            </span>
          </div>
        </div>

        {/* ── Nav links ── */}
        <nav style={{ display: "flex", height: "100%", flexShrink: 0, paddingLeft: 4 }}>
          {([
            { label: "Terminal", active: true, tab: null },
            { label: "Orders", active: false, tab: "orders" },
            { label: "Positions", active: false, tab: "positions" },
            { label: "Funds", active: false, tab: "account" },
          ] as const).map(({ label, active, tab }) => (
            <Link
              key={label}
              href={tab ? buildRouteWithQuery(pathname, { tab }) : pathname}
              replace
              scroll={false}
              style={{
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                textDecoration: "none",
                color: active ? "var(--terminal-accent, #22D3EE)" : "var(--terminal-text-muted)",
                borderBottom: active ? "2px solid var(--terminal-accent, #22D3EE)" : "2px solid transparent",
                paddingBottom: 0,
                paddingTop: 0,
                paddingLeft: 14,
                paddingRight: 14,
                height: "100%",
                lineHeight: "52px",
                display: "inline-flex",
                alignItems: "center",
                transition: "color 120ms, opacity 120ms",
                opacity: active ? 1 : 0.7,
                background: active ? "rgba(34,211,238,.05)" : "transparent",
              }}
              onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.opacity = "1" }}
              onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.opacity = "0.7" }}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div style={{ flex: 1 }} />

        {/* ── Index chips ── */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
          {([
            { label: "NIFTY 50", short: "NIFTY", instrumentId: "NSE_EQ-26571" },
            { label: "BANK NIFTY", short: "BNIFTY", instrumentId: "NSE_EQ-26575" },
          ] as const).map(({ label, short, instrumentId }, idx) => {
            const idxQuote = resolveIndexQuote(quotes as any, { instrumentId })
            const { price, change } = idxQuote
              ? resolveIndexDisplayState({ quote: idxQuote })
              : { price: 0, change: 0 }
            const isUp = change >= 0
            const upColor = "var(--terminal-up, #10D996)"
            const dnColor = "var(--terminal-dn, #FF3B5C)"
            const priceColor = price > 0 ? (isUp ? upColor : dnColor) : "var(--terminal-text-muted)"
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {idx > 0 && (
                  <span style={{ color: "var(--terminal-separator, rgba(255,255,255,.12))", fontSize: 14, margin: "0 2px" }}>·</span>
                )}
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: price > 0 ? (isUp ? "var(--terminal-up-dim, rgba(16,217,150,.08))" : "var(--terminal-dn-dim, rgba(255,59,92,.08))") : "var(--terminal-surface-hi)",
                    border: `1px solid ${price > 0 ? (isUp ? "rgba(16,217,150,.18)" : "rgba(255,59,92,.18)") : "var(--terminal-separator, rgba(255,255,255,.06))"}`,
                    borderRadius: 6,
                    padding: "4px 10px",
                    cursor: "default",
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--terminal-text-muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {short}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontFamily: "var(--font-mono, monospace)",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      color: priceColor,
                      textShadow: price > 0 ? (isUp ? "0 0 10px rgba(16,217,150,.4)" : "0 0 10px rgba(255,59,92,.4)") : "none",
                    }}
                  >
                    {price > 0 ? price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </span>
                  {price > 0 && (
                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", fontWeight: 600, color: priceColor, fontVariantNumeric: "tabular-nums" }}>
                      {isUp ? "▲" : "▼"}{Math.abs(change).toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── IST clock ── */}
        <span
          suppressHydrationWarning
          style={{ fontSize: 11, fontFamily: "var(--font-mono, monospace)", color: "var(--terminal-text-muted)", marginLeft: 16, marginRight: 8, whiteSpace: "nowrap", flexShrink: 0 }}
        >
          {currentIstTime ? formatTimeIST(currentIstTime) : "--:--"} IST
        </span>

        {/* ── Live status chip ── */}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 5, flexShrink: 0, marginRight: 10,
            fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            background: isWebSocketConnected ? "rgba(16,217,150,.12)" : isWebSocketConnecting ? "rgba(245,158,11,.12)" : "rgba(239,68,68,.12)",
            color: isWebSocketConnected ? "var(--terminal-up, #10D996)" : isWebSocketConnecting ? "#F59E0B" : "var(--terminal-dn, #FF3B5C)",
            border: `1px solid ${isWebSocketConnected ? "rgba(16,217,150,.25)" : isWebSocketConnecting ? "rgba(245,158,11,.25)" : "rgba(239,68,68,.25)"}`,
            padding: "3px 10px",
            borderRadius: 20,
            boxShadow: isWebSocketConnected ? "0 0 8px rgba(16,217,150,.20)" : "none",
          }}
        >
          <span
            style={{
              width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
              background: isWebSocketConnected ? "var(--terminal-up, #10D996)" : isWebSocketConnecting ? "#F59E0B" : "var(--terminal-dn, #FF3B5C)",
              animation: isWebSocketConnected ? "pulse 2s ease-in-out infinite" : "none",
            }}
          />
          <span>{isWebSocketConnected ? "LIVE" : isWebSocketConnecting ? "SYNC" : "OFF"}</span>
        </div>

        {/* ── Theme toggle ── */}
        <ThemeToggle className="shrink-0 text-[color:var(--terminal-text-muted)] hover:text-[color:var(--terminal-text)]" />

        {/* ── Avatar ── */}
        <div
          style={{
            width: 30, height: 30, borderRadius: "50%", flexShrink: 0, marginLeft: 8,
            background: "linear-gradient(135deg, #06B6D4, #8B5CF6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 800, color: "#fff", cursor: "default",
            boxShadow: "0 0 10px rgba(6,182,212,.25)",
          }}
          title={session?.user?.name ?? ""}
        >
          {userInitials}
        </div>
      </header>

      {/* ── MOBILE HEADER (< lg) ── */}
      <header className="lg:hidden sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-2xl">
        {/* Subtle gradient accent line at very top */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

        <div className="flex h-14 items-center justify-between px-3 sm:px-4 lg:px-6 max-w-[1400px] mx-auto gap-2 sm:gap-3">

          {/* ── LEFT: Brand ── */}
          <div className="flex items-center gap-2 shrink-0 group cursor-pointer select-none">
            <img
              src={BRAND_ASSETS.logos.mark}
              alt={BRAND_IDENTITY.names.full}
              className="h-8 w-8 rounded-[10px] object-contain"
            />
            {/* Brand name: hidden on mobile, visible sm+ */}
            <span className="hidden sm:block text-[15px] font-bold tracking-tight text-foreground/90 whitespace-nowrap">
              {BRAND_IDENTITY.names.full}
            </span>
          </div>

          {/* ── CENTER: Index data — mobile-first ── */}
          <div className="flex items-center gap-2 flex-1 justify-center min-w-0 overflow-hidden">

            {/* Mobile only: compact NIFTY price (no pill, bare numbers) */}
            <div className="flex sm:hidden items-center gap-3">
              <div className="flex flex-col items-center leading-tight">
                <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60 leading-none mb-0.5">NIFTY</span>
                <IndexDisplay
                  name="NIFTY 50"
                  instrumentId="NSE_EQ-26571"
                  quotes={quotes as any}
                  isLoading={isQuotesLoading}
                  connectionState={wsConnectionState}
                  marketSession={marketSession}
                  compact
                />
              </div>
              <div className="w-px h-5 bg-border/40 shrink-0" />
              <div className="flex flex-col items-center leading-tight">
                <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60 leading-none mb-0.5">BANK</span>
                <IndexDisplay
                  name="BANK NIFTY"
                  instrumentId="NSE_EQ-26575"
                  quotes={quotes as any}
                  isLoading={isQuotesLoading}
                  connectionState={wsConnectionState}
                  marketSession={marketSession}
                  compact
                />
              </div>
            </div>

            {/* sm+: full pill chips */}
            <div className="hidden sm:flex items-center gap-2">
              {INDEX_CONFIGS.map(({ name, instrumentId }) => (
                <IndexDisplay
                  key={instrumentId}
                  name={name}
                  instrumentId={instrumentId}
                  quotes={quotes as any}
                  isLoading={isQuotesLoading}
                  connectionState={wsConnectionState}
                  marketSession={marketSession}
                />
              ))}
            </div>

            {/* IST time — desktop only; suppressHydrationWarning + null guard prevent SSR mismatch */}
            <span suppressHydrationWarning className="hidden lg:inline text-[11px] font-mono text-muted-foreground/50 ml-1 pl-3 border-l border-border/40 whitespace-nowrap shrink-0">
              {currentIstTime ? formatTimeIST(currentIstTime) : "--:--"} IST
            </span>
          </div>

          {/* ── RIGHT: Status + Notifications + Avatar ── */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

            {/* Mobile: bare WS dot (no pill, no border) */}
            <span className={`flex sm:hidden h-2 w-2 rounded-full shrink-0 ${
              isWebSocketConnected ? "bg-emerald-500"
              : isWebSocketConnecting ? "bg-amber-400 animate-pulse"
              : "bg-rose-500"
            }`} />

            {/* sm+: WS pill */}
            <div className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-wide transition-colors ${
              isWebSocketConnected
                ? "bg-emerald-500/8 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                : isWebSocketConnecting
                  ? "bg-amber-500/8 border-amber-500/20 text-amber-600 dark:text-amber-400"
                  : isSnapshotMode
                    ? "bg-amber-500/8 border-amber-500/20 text-amber-600 dark:text-amber-300"
                    : "bg-rose-500/8 border-rose-500/20 text-rose-600 dark:text-rose-400"
            }`}>
              {isWebSocketConnected ? (
                <Activity className="h-3 w-3 animate-pulse shrink-0" />
              ) : isWebSocketConnecting ? (
                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              ) : isSnapshotMode ? (
                <AlertCircle className="h-3 w-3 shrink-0" />
              ) : (
                <WifiOff className="h-3 w-3 shrink-0" />
              )}
              <span className="hidden md:inline">
                {isWebSocketConnected ? "Live" : isWebSocketConnecting ? "Sync" : isSnapshotMode ? "Snap" : "Off"}
              </span>
            </div>

            {/* Fullscreen — desktop only */}
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg border border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground hover:border-border/70 transition-all duration-200 hover:scale-105 active:scale-95"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>

            {/* Notifications */}
            <NotificationBell userId={userId} />

            {/* Account avatar + dropdown → navigates to /console sections */}
            <AccountMenu userId={userId} />
          </div>
        </div>
      </header>

      {/* ── Desktop 3-column terminal (lg+) ── */}
      {isDesktop && (
        <DesktopTerminalLayout
          positions={positions ?? []}
          positionsPnLMeta={positionsPnLMeta}
          orders={orders ?? []}
          session={session}
          portfolio={portfolio}
          pnl={pnlObject}
          onQuickBuy={handleQuickBuy}
          onQuickSell={handleQuickSell}
          optimisticClosePosition={optimisticClosePosition}
          refreshPositions={refreshPositions}
          onPositionUpdate={handleRefreshAllData}
          positionsMarketFeedStatus={positionsMarketFeedStatus}
          tradingAccountId={tradingAccountId ?? undefined}
          health={health}
        />
      )}

      {/* ── Mobile / tablet tab layout (< lg) ── */}
      {!isDesktop && <div className="mx-auto w-full max-w-[1400px] px-3 sm:px-4">
        <div className="flex gap-4 pt-3 sm:pt-4 pb-20 sm:pb-24">
          {/* Desktop Navigation Rail */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="desktop-sticky-rail desktop-sticky-rail--workspace rounded-2xl border border-border/60 bg-card/80 backdrop-blur-md p-3 shadow-sm">
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Workspace
              </div>
              <div className="space-y-1.5">
                {TAB_CONFIGS.map(({ id, icon: Icon, label }) => {
                  const isActive = currentTab === id
                  const badgeCount = tabBadgeCounts[id]
                  const badgeValue = typeof badgeCount === "number" && badgeCount > 0 ? Math.min(badgeCount, 99) : null
                  return (
                    <Link
                      key={`desktop-${id}`}
                      href={buildRouteWithQuery(pathname, id === "home" ? {} : { tab: id })}
                      replace
                      scroll={false}
                      onClick={(e) => handleDesktopTabClick(id, e)}
                      className={`flex h-10 w-full items-center justify-start gap-3 rounded-xl px-3 transition-all duration-200 ${
                        isActive
                          ? "bg-primary/10 text-primary hover:bg-primary/15"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                      <span className="font-medium">{label}</span>
                      {badgeValue !== null && (
                        <span
                          className={`ml-auto inline-flex min-w-[1.4rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {badgeCount! > 99 ? "99+" : badgeValue}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>

              <div className="mt-4 rounded-xl border border-border/50 bg-background/70 px-3 py-3 space-y-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Live Overview
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-[10px] text-muted-foreground">Open Orders</p>
                    <p className="text-sm font-semibold text-foreground">{desktopWorkspaceStats.pendingOrders}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <p className="text-[10px] text-muted-foreground">Positions</p>
                    <p className="text-sm font-semibold text-foreground">{desktopWorkspaceStats.activePositions}</p>
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground">Available Margin</p>
                  <p className="text-sm font-semibold text-foreground">
                    ₹{desktopWorkspaceStats.availableMargin.toLocaleString("en-IN")}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2">
                  <p className="text-[10px] text-muted-foreground">Ledger Balance</p>
                  <p className="text-sm font-semibold text-foreground">
                    ₹{desktopWorkspaceStats.balance.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content - Responsive */}
          <main className="min-w-0 flex-1">
            <div className="desktop-sticky-rail desktop-sticky-rail--workspace desktop-sticky-rail--priority mb-4 hidden lg:flex items-center justify-between rounded-2xl border border-border/60 bg-card/85 px-4 py-3 shadow-sm backdrop-blur-md">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {TAB_CONFIGS.find((tab) => tab.id === currentTab)?.label}
                </h2>
                <p className="text-xs text-muted-foreground">{TAB_DESCRIPTIONS[currentTab]}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="h-7 rounded-full border-border/60 bg-muted/30 px-2 text-[11px] font-semibold text-foreground">
                  Tab {activeTabSequenceLabel}
                </Badge>
                <Badge variant="outline" className="h-7 rounded-full border-amber-500/30 bg-amber-500/10 px-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  Pending {desktopWorkspaceStats.pendingOrders}
                </Badge>
                <Badge variant="outline" className="h-7 rounded-full border-blue-500/30 bg-blue-500/10 px-2 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  Active {desktopWorkspaceStats.activePositions}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-2 bg-background/80"
                  onClick={handleRefreshAllData}
                >
                  <span suppressHydrationWarning className="hidden xl:inline text-[11px] text-muted-foreground">
                    {lastWorkspaceRefreshAt ? `Updated ${formatTimeIST(lastWorkspaceRefreshAt)}` : "Refresh"}
                  </span>
                  <RefreshCcw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              </div>
            </div>

            {(error && hasAnyData) || wsConnectionState === "disconnected" || isWebSocketError || sseDead || sseReconnecting ? (
              <div className="desktop-sticky-rail desktop-sticky-rail--secondary mb-3 space-y-2">
                {error && hasAnyData && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-200">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>
                          Some trading data may be stale due to an error. You can continue, or retry to resync.
                        </span>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleRetry}>
                        Retry
                      </Button>
                    </div>
                  </div>
                )}
                {sseDead && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                        <span>
                          Order/position update stream is offline. Showing the last known state. New trades + fills will not appear until you reconnect.
                        </span>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={forceReconnectSse}>
                        Reconnect now
                      </Button>
                    </div>
                  </div>
                )}
                {sseReconnecting && !sseDead && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                      <span>Re-establishing the order/position update stream…</span>
                    </div>
                  </div>
                )}
                {(wsConnectionState === "disconnected" || isWebSocketError) && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      isSnapshotMode
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                        : "border-border/60 bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <WifiOff className={`h-3.5 w-3.5 ${isSnapshotMode ? "text-amber-600" : "text-red-500"}`} />
                        <span>
                          {isSnapshotMode
                            ? "Market data feed is disconnected. Showing snapshot/reference prices until live stream reconnects."
                            : "Market data feed is offline. Live prices are unavailable until reconnection."}
                        </span>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleRefreshAllData}>
                        Reconnect
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            {shouldShowDashboardSkeleton ? <DashboardSkeleton /> : renderContent()}
          </main>
        </div>
      </div>}

      {/* Bottom Navigation — Center FAB */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
        <div className="bg-card/95 backdrop-blur-lg border-t border-border/50 shadow-2xl overflow-visible">
          {/* Fixed-height row — FAB overflows upward via -translate-y */}
          <div className="flex items-center justify-around h-[54px] overflow-visible px-1 sm:px-2 max-w-[1400px] mx-auto">

            {/* Flat tab renderer */}
            {([0, 1] as const).map((i) => {
              const { id, icon: Icon, label } = TAB_CONFIGS[i]
              const badgeCount = tabBadgeCounts[id]
              const showBadge = typeof badgeCount === "number" && badgeCount > 0
              const isActive = currentTab === id
              return (
                <Link
                  key={id}
                  href={buildRouteWithQuery(pathname, id === "home" ? {} : { tab: id })}
                  replace scroll={false}
                  onClick={() => setActiveTabOverride(id)}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-[3px] flex-1 h-full transition-colors duration-200 ${
                    isActive ? "text-primary" : "text-muted-foreground/60"
                  }`}
                >
                  <div className="relative">
                    <Icon className="h-5 w-5" />
                    {showBadge && (
                      <span className="absolute -top-1.5 -right-2 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[8px] font-bold text-primary-foreground">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </div>
                  <span className={`text-[9px] leading-none ${isActive ? "font-semibold" : "font-medium"}`}>{label}</span>
                </Link>
              )
            })}

            {/* Center FAB — Positions */}
            {(() => {
              const fab = TAB_CONFIGS[3]
              const FabIcon = fab.icon
              const isActive = currentTab === fab.id
              const badgeCount = tabBadgeCounts[fab.id]
              const showBadge = typeof badgeCount === "number" && badgeCount > 0
              return (
                <div className="flex flex-col items-center -translate-y-[22px] shrink-0 mx-2">
                  <Link
                    href={buildRouteWithQuery(pathname, { tab: fab.id })}
                    replace scroll={false}
                    onClick={() => setActiveTabOverride(fab.id)}
                    aria-label={fab.label}
                    aria-current={isActive ? "page" : undefined}
                    className="relative flex items-center justify-center w-[54px] h-[54px] active:scale-90 transition-transform duration-150"
                  >
                    {/* Spinning border — active */}
                    {isActive && (
                      <span className="absolute -inset-[3px] rounded-full animate-spin pointer-events-none" style={{
                        background: "conic-gradient(from 0deg, transparent 0%, transparent 48%, color-mix(in oklab, var(--primary), transparent 70%) 60%, var(--primary) 75%, var(--primary) 83%, color-mix(in oklab, var(--primary), transparent 70%) 93%, transparent 100%)",
                        animationDuration: "2.2s",
                      }} />
                    )}
                    {/* Idle aura */}
                    {!isActive && (
                      <span className="absolute -inset-2 rounded-full animate-pulse pointer-events-none" style={{
                        background: "radial-gradient(circle, color-mix(in oklab, var(--primary), transparent 82%) 0%, transparent 70%)",
                        animationDuration: "2.8s",
                      }} />
                    )}
                    {/* Glow bloom */}
                    <span className={`absolute -inset-[2px] rounded-full blur-md transition-opacity duration-500 ${isActive ? "opacity-60" : "opacity-25"}`}
                      style={{ background: "color-mix(in oklab, var(--primary), transparent 60%)" }} />
                    {/* Button */}
                    <span className={`absolute inset-[3px] rounded-full flex items-center justify-center shadow-xl transition-all duration-300 ${
                      isActive
                        ? "bg-gradient-to-br from-primary via-primary to-primary/80 shadow-primary/40"
                        : "bg-gradient-to-br from-primary/95 to-primary/70 shadow-primary/20"
                    }`}>
                      <FabIcon className="h-[21px] w-[21px] text-primary-foreground" />
                    </span>
                    {showBadge && (
                      <span className="absolute -top-0.5 -right-0.5 z-20 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-bold text-white">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </Link>
                  <span className={`text-[9px] leading-none mt-1.5 font-semibold transition-colors duration-200 ${isActive ? "text-primary" : "text-muted-foreground/50"}`}>
                    {fab.label}
                  </span>
                </div>
              )
            })()}

            {/* Right flat tabs: Orders + Account */}
            {([2, 4] as const).map((i) => {
              const { id, icon: Icon, label } = TAB_CONFIGS[i]
              const badgeCount = tabBadgeCounts[id]
              const showBadge = typeof badgeCount === "number" && badgeCount > 0
              const isActive = currentTab === id
              return (
                <Link
                  key={id}
                  href={buildRouteWithQuery(pathname, { tab: id })}
                  replace scroll={false}
                  onClick={() => setActiveTabOverride(id)}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-[3px] flex-1 h-full transition-colors duration-200 ${
                    isActive ? "text-primary" : "text-muted-foreground/60"
                  }`}
                >
                  <div className="relative">
                    <Icon className="h-5 w-5" />
                    {showBadge && (
                      <span className="absolute -top-1.5 -right-2 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-primary px-1 text-[8px] font-bold text-primary-foreground">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </div>
                  <span className={`text-[9px] leading-none ${isActive ? "font-semibold" : "font-medium"}`}>{label}</span>
                </Link>
              )
            })}

          </div>
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </div>
      </div>

      {/* Order Dialog — used only by the legacy quick-buy/sell flows (chart bar, terminal panel, etc.). */}
      {(orderDialogOpen || !!selectedStockForOrder) && (
        <OrderDialog
          isOpen={orderDialogOpen}
          onClose={handleCloseOrderDialog}
          stock={selectedStockForOrder}
          initialOrderSide={orderInitialSide}
          portfolio={accountUnified}
          drawer
          onOrderPlaced={handleOrderPlaced}
          session={session}
        />
      )}

      {/* Watchlist row-tap drawer — Kite-inspired peek/expanded/order experience. */}
      <WatchlistOrderDrawer
        isOpen={!!watchlistDrawerStock}
        stock={watchlistDrawerStock}
        onClose={handleCloseWatchlistDrawer}
        portfolio={accountUnified}
        session={session}
        onOrderPlaced={handleOrderPlaced}
        onOrderPlacedWithMeta={handleOrderPlacedWithMeta}
        onViewChart={handleViewChart}
      />

      {/* Docked order status card — shown after quick order placement */}
      <PersistentOrderCard
        orderId={lastOrderId}
        orderSummary={lastOrderSummary ?? undefined}
        onRetry={(symbol) => {
          setLastOrderId(null)
          const stock = watchlistDrawerStock?.symbol === symbol ? watchlistDrawerStock : null
          if (stock) setWatchlistDrawerStock(stock)
        }}
        onDismiss={() => setLastOrderId(null)}
      />

      {/* Full-screen chart drawer — left-slide, chart shell owns everything including Buy/Sell */}
      <Drawer open={!!chartDrawerStock} onOpenChange={(o) => !o && handleCloseChartDrawer()} direction="left">
        <DrawerContent className="data-[vaul-drawer-direction=left]:h-screen data-[vaul-drawer-direction=left]:w-screen data-[vaul-drawer-direction=left]:max-w-none data-[vaul-drawer-direction=left]:rounded-none data-[vaul-drawer-direction=left]:border-0 px-0 pb-0">
          {chartDrawerStock && (
            <WatchlistObsidianChartShell
              instrument={{
                instrumentKey: chartDrawerStock.instrumentId || chartDrawerStock.symbol || "chart",
                token: chartDrawerStock.token,
                instrumentId: chartDrawerStock.instrumentId ?? null,
                seedBasePrice: chartDrawerStock.ltp ?? chartDrawerStock.close ?? 0,
              }}
              symbol={chartDrawerStock.symbol ?? "—"}
              name={chartDrawerStock.name ?? chartDrawerStock.companyName}
              onClose={handleCloseChartDrawer}
              onBuy={(instrument, ltp) => {
                handleCloseChartDrawer()
                handleQuickBuy(chartDrawerStock)
              }}
              onSell={(instrument, ltp) => {
                handleCloseChartDrawer()
                handleQuickSell(chartDrawerStock)
              }}
              className="min-h-0 flex-1"
            />
          )}
        </DrawerContent>
      </Drawer>
    </div>
  )
}

// Wrapper Component with Session Management
const TradingDashboardWrapper: React.FC = () => {
  const { data: session, status } = useSession()
  const userId = session?.user?.id as string | undefined
  const router = useRouter()
  const [sessionLoadGiveUp, setSessionLoadGiveUp] = useState(false)
  const hasStaleAuthSession = status === "authenticated" && !userId
  const shouldRedirectToLogin = status === "unauthenticated" || hasStaleAuthSession

  useEffect(() => {
    if (status === "loading") return
    // Any resolved auth state means the dashboard wrapper committed without throwing.
    // Clear both recovery budgets so a subsequent crash gets the full auto-retry flow
    // instead of inheriting leftover attempts from a prior session / stale-cookie redirect.
    clearDashboardLoadRecoveryCounter()
    clearDashboardErrorRecoveryCounter()
  }, [status, userId])

  useEffect(() => {
    if (status !== "loading") {
      setSessionLoadGiveUp(false)
      return
    }

    const timeoutId = window.setTimeout(() => {
      if (prepareDashboardLoadRecoveryReload() === "reload") {
        console.trace("[TradingDashboard] session-stuck reload triggered")
        window.location.reload()
        return
      }
      setSessionLoadGiveUp(true)
    }, DASHBOARD_LOAD_STUCK_MS)

    return () => window.clearTimeout(timeoutId)
  }, [status])

  useEffect(() => {
    if (!shouldRedirectToLogin) return
    const callbackUrl = getAppRoute("dashboard")
    const loginUrl = buildRouteWithQuery(getAuthRoute("login"), { callbackUrl })

    if (hasStaleAuthSession) {
      // Stale cookie: clear it via signOut so we don't loop back into the same branch.
      void signOut({ callbackUrl: loginUrl, redirect: true })
      return
    }

    router.replace(loginUrl)
  }, [shouldRedirectToLogin, hasStaleAuthSession, router])

  const handleSessionRetry = useCallback(() => {
    clearDashboardLoadRecoveryCounter()
    setSessionLoadGiveUp(false)
    window.location.reload()
  }, [])

  if (status === "loading") {
    if (!sessionLoadGiveUp) {
      return <LoadingScreen message="Loading your secure session..." />
    }
    return (
      <ErrorScreen
        error="Session is taking longer than expected. Auto-refresh was tried several times. Please retry or sign in again."
        onRetry={handleSessionRetry}
      />
    )
  }

  if (shouldRedirectToLogin) {
    const message = getRedirectMessage(hasStaleAuthSession)
    return <LoadingScreen message={message} />
  }

  if (!userId) {
    return <LoadingScreen message="Preparing dashboard..." />
  }

  return (
    <TradingRealtimeProvider userId={userId} session={session as any}>
      <WebSocketMarketDataProvider
        userId={userId}
        enableWebSocket={true}
      >
        <TradingDashboard />
      </WebSocketMarketDataProvider>
    </TradingRealtimeProvider>
  )
}

export default TradingDashboardWrapper
