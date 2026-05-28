/**
 * File:        hooks/use-order-status.ts
 * Module:      Hooks · Order Status
 * Purpose:     SWR polling hook for order status after placement. Polls every 2s until the
 *              order reaches a terminal state (EXECUTED/REJECTED/CANCELLED/EXPIRED) or 60s elapses.
 *
 * Exports:
 *   - useOrderStatus(orderId) → { data, error, isLoading, isTerminal } — the React hook
 *   - isTerminalOrderStatus(status) → boolean — pure helper (exported for tests)
 *   - buildOrderStatusUrl(orderId) → string | null — pure helper (exported for tests)
 *   - OrderStatusData — response shape from /api/trading/orders/status
 *
 * Depends on:
 *   - swr — for SWR polling
 *   - @/lib/market-data/constants — ORDER_POLL_INTERVAL_MS, ORDER_POLL_MAX_DURATION_MS
 *
 * Side-effects: SWR fetch to /api/trading/orders/status
 *
 * Key invariants:
 *   - Polling stops as soon as a terminal status is received — no further requests
 *   - The startTime ref resets whenever orderId changes so a new order always gets a fresh 60s window
 *
 * Read order:
 *   1. OrderStatusData — API response shape
 *   2. TERMINAL_STATUSES — set of terminal status strings
 *   3. isTerminalOrderStatus / buildOrderStatusUrl — pure helpers
 *   4. useOrderStatus — main hook
 *
 * Author: Aman Sharma
 * Last-updated: 2026-05-09
 */

"use client"

import { useRef } from "react"
import useSWR from "swr"
import { ORDER_POLL_INTERVAL_MS, ORDER_POLL_MAX_DURATION_MS } from "@/lib/market-data/constants"

export interface OrderStatusData {
  success: boolean
  orderId: string
  status: string
  symbol: string
  quantity: number
  price: number | null
  averagePrice: number | null
  filledQuantity: number
  failureCode: string | null
  failureReason: string | null
  createdAt: string
}

const TERMINAL_STATUSES = new Set([
  "EXECUTED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
  "PARTIALLY_FILLED",
])

export function isTerminalOrderStatus(status: string | null | undefined): boolean {
  if (!status) return false
  return TERMINAL_STATUSES.has(status)
}

export function buildOrderStatusUrl(orderId: string | null): string | null {
  if (!orderId) return null
  return `/api/trading/orders/status?orderId=${orderId}`
}

async function fetcher(url: string): Promise<OrderStatusData> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Order status fetch failed: ${res.status}`)
  return res.json()
}

export function useOrderStatus(orderId: string | null) {
  const startTimeRef = useRef<number>(Date.now())
  const prevOrderIdRef = useRef<string | null>(null)

  // Reset start time when orderId changes (new order = fresh 60s polling window)
  if (orderId !== prevOrderIdRef.current) {
    prevOrderIdRef.current = orderId
    startTimeRef.current = Date.now()
  }

  const withinWindow = Date.now() - startTimeRef.current < ORDER_POLL_MAX_DURATION_MS

  const { data, error, isLoading } = useSWR<OrderStatusData>(
    buildOrderStatusUrl(orderId),
    fetcher,
    {
      refreshInterval: (latestData) => {
        if (!latestData) return withinWindow ? ORDER_POLL_INTERVAL_MS : 0
        if (isTerminalOrderStatus(latestData.status)) return 0
        if (Date.now() - startTimeRef.current >= ORDER_POLL_MAX_DURATION_MS) return 0
        return ORDER_POLL_INTERVAL_MS
      },
      revalidateOnFocus: false,
      dedupingInterval: ORDER_POLL_INTERVAL_MS - 100,
    }
  )

  return {
    data,
    error,
    isLoading,
    isTerminal: isTerminalOrderStatus(data?.status),
  }
}
