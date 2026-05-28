/**
 * @file use-prisma-watchlist.ts
 * @module hooks
 * @description Prisma-based watchlist management hooks using SWR for fast initial load and SSE for real-time updates
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-05-08 — Stop per-item / per-event console spam in prod. Drop the
 *   per-item "data extraction" log (was N logs per fetch × every SSE event), and
 *   gate per-event/refresh debug lines behind NODE_ENV. Keep fetch errors and
 *   manual-refresh-failure logs unconditional — those are rare and useful.
 * @updated 2026-05-08 — Add 15s AbortSignal.timeout to the fetcher so a hung
 *   backend fails visibly through SWR's retry path instead of leaving the
 *   in-flight promise pending forever.
 */

"use client"

import { useCallback, useEffect, useRef, useMemo } from "react"
import useSWR from 'swr'
import { toast } from "@/hooks/use-toast"
import { useSharedSSESubscribe } from './use-shared-sse'
import {
  parseFiniteMarketNumber,
  parsePositiveIntegerMarketNumber,
} from "@/lib/market-data/utils/quote-lookup"
import { BRAND_THEME } from "@/Branding"

// Types
export interface WatchlistItemData {
  id: string
  watchlistItemId: string
  instrumentId: string
  symbol: string
  name: string
  ltp: number
  close: number
  exchange?: string // Exchange name (NSE, BSE, MCX, NCO, CDS, BCD, FX, IDX, NASDAQ, NYSE, BINANCE, ...)
  segment?: string
  strikePrice?: number
  optionType?: string
  expiry?: string
  lotSize?: number
  /** Asset classification — EQ | FUT | CE | PE | IDX | ETF | SPOT | … Drives the badge / order routing. */
  instrumentType?: string
  notes?: string
  alertPrice?: number
  alertType?: string
  hasLiveSubscriptionIssue?: boolean
  liveSubscriptionWarning?: string | null
  sortOrder: number
  createdAt: string
  token?: number // Instrument token from Vayu API (prefer WatchlistItem.token, fallback to Stock.token)
  uirId?: number // Provider-agnostic UIR id from milli-search (gateway emits on every tick)
  canonicalSymbol?: string // e.g. "NSE:RELIANCE" — used for WS symbols[] subscribe
  logo_url?: string
}

export interface WatchlistData {
  id: string
  name: string
  description?: string
  color: string
  isDefault: boolean
  isPrivate: boolean
  sortOrder: number
  items: WatchlistItemData[]
  createdAt: string
  updatedAt: string
}

export interface CreateWatchlistInput {
  name: string
  description?: string
  color?: string
  isDefault?: boolean
}

export interface UpdateWatchlistInput {
  name?: string
  description?: string
  color?: string
  isDefault?: boolean
  sortOrder?: number
}

export interface AddWatchlistItemInput {
  stockId?: string
  token?: number
  symbol?: string
  name?: string
  exchange?: string
  segment?: string
  strikePrice?: number
  optionType?: 'CE' | 'PE'
  expiry?: string
  lotSize?: number
  logo_url?: string
  notes?: string
  alertPrice?: number
  alertType?: string
}

export interface UpdateWatchlistItemInput {
  notes?: string
  alertPrice?: number | null
  alertType?: string | null
  sortOrder?: number
}

// Helper function to transform API data
const toNumber = (v: any): number => {
  return parseFiniteMarketNumber(v) ?? 0
}

export const transformWatchlistData = (watchlists: any[]): WatchlistData[] => {
  if (!watchlists || !Array.isArray(watchlists)) return []

  return watchlists.map((watchlist) => {
    const items = watchlist.items?.map((item: any) => {
      // Read all fields directly from WatchlistItem (no Stock dependency)
      // Generate instrumentId from exchange and token
      const instrumentId = item.token && item.exchange 
        ? `${item.exchange}-${item.token}` 
        : item.stockId || `unknown-${item.id}`
      
      // Warn if critical fields are missing — UIR id + canonical symbol is sufficient.
      // The actual user-visible signal lives on the returned item (hasLiveSubscriptionIssue
      // / liveSubscriptionWarning) which the WatchlistItemCard renders; we don't need a
      // console line per missing-mapping per render to know about it. Gate to dev.
      const hasLiveSubscriptionIssue = (!item.token && !item.uirId) || (!item.exchange && !item.canonicalSymbol)
      const liveSubscriptionWarning = hasLiveSubscriptionIssue
        ? "Live quote stream unavailable until token/exchange mapping is resolved."
        : null
      if (hasLiveSubscriptionIssue && process.env.NODE_ENV === 'development') {
        console.warn('⚠️ [TRANSFORM] WatchlistItem missing token or exchange:', {
          itemId: item.id,
          symbol: item.symbol,
        })
      }

      // Per-item data-extraction debug log used to fire on every render of every
      // watchlist item — at 50 items per render and frequent SWR revalidations,
      // that's a flood of identical lines in prod. Drop entirely; the same info
      // is visible on the returned object and in React DevTools when debugging.


      return {
        id: item.stockId || item.id, // Use stockId if exists (backward compat), else item.id
        watchlistItemId: item.id,
        instrumentId,
        symbol: item.symbol || 'UNKNOWN', // Fallback for null/undefined
        name: item.name || 'Unknown', // Fallback for null/undefined
        exchange: item.exchange || 'NSE', // Fallback for null/undefined
        ltp: toNumber(item.ltp),
        close: toNumber(item.close),
        segment: item.segment || 'NSE', // Fallback for null/undefined
        strikePrice: item.strikePrice ? toNumber(item.strikePrice) : undefined,
        optionType: item.optionType,
        expiry: item.expiry,
        lotSize: item.lotSize,
        instrumentType: typeof item.instrumentType === 'string' && item.instrumentType.trim().length > 0
          ? item.instrumentType.trim().toUpperCase()
          : undefined,
        notes: item.notes,
        alertPrice: item.alertPrice ? toNumber(item.alertPrice) : undefined,
        alertType: item.alertType,
        hasLiveSubscriptionIssue,
        liveSubscriptionWarning,
        sortOrder: item.sortOrder || 0,
        createdAt: item.createdAt,
        token: parsePositiveIntegerMarketNumber(item.token) ?? undefined,
        uirId: parsePositiveIntegerMarketNumber(item.uirId) ?? undefined,
        canonicalSymbol: typeof item.canonicalSymbol === 'string' ? item.canonicalSymbol : undefined,
        logo_url: typeof item.logo_url === 'string' ? item.logo_url : undefined,
      }
    }) || []

    return {
      id: watchlist.id,
      name: watchlist.name,
      description: watchlist.description,
      color: watchlist.color || BRAND_THEME.watchlist.defaultColor,
      isDefault: watchlist.isDefault || false,
      isPrivate: watchlist.isPrivate || false,
      sortOrder: watchlist.sortOrder || 0,
      items,
      createdAt: watchlist.createdAt,
      updatedAt: watchlist.updatedAt,
    }
  })
}

// Response type for watchlist API
interface WatchlistsResponse {
  watchlists: any[]
}

// Enhanced fetcher with better error handling (matches orders/positions pattern)
// 15-second hard timeout. Without it, a hung backend leaves SWR's in-flight
// promise pending forever — the user sees stale watchlist data with no error
// feedback, and SWR's retry/refresh logic never fires. Aligns with the same
// pattern in use-realtime-orders / positions / account.
const FETCHER_TIMEOUT_MS = 15_000

const fetcher = async (url: string): Promise<WatchlistsResponse> => {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(FETCHER_TIMEOUT_MS),
    })
    
    if (!res.ok) {
      // Handle specific HTTP errors
      if (res.status === 401) {
        throw new Error('Unauthorized: Please login again')
      } else if (res.status === 403) {
        throw new Error('Forbidden: Access denied')
      } else if (res.status === 404) {
        throw new Error('Watchlists endpoint not found')
      } else if (res.status >= 500) {
        throw new Error('Server error: Please try again later')
      }
      throw new Error(`Failed to fetch watchlists: ${res.status} ${res.statusText}`)
    }
    
    const data = await res.json()
    
    // Validate response structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format')
    }
    
    // Ensure watchlists array exists. If the API returns malformed data, the
    // warn used to fire on every fetch (focus revalidate / SSE event / manual
    // refresh). The empty-list fallback is the user-visible signal; gate the
    // log to dev so prod doesn't spam.
    if (!Array.isArray(data.watchlists)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ [REALTIME-WATCHLISTS] Invalid watchlists array, defaulting to empty')
      }
      return { watchlists: [] }
    }
    
    return data
  } catch (error) {
    // Enhanced error logging
    if (error instanceof Error) {
      console.error('❌ [REALTIME-WATCHLISTS] Fetch error:', {
        message: error.message,
        url,
        timestamp: new Date().toISOString()
      })
    }
    throw error
  }
}

// Main Hook for All Watchlists
export function useEnhancedWatchlists(userId?: string) {
  const retryCountRef = useRef(0)
  const maxRetries = 3
  
  // Initial data fetch using SWR (fast, cached, deduplicated)
  const { data, error, isLoading, mutate } = useSWR<WatchlistsResponse>(
    userId ? '/api/watchlists' : null,
    fetcher,
    {
      refreshInterval: 0, // No polling - SSE will trigger updates
      revalidateOnFocus: true,
      // Recovery against missed SSE events when the user returns to the tab. Throttled so
      // 14 hooks don't all fire on the same visibilitychange — one fetch per 30s window.
      focusThrottleInterval: 30_000,
      revalidateOnReconnect: true,
      dedupingInterval: 1000,
      shouldRetryOnError: true,
      errorRetryCount: maxRetries,
      errorRetryInterval: 5000,
      onError: (err) => {
        retryCountRef.current += 1
        // Keep in prod: rare and operationally useful when the watchlist endpoint flaps.
        console.error(`❌ [REALTIME-WATCHLISTS] Error (attempt ${retryCountRef.current}/${maxRetries}):`, err.message)
      },
      onSuccess: () => {
        if (retryCountRef.current > 0) {
          if (process.env.NODE_ENV === 'development') {
            console.debug('✅ [REALTIME-WATCHLISTS] Recovered from error')
          }
          retryCountRef.current = 0
        }
      }
    }
  )

  // Transform data
  const watchlists = useMemo(() => {
    if (!data?.watchlists) return []
    return transformWatchlistData(data.watchlists)
  }, [data])

  // Shared SSE connection for real-time watchlist updates
  useSharedSSESubscribe(userId || undefined, useCallback((message) => {
    // Handle watchlist-related events
    if (message.event === 'watchlist_updated' ||
        message.event === 'watchlist_item_added' ||
        message.event === 'watchlist_item_removed') {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`📨 [REALTIME-WATCHLISTS] Received ${message.event} event, refreshing watchlists`)
      }
      mutate().catch(err => {
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ [REALTIME-WATCHLISTS] Refresh after event failed:', err)
        }
      })
    }
  }, [mutate]))

  // Refresh function
  const refetch = useCallback(async () => {
    if (process.env.NODE_ENV === 'development') {
      console.debug("🔄 [REALTIME-WATCHLISTS] Manual refresh triggered")
    }
    try {
      return await mutate()
    } catch (error) {
      // Keep in prod — manual refresh failures are rare and useful to investigate.
      console.error("❌ [REALTIME-WATCHLISTS] Manual refresh failed:", error)
      throw error
    }
  }, [mutate])

  const createWatchlist = useCallback(async (input: CreateWatchlistInput) => {
    if (!userId) throw new Error("User ID required")

    try {
      const response = await fetch('/api/watchlists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create watchlist')
      }

      const data = await response.json()
      
      // Refresh using SWR mutate (SSE will also trigger update)
      await mutate()
      
      toast({ 
        title: "Watchlist Created", 
        description: `"${input.name}" has been created successfully.` 
      })
      
      return data.watchlist
    } catch (error) {
      console.error("Error creating watchlist:", error)
      toast({
        title: "Failed to Create Watchlist",
        description: error instanceof Error ? error.message : "Could not create watchlist.",
        variant: "destructive",
      })
      throw error
    }
  }, [userId, mutate])

  const updateWatchlist = useCallback(async (id: string, input: UpdateWatchlistInput) => {
    try {
      const response = await fetch(`/api/watchlists/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update watchlist')
      }
      
      // Refresh using SWR mutate (SSE will also trigger update)
      await mutate()
      
      toast({ title: "Watchlist Updated", description: "Watchlist has been updated successfully." })
    } catch (error) {
      console.error("Error updating watchlist:", error)
      toast({
        title: "Failed to Update Watchlist",
        description: error instanceof Error ? error.message : "Could not update watchlist.",
        variant: "destructive",
      })
      throw error
    }
  }, [mutate])

  const deleteWatchlist = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/watchlists/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete watchlist')
      }
      
      // Refresh using SWR mutate (SSE will also trigger update)
      await mutate()
      
      toast({ title: "Watchlist Deleted", description: "Watchlist has been deleted successfully." })
    } catch (error) {
      console.error("Error deleting watchlist:", error)
      toast({
        title: "Failed to Delete Watchlist",
        description: error instanceof Error ? error.message : "Could not delete watchlist.",
        variant: "destructive",
      })
      throw error
    }
  }, [mutate])

  return {
    watchlists,
    isLoading,
    isRefreshing: false, // SWR handles this internally
    isError: !!error,
    error: error || null,
    refetch,
    mutate, // Expose mutate for optimistic updates
    createWatchlist,
    updateWatchlist,
    deleteWatchlist,
  }
}

// Hook for Single Watchlist Operations
export function useWatchlistItems(watchlistId?: string) {
  const { refetch: refetchWatchlists, mutate: mutateWatchlists } = useEnhancedWatchlists()

  const addItem = useCallback(async (input: AddWatchlistItemInput) => {
    if (!watchlistId) throw new Error("Watchlist ID required")

    // Generate temporary ID for optimistic update
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Trading-6mp: pre-fix the optimistic item flagged a subscription
    // issue whenever EITHER token OR exchange was missing. Some search-
    // result shapes carry a token but lack an explicit exchange field —
    // the segment field is enough for the WS provider to subscribe.
    // Mirror the smarter transform-side check (see line ~130 above) so the
    // optimistic state matches what the API will return after revalidation
    // and we don't render a transient "subscription issue" warning that
    // disappears 1-2s later when the real item lands.
    const optimisticExchangeOk = Boolean(input.exchange || input.segment)
    const optimisticTokenOk = Boolean(input.token) // input shape doesn't carry uirId
    const optimisticIssue = !optimisticTokenOk || !optimisticExchangeOk

    // Create optimistic item
    const optimisticItem: WatchlistItemData = {
      id: tempId,
      watchlistItemId: tempId,
      instrumentId: input.token && input.exchange
        ? `${input.exchange}-${input.token}`
        : input.stockId || tempId,
      symbol: input.symbol || 'Loading...',
      name: input.name || 'Loading...',
      ltp: 0,
      close: 0,
      exchange: input.exchange || 'NSE',
      segment: input.segment || input.exchange || 'NSE',
      strikePrice: input.strikePrice,
      optionType: input.optionType,
      expiry: input.expiry,
      lotSize: input.lotSize,
      notes: input.notes,
      alertPrice: input.alertPrice,
      alertType: input.alertType,
      hasLiveSubscriptionIssue: optimisticIssue,
      liveSubscriptionWarning: optimisticIssue
        ? "Live quote stream unavailable until token/exchange mapping is resolved."
        : null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      token: input.token,
      logo_url: input.logo_url,
    }

    // Optimistic update: immediately add to UI
    mutateWatchlists(
      (currentData: WatchlistsResponse | undefined) => {
        if (!currentData) return currentData
        
        const watchlists = currentData.watchlists.map((wl: any) => {
          if (wl.id === watchlistId) {
            return {
              ...wl,
              items: [...(wl.items || []), optimisticItem]
            }
          }
          return wl
        })
        
        return { watchlists }
      },
      false // Don't revalidate immediately
    )

    // Show instant feedback
    toast({ 
      title: "Stock Added", 
      description: `${input.symbol || 'Stock'} added to watchlist.`,
      duration: 2000
    })

    try {
      const response = await fetch(`/api/watchlists/${watchlistId}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const backendErrorMessage =
          typeof errorData?.error === "string" ? errorData.error : "Failed to add item"
        const isDuplicateError =
          response.status === 409 || /already exists/i.test(backendErrorMessage)

        // Revert optimistic update on all non-201 paths
        await mutateWatchlists()

        if (isDuplicateError) {
          toast({
            title: "Already in Watchlist",
            description: `${input.symbol || "Instrument"} already exists in this watchlist.`,
          })
          return
        }

        throw new Error(backendErrorMessage)
      }

      // Revalidate to get real data (this will replace optimistic item with real one)
      await mutateWatchlists()
    } catch (error) {
      console.error("Error adding item:", error)
      // Revert optimistic update on error
      await mutateWatchlists()
      toast({
        title: "Failed to Add Stock",
        description: error instanceof Error ? error.message : "Could not add stock to watchlist.",
        variant: "destructive",
      })
      throw error
    }
  }, [watchlistId, mutateWatchlists])

  const updateItem = useCallback(async (itemId: string, input: UpdateWatchlistItemInput) => {
    try {
      const response = await fetch(`/api/watchlists/items/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update item')
      }

      toast({ title: "Item Updated", description: "Watchlist item has been updated successfully." })
    } catch (error) {
      console.error("Error updating item:", error)
      toast({
        title: "Failed to Update Item",
        description: error instanceof Error ? error.message : "Could not update watchlist item.",
        variant: "destructive",
      })
      throw error
    }
  }, [])

  const removeItem = useCallback(async (itemId: string) => {
    try {
      const response = await fetch(`/api/watchlists/items/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to remove item')
      }

      // Trading-6vp: revalidate watchlists immediately after DELETE so callers
      // that don't manually refetch (e.g. terminal-watchlist) don't end up
      // showing the removed item until the next 30s focus revalidate or an
      // SSE delete event lands. SWR dedupes nearby revalidations, so callers
      // that DO explicitly call refetchWatchlists (e.g. mobile WatchlistManager)
      // are unharmed.
      try {
        await mutateWatchlists()
      } catch {
        // Revalidation failure is non-fatal — the optimistic delete and toast
        // already happened. Worst case the row reappears until next focus.
      }

      toast({ title: "Stock Removed", description: "Successfully removed from watchlist." })
    } catch (error) {
      console.error("Error removing item:", error)
      toast({
        title: "Failed to Remove Stock",
        description: error instanceof Error ? error.message : "Could not remove stock from watchlist.",
        variant: "destructive",
      })
      throw error
    }
  }, [mutateWatchlists])

  return {
    addItem,
    updateItem,
    removeItem,
  }
}

// Hook for Watchlist Item Management
export function useWatchlistItem(itemId?: string) {
  const updateItem = useCallback(async (input: UpdateWatchlistItemInput) => {
    if (!itemId) throw new Error("Item ID required")

    try {
      const response = await fetch(`/api/watchlists/items/${itemId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update item')
      }

      toast({ title: "Item Updated", description: "Watchlist item has been updated successfully." })
    } catch (error) {
      console.error("Error updating item:", error)
      toast({
        title: "Failed to Update Item",
        description: error instanceof Error ? error.message : "Could not update watchlist item.",
        variant: "destructive",
      })
      throw error
    }
  }, [itemId])

  const removeItem = useCallback(async () => {
    if (!itemId) throw new Error("Item ID required")

    try {
      const response = await fetch(`/api/watchlists/items/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to remove item')
      }

      toast({ title: "Stock Removed", description: "Successfully removed from watchlist." })
    } catch (error) {
      console.error("Error removing item:", error)
      toast({
        title: "Failed to Remove Stock",
        description: error instanceof Error ? error.message : "Could not remove stock from watchlist.",
        variant: "destructive",
      })
      throw error
    }
  }, [itemId])

  return {
    updateItem,
    removeItem,
  }
}

// Utility function for quick stock addition
export async function addStockToWatchlist(
  stockIdOrToken: string, // Can be stockId or "token:123:SYMBOL:EXCHANGE"
  watchlistId?: string | null,
  options?: {
    notes?: string
    alertPrice?: number
    alertType?: string
  }
) {
  try {
    let finalWatchlistId = watchlistId

    if (!finalWatchlistId) {
      // Get all watchlists to find default
      const response = await fetch('/api/watchlists')
      if (!response.ok) {
        throw new Error('Failed to fetch watchlists')
      }

      const data = await response.json()
      const watchlists = transformWatchlistData(data.watchlists)
      const defaultWatchlist = watchlists.find(w => w.isDefault)

      if (defaultWatchlist) {
        finalWatchlistId = defaultWatchlist.id
      } else if (watchlists.length > 0) {
        finalWatchlistId = watchlists[0].id
      } else {
        // Create default watchlist
        const createResponse = await fetch('/api/watchlists', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: "My Watchlist",
            isDefault: true
          }),
        })

        if (!createResponse.ok) {
          throw new Error('Failed to create default watchlist')
        }

        const createData = await createResponse.json()
        finalWatchlistId = createData.watchlist.id
      }
    }

    if (!finalWatchlistId) {
      throw new Error("Could not find or create a watchlist.")
    }

    // Parse stockIdOrToken to handle token format
    let requestBody: any = {
      notes: options?.notes,
      alertPrice: options?.alertPrice,
      alertType: options?.alertType || "ABOVE",
    }

    // Check if it's a token-based instrument
    // Format: token:{token}:{symbol}:{exchange}:{segment}:{name}
    if (stockIdOrToken.startsWith('token:')) {
      const [, token, symbol, exchange, segment, encodedName] = stockIdOrToken.split(':')
      const name = decodeURIComponent(encodedName || '')
      
      console.log('🔍 [ADD-STOCK] Token-based instrument detected', { 
        token, symbol, exchange, segment, name 
      })
      
      requestBody = {
        ...requestBody,
        token: parsePositiveIntegerMarketNumber(token),
        symbol,
        name,
        exchange,
        segment,
      }
      if (requestBody.token === null || requestBody.token === undefined) {
        throw new Error("Invalid token payload for watchlist item")
      }
    } else {
      // Regular stockId (UUID)
      requestBody.stockId = stockIdOrToken
    }

    // Add item to watchlist
    const response = await fetch(`/api/watchlists/${finalWatchlistId}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to add stock to watchlist')
    }

    return response.json()
  } catch (error) {
    console.error("Error adding stock to watchlist:", error)
    throw error
  }
}