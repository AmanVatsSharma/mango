/**
 * File:        lib/hooks/use-realtime-positions.ts
 * Module:      Trading · Realtime Hooks
 * Purpose:     SSE-driven positions feed (open + closed) — patches cache from SSE; refetch only on (re)connect or rare lifecycle events.
 *
 * Exports:
 *   - useRealtimePositions(userId, options?, activeAccountId?) → { positions, isLoading, error, pnlMeta, refresh, optimisticAddPosition, optimisticClosePosition, mutate, retryCount } — net or lots view stream
 *
 * Depends on:
 *   - swr — initial fetch + cache; refreshInterval is 0 (SSE-only steady state)
 *   - ./use-shared-sse — single shared EventSource per user across hooks
 *   - @/lib/hooks/realtime-position-number-utils — payload coercion
 *
 * Side-effects:
 *   - HTTP GET /api/trading/positions/{net|list} on mount, on tab focus, and on network reconnect
 *
 * Key invariants:
 *   - Lots view: positions_pnl_updated → in-place cache patch, NO refetch
 *   - Net view: positions_pnl_updated → in-place cache patch using `lotIds` to map per-lot updates to the parent net row.
 *     * unrealizedPnL = (currentPrice - net.averagePrice) × net.quantity (signed)
 *     * dayPnL        = (currentPrice - prevClose)        × net.quantity (signed) — requires `prevClose` in the event
 *     * If `prevClose` is absent (older worker / missing quote field), dayPnL stays at last server snapshot
 *   - position_opened/closed/updated: lots view patches in place; net view refetches (450ms debounce, rare events)
 *   - On SSE (re)connect, TradingRealtimeProvider issues a coalesced refresh — no duplicate refetch here
 *
 * Read order:
 *   1. useRealtimePositions — SWR init + SSE wiring
 *   2. SSE handler — distinguishes PnL vs lifecycle events, lots vs net view
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-07
 */

"use client"

import useSWR from 'swr'
import { useCallback, useEffect, useRef } from 'react'
import { useSharedSSESubscribe } from './use-shared-sse'
import {
  parseFiniteRealtimePositionNumber,
  resolveRealtimePositionClosedState,
} from "@/lib/hooks/realtime-position-number-utils"

const REALTIME_POSITION_EVENT_DEDUP_WINDOW_MS = 1200

// Types
interface Position {
  id: string
  symbol: string
  productType?: string | null
  isIntraday?: boolean | null
  stockId?: string | null
  quantity: number
  averagePrice: number
  instrumentId?: string | null
  exchange?: string | null
  segment?: string | null
  strikePrice?: number | null
  optionType?: string | null
  expiry?: string | null
  token?: number | null
  identity?: {
    stockId: string | null
    instrumentId: string | null
    segment: string | null
    exchange: string | null
    strikePrice: number | null
    optionType: string | null
    expiry: string | null
    token: number | null
  } | null
  unrealizedPnL: number
  dayPnL: number
  pnlUpdatedAtMs?: number | null
  realizedPnL?: number
  bookedPnL?: number
  status?: "OPEN" | "CLOSED"
  isClosed?: boolean
  stopLoss?: number | null
  target?: number | null
  createdAt: string
  stock?: any
  lotSize?: number | null
  currentPrice?: number
  currentValue?: number
  investedValue?: number
}

interface PositionsResponse {
  success: boolean
  positions: Position[]
  meta?: {
    pnlMode?: "client" | "server"
    workerHealthy?: boolean
    pnlMaxAgeMs?: number
    positionsTabMtmDisplayMode?: "live_hybrid" | "live_quote_preferred" | "server_snapshot_preferred"
    positionSquareOffPriceAuthority?: "server" | "client_assisted"
  }
  error?: string
}

interface UseRealtimePositionsReturn {
  positions: Position[]
  isLoading: boolean
  error: Error | null
  pnlMeta: {
    pnlMode: "client" | "server"
    workerHealthy: boolean
    pnlMaxAgeMs: number | null
    positionsTabMtmDisplayMode: "live_hybrid" | "live_quote_preferred" | "server_snapshot_preferred"
    positionSquareOffPriceAuthority: "server" | "client_assisted"
  }
  refresh: () => Promise<any>
  optimisticAddPosition: (newPosition: Partial<Position>) => void
  optimisticClosePosition: (positionId: string, exitPrice?: number, closeQuantityAbs?: number) => void
  mutate: any
  retryCount: number
}

// 15-second hard timeout. Without it, a hung backend leaves SWR's
// in-flight promise pending forever — the user sees stale data with no
// error feedback, and SWR's retry/refresh logic never fires for the dead
// request. See same constant in use-realtime-orders / use-realtime-account.
const FETCHER_TIMEOUT_MS = 15_000

// Enhanced fetcher with better error handling
const fetcher = async (url: string): Promise<PositionsResponse> => {
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(FETCHER_TIMEOUT_MS),
    })
    
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Unauthorized: Please login again')
      } else if (res.status === 403) {
        throw new Error('Forbidden: Access denied')
      } else if (res.status === 404) {
        throw new Error('Positions endpoint not found')
      } else if (res.status >= 500) {
        throw new Error('Server error: Please try again later')
      }
      throw new Error(`Failed to fetch positions: ${res.status} ${res.statusText}`)
    }
    
    const data = await res.json()
    
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format')
    }
    
    if (data.success === false && data.error) {
      throw new Error(data.error)
    }
    
    return data
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ [REALTIME-POSITIONS] Fetch error:', {
        message: error.message,
        url,
        timestamp: new Date().toISOString()
      })
    }
    throw error
  }
}

// Validation helpers
function validatePosition(position: any): position is Partial<Position> {
  if (!position || typeof position !== 'object') {
    console.warn('⚠️ [REALTIME-POSITIONS] Invalid position object:', position)
    return false
  }
  
  if (position.id && typeof position.id !== 'string') {
    console.warn('⚠️ [REALTIME-POSITIONS] Invalid position ID:', position.id)
    return false
  }
  
  if (position.symbol && typeof position.symbol !== 'string') {
    console.warn('⚠️ [REALTIME-POSITIONS] Invalid symbol:', position.symbol)
    return false
  }
  
  if (position.quantity !== undefined) {
    if (typeof position.quantity !== 'number' || isNaN(position.quantity)) {
      console.warn('⚠️ [REALTIME-POSITIONS] Invalid quantity:', position.quantity)
      return false
    }

    if (position.status && position.status !== "OPEN" && position.status !== "CLOSED") {
      console.warn("⚠️ [REALTIME-POSITIONS] Invalid status:", position.status)
      return false
    }
  }
  
  if (position.averagePrice !== undefined) {
    if (typeof position.averagePrice !== 'number' || isNaN(position.averagePrice) || position.averagePrice <= 0) {
      console.warn('⚠️ [REALTIME-POSITIONS] Invalid average price:', position.averagePrice)
      return false
    }
  }
  
  return true
}

function validatePositionId(positionId: any): positionId is string {
  if (typeof positionId !== 'string' || positionId.trim().length === 0) {
    console.warn('⚠️ [REALTIME-POSITIONS] Invalid position ID:', positionId)
    return false
  }
  return true
}

export function useRealtimePositions(
  userId: string | undefined | null,
  options?: { view?: "lots" | "net" },
  activeAccountId?: string | null,
): UseRealtimePositionsReturn {
  const retryCountRef = useRef(0)
  const maxRetries = 3
  const lastSyncRef = useRef<number>(Date.now())
  const revalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentRealtimeEventsRef = useRef<Map<string, number>>(new Map())
  const recentPnlUpdateAtByPositionRef = useRef<Map<string, number>>(new Map())
  const DEBUG = process.env.NEXT_PUBLIC_DEBUG_REALTIME === 'true' || process.env.NODE_ENV === 'development'
  const view: "lots" | "net" = options?.view === "net" ? "net" : "lots"

  // Build fetch URL: prefer activeAccountId (for LIVE/DEMO switching) over userId
  const fetchUrl = (() => {
    if (!userId) return null
    const base = view === "net"
      ? `/api/trading/positions/net?userId=${userId}`
      : `/api/trading/positions/list?userId=${userId}`
    if (activeAccountId) {
      return `${base}&accountId=${activeAccountId}`
    }
    return base
  })()

  // Initial data fetch - polling handled by adaptive useEffect below
  const { data, error, isLoading, mutate } = useSWR<PositionsResponse>(
    fetchUrl,
    fetcher,
    {
      refreshInterval: 0, // Disabled - we use adaptive manual polling instead
      revalidateOnFocus: true,
      focusThrottleInterval: 30_000,
      revalidateOnReconnect: true,
      dedupingInterval: 1000,
      shouldRetryOnError: true,
      errorRetryCount: maxRetries,
      errorRetryInterval: 5000,
      onError: (err) => {
        retryCountRef.current += 1
        console.error(`❌ [REALTIME-POSITIONS] Error (attempt ${retryCountRef.current}/${maxRetries}):`, err.message)
      },
      onSuccess: () => {
        if (retryCountRef.current > 0) {
          if (DEBUG) console.info('✅ [REALTIME-POSITIONS] Recovered from error')
          retryCountRef.current = 0
        }
        lastSyncRef.current = Date.now()
      }
    }
  )

  const scheduleRevalidate = useCallback(() => {
    if (revalidateTimerRef.current) return
    revalidateTimerRef.current = setTimeout(() => {
      revalidateTimerRef.current = null
      mutate().catch((err) => {
        console.error('❌ [REALTIME-POSITIONS] Debounced revalidation failed:', err)
      })
    }, 450)
  }, [mutate])

  // schedulePnlRevalidate removed — net view now patches PnL fully from SSE events using
  // prevClose carried in the per-lot update payload (recomputes net.dayPnL / unrealizedPnL
  // deterministically). dayPnL stays at the last server snapshot only when prevClose is
  // absent in the event (older worker / missing quote field) — recovered on focus / reconnect.

  // Shared SSE connection for real-time updates
  useSharedSSESubscribe(userId, useCallback((message) => {
    // Handle position-related events
    if (message.event === 'positions_pnl_updated') {
      if (view === "net") {
        if (DEBUG) console.debug(`📨 [REALTIME-POSITIONS] SSE ${message.event} → patch (net view, no refetch)`)

        try {
          mutate((currentData: PositionsResponse | undefined) => {
            const rawUpdates = (message.data as any)?.updates
            if (!Array.isArray(rawUpdates) || rawUpdates.length === 0) return currentData
            if (!currentData || !Array.isArray(currentData.positions)) return currentData

            // Map per-lot updates so we can match to net rows via their lotIds[].
            const updateByLotId = new Map<string, any>()
            rawUpdates.forEach((u: any) => {
              if (typeof u?.positionId === 'string') updateByLotId.set(u.positionId, u)
            })
            if (updateByLotId.size === 0) return currentData

            let anyChanged = false
            const nextPositions = currentData.positions.map((p: any) => {
              const lotIds = Array.isArray(p?.lotIds) ? p.lotIds : []
              if (lotIds.length === 0) return p

              // Pick the freshest matching update across this net row's lots.
              let matched: any = null
              let maxUpdatedAt = 0
              for (const lid of lotIds) {
                const u = updateByLotId.get(lid)
                if (!u) continue
                const ts = parseFiniteRealtimePositionNumber(u.updatedAtMs) ?? 0
                if (ts > maxUpdatedAt) {
                  matched = u
                  maxUpdatedAt = ts
                }
              }
              if (!matched) return p

              // Dedup by net id + updatedAt.
              const netId = typeof p?.id === 'string' ? p.id : null
              if (netId) {
                const lastSeenAt = recentPnlUpdateAtByPositionRef.current.get(netId) ?? 0
                if (maxUpdatedAt <= lastSeenAt) return p
                recentPnlUpdateAtByPositionRef.current.set(netId, maxUpdatedAt)
              }

              const quantity = parseFiniteRealtimePositionNumber(p.quantity) ?? 0
              const avg = parseFiniteRealtimePositionNumber(p.averagePrice) ?? 0
              const currentPriceCandidate = parseFiniteRealtimePositionNumber(matched.currentPrice)
              const currentPrice = currentPriceCandidate ?? p.currentPrice
              const prevClose = parseFiniteRealtimePositionNumber(matched.prevClose)

              const hasFiniteCp = typeof currentPrice === 'number' && Number.isFinite(currentPrice)

              // Net unrealized PnL is deterministic from currentPrice + averagePrice + signed quantity.
              const unrealizedPnL = hasFiniteCp ? (currentPrice - avg) * quantity : p.unrealizedPnL

              // Net dayPnL = (currentPrice - prevClose) × quantity — matches the worker formula.
              // If prevClose is absent (older worker / missing quote field), keep the prior server value.
              const dayPnL =
                hasFiniteCp && typeof prevClose === 'number' && Number.isFinite(prevClose)
                  ? (currentPrice - prevClose) * quantity
                  : p.dayPnL

              const currentValue = hasFiniteCp ? currentPrice * quantity : p.currentValue
              const investedValue = avg * quantity

              anyChanged = true
              return {
                ...p,
                unrealizedPnL,
                dayPnL,
                currentPrice,
                pnlUpdatedAtMs: maxUpdatedAt,
                currentValue,
                investedValue,
              }
            })

            if (!anyChanged) return currentData
            return { ...currentData, positions: nextPositions }
          }, false)
        } catch (e) {
          console.error('❌ [REALTIME-POSITIONS] Net-view PnL patch failed:', e)
        }

        lastSyncRef.current = Date.now()
        return
      }
      if (DEBUG) console.debug(`📨 [REALTIME-POSITIONS] SSE ${message.event} → patch (no refetch)`)

      try {
        mutate((currentData: PositionsResponse | undefined) => {
          const rawUpdates = (message.data as any)?.updates
          if (!Array.isArray(rawUpdates) || rawUpdates.length === 0) return currentData
          const updates = rawUpdates.filter((u: any) => {
            if (typeof u?.positionId !== "string") return false
            const updateAtMs = Number(parseFiniteRealtimePositionNumber(u?.updatedAtMs) ?? 0)
            if (!Number.isFinite(updateAtMs) || updateAtMs <= 0) return false
            const lastSeenAt = recentPnlUpdateAtByPositionRef.current.get(u.positionId) ?? 0
            if (updateAtMs <= lastSeenAt) return false
            recentPnlUpdateAtByPositionRef.current.set(u.positionId, updateAtMs)
            if (recentPnlUpdateAtByPositionRef.current.size > 500) {
              const expiry = Date.now() - 10 * 60 * 1000
              recentPnlUpdateAtByPositionRef.current.forEach((seenAt, key) => {
                if (seenAt < expiry) recentPnlUpdateAtByPositionRef.current.delete(key)
              })
            }
            return true
          })
          if (!currentData || !Array.isArray(currentData.positions) || !Array.isArray(updates) || updates.length === 0) {
            return currentData
          }

          const map = new Map<string, any>()
          updates.forEach((u: any) => {
            if (typeof u?.positionId === "string") map.set(u.positionId, u)
          })
          if (map.size === 0) return currentData

          const nextPositions = currentData.positions.map((p: any) => {
            const u = map.get(p?.id)
            if (!u) return p

            const quantity = parseFiniteRealtimePositionNumber(p.quantity) ?? 0
            const avg = parseFiniteRealtimePositionNumber(p.averagePrice) ?? 0
            const currentPriceCandidate = parseFiniteRealtimePositionNumber(u.currentPrice)
            const currentPrice = currentPriceCandidate ?? p.currentPrice

            const currentValue =
              typeof currentPrice === "number" && Number.isFinite(currentPrice)
                ? currentPrice * quantity
                : p.currentValue
            const investedValue = avg * quantity

            return {
              ...p,
              unrealizedPnL: parseFiniteRealtimePositionNumber(u.unrealizedPnL) ?? p.unrealizedPnL,
              dayPnL: parseFiniteRealtimePositionNumber(u.dayPnL) ?? p.dayPnL,
              currentPrice,
              pnlUpdatedAtMs: parseFiniteRealtimePositionNumber(u.updatedAtMs) ?? p.pnlUpdatedAtMs,
              currentValue,
              investedValue,
            }
          })

          return { ...currentData, positions: nextPositions }
        }, false)
      } catch (e) {
        console.error('❌ [REALTIME-POSITIONS] PnL patch failed:', e)
      }

      lastSyncRef.current = Date.now()
      return
    }

    if (message.event === 'position_opened' || 
        message.event === 'position_closed' || 
        message.event === 'position_updated') {
      if (view === "net") {
        if (DEBUG) console.debug(`📨 [REALTIME-POSITIONS] SSE ${message.event} → revalidate (net view)`)
        scheduleRevalidate()
        lastSyncRef.current = Date.now()
        return
      }
      if (DEBUG) console.debug(`📨 [REALTIME-POSITIONS] SSE ${message.event} → patch+revalidate`)

      try {
        mutate((currentData: PositionsResponse | undefined) => {
          if (!currentData || !Array.isArray(currentData.positions)) return currentData

          const d: any = message.data || {}
          const id = d.positionId as string | undefined
          if (!id) return currentData
          const now = Date.now()
          const dedupKey = `${message.event}:${id}`
          const lastSeenAt = recentRealtimeEventsRef.current.get(dedupKey) ?? 0
          if (now - lastSeenAt < REALTIME_POSITION_EVENT_DEDUP_WINDOW_MS) {
            return currentData
          }
          recentRealtimeEventsRef.current.set(dedupKey, now)
          if (recentRealtimeEventsRef.current.size > 500) {
            const expiry = now - REALTIME_POSITION_EVENT_DEDUP_WINDOW_MS * 2
            recentRealtimeEventsRef.current.forEach((seenAt, key) => {
              if (seenAt < expiry) recentRealtimeEventsRef.current.delete(key)
            })
          }

          const idx = currentData.positions.findIndex((p: any) => p?.id === id)
          const parsedQuantity = parseFiniteRealtimePositionNumber(d.quantity)
          const parsedAveragePrice = parseFiniteRealtimePositionNumber(d.averagePrice)
          const parsedRealizedPnl = parseFiniteRealtimePositionNumber(d.realizedPnL)
          const isClosed = resolveRealtimePositionClosedState(message.event, d.quantity)

          if (idx === -1) {
            // Add new position stub
            const stub: Position = {
              id,
              symbol: String(d.symbol || 'UNKNOWN'),
              productType: typeof d.productType === "string" ? d.productType : "MIS",
              isIntraday: typeof d.isIntraday === "boolean" ? d.isIntraday : true,
              stockId: typeof d.stockId === "string" ? d.stockId : null,
              quantity: parsedQuantity ?? 0,
              averagePrice: parsedAveragePrice ?? 0,
              unrealizedPnL: parsedRealizedPnl ?? 0,
              dayPnL: parsedRealizedPnl ?? 0,
              realizedPnL: isClosed ? (parsedRealizedPnl ?? 0) : undefined,
              bookedPnL: isClosed ? (parsedRealizedPnl ?? 0) : undefined,
              status: isClosed ? "CLOSED" : "OPEN",
              isClosed,
              stopLoss: null,
              target: null,
              createdAt: message.timestamp || new Date().toISOString(),
              stock: undefined,
            }
            return { ...currentData, positions: [stub, ...currentData.positions] }
          }

          const updated = [...currentData.positions]
          const prev = updated[idx] as any
          updated[idx] = {
            ...prev,
            productType: typeof d.productType === "string" ? d.productType : prev.productType,
            isIntraday: typeof d.isIntraday === "boolean" ? d.isIntraday : prev.isIntraday,
            quantity: parsedQuantity ?? prev.quantity,
            averagePrice: parsedAveragePrice ?? prev.averagePrice,
            status: isClosed ? "CLOSED" : "OPEN",
            isClosed,
            realizedPnL: isClosed ? (parsedRealizedPnl ?? prev.realizedPnL) : prev.realizedPnL,
            bookedPnL: isClosed ? (parsedRealizedPnl ?? prev.bookedPnL) : prev.bookedPnL,
          }

          return { ...currentData, positions: updated }
        }, false)
      } catch (e) {
        console.error('❌ [REALTIME-POSITIONS] Cache patch failed:', e)
      }

      scheduleRevalidate()
      lastSyncRef.current = Date.now() // Update last sync time on event
    }
  }, [mutate, DEBUG, scheduleRevalidate, view]))

  // SSE-only steady state: no periodic safety-net polling.
  // Recovery paths: SWR revalidateOnFocus / revalidateOnReconnect + the SSE `connected` event handler above.
  // Cleanup debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (revalidateTimerRef.current) clearTimeout(revalidateTimerRef.current)
      revalidateTimerRef.current = null
    }
  }, [])

  // Refresh function
  const refresh = useCallback(async () => {
    if (DEBUG) console.info("🔄 [REALTIME-POSITIONS] Manual refresh triggered")
    try {
      return await mutate()
    } catch (error) {
      console.error("❌ [REALTIME-POSITIONS] Manual refresh failed:", error)
      throw error
    }
  }, [mutate])

  // Optimistic update for new position with validation
  const optimisticAddPosition = useCallback((newPosition: Partial<Position>) => {
    if (!validatePosition(newPosition)) {
      console.error('❌ [REALTIME-POSITIONS] Cannot add position: Invalid position data')
      return
    }
    
    if (DEBUG) console.log("⚡ [REALTIME-POSITIONS] Optimistic add:", newPosition.id)
    
    try {
      mutate(
        (currentData: PositionsResponse | undefined) => {
          if (!currentData) {
            console.warn('⚠️ [REALTIME-POSITIONS] No current data for optimistic update')
            return currentData
          }
          
          if (!Array.isArray(currentData.positions)) {
            console.warn('⚠️ [REALTIME-POSITIONS] Invalid positions array in current data')
            return currentData
          }
          
          // Check if position already exists (update quantity)
            const existingIndex = currentData.positions.findIndex(
              (p: Position) => p.symbol === newPosition.symbol
            )
          
          if (existingIndex >= 0) {
            const updated = [...currentData.positions]
            const existingPosition = updated[existingIndex]
            
            // Safe quantity update
            const newQuantity = (existingPosition.quantity || 0) + (newPosition.quantity || 0)
            
              updated[existingIndex] = {
                ...existingPosition,
                quantity: newQuantity,
                status: newQuantity === 0 ? "CLOSED" : "OPEN",
                isClosed: newQuantity === 0,
                realizedPnL:
                  newQuantity === 0
                    ? existingPosition.realizedPnL ?? existingPosition.unrealizedPnL ?? 0
                    : existingPosition.realizedPnL,
                bookedPnL:
                  newQuantity === 0
                    ? existingPosition.realizedPnL ?? existingPosition.unrealizedPnL ?? 0
                    : existingPosition.bookedPnL
              }
            
            if (DEBUG) console.log(`📊 [REALTIME-POSITIONS] Updated existing position ${newPosition.symbol}: ${existingPosition.quantity} → ${newQuantity}`)
            
            return { ...currentData, positions: updated }
          }
          
          if (DEBUG) console.log(`📊 [REALTIME-POSITIONS] Added new position ${newPosition.symbol}`)
          
            const isClosed = (newPosition.quantity ?? 0) === 0
            const normalizedPosition: Position = {
              status: newPosition.status ?? (isClosed ? "CLOSED" : "OPEN"),
              isClosed,
              realizedPnL:
                newPosition.realizedPnL ??
                (isClosed ? newPosition.unrealizedPnL ?? 0 : undefined),
              bookedPnL:
                newPosition.bookedPnL ??
                (isClosed ? newPosition.unrealizedPnL ?? 0 : undefined),
              ...newPosition
            } as Position

            return {
              ...currentData,
              positions: [normalizedPosition, ...currentData.positions]
            }
        },
        false
      )
      
      // Revalidate after delay
      setTimeout(() => {
        mutate().catch(err => {
          console.error('❌ [REALTIME-POSITIONS] Delayed revalidation failed:', err)
        })
      }, 500)
    } catch (error) {
      console.error('❌ [REALTIME-POSITIONS] Optimistic add failed:', error)
    }
  }, [mutate])

  // Optimistic update for closing position with validation
  const optimisticClosePosition = useCallback((positionId: string, exitPrice?: number, closeQuantityAbs?: number) => {
    if (!validatePositionId(positionId)) {
      console.error('❌ [REALTIME-POSITIONS] Cannot close position: Invalid position ID')
      return
    }
    
    if (DEBUG) console.log(
      "⚡ [REALTIME-POSITIONS] Optimistic close:",
      positionId,
      exitPrice ? `@ ₹${exitPrice}` : '',
      closeQuantityAbs ? `qty=${closeQuantityAbs}` : "full",
    )
    
    try {
      mutate(
        (currentData: PositionsResponse | undefined) => {
          if (!currentData) {
            console.warn('⚠️ [REALTIME-POSITIONS] No current data for optimistic close')
            return currentData
          }
          
          if (!Array.isArray(currentData.positions)) {
            console.warn('⚠️ [REALTIME-POSITIONS] Invalid positions array in current data')
            return currentData
          }
          
          return {
            ...currentData,
              positions: currentData.positions.map((p: Position) => {
                if (p.id !== positionId) return p
                
                // Calculate booked P&L based on exit price or current unrealized P&L
                const finalExitPrice = exitPrice ?? p.currentPrice ?? p.averagePrice
                const signedQuantity = Math.trunc(parseFiniteRealtimePositionNumber(p.quantity) ?? p.quantity)
                const absoluteQuantity = Math.abs(signedQuantity)
                const closeQuantity = closeQuantityAbs
                  ? Math.max(1, Math.min(absoluteQuantity, Math.trunc(closeQuantityAbs)))
                  : absoluteQuantity
                const signedCloseQuantity = signedQuantity >= 0 ? closeQuantity : -closeQuantity
                const remainingQuantity = signedQuantity - signedCloseQuantity
                const realizedDelta = (finalExitPrice - p.averagePrice) * signedCloseQuantity
                const nextBookedPnL =
                  (parseFiniteRealtimePositionNumber(p.bookedPnL) ??
                    parseFiniteRealtimePositionNumber(p.realizedPnL) ??
                    0) + realizedDelta
                const isClosed = remainingQuantity === 0

                return {
                  ...p,
                  quantity: remainingQuantity,
                  status: isClosed ? "CLOSED" : "OPEN",
                  isClosed,
                  realizedPnL: nextBookedPnL,
                  bookedPnL: nextBookedPnL,
                  currentPrice: finalExitPrice,
                  currentValue: isClosed ? 0 : finalExitPrice * remainingQuantity,
                }
              }) // Keep closed positions (qty 0) to show as booked
          }
        },
        false // Don't revalidate immediately - let server response update it
      )
      
      // Revalidate after a short delay to get server-confirmed data
      setTimeout(() => {
        mutate().catch(err => {
          console.error('❌ [REALTIME-POSITIONS] Delayed revalidation failed:', err)
        })
      }, 1000) // Slightly longer delay to allow server processing
    } catch (error) {
      console.error('❌ [REALTIME-POSITIONS] Optimistic close failed:', error)
    }
  }, [mutate])

  // Safe data extraction with fallback
  const positions: Position[] = (() => {
    try {
        if (data?.positions && Array.isArray(data.positions)) {
          return data.positions.map((position: Position) => {
            const isClosed = position.isClosed ?? position.quantity === 0
            const realizedPnL =
              position.realizedPnL ?? (isClosed ? position.unrealizedPnL ?? 0 : 0)

            return {
              ...position,
              status: position.status ?? (isClosed ? "CLOSED" : "OPEN"),
              isClosed,
              realizedPnL,
              bookedPnL: position.bookedPnL ?? realizedPnL
            }
          })
      }
      return []
    } catch (err) {
      console.error('❌ [REALTIME-POSITIONS] Error extracting positions:', err)
      return []
    }
  })()

  return {
    positions,
    isLoading,
    error: error || null,
    pnlMeta: {
      pnlMode: data?.meta?.pnlMode === "server" ? "server" : "client",
      workerHealthy: Boolean(data?.meta?.workerHealthy),
      pnlMaxAgeMs: parseFiniteRealtimePositionNumber(data?.meta?.pnlMaxAgeMs),
      positionsTabMtmDisplayMode:
        data?.meta?.positionsTabMtmDisplayMode === "server_snapshot_preferred"
          ? "server_snapshot_preferred"
          : data?.meta?.positionsTabMtmDisplayMode === "live_hybrid"
            ? "live_hybrid"
            : "live_quote_preferred",
      positionSquareOffPriceAuthority:
        data?.meta?.positionSquareOffPriceAuthority === "server" ? "server" : "client_assisted",
    },
    refresh,
    optimisticAddPosition,
    optimisticClosePosition,
    mutate,
    retryCount: retryCountRef.current
  }
}
