/**
 * @file WatchlistManager.tsx
 * @module components/watchlist
 * @description Premium watchlist manager with shadcn tabs and modern UI. 
 * 
 * CRITICAL: WebSocket Quotes Access Pattern
 * - WebSocket stores quotes keyed by TOKEN (e.g., quotes["26000"])
 * - Watchlist items must use item.token.toString() to access quotes
 * - DO NOT use item.instrumentId for quote lookup (e.g., quotes["NSE_EQ-26000"])
 * - Fallback to instrumentId only if token is unavailable
 * 
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2025-01-27 - Fixed WebSocket quote key mismatch issue
 * @updated 2026-05-07 — Stop per-render console.log/warn spam in production: drop
 *   first-item debug log, gate quote-missing warns to dev + dedupe per token.
 */

"use client"

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus,
  Eye,
  Star,
  Search,
  ArrowUpDown,
  Loader2,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger, 
  DropdownMenuSeparator, 
  DropdownMenuLabel 
} from "@/components/ui/dropdown-menu"
import { toast } from "@/hooks/use-toast"
import { useSession } from "next-auth/react"
import {
  parsePositiveIntegerMarketNumber,
  parseTokenFromInstrumentId,
  resolveDisplayQuoteSnapshot,
  resolveQuotePriceSnapshot,
  resolveQuoteFromMap,
  type MarketQuoteLike,
} from "@/lib/market-data/utils/quote-lookup"
import type { WSMarketDataError } from "@/lib/market-data/providers/types"
import { useMarketDataStable } from "@/lib/market-data/providers/WebSocketMarketDataProvider"

import WatchlistItemCard from "./WatchlistItemCard"
import { CreateWatchlistDialog } from "./CreateWatchlistDialog"
import { EditWatchlistDialog } from "./EditWatchlistDialog"
import { StockSearch } from "../stock-search"
import { 
  useEnhancedWatchlists, 
  useWatchlistItems,
  type WatchlistData,
  type WatchlistItemData 
} from "@/lib/hooks/use-prisma-watchlist"

interface Quote extends MarketQuoteLike {
  prev_close_price: number
  market_depth?: {
    bid: Array<{ price: number; quantity: number }>
    ask: Array<{ price: number; quantity: number }>
  }
  ohlc?: {
    open: number
    high: number
    low: number
    close: number
    volume: number
    turnover: number
  }
}

interface WatchlistManagerProps {
  quotes: Record<string, Quote>
  subscriptionErrorsByToken?: Record<string, WSMarketDataError>
  onSelectStock: (stock: any) => void
  onQuickBuy?: (stock: any) => void
  onQuickSell?: (stock: any) => void
  className?: string
}

type SortBy = 'name' | 'change' | 'price' | 'added'
type InstrumentTab = 'all' | 'equity' | 'futures' | 'options' | 'commodities'

const PERSISTED_STOCK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const normalizePersistedStockId = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined
  }
  const normalizedValue = value.trim()
  if (!normalizedValue || !PERSISTED_STOCK_ID_PATTERN.test(normalizedValue)) {
    return undefined
  }
  return normalizedValue
}

export function WatchlistManager({
  quotes,
  subscriptionErrorsByToken,
  onSelectStock,
  onQuickBuy,
  onQuickSell,
  className
}: WatchlistManagerProps) {
  const { data: session } = useSession()
  const userId = session?.user?.id as string
  const { marketDisplayQuoteFreshness, marketDisplayUi } = useMarketDataStable()

  // State
  const [activeTab, setActiveTab] = useState<string>("")
  const [instrumentFilter, setInstrumentFilter] = useState<InstrumentTab>('all')
  const [sortBy, setSortBy] = useState<SortBy>('added')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showSearchDialog, setShowSearchDialog] = useState(false)
  const [editingWatchlist, setEditingWatchlist] = useState<WatchlistData | null>(null)
  const [removingItems, setRemovingItems] = useState<Set<string>>(new Set())
  const [searchInputFocused, setSearchInputFocused] = useState(false)

  // Dev-only "have we already warned about this missing token?" set so we don't
  // log "quote not found" once per render per item — only once per token, ever.
  const warnedMissingTokensRef = useRef<Set<number | string>>(new Set())

  // Hooks
  const {
    watchlists,
    isLoading: watchlistsLoading,
    isRefreshing: watchlistsRefreshing,
    createWatchlist,
    updateWatchlist,
    deleteWatchlist,
    refetch: refetchWatchlists
  } = useEnhancedWatchlists(userId)

  const {
    addItem,
    updateItem,
    removeItem
  } = useWatchlistItems(activeTab || undefined)

  // Computed values
  const activeWatchlist = useMemo(() => {
    // Preserve last selected tab if still present; otherwise fall back gracefully
    if (watchlists.length === 0) return null
    const current = watchlists.find(w => w.id === activeTab)
    return current || watchlists[0] || null
  }, [watchlists, activeTab])

  // Note: WebSocket subscription management is centralized in WebSocketMarketDataProvider.
  // WatchlistManager only consumes `quotes` and focuses on UX + CRUD.

  // Calculate tab counts in a separate useMemo (outside of map)
  const tabCounts = useMemo(() => {
    if (!activeWatchlist || !activeWatchlist.items || !Array.isArray(activeWatchlist.items)) {
      return { all: 0, equity: 0, futures: 0, options: 0, commodities: 0 }
    }
    
    const items = [...(activeWatchlist.items || [])]
    
    const counts = {
      all: items.length,
      equity: items.filter(item => {
        const segment = item?.segment?.toUpperCase() || ''
        return ['NSE', 'NSE_EQ', 'BSE', 'BSE_EQ'].includes(segment)
      }).length,
      futures: items.filter(item => {
        const segment = item?.segment?.toUpperCase() || ''
        return ['NSE_FO', 'BSE_FO', 'NFO'].includes(segment) && !item.optionType
      }).length,
      options: items.filter(item => {
        const segment = item?.segment?.toUpperCase() || ''
        return ['NSE_FO', 'BSE_FO', 'NFO'].includes(segment) && !!item.optionType
      }).length,
      commodities: items.filter(item => {
        const segment = item?.segment?.toUpperCase() || ''
        const exchange = item?.exchange?.toUpperCase() || ''
        return ['MCX', 'MCX_FO'].includes(segment) || exchange.includes('MCX')
      }).length,
    }
    
    return counts
  }, [activeWatchlist])

  // Phase 1: Filter + stable sort (no quotes dep — runs only when list/filter/sort changes).
  // For 'change' and 'price' sorts this just returns the filtered list unsorted; Phase 2 sorts it.
  const filteredItems = useMemo(() => {
    try {
      if (!activeWatchlist || !Array.isArray(activeWatchlist.items)) return []
      return activeWatchlist.items.filter((item, index) => {
        try {
          const segment = item?.segment?.toUpperCase() || ''
          const optionType = item?.optionType
          switch (instrumentFilter) {
            case 'all': return true
            case 'equity': return ['NSE', 'NSE_EQ', 'BSE', 'BSE_EQ'].includes(segment)
            case 'futures': return ['NSE_FO', 'BSE_FO', 'NFO'].includes(segment) && !optionType
            case 'options': return ['NSE_FO', 'BSE_FO', 'NFO'].includes(segment) && !!optionType
            case 'commodities': return ['MCX', 'MCX_FO'].includes(segment)
            default: return true
          }
        } catch (filterError: any) {
          console.error(`❌ [WATCHLIST-MANAGER] Error filtering item ${index}:`, filterError.message)
          return true
        }
      })
    } catch (error: any) {
      console.error('❌ [WATCHLIST-MANAGER] Fatal error in filteredItems:', error.message)
      return []
    }
  }, [activeWatchlist, instrumentFilter])

  // Phase 2: Quote-driven sort — debounced so it fires at most every 500ms, not on every tick.
  // For 'added' and 'name' sorts, quotes are not needed at all.
  const debouncedQuotesRef = useRef<typeof quotes>(quotes)
  const [quoteSortTick, setQuoteSortTick] = useState(0)
  useEffect(() => {
    if (sortBy !== 'change' && sortBy !== 'price') return
    const t = setTimeout(() => {
      debouncedQuotesRef.current = quotes
      setQuoteSortTick(n => n + 1)
    }, 500)
    return () => clearTimeout(t)
  }, [quotes, sortBy])

  const sortedItems = useMemo(() => {
    try {
      const items = [...filteredItems]
      items.sort((a, b) => {
        try {
          switch (sortBy) {
            case 'name':
              return (a?.symbol || 'UNKNOWN').localeCompare(b?.symbol || 'UNKNOWN')
            case 'change': {
              const q = debouncedQuotesRef.current
              try {
                const quoteA = resolveQuoteFromMap(q, { token: a?.token, uirId: (a as any)?.uirId, instrumentId: a?.instrumentId })
                const quoteB = resolveQuoteFromMap(q, { token: b?.token, uirId: (b as any)?.uirId, instrumentId: b?.instrumentId })
                const snapA = resolveQuotePriceSnapshot({ quote: quoteA, fallbackPrice: a?.ltp, fallbackClose: a?.close, maxAgeMs: marketDisplayQuoteFreshness.liveMaxAgeMs })
                const snapB = resolveQuotePriceSnapshot({ quote: quoteB, fallbackPrice: b?.ltp, fallbackClose: b?.close, maxAgeMs: marketDisplayQuoteFreshness.liveMaxAgeMs })
                const changeA = snapA.isFresh ? (snapA.uiPrice - snapA.prevClose) : 0
                const changeB = snapB.isFresh ? (snapB.uiPrice - snapB.prevClose) : 0
                return changeB - changeA
              } catch (err: any) {
                console.error('❌ [WATCHLIST-MANAGER] Error calculating change:', err)
                return 0
              }
            }
            case 'price': {
              const q = debouncedQuotesRef.current
              try {
                const quoteA = resolveQuoteFromMap(q, { token: a?.token, uirId: (a as any)?.uirId, instrumentId: a?.instrumentId })
                const quoteB = resolveQuoteFromMap(q, { token: b?.token, uirId: (b as any)?.uirId, instrumentId: b?.instrumentId })
                const snapA = resolveQuotePriceSnapshot({ quote: quoteA, fallbackPrice: a?.ltp, fallbackClose: a?.close, maxAgeMs: marketDisplayQuoteFreshness.liveMaxAgeMs })
                const snapB = resolveQuotePriceSnapshot({ quote: quoteB, fallbackPrice: b?.ltp, fallbackClose: b?.close, maxAgeMs: marketDisplayQuoteFreshness.liveMaxAgeMs })
                return (snapB.isFresh ? snapB.uiPrice : 0) - (snapA.isFresh ? snapA.uiPrice : 0)
              } catch (err: any) {
                console.error('❌ [WATCHLIST-MANAGER] Error calculating price:', err)
                return 0
              }
            }
            case 'added':
            default: {
              try {
                const timeA = a?.createdAt ? new Date(a.createdAt).getTime() : 0
                const timeB = b?.createdAt ? new Date(b.createdAt).getTime() : 0
                return (isNaN(timeA) || isNaN(timeB)) ? 0 : timeB - timeA
              } catch (err: any) {
                console.error('❌ [WATCHLIST-MANAGER] Error parsing dates:', err)
                return 0
              }
            }
          }
        } catch (sortError: any) {
          console.error('❌ [WATCHLIST-MANAGER] Error in sort comparison:', sortError.message)
          return 0
        }
      })
      return items
    } catch (error: any) {
      console.error('❌ [WATCHLIST-MANAGER] Fatal error in sortedItems:', error.message)
      return []
    }
  // quoteSortTick triggers re-sort when debounced quotes arrive (change/price modes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems, sortBy, marketDisplayQuoteFreshness.liveMaxAgeMs, quoteSortTick])

  const activeWatchlistSequence = useMemo(() => {
    if (!activeWatchlist || watchlists.length === 0) {
      return "0/0"
    }
    const index = watchlists.findIndex((watchlist) => watchlist.id === activeWatchlist.id)
    if (index < 0) {
      return `1/${watchlists.length}`
    }
    return `${index + 1}/${watchlists.length}`
  }, [activeWatchlist, watchlists])

  const activeWatchlistTokens = useMemo(() => {
    const tokens = new Set<number>()
    for (const item of activeWatchlist?.items || []) {
      const normalizedToken = parsePositiveIntegerMarketNumber(item?.token)
      if (normalizedToken !== null) {
        tokens.add(normalizedToken)
      }
    }
    return Array.from(tokens)
  }, [activeWatchlist])

  const sortByLabel = sortBy === "added" ? "Recent" : sortBy === "name" ? "Name" : sortBy === "change" ? "Change" : "Price"
  const instrumentFilterLabel =
    instrumentFilter === "all"
      ? "All"
      : instrumentFilter === "equity"
        ? "Equity"
        : instrumentFilter === "futures"
          ? "Futures"
          : instrumentFilter === "options"
            ? "Options"
            : "MCX"

  // Handlers
  const handleCreateWatchlist = useCallback(async (data: {
    name: string
    description?: string
    color?: string
    isDefault?: boolean
  }) => {
    try {
      await createWatchlist(data)
      setShowCreateDialog(false)
    } catch (error) {
      // Error is handled by the hook
    }
  }, [createWatchlist])

  const handleEditWatchlist = useCallback(async (data: {
    name?: string
    description?: string
    color?: string
    isDefault?: boolean
  }) => {
    if (!editingWatchlist) return
    
    try {
      await updateWatchlist(editingWatchlist.id, data)
      setShowEditDialog(false)
      setEditingWatchlist(null)
    } catch (error) {
      // Error is handled by the hook
    }
  }, [editingWatchlist, updateWatchlist])

  const handleDeleteWatchlist = useCallback(async (watchlistId: string) => {
    try {
      await deleteWatchlist(watchlistId)
      if (activeTab === watchlistId) {
        setActiveTab("")
      }
    } catch (error) {
      // Error is handled by the hook
    }
  }, [deleteWatchlist, activeTab])

  const handleAddStock = useCallback(async (stockData: string | { stockId?: string; token?: number; symbol?: string; name?: string; exchange?: string; segment?: string; strikePrice?: number; optionType?: 'CE' | 'PE'; expiry?: string; lotSize?: number; instrumentId?: string; logo_url?: string }) => {
    if (!activeTab) {
      toast({
        title: "No Watchlist Selected",
        description: "Please select a watchlist first.",
        variant: "destructive"
      })
      return
    }

    try {
      // If it's a string (legacy format or token string), try to parse it
      if (typeof stockData === 'string') {
        // Check if it's a token-based format: token:token:symbol:exchange:segment:name
        if (stockData.startsWith('token:')) {
          const parts = stockData.split(':')
          if (parts.length >= 4) {
            const parsedToken = parsePositiveIntegerMarketNumber(parts[1])
            if (parsedToken === null) {
              throw new Error("Invalid token payload")
            }
            await addItem({
              token: parsedToken,
              symbol: parts[2],
              exchange: parts[3],
              segment: parts[4] || undefined,
              name: parts[5] ? decodeURIComponent(parts[5]) : undefined,
            })
          } else {
            throw new Error("Invalid token payload")
          }
        } else {
          // Regular stockId (UUID)
          const normalizedStockId = normalizePersistedStockId(stockData)
          if (!normalizedStockId) {
            throw new Error("Token is required to add this instrument to watchlist.")
          }
          await addItem({ stockId: normalizedStockId })
        }
      } else {
        // Object with metadata - ensure token is included or can be extracted
        const itemData: any = { ...stockData }
        const normalizedStockId = normalizePersistedStockId(itemData.stockId)
        if (normalizedStockId) {
          itemData.stockId = normalizedStockId
        } else {
          delete itemData.stockId
        }
        
        console.log('📝 [WATCHLIST-MANAGER] Adding stock with data:', {
          hasToken: !!itemData.token,
          hasStockId: !!itemData.stockId,
          hasInstrumentId: !!itemData.instrumentId,
          symbol: itemData.symbol,
          exchange: itemData.exchange,
          segment: itemData.segment
        })
        
        const normalizedToken =
          parsePositiveIntegerMarketNumber(itemData.token) ??
          parseTokenFromInstrumentId(itemData.instrumentId)
        if (normalizedToken !== null) {
          itemData.token = normalizedToken
          console.log(`✅ [WATCHLIST-MANAGER] Resolved token ${normalizedToken} for watchlist add`)
        } else {
          delete itemData.token
        }
        
        // Ensure required fields are present
        if (!itemData.token && !itemData.stockId) {
          const errorMsg = 'Token is required to add this instrument to watchlist. Please retry with a valid search result.'
          console.error('❌ [WATCHLIST-MANAGER] Missing token and stockId:', itemData)
          throw new Error(errorMsg)
        }
        
        console.log('✅ [WATCHLIST-MANAGER] Calling addItem with:', {
          token: itemData.token,
          symbol: itemData.symbol,
          exchange: itemData.exchange,
          segment: itemData.segment
        })
        
        await addItem(itemData)
      }
      setShowSearchDialog(false)
      // addItem already performs optimistic update + mutate; keep any manual refetch non-blocking.
      refetchWatchlists().catch((refreshError) => {
        console.warn("⚠️ [WATCHLIST-MANAGER] Post-add refetch failed:", refreshError)
      })
    } catch (error) {
      console.error('❌ [WATCHLIST-MANAGER] Failed to add stock:', error)
      toast({
        title: "Failed to Add Stock",
        description: error instanceof Error ? error.message : "Could not add stock to watchlist.",
        variant: "destructive"
      })
    }
  }, [activeTab, addItem, refetchWatchlists])

  const handleRemoveItem = useCallback(async (itemId: string) => {
    setRemovingItems(prev => new Set(prev).add(itemId))
    
    try {
      await removeItem(itemId)
      await refetchWatchlists()
    } catch (error) {
      // Error is handled by the hook
    } finally {
      setRemovingItems(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemId)
        return newSet
      })
    }
  }, [removeItem, refetchWatchlists])

  const handleToggleAlert = useCallback(async (itemId: string, enabled: boolean, price?: number) => {
    try {
      await updateItem(itemId, {
        alertPrice: enabled ? price : undefined,
        alertType: enabled ? "ABOVE" : undefined
      })
      await refetchWatchlists()
    } catch (error) {
      // Error is handled by the hook
    }
  }, [updateItem, refetchWatchlists])

  // Set default watchlist on first load
  React.useEffect(() => {
    if (watchlists.length > 0) {
      if (!activeTab) {
        const defaultWatchlist = watchlists.find(w => w.isDefault) || watchlists[0]
        if (defaultWatchlist) {
          setActiveTab(defaultWatchlist.id)
        }
      } else if (!watchlists.some(w => w.id === activeTab)) {
        // Previously selected tab removed; pick a new default
        const fallback = watchlists.find(w => w.isDefault) || watchlists[0]
        if (fallback) {
          setActiveTab(fallback.id)
        }
      }
    }
  }, [watchlists, activeTab])

  // Handle search input focus to show add stock dialog
  const handleSearchFocus = useCallback(() => {
    setSearchInputFocused(true)
    setShowSearchDialog(true)
  }, [])

  const handleSearchBlur = useCallback(() => {
    if (!showSearchDialog) {
      setSearchInputFocused(false)
    }
  }, [showSearchDialog])

  const handleSearchDialogOpenChange = useCallback((open: boolean) => {
    setShowSearchDialog(open)
    setSearchInputFocused(open)
  }, [])

  const handleSearchKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      handleSearchFocus()
    }
  }, [handleSearchFocus])

  // Only block UI before first load. Keep content during refresh.
  if (watchlistsLoading && watchlists.length === 0) {
    return (
      <div className="space-y-6">
        {/* Tabs skeleton */}
        <div className="flex gap-2 overflow-x-auto">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-12 w-36 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse"
            />
          ))}
          <div className="h-12 w-10 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />
        </div>

        {/* Search skeleton */}
        <div className="h-11 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />

        {/* Instrument filter skeleton */}
        <div className="flex gap-2 overflow-x-auto">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-24 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse"
            />
          ))}
        </div>

        {/* Watchlist item rows skeleton */}
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 dark:border-gray-800 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-28 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                  <div className="h-3 w-40 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                </div>
                <div className="h-6 w-16 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (watchlists.length === 0) {
    return (
      <>
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Eye className="h-8 w-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No Watchlists
          </h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">
            Create your first watchlist to start tracking stocks
          </p>
          <Button 
            onClick={() => setShowCreateDialog(true)}
            className="bg-blue-600 hover:bg-blue-700 shadow-lg px-6"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Watchlist
          </Button>
        </div>

        <CreateWatchlistDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onCreate={handleCreateWatchlist}
        />
      </>
    )
  }

  return (
    <div className={className}>

      {/* Unified Glassmorphic Header */}
      <div className="sticky top-0 z-30 -mx-4 px-4 pb-3 pt-2 mb-4 bg-background/80 backdrop-blur-xl border-b border-border/40 supports-[backdrop-filter]:bg-background/60">
        
        {/* Watchlist tab strip — underline indicator style (Zerodha/Kite pattern) */}
        <div className="flex items-center overflow-x-auto hide-scrollbar -mx-4 px-4 mb-0 border-b border-border/30">
          {watchlists.map(w => (
            <button
              key={w.id}
              onClick={() => setActiveTab(w.id)}
              className={`relative flex-shrink-0 px-3 pb-2.5 pt-1 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ${
                activeTab === w.id
                  ? 'text-blue-500 dark:text-blue-400'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {w.name}
              {activeTab === w.id && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-blue-500 dark:bg-blue-400 rounded-full" />
              )}
            </button>
          ))}
          <div className="flex-1 min-w-2" />
          {watchlistsRefreshing && (
            <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-muted-foreground mb-1" />
          )}
          <button
            onClick={() => setShowCreateDialog(true)}
            title="New Watchlist"
            className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors mb-1"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/*
        COMMENTED OUT: Old dropdown-based watchlist selector (kept for easy rollback)
        <div className="flex items-center justify-between mb-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 outline-none group cursor-pointer">
              <h2 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
                {activeWatchlist?.name || "Watchlist"}
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </h2>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 rounded-xl border-border/50 bg-background/95 backdrop-blur-xl shadow-lg">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">My Watchlists</DropdownMenuLabel>
              {watchlists.map(w => (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => setActiveTab(w.id)}
                  className="flex items-center justify-between rounded-lg cursor-pointer py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: w.color }} />
                    <span className={activeTab === w.id ? "font-medium text-foreground" : "text-muted-foreground"}>{w.name}</span>
                  </div>
                  {w.isDefault && <Star className="h-3 w-3 text-yellow-500" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="bg-border/50" />
              <DropdownMenuItem onClick={() => setShowCreateDialog(true)} className="gap-2 cursor-pointer text-blue-600 dark:text-blue-400 py-2">
                <Plus className="h-4 w-4" />
                <span>New Watchlist</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {watchlistsRefreshing && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        */}

        {/* Integrated Search & Sort */}
        <div className="relative mt-3 mb-3">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search symbols..."
            onFocus={handleSearchFocus}
            onBlur={handleSearchBlur}
            onClick={handleSearchFocus}
            onKeyDown={handleSearchKeyDown}
            readOnly
            role="button"
            aria-label="Open stock search"
            className="w-full pl-10 pr-12 h-11 bg-muted/40 border-border/50 hover:bg-muted/60 transition-colors rounded-xl focus-visible:ring-1 focus-visible:ring-primary focus-visible:bg-background cursor-pointer"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-muted rounded-lg transition-colors group flex items-center justify-center text-muted-foreground hover:text-foreground"
                title="Sort Watchlist"
              >
                <ArrowUpDown className="h-4 w-4" />
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full opacity-70"></div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-border/50 bg-background/95 backdrop-blur-xl shadow-lg">
              {(['added', 'name', 'change', 'price'] as SortBy[]).map(sort => (
                <DropdownMenuItem 
                  key={sort} 
                  onClick={() => setSortBy(sort)}
                  className="rounded-lg cursor-pointer capitalize py-2"
                >
                  <span className={sortBy === sort ? "font-medium text-primary" : "text-muted-foreground"}>
                    {sort === 'added' ? 'Recently Added' : sort}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Apple-style Segmented Control Filters - Commented out for now to allow rollback */}
        {/*
        <div className="flex bg-muted/50 p-1 rounded-xl w-full overflow-x-auto hide-scrollbar" style={{ scrollbarWidth: 'none' }}>
          {(['all', 'equity', 'futures', 'options', 'commodities'] as InstrumentTab[]).map(tab => {
            const isActive = instrumentFilter === tab
            const label = tab === 'all' ? 'All' : 
                         tab === 'equity' ? 'Equity' :
                         tab === 'futures' ? 'Futures' :
                         tab === 'options' ? 'Options' : 'MCX'
            const count = tabCounts[tab] || 0

            return (
              <button
                key={tab}
                onClick={() => setInstrumentFilter(tab)}
                className={`relative flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-sm font-medium transition-all min-w-max ${
                  isActive 
                    ? 'text-foreground shadow-sm bg-background border border-border/40' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-transparent'
                }`}
              >
                <span>{label}</span>
                {count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-muted text-foreground' : 'bg-muted/80 text-muted-foreground'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        */}
      </div>

      {/* Watchlist Items List */}
      <div className="space-y-2 lg:rounded-2xl lg:border lg:border-border/50 lg:bg-card/60 lg:p-3 lg:shadow-sm">
        {watchlistsRefreshing && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span>Refreshing latest items...</span>
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {sortedItems.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center py-12"
            >
              <div className="w-12 h-12 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-1">
                No stocks yet
              </h3>
              <p className="text-sm text-muted-foreground">
                Tap search to add stocks
              </p>
            </motion.div>
          ) : (
                  sortedItems.map((item, itemIndex) => {
                    try {
                      if (!item || !item.id) {
                        if (process.env.NODE_ENV === 'development') {
                          console.error(`❌ [WATCHLIST-MANAGER] Invalid item at index ${itemIndex}:`, item)
                        }
                        return null
                      }

                      // First-item debug log was firing on every parent re-render
                      // (potentially many per second on a busy feed). Removed — the
                      // information is reproducible by inspecting the first
                      // sortedItems entry in React DevTools when needed.

                      // token → uirId → instrumentId fallback chain
                      const quote = resolveQuoteFromMap(quotes, {
                        token: item.token,
                        uirId: (item as any).uirId,
                        instrumentId: item.instrumentId || undefined,
                      })
                      const quoteDisplay = resolveDisplayQuoteSnapshot({
                        quote,
                        fallbackPrice: item.ltp,
                        fallbackClose: item.close,
                        liveMaxAgeMs: marketDisplayQuoteFreshness.liveMaxAgeMs,
                        displayMaxAgeMs: marketDisplayQuoteFreshness.displayMaxAgeMs,
                        staleQuotePriceMode: marketDisplayUi.staleQuotePriceMode,
                      })
                      const resolvedTokenForSubscriptionErrors =
                        parsePositiveIntegerMarketNumber(item.token) ??
                        parseTokenFromInstrumentId(item.instrumentId || "")
                      const subscriptionError =
                        resolvedTokenForSubscriptionErrors !== null
                          ? subscriptionErrorsByToken?.[resolvedTokenForSubscriptionErrors.toString()]
                          : undefined
                      const shouldMarkSubscriptionIssue = Boolean(subscriptionError && quoteDisplay.source !== "LIVE")
                      const itemForCard = shouldMarkSubscriptionIssue
                        ? ({
                            ...(item as any),
                            hasLiveSubscriptionIssue: true,
                            liveSubscriptionWarning:
                              typeof subscriptionError?.message === "string" && subscriptionError.message.trim().length > 0
                                ? subscriptionError.message
                                : "Live quote stream unavailable for this instrument.",
                          } as any)
                        : item
                      const quoteForRendering = quoteDisplay.isDisplayable ? (quote ?? undefined) : undefined
                      const livePrice = quoteDisplay.uiPrice ?? 0
                      const previousClose = quoteDisplay.prevClose ?? 0
                      
                      // Quote-missing / not-displayable warnings used to fire on every
                      // render path of every item — at 50 items × N renders/sec that
                      // floods the console (and even prod logs since there was no NODE_ENV
                      // gate). The "no live quote" case is already surfaced visually via
                      // isPriceDisplayable + the subscription-error overlay; we don't need
                      // a per-render console warning to diagnose it.
                      if (process.env.NODE_ENV === 'development' && !quote && item.token) {
                        // dev-only one-shot per missing token (Set lives across renders below)
                        if (!warnedMissingTokensRef.current.has(item.token)) {
                          warnedMissingTokensRef.current.add(item.token)
                          console.warn(`⚠️ [WATCHLIST-MANAGER] Quote not found for token ${item.token} (${item.symbol})`)
                        }
                      }
                      
                      return (
                        <motion.div
                          key={item.watchlistItemId || item.id || `item-${itemIndex}`}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                        >
                          <WatchlistItemCard
                            item={itemForCard}
                            quote={
                              quoteForRendering
                                ? {
                                    ...(quoteForRendering as any),
                                    last_trade_price: Number(
                                      (quoteForRendering as any)?.last_trade_price ??
                                        quoteDisplay.tradePrice ??
                                        livePrice,
                                    ),
                                    prev_close_price: Number(
                                      (quoteForRendering as any)?.prev_close_price ??
                                        previousClose,
                                    ),
                                  }
                                : undefined
                            }
                        onSelect={onSelectStock}
                        onEdit={(item) => {
                          // Handle edit item
                          console.log('Edit item:', item)
                        }}
                        onRemove={handleRemoveItem}
                        onToggleAlert={handleToggleAlert}
                        onQuickBuy={onQuickBuy}
                        onQuickSell={onQuickSell}
                        isRemoving={removingItems.has(item.watchlistItemId || item.id)}
                        isSnapshotPrice={
                          quoteDisplay.source === "SNAPSHOT" || quoteDisplay.source === "STALE"
                        }
                        isPriceDisplayable={quoteDisplay.isDisplayable}
                        isRefreshingPrice={
                          marketDisplayUi.quoteBadgesEnabled &&
                          quoteDisplay.source === "STALE" &&
                          !shouldMarkSubscriptionIssue
                        }
                      />
                    </motion.div>
                      )
                    } catch (itemError: any) {
                      console.error(`❌ [WATCHLIST-MANAGER] Error rendering item ${itemIndex}:`, {
                        error: itemError.message,
                        stack: itemError.stack,
                        item,
                      })
                      return null
                    }
                  }).filter(Boolean)
                )}
              </AnimatePresence>
            </div>

      {/* Dialogs */}
      <CreateWatchlistDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={handleCreateWatchlist}
      />

      <EditWatchlistDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        watchlist={editingWatchlist}
        onUpdate={handleEditWatchlist}
        onDelete={handleDeleteWatchlist}
      />

      <StockSearch
        open={showSearchDialog}
        onOpenChange={handleSearchDialogOpenChange}
        onAddStock={handleAddStock}
        onClose={() => handleSearchDialogOpenChange(false)}
        existingTokens={activeWatchlistTokens}
      />
    </div>
  )
}
