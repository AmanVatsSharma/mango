/**
 * File:        components/trading/realtime/trading-realtime-provider.tsx
 * Module:      Trading · Realtime
 * Purpose:     Centralized realtime trading data provider (orders/positions/account) + derived values for /dashboard.
 *
 * Exports:
 *   - TradingRealtimeProvider({ userId, session, children }) — wraps the dashboard subtree, owns the SSE subscription and provides context
 *   - useTradingRealtime() → TradingRealtimeContextValue — context hook
 *   - TradingRealtimeContextValue / TradingRealtimeConnectionHealth — types
 *
 * Depends on:
 *   - @/lib/hooks/use-realtime-orders | use-realtime-positions | use-realtime-account — slice hooks (patch caches from SSE)
 *   - @/lib/hooks/use-shared-sse — single shared EventSource per user
 *   - @/components/trading/realtime/trading-realtime-number-utils — fallback PnL aggregation
 *
 * Side-effects:
 *   - Establishes ONE shared SSE subscription per provider mount
 *   - Triggers a coalesced refresh of all three slices ONLY on SSE (re)connect — recovery for any missed-event window
 *
 * Key invariants:
 *   - Per-event refetch lives in slice hooks (patch). Provider does NOT refetch on per-lifecycle events — it would duplicate work.
 *   - On SSE `connected` (initial / reconnect): one debounced refresh of orders + positions + account (175ms coalesce window)
 *   - 500ms in-process dedup on (event, entityId) to ignore worker→Redis duplicates
 *
 * Read order:
 *   1. TradingRealtimeProvider — wires slice hooks + SSE subscription
 *   2. onSseEvent — dispatch table (only `connected` triggers refresh)
 *   3. scheduleCoalescedRefresh — 175ms debounce + Promise.all of slice refreshes
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Stop rebuilding context value on every parent render: depend on the slice
 *     hooks' individual useCallback'd functions, not the whole hook return object.
 *   - Surface the shared SSE feed lifecycle (live | reconnecting | dead) and
 *     a `forceReconnectSse` callback so the dashboard can render a sticky
 *     banner with a manual "Reconnect now" affordance after the retry budget
 *     is exhausted (synthetic `connection_dead` event). Without this, the
 *     dashboard had no way to surface SSE death — only the WS market-data
 *     feed had connection-status UI.
 */

"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { Session } from "next-auth"
import { useRealtimeAccount } from "@/lib/hooks/use-realtime-account"
import { useActiveAccountId } from "@/lib/hooks/use-active-account-id"
import { useRealtimeOrders } from "@/lib/hooks/use-realtime-orders"
import { useRealtimePositions } from "@/lib/hooks/use-realtime-positions"
import type { PnLData } from "@/types/trading"
import { createClientLogger } from "@/lib/logging/client-logger"
import {
  useSharedSSESubscribe,
  forceReconnectSharedSSE,
} from "@/lib/hooks/use-shared-sse"
import type { SSEMessage } from "@/lib/hooks/use-shared-sse"
import {
  computeTradingRealtimeFallbackPnl,
  resolveRealtimePositionInstrumentIds,
  resolveRealtimePositionTokens,
} from "@/components/trading/realtime/trading-realtime-number-utils"

const TRADING_REALTIME_EVENT_DEDUP_WINDOW_MS = 500

/** Lifecycle of the underlying shared SSE connection.
 *  - "live"        — last we knew, the EventSource is open and serving events.
 *  - "reconnecting" — onerror has fired, a backoff reconnect is in flight; UI
 *                     stays on cached state but should hint that data may lag.
 *  - "dead"        — retry budget exhausted; UI must surface a "Reconnect now"
 *                     affordance so the trader can manually re-arm the stream.
 */
export type TradingRealtimeSseState = "live" | "reconnecting" | "dead"

export type TradingRealtimeConnectionHealth = {
  lastRefreshAt: number | null
  /** Snapshot of the SSE feed health for status pills / banners. */
  sseState: TradingRealtimeSseState
}

export type TradingRealtimeContextValue = {
  userId: string
  session: Session
  tradingAccountId: string | null

  orders: any[]
  positions: any[]
  positionsPnLMeta: {
    pnlMode: "client" | "server"
    workerHealthy: boolean
    pnlMaxAgeMs: number | null
    positionsTabMtmDisplayMode: "live_hybrid" | "live_quote_preferred" | "server_snapshot_preferred"
    positionSquareOffPriceAuthority: "server" | "client_assisted"
  }
  account: any | null

  isLoading: boolean
  error: Error | null

  pnl: PnLData

  positionInstrumentIds: string[]
  positionTokens: number[]
  optimisticClosePosition: (positionId: string, exitPrice?: number, closeQuantityAbs?: number) => void
  refreshPositions: () => Promise<any>

  refreshAll: () => Promise<void>
  /** Manually re-arm the shared SSE stream after a `connection_dead` event. */
  forceReconnectSse: () => void
  health: TradingRealtimeConnectionHealth
}

const TradingRealtimeContext = createContext<TradingRealtimeContextValue | null>(null)

export function useTradingRealtime(): TradingRealtimeContextValue {
  const ctx = useContext(TradingRealtimeContext)
  if (!ctx) {
    throw new Error("useTradingRealtime must be used within TradingRealtimeProvider")
  }
  return ctx
}

type TradingRealtimeProviderProps = {
  userId: string
  session: Session
  children: React.ReactNode
}

export function TradingRealtimeProvider({ userId, session, children }: TradingRealtimeProviderProps) {
  const log = useMemo(() => createClientLogger("TRADING-REALTIME"), [])
  const activeAccountId = useActiveAccountId()
  const ordersHook = useRealtimeOrders(userId, activeAccountId)
  const positionsHook = useRealtimePositions(userId, { view: "net" }, activeAccountId)
  const accountHook = useRealtimeAccount(userId, activeAccountId)
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null)
  // SSE feed lifecycle for the dashboard banner. We start optimistically
  // assuming the feed is live (covers SSR + first-paint), then transition based
  // on inbound `connected` / `connection_dead` synthetic events from the
  // shared SSE manager. There's no `connection_lost` event today; an error
  // path inside the manager simply enters the reconnect loop and emits
  // `connected` again on success or `connection_dead` on budget exhaustion.
  const [sseState, setSseState] = useState<TradingRealtimeSseState>("live")

  // Pull stable, useCallback-wrapped function refs out of each slice hook.
  // The slice hooks themselves return a fresh outer object on every render, so
  // depending on `ordersHook` / `positionsHook` / `accountHook` directly would
  // invalidate every memo and useCallback below on every parent render and rebuild
  // the context value object — re-rendering every dashboard consumer for no reason.
  // Each individual function below is wrapped in useCallback inside its hook, so
  // these references are stable across renders.
  const refreshOrders = ordersHook.refresh
  const refreshPositionsFn = positionsHook.refresh
  const refreshAccount = accountHook.refresh
  const optimisticClosePosition = positionsHook.optimisticClosePosition

  const tradingAccountId = useMemo(() => {
    return ((session?.user as any)?.tradingAccountId as string | undefined) ?? accountHook.account?.id ?? null
  }, [session, accountHook.account])

  // Refresh all data when active account changes (LIVE/DEMO switch)
  const prevActiveAccountIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevActiveAccountIdRef.current !== null && activeAccountId !== prevActiveAccountIdRef.current) {
      log.info("Active account changed, refreshing all data", {
        from: prevActiveAccountIdRef.current,
        to: activeAccountId,
      })
      refreshAll()
    }
    prevActiveAccountIdRef.current = activeAccountId
  }, [activeAccountId, log])

  const error = (ordersHook.error || positionsHook.error || accountHook.error) ?? null
  const isLoading = ordersHook.isLoading || positionsHook.isLoading || accountHook.isLoading

  // NOTE: Quote-driven P&L is computed in the dashboard (needs market-data quotes).
  // Here we compute stable fallbacks so UI has something even when market data is offline.
  const pnl: PnLData = useMemo(() => {
    const positions = positionsHook.positions || []
    if (!positions.length) return { totalPnL: 0, dayPnL: 0 }

    return computeTradingRealtimeFallbackPnl(positions)
  }, [positionsHook.positions])

  const positionInstrumentIds = useMemo(() => {
    return resolveRealtimePositionInstrumentIds(positionsHook.positions || [])
  }, [positionsHook.positions])

  const positionTokens = useMemo(() => {
    return resolveRealtimePositionTokens(positionsHook.positions || [])
  }, [positionsHook.positions])

  /**
   * Trading Sync Coordinator
   *
   * Problem: Each slice hook refreshes only itself; plus components often trigger manual refreshes.
   * Fix: Coalesce trading lifecycle events and refresh dependent slices together.
   */
  const refreshCoordinatorRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null
    wantOrders: boolean
    wantPositions: boolean
    wantAccount: boolean
  }>({ timer: null, wantOrders: false, wantPositions: false, wantAccount: false })
  const recentEventRef = useRef<Map<string, number>>(new Map())

  const scheduleCoalescedRefresh = useCallback(
    (flags: { orders?: boolean; positions?: boolean; account?: boolean }, reason: string) => {
      const state = refreshCoordinatorRef.current
      state.wantOrders = state.wantOrders || !!flags.orders
      state.wantPositions = state.wantPositions || !!flags.positions
      state.wantAccount = state.wantAccount || !!flags.account

      if (state.timer) return

      state.timer = setTimeout(async () => {
        const wantOrders = state.wantOrders
        const wantPositions = state.wantPositions
        const wantAccount = state.wantAccount
        state.timer = null
        state.wantOrders = false
        state.wantPositions = false
        state.wantAccount = false

        const startedAt = Date.now()
        log.info("sync: refresh start", {
          reason,
          wantOrders,
          wantPositions,
          wantAccount,
          userId,
        })

        try {
          const tasks: Array<Promise<unknown>> = []
          if (wantOrders) tasks.push(refreshOrders())
          if (wantPositions) tasks.push(refreshPositionsFn())
          if (wantAccount) tasks.push(refreshAccount())
          await Promise.all(tasks)
          setLastRefreshAt(Date.now())
        } catch (e) {
          log.error("sync: refresh failed", { reason, message: (e as any)?.message || String(e) })
        } finally {
          log.info("sync: refresh done", { reason, elapsedMs: Date.now() - startedAt })
        }
      }, 175) // short debounce to coalesce bursts of lifecycle events
    },
    [refreshOrders, refreshPositionsFn, refreshAccount, log, userId],
  )

  const onSseEvent = useCallback(
    (message: SSEMessage) => {
      const eventData = (message?.data ?? {}) as Record<string, unknown>
      const eventEntityId =
        typeof eventData.orderId === "string"
          ? eventData.orderId
          : typeof eventData.positionId === "string"
            ? eventData.positionId
            : typeof eventData.tradingAccountId === "string"
              ? eventData.tradingAccountId
              : "global"
      const dedupKey = `${message.event}:${eventEntityId}`
      const now = Date.now()
      const lastSeenAt = recentEventRef.current.get(dedupKey) ?? 0
      if (now - lastSeenAt < TRADING_REALTIME_EVENT_DEDUP_WINDOW_MS) {
        return
      }
      recentEventRef.current.set(dedupKey, now)
      if (recentEventRef.current.size > 500) {
        const expiry = now - TRADING_REALTIME_EVENT_DEDUP_WINDOW_MS * 2
        recentEventRef.current.forEach((seenAt, key) => {
          if (seenAt < expiry) recentEventRef.current.delete(key)
        })
      }

      // Per-lifecycle SSE events are patched directly inside the slice hooks (orders/positions/account).
      // The provider only triggers a full coalesced refresh on (re)connect — the sole recovery point for any
      // events that may have been missed while the SSE stream was down. Per-event refetch here would duplicate
      // the slice-hook patch and add HTTP churn the user would observe in the network tab.
      if (message.event === "connected") {
        // Reconnect (or first connect) — flip back to live and reconcile.
        setSseState("live")
        scheduleCoalescedRefresh({ orders: true, positions: true, account: true }, "sse:connected")
        return
      }
      if (message.event === "connection_dead") {
        // The shared SSE manager exhausted its retry budget. Surface a sticky
        // banner via context state; the dashboard binds a "Reconnect now"
        // button to forceReconnectSse(). The slice-hook caches keep the last
        // known data visible so trading workflows aren't blocked entirely.
        log.warn("sse: connection dead — awaiting manual reconnect", {
          userId,
          attempts: (eventData as any)?.attempts,
        })
        setSseState("dead")
      }
    },
    [scheduleCoalescedRefresh, log, userId],
  )

  // Establish ONE shared SSE subscription for trading lifecycle events.
  useSharedSSESubscribe(userId, onSseEvent)

  // Cleanup any pending refresh timer on unmount.
  useEffect(() => {
    return () => {
      const s = refreshCoordinatorRef.current
      if (s.timer) clearTimeout(s.timer)
      s.timer = null
      s.wantOrders = false
      s.wantPositions = false
      s.wantAccount = false
    }
  }, [])

  const refreshAll = useCallback(async () => {
    log.info("refreshAll: start", {
      userId,
      tradingAccountId,
    })
    await Promise.all([refreshOrders(), refreshPositionsFn(), refreshAccount()])
    setLastRefreshAt(Date.now())
    log.info("refreshAll: done", { userId })
  }, [refreshOrders, refreshPositionsFn, refreshAccount, userId, tradingAccountId, log])

  /** Bound to the dashboard's "Reconnect now" banner. We optimistically flip
   *  to "reconnecting" so the UI updates immediately; the manager will then
   *  emit a fresh `connected` event on success (which flips back to "live") or
   *  another `connection_dead` if the manual attempt also fails. */
  const forceReconnectSse = useCallback(() => {
    setSseState("reconnecting")
    forceReconnectSharedSSE(userId)
  }, [userId])

  const value: TradingRealtimeContextValue = useMemo(
    () => ({
      userId,
      session,
      tradingAccountId,
      orders: ordersHook.orders,
      positions: positionsHook.positions,
      positionsPnLMeta: positionsHook.pnlMeta,
      account: accountHook.account,
      isLoading,
      error,
      pnl,
      positionInstrumentIds,
      positionTokens,
      optimisticClosePosition,
      refreshPositions: refreshPositionsFn,
      refreshAll,
      forceReconnectSse,
      health: {
        lastRefreshAt,
        sseState,
      },
    }),
    [
      userId,
      session,
      tradingAccountId,
      ordersHook.orders,
      positionsHook.positions,
      positionsHook.pnlMeta,
      accountHook.account,
      isLoading,
      error,
      pnl,
      positionInstrumentIds,
      positionTokens,
      optimisticClosePosition,
      refreshPositionsFn,
      refreshAll,
      forceReconnectSse,
      lastRefreshAt,
      sseState,
    ],
  )

  return <TradingRealtimeContext.Provider value={value}>{children}</TradingRealtimeContext.Provider>
}

