/**
 * File:        lib/hooks/use-realtime-orders.ts
 * Module:      Trading · Realtime Hooks
 * Purpose:     SSE-driven orders feed — patches cache from SSE events; refetch only on (re)connect or focus.
 *
 * Exports:
 *   - useRealtimeOrders(userId, activeAccountId?) → { orders, isLoading, error, refresh, optimisticUpdate, resolveOptimisticOrder, rejectOptimisticOrder, mutate, retryCount }
 *   - buildOutOfOrderOrderStub(event, data, timestampIso) → Order — synthesise stub when execute/cancel arrives before placed
 *
 * Depends on:
 *   - swr — initial fetch + cache; refreshInterval is 0
 *   - ./use-shared-sse — single shared EventSource per user
 *   - @/lib/hooks/realtime-order-number-utils — payload coercion
 *
 * Side-effects:
 *   - HTTP GET /api/trading/orders/list on mount, on tab focus, and on network reconnect
 *
 * Key invariants:
 *   - SSE order_placed/executed/cancelled payloads are authoritative — patch in place, do NOT refetch per event
 *   - On SSE (re)connect, TradingRealtimeProvider issues a coalesced refresh — no duplicate refetch here
 *   - No periodic safety-net polling — drift is bounded by SSE delivery + revalidateOnFocus/Reconnect
 *   - 1.2s dedup window per (event, orderId) to absorb duplicates from in-process + Redis paths
 *   - When activeAccountId is provided, fetches orders for that specific account (LIVE/DEMO switching)
 *
 * Read order:
 *   1. useRealtimeOrders — SWR init + SSE wiring
 *   2. SSE handler — patches cache for placed/executed/cancelled
 *   3. optimisticUpdate / resolveOptimisticOrder / rejectOptimisticOrder — submit-side UX
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-15
 */

"use client"

import useSWR from 'swr'
import { useCallback, useEffect, useRef } from 'react'
import { useSharedSSESubscribe } from './use-shared-sse'
import {
  normalizeRealtimeOrderPrice,
  normalizeRealtimeOrderQuantity,
} from "@/lib/hooks/realtime-order-number-utils"

const REALTIME_ORDER_EVENT_DEDUP_WINDOW_MS = 1200

// Types
interface Order {
  id: string
  symbol: string
  quantity: number
  orderType: string
  orderSide: string
  price?: number | null
  averagePrice?: number | null
  filledQuantity?: number
  productType?: string
  status: string
  failureCode?: string | null
  failureReason?: string | null
  createdAt: string
  executedAt?: string | null
  stock?: any
}

interface OrdersResponse {
  success: boolean
  orders: Order[]
  error?: string
}

interface UseRealtimeOrdersReturn {
  orders: Order[]
  isLoading: boolean
  error: Error | null
  refresh: () => Promise<any>
  optimisticUpdate: (newOrder: Partial<Order>) => void
  resolveOptimisticOrder: (tempOrderId: string, patch?: Partial<Order>) => void
  rejectOptimisticOrder: (tempOrderId: string, reason?: string) => void
  mutate: any
  retryCount: number
}

// 15-second hard timeout. Without it, a hung backend leaves SWR's
// in-flight promise pending forever — the user sees stale data with no
// error feedback, and SWR's retry/refresh logic never fires for the dead
// request. AbortSignal.timeout makes the fetch fail visibly so SWR can
// surface the error and schedule a retry on the next focus / interval.
const FETCHER_TIMEOUT_MS = 15_000

// Enhanced fetcher with better error handling
const fetcher = async (url: string): Promise<OrdersResponse> => {
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
        throw new Error('Orders endpoint not found')
      } else if (res.status >= 500) {
        throw new Error('Server error: Please try again later')
      }
      throw new Error(`Failed to fetch orders: ${res.status} ${res.statusText}`)
    }
    
    const data = await res.json()
    
    // Validate response structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response format')
    }
    
    // Handle API error responses
    if (data.success === false && data.error) {
      throw new Error(data.error)
    }
    
    return data
  } catch (error) {
    // Enhanced error logging
    if (error instanceof Error) {
      console.error('❌ [REALTIME-ORDERS] Fetch error:', {
        message: error.message,
        url,
        timestamp: new Date().toISOString()
      })
    }
    throw error
  }
}

// Validation helper
function validateOrder(order: any): order is Partial<Order> {
  if (!order || typeof order !== 'object') {
    console.warn('⚠️ [REALTIME-ORDERS] Invalid order object:', order)
    return false
  }
  
  if (order.id && typeof order.id !== 'string') {
    console.warn('⚠️ [REALTIME-ORDERS] Invalid order ID:', order.id)
    return false
  }
  
  if (order.quantity !== undefined && (typeof order.quantity !== 'number' || order.quantity <= 0)) {
    console.warn('⚠️ [REALTIME-ORDERS] Invalid quantity:', order.quantity)
    return false
  }
  
  return true
}

export function buildOutOfOrderOrderStub(
  event: 'order_executed' | 'order_cancelled',
  data: Record<string, unknown>,
  timestampIso: string,
): Order {
  const submittedPrice = normalizeRealtimeOrderPrice((data as any).submittedPrice ?? (data as any).price)
  const executedPrice = normalizeRealtimeOrderPrice(
    (data as any).averagePrice ?? (data as any).executionPrice ?? (data as any).price,
  )
  const fallbackFilledQuantity = normalizeRealtimeOrderQuantity((data as any).filledQuantity ?? (data as any).quantity)

  return {
    id: String((data as any).orderId || 'UNKNOWN'),
    symbol: String((data as any).symbol || 'UNKNOWN'),
    quantity: normalizeRealtimeOrderQuantity((data as any).quantity),
    orderType: String((data as any).orderType || 'MARKET'),
    orderSide: String((data as any).orderSide || 'BUY'),
    price: submittedPrice,
    averagePrice: event === 'order_executed' ? (executedPrice ?? submittedPrice) : null,
    filledQuantity: event === 'order_executed' ? Math.max(0, fallbackFilledQuantity) : 0,
    productType: undefined,
    status: event === 'order_executed' ? 'EXECUTED' : 'CANCELLED',
    failureReason:
      event === 'order_cancelled' && typeof (data as any).failureReason === 'string'
        ? ((data as any).failureReason as string).trim() || undefined
        : undefined,
    createdAt: timestampIso,
    executedAt: event === 'order_executed' ? timestampIso : null,
    stock: undefined,
  }
}

export function useRealtimeOrders(userId: string | undefined | null, activeAccountId?: string | null): UseRealtimeOrdersReturn {
  const retryCountRef = useRef(0)
  const maxRetries = 3
  const lastSyncRef = useRef<number>(Date.now())
  const recentRealtimeEventsRef = useRef<Map<string, number>>(new Map())
  const DEBUG = process.env.NEXT_PUBLIC_DEBUG_REALTIME === 'true' || process.env.NODE_ENV === 'development'

  // Build fetch URL: prefer activeAccountId (for LIVE/DEMO switching) over userId
  const fetchUrl = (() => {
    if (!userId) return null
    if (activeAccountId) {
      return `/api/trading/orders/list?userId=${userId}&accountId=${activeAccountId}`
    }
    return `/api/trading/orders/list?userId=${userId}`
  })()

  // Initial data fetch - polling handled by adaptive useEffect below
  const { data, error, isLoading, mutate } = useSWR<OrdersResponse>(
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
        console.error(`❌ [REALTIME-ORDERS] Error (attempt ${retryCountRef.current}/${maxRetries}):`, err.message)
      },
      onSuccess: () => {
        if (retryCountRef.current > 0) {
          if (DEBUG) console.info('✅ [REALTIME-ORDERS] Recovered from error')
          retryCountRef.current = 0
        }
        lastSyncRef.current = Date.now()
      }
    }
  )

  // Shared SSE connection for real-time updates
  useSharedSSESubscribe(userId, useCallback((message) => {
    // Handle order-related events
    if (message.event === 'order_placed' || 
        message.event === 'order_executed' || 
        message.event === 'order_cancelled') {
      if (DEBUG) console.debug(`📨 [REALTIME-ORDERS] SSE ${message.event} → patch+revalidate`)

      // Patch cache instantly for a flicker-free UX, then verify with one debounced revalidate.
      try {
        mutate((currentData: OrdersResponse | undefined) => {
          if (!currentData || !Array.isArray(currentData.orders)) return currentData

          const d: any = message.data || {}
          const id = d.orderId as string | undefined
          if (!id) return currentData
          const now = Date.now()
          const dedupKey = `${message.event}:${id}`
          const lastSeenAt = recentRealtimeEventsRef.current.get(dedupKey) ?? 0
          if (now - lastSeenAt < REALTIME_ORDER_EVENT_DEDUP_WINDOW_MS) {
            return currentData
          }
          recentRealtimeEventsRef.current.set(dedupKey, now)
          if (recentRealtimeEventsRef.current.size > 500) {
            const expiry = now - REALTIME_ORDER_EVENT_DEDUP_WINDOW_MS * 2
            recentRealtimeEventsRef.current.forEach((seenAt, key) => {
              if (seenAt < expiry) recentRealtimeEventsRef.current.delete(key)
            })
          }

          const ts = message.timestamp || new Date().toISOString()
          const idx = currentData.orders.findIndex((o: any) => o?.id === id)

          if (message.event === 'order_placed') {
            if (idx >= 0) return currentData
            const submittedPrice = normalizeRealtimeOrderPrice(d.submittedPrice ?? d.price)
            const stub: Order = {
              id,
              symbol: String(d.symbol || 'UNKNOWN'),
              quantity: normalizeRealtimeOrderQuantity(d.quantity),
              orderType: String(d.orderType || 'MARKET'),
              orderSide: String(d.orderSide || 'BUY'),
              price: submittedPrice,
              averagePrice: null,
              filledQuantity: 0,
              productType: undefined,
              status: String(d.status || 'PENDING'),
              createdAt: ts,
              executedAt: null,
              stock: undefined,
            }
            return { ...currentData, orders: [stub, ...currentData.orders] }
          }

          if (idx === -1) {
            // Out-of-order safety: create a minimal order stub so execution/cancel events are not dropped.
            const stub = buildOutOfOrderOrderStub(
              message.event as 'order_executed' | 'order_cancelled',
              d,
              ts,
            )
            return { ...currentData, orders: [stub, ...currentData.orders] }
          }

          const updated = [...currentData.orders]
          const prev = updated[idx] as any

          if (message.event === 'order_executed') {
            const submittedPrice = normalizeRealtimeOrderPrice(d.submittedPrice ?? d.price)
            const executedPrice = normalizeRealtimeOrderPrice(d.averagePrice ?? d.executionPrice ?? d.price)
            const parsedFilledQuantity = normalizeRealtimeOrderQuantity(d.filledQuantity)
            const fallbackFilledQuantity = normalizeRealtimeOrderQuantity(prev.filledQuantity ?? prev.quantity)
            updated[idx] = {
              ...prev,
              status: 'EXECUTED',
              price: submittedPrice ?? prev.price,
              averagePrice: executedPrice ?? prev.averagePrice ?? submittedPrice ?? prev.price,
              filledQuantity: parsedFilledQuantity > 0 ? parsedFilledQuantity : fallbackFilledQuantity,
              executedAt: ts,
            }
          } else if (message.event === 'order_cancelled') {
            updated[idx] = {
              ...prev,
              status: 'CANCELLED',
              failureReason:
                typeof d.failureReason === "string" && d.failureReason.trim().length > 0
                  ? d.failureReason.trim()
                  : prev.failureReason,
            }
          }

          return { ...currentData, orders: updated }
        }, false)
      } catch (e) {
        console.error('❌ [REALTIME-ORDERS] Cache patch failed:', e)
      }

      // Trust the SSE patch — no per-event refetch. Drift recovery: SSE `connected` + revalidateOnFocus/Reconnect.
      lastSyncRef.current = Date.now()
    }
  }, [mutate, DEBUG]))

  // Refresh function to call after placing order
  const refresh = useCallback(async () => {
    if (DEBUG) console.info("🔄 [REALTIME-ORDERS] Manual refresh triggered")
    try {
      return await mutate()
    } catch (error) {
      console.error("❌ [REALTIME-ORDERS] Manual refresh failed:", error)
      throw error
    }
  }, [mutate])

  // Optimistic update function with validation (upsert by id)
  const optimisticUpdate = useCallback((newOrder: Partial<Order>) => {
    // Validate input
    if (!validateOrder(newOrder)) {
      console.error('❌ [REALTIME-ORDERS] Cannot perform optimistic update: Invalid order')
      return
    }
    
    if (DEBUG) console.log("⚡ [REALTIME-ORDERS] Optimistic update:", newOrder.id)
    
    try {
      mutate(
        (currentData: OrdersResponse | undefined) => {
          // Safety check
          if (!currentData) {
            console.warn('⚠️ [REALTIME-ORDERS] No current data for optimistic update')
            return currentData
          }
          
          if (!Array.isArray(currentData.orders)) {
            console.warn('⚠️ [REALTIME-ORDERS] Invalid orders array in current data')
            return currentData
          }

          const id = (newOrder as any)?.id as string | undefined
          if (!id) return currentData

          const idx = currentData.orders.findIndex((o: any) => o?.id === id)
          if (idx === -1) {
            return {
              ...currentData,
              orders: [newOrder as Order, ...currentData.orders],
            }
          }

          const updated = [...currentData.orders]
          updated[idx] = { ...(updated[idx] as any), ...(newOrder as any) }
          return { ...currentData, orders: updated }
        },
        false // Don't revalidate immediately
      )
      // No delayed refetch — the order_placed SSE event arrives shortly and will replace the optimistic stub.
    } catch (error) {
      console.error('❌ [REALTIME-ORDERS] Optimistic update failed:', error)
    }
  }, [mutate])

  const resolveOptimisticOrder = useCallback(
    (tempOrderId: string, patch?: Partial<Order>) => {
      if (typeof tempOrderId !== "string" || tempOrderId.length === 0) return

      mutate(
        (currentData: OrdersResponse | undefined) => {
          if (!currentData || !Array.isArray(currentData.orders)) return currentData

          const idx = currentData.orders.findIndex((o: any) => o?.id === tempOrderId)
          if (idx === -1) return currentData

          const updated = [...currentData.orders]
          const prev = updated[idx] as any
          const next = { ...prev, ...(patch as any) }

          // If backend id is provided, de-duplicate and replace id.
          const nextId = (next as any)?.id as string | undefined
          if (nextId && nextId !== tempOrderId) {
            const withoutDup = updated.filter((o: any) => o?.id !== nextId && o?.id !== tempOrderId)
            return { ...currentData, orders: [next, ...withoutDup] }
          }

          updated[idx] = next
          return { ...currentData, orders: updated }
        },
        false,
      )
    },
    [mutate],
  )

  const rejectOptimisticOrder = useCallback(
    (tempOrderId: string, reason?: string) => {
      if (typeof tempOrderId !== "string" || tempOrderId.length === 0) return
      console.warn("⚠️ [REALTIME-ORDERS] Rejecting optimistic order", { tempOrderId, reason })

      mutate(
        (currentData: OrdersResponse | undefined) => {
          if (!currentData || !Array.isArray(currentData.orders)) return currentData
          const filtered = currentData.orders.filter((o: any) => o?.id !== tempOrderId)
          return { ...currentData, orders: filtered }
        },
        false,
      )
    },
    [mutate],
  )

  // Safe data extraction with fallback
  const orders: Order[] = (() => {
    try {
      if (data?.orders && Array.isArray(data.orders)) {
        return data.orders
      }
      return []
    } catch (err) {
      console.error('❌ [REALTIME-ORDERS] Error extracting orders:', err)
      return []
    }
  })()

  return {
    orders,
    isLoading,
    error: error || null,
    refresh,
    optimisticUpdate,
    resolveOptimisticOrder,
    rejectOptimisticOrder,
    mutate,
    retryCount: retryCountRef.current
  }
}
