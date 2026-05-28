/**
 * File:        lib/hooks/use-shared-sse.ts
 * Module:      Trading · Realtime Hooks
 * Purpose:     Single shared EventSource per userId across all consuming hooks;
 *              reconnect with bounded exponential backoff + jitter; emits
 *              `connected` and `connection_dead` synthetic events so consumers
 *              can render banners without polling React state.
 *
 * Exports:
 *   - SharedSSEManager                                              — singleton class
 *   - useSharedSSE(userId, onEvent)
 *       → { isConnected, connectionState, lastEventAt, lastErrorAt } — full hook (status UI)
 *   - useSharedSSESubscribe(userId, onEvent)                         — lean hook (event stream + tab-back recovery)
 *   - RealtimeEventType                                              — union (incl. `connected`, `connection_dead`)
 *   - SSEMessage / EventCallback                                     — type aliases
 *
 * Side-effects:
 *   - Opens one EventSource per userId on first subscriber; closed on last unsubscribe
 *   - Registers window `online` + document `visibilitychange` listeners for tab-back recovery
 *
 * Key invariants:
 *   - One EventSource per userId regardless of how many hooks subscribe
 *   - Reconnect: exponential backoff base=1s, cap=60s, ±20% jitter, up to MAX_RECONNECT_ATTEMPTS (30)
 *   - On retry budget exhausted: emit synthetic `connection_dead` event to all subscribers, mark sticky
 *     until manual `forceReconnect()` or a new subscribe arrives
 *   - The lean `useSharedSSESubscribe` ALSO registers tab-back/online recovery so dashboards using
 *     the lean variant don't lose recovery (was the dashboard-SSE-dies-after-sleep bug)
 *
 * Read order:
 *   1. SharedSSEManager — connection lifecycle, reconnect strategy, subscriber Set
 *   2. useSharedSSESubscribe — lean React adapter (most consumers)
 *   3. useSharedSSE — full React adapter (status pills)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Trading-0di: raise reconnect cap 5→30, switch linear→bounded exponential
 *     backoff with jitter, emit `connection_dead` when budget exhausted.
 *   - Trading-qhu: wire `online`/`visibilitychange` listeners into the lean
 *     hook so dashboards using `useSharedSSESubscribe` recover after tab sleep.
 *   - Throttle forceReconnect (1.5s window). Without this, every tab-back
 *     visibilitychange fires once per consumer (7 dashboard hooks today),
 *     so the manager closed + re-opened the EventSource seven times in
 *     rapid succession. Now the first call wins; subsequent ones no-op.
 */

"use client"

import React, { useEffect, useRef, useCallback } from "react"
import { createClientLogger } from "@/lib/logging/client-logger"

export type RealtimeEventType =
  | 'order_placed'
  | 'order_executed'
  | 'order_cancelled'
  | 'position_opened'
  | 'position_closed'
  | 'position_updated'
  | 'positions_pnl_updated'
  | 'balance_updated'
  | 'margin_blocked'
  | 'margin_released'
  | 'watchlist_updated'
  | 'watchlist_item_added'
  | 'watchlist_item_removed'
  | 'notification_created'
  | 'notification_deleted'
  | 'connected'
  // Synthetic event emitted by SharedSSEManager (NOT by the server) when the
  // reconnect budget is exhausted. Consumers should render a degraded-mode
  // banner with a manual "Reconnect now" affordance that calls
  // sseManager.forceReconnect(userId).
  | 'connection_dead'

export interface SSEMessage {
  event: RealtimeEventType
  data: any
  timestamp: string
}

export type EventCallback = (message: SSEMessage) => void

/**
 * Shared SSE connection manager
 * Creates a single SSE connection per userId and allows multiple subscribers
 */
// Reconnect strategy constants — exported so the test suite + admin UI
// can reference the same values without re-deriving them.
export const SSE_RECONNECT_BASE_MS = 1_000
export const SSE_RECONNECT_CAP_MS = 60_000
export const SSE_RECONNECT_JITTER = 0.2
export const SSE_MAX_RECONNECT_ATTEMPTS = 30
/**
 * Coalescence window for forceReconnect() calls. When the dashboard tab
 * returns visible, every consumer of useSharedSSESubscribe fires its own
 * visibilitychange handler; with seven slice hooks (orders, positions,
 * account, notifications, watchlist, position-history, trading-realtime
 * provider) that's 7 simultaneous forceReconnect calls per tab-back.
 *
 * Without throttling, the manager closes + recreates the EventSource on
 * each call, so the user gets 7 reconnect cycles back-to-back for one
 * underlying need. We keep the FIRST call (which actually reconnects)
 * and ignore any subsequent calls within this window.
 */
export const SSE_FORCE_RECONNECT_THROTTLE_MS = 1_500

function computeReconnectDelayMs(attempt: number): number {
  // attempt is 1-indexed (first retry = 1)
  const exp = SSE_RECONNECT_BASE_MS * Math.pow(2, Math.max(0, attempt - 1))
  const capped = Math.min(SSE_RECONNECT_CAP_MS, exp)
  const jitter = capped * SSE_RECONNECT_JITTER * (Math.random() * 2 - 1) // ±20%
  return Math.max(SSE_RECONNECT_BASE_MS, Math.floor(capped + jitter))
}

export class SharedSSEManager {
  private connections: Map<string, EventSource> = new Map()
  private subscribers: Map<string, Set<EventCallback>> = new Map()
  private reconnectAttempts: Map<string, number> = new Map()
  private lastEventAt: Map<string, number> = new Map()
  private lastErrorAt: Map<string, number> = new Map()
  // Sticky DEAD flag per userId — set when retry budget exhausted, cleared on
  // forceReconnect or new subscriber. Prevents the manager from immediately
  // re-trying after the same DEAD state every time a new subscriber arrives
  // mid-outage; the deliberate gate is forceReconnect.
  private deadUsers: Set<string> = new Set()
  // Throttle window for forceReconnect — first call wins, subsequent calls
  // within SSE_FORCE_RECONNECT_THROTTLE_MS are no-ops. Stops the seven-consumer
  // thunder herd that fires when the tab becomes visible again (every lean
  // hook wires its own visibilitychange listener).
  private lastForceReconnectAt: Map<string, number> = new Map()
  private readonly maxReconnectAttempts = SSE_MAX_RECONNECT_ATTEMPTS
  private readonly log = createClientLogger("SHARED-SSE")

  private emitToSubscribers(userId: string, message: SSEMessage): void {
    const subscribers = this.subscribers.get(userId)
    if (!subscribers) return
    subscribers.forEach((callback) => {
      try {
        callback(message)
      } catch (error) {
        this.log.error("subscriber callback error", { userId, message: (error as any)?.message || String(error) })
      }
    })
  }

  /**
   * Subscribe to SSE events for a user
   * Creates connection if needed, otherwise reuses existing
   */
  subscribe(userId: string, callback: EventCallback): () => void {
    this.log.debug("subscribe", { userId })

    // Add callback to subscribers
    if (!this.subscribers.has(userId)) {
      this.subscribers.set(userId, new Set())
    }
    this.subscribers.get(userId)!.add(callback)

    // Create connection if it doesn't exist
    if (!this.connections.has(userId)) {
      this.createConnection(userId)
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribe(userId, callback)
    }
  }

  ensureConnection(userId: string): void {
    const hasSubscribers = this.subscribers.has(userId) && (this.subscribers.get(userId)?.size || 0) > 0
    if (!hasSubscribers) return
    if (this.connections.has(userId)) return
    this.createConnection(userId)
  }

  /**
   * Unsubscribe from SSE events
   */
  unsubscribe(userId: string, callback: EventCallback): void {
    this.log.debug("unsubscribe", { userId })

    const userSubscribers = this.subscribers.get(userId)
    if (userSubscribers) {
      userSubscribers.delete(callback)

      // If no more subscribers, close connection AND clear retry/dead state
      // for this userId — they may re-subscribe later in a fresh state.
      if (userSubscribers.size === 0) {
        this.closeConnection(userId)
        this.subscribers.delete(userId)
        this.reconnectAttempts.delete(userId)
        this.deadUsers.delete(userId)
        this.lastForceReconnectAt.delete(userId)
      }
    }
  }

  /**
   * Create SSE connection for a user
   */
  private createConnection(userId: string): void {
    // Guard against SSR
    if (typeof window === 'undefined') {
      this.log.warn("cannot create SSE connection on server side", { userId })
      return
    }

    if (this.connections.has(userId)) {
      this.log.debug("connection already exists", { userId })
      return
    }

    if (this.deadUsers.has(userId)) {
      // Sticky DEAD — only forceReconnect() may clear and re-open. Prevents
      // subscribe/ensureConnection paths from quietly bypassing the budget cap.
      this.log.debug("skipping create — connection marked DEAD; awaiting forceReconnect", { userId })
      return
    }

    this.log.debug("creating SSE connection", { userId })
    
    const eventSource = new EventSource(`/api/realtime/stream?userId=${userId}`)
    this.connections.set(userId, eventSource)
    // NOTE: reconnectAttempts is NOT reset here — that would zero the counter on
    // every retry attempt and the budget cap would never trigger. The counter is
    // reset on successful onopen (proof the connection is healthy) and on real
    // unsubscribe (no subscribers left).
    if (!this.reconnectAttempts.has(userId)) {
      this.reconnectAttempts.set(userId, 0)
    }
    this.lastEventAt.set(userId, Date.now())

    eventSource.onopen = () => {
      this.log.debug("SSE connection established", { userId })
      this.reconnectAttempts.set(userId, 0) // Reset on successful connection
      this.lastEventAt.set(userId, Date.now())
      this.emitToSubscribers(userId, {
        event: 'connected',
        data: { userId, timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      })
    }

    eventSource.onmessage = (event) => {
      try {
        const message: SSEMessage = JSON.parse(event.data)
        this.log.throttled("events", 2000, "debug", "received event", { userId, event: message.event })
        this.lastEventAt.set(userId, Date.now())

        // Broadcast to all subscribers
        this.emitToSubscribers(userId, message)
      } catch (error) {
        this.log.error("error parsing SSE message", { userId, message: (error as any)?.message || String(error) })
      }
    }

    eventSource.onerror = (error) => {
      this.log.error("SSE connection error", { userId })
      this.lastErrorAt.set(userId, Date.now())

      const hasSubscribers = this.subscribers.has(userId) && (this.subscribers.get(userId)?.size || 0) > 0

      // EventSource constants (CLOSED = 2)
      const EVENT_SOURCE_CLOSED = 2
      if (!hasSubscribers || eventSource.readyState !== EVENT_SOURCE_CLOSED) return

      const attempts = this.reconnectAttempts.get(userId) || 0
      if (attempts >= this.maxReconnectAttempts) {
        this.log.error("max reconnect attempts reached", {
          userId,
          maxAttempts: this.maxReconnectAttempts,
        })
        this.closeConnection(userId)
        // Sticky DEAD: no automatic re-try on next subscribe; only forceReconnect clears.
        // Emits to current subscribers so the UI can render a "Connection lost — retry" banner.
        this.deadUsers.add(userId)
        this.emitToSubscribers(userId, {
          event: "connection_dead",
          data: {
            userId,
            attempts,
            maxAttempts: this.maxReconnectAttempts,
            lastErrorAt: this.lastErrorAt.get(userId) ?? Date.now(),
          },
          timestamp: new Date().toISOString(),
        })
        return
      }

      const newAttempts = attempts + 1
      this.reconnectAttempts.set(userId, newAttempts)
      const delayMs = computeReconnectDelayMs(newAttempts)
      this.log.warn("attempting reconnect", {
        userId,
        attempt: newAttempts,
        maxAttempts: this.maxReconnectAttempts,
        delayMs,
      })

      this.closeConnection(userId)

      setTimeout(() => {
        const stillHasSubscribers =
          this.subscribers.has(userId) && (this.subscribers.get(userId)?.size || 0) > 0
        if (stillHasSubscribers && !this.connections.has(userId) && !this.deadUsers.has(userId)) {
          this.createConnection(userId)
        }
      }, delayMs)
    }
  }

  /**
   * Manually re-attempt a dead/closed connection. Used by the "Reconnect now"
   * UI affordance the dashboard renders when it sees a `connection_dead` event,
   * and by the tab-back/online listeners after a long sleep.
   *
   * Throttled by SSE_FORCE_RECONNECT_THROTTLE_MS — the first call within a
   * window actually reconnects; subsequent calls are no-ops. This is what
   * keeps the 7 lean-hook visibilitychange handlers from each tearing down
   * and recreating the EventSource sequentially on every tab-back.
   */
  forceReconnect(userId: string): void {
    const now = Date.now()
    const last = this.lastForceReconnectAt.get(userId) ?? 0
    if (now - last < SSE_FORCE_RECONNECT_THROTTLE_MS) {
      this.log.debug("forceReconnect throttled", { userId, sinceLastMs: now - last })
      return
    }
    this.lastForceReconnectAt.set(userId, now)
    this.log.info("forceReconnect", { userId })
    this.deadUsers.delete(userId)
    this.reconnectAttempts.set(userId, 0)
    this.closeConnection(userId)
    this.ensureConnection(userId)
  }

  /**
   * Close SSE connection for a user.
   * Does NOT touch reconnectAttempts — that counter must persist across the
   * close→retry cycle so the budget can actually exhaust. Clearing it lives
   * in unsubscribe (real teardown) and onopen (successful reconnect).
   */
  private closeConnection(userId: string): void {
    const eventSource = this.connections.get(userId)
    if (eventSource) {
      this.log.debug("closing SSE connection", { userId })
      eventSource.close()
      this.connections.delete(userId)
    }
  }

  /**
   * Check if connection exists for a user
   */
  isConnected(userId: string): boolean {
    if (typeof window === 'undefined') return false
    const eventSource = this.connections.get(userId)
    if (!eventSource) return false
    // EventSource.OPEN = 1
    return eventSource.readyState === 1
  }

  /**
   * Get connection state
   */
  getConnectionState(userId: string): 'connecting' | 'open' | 'closed' {
    if (typeof window === 'undefined') return 'closed'
    const eventSource = this.connections.get(userId)
    if (!eventSource) return 'closed'

    switch (eventSource.readyState) {
      case EventSource.CONNECTING:
        return 'connecting'
      case EventSource.OPEN:
        return 'open'
      case EventSource.CLOSED:
        return 'closed'
      default:
        return 'closed'
    }
  }

  getLastEventAt(userId: string): number | null {
    return this.lastEventAt.get(userId) ?? null
  }

  getLastErrorAt(userId: string): number | null {
    return this.lastErrorAt.get(userId) ?? null
  }
}

// Singleton instance
const sseManager = new SharedSSEManager()

/**
 * Manually re-attempt the shared SSE stream for a given userId. Use this from
 * UI components that want to drive a "Reconnect now" affordance after seeing a
 * `connection_dead` event — the dashboard renders this when the SSE retry
 * budget is exhausted.
 *
 * Wraps the singleton method and inherits its 1.5s coalescence throttle so
 * spamming the button doesn't reopen the stream repeatedly.
 */
export function forceReconnectSharedSSE(userId: string | undefined | null): void {
  if (!userId) return
  sseManager.forceReconnect(userId)
}

/**
 * Lean shared-SSE subscriber — subscribes to the event stream only.
 *
 * Use this when you don't need React state for connection status pills.
 * That's the case for almost every event-consuming hook (orders, positions,
 * account, notifications, watchlist, position-history, trading-realtime
 * provider): they only care about the inbound message stream and never read
 * back `isConnected` / `connectionState` / `lastEventAt`. Using the full
 * `useSharedSSE` for those would create one extra setInterval(30s) and three
 * extra `addEventListener` registrations per hook for state nobody reads.
 *
 * For UIs that DO render connection-status pills (admin console, etc.), use
 * the original `useSharedSSE` below.
 */
export function useSharedSSESubscribe(
  userId: string | undefined | null,
  onEvent: EventCallback,
): void {
  const onEventRef = useRef(onEvent)
  const log = useRef(createClientLogger("SHARED-SSE-SUB")).current

  // Keep callback ref updated without triggering subscribe/unsubscribe churn.
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return

    log.debug("setting up subscription", { userId })

    const unsubscribe = sseManager.subscribe(userId, (message) => {
      onEventRef.current(message)
    })

    // Tab-back + online recovery — the dashboard SSE provider uses this lean
    // hook, and the previous version omitted these listeners (they only lived
    // in the full useSharedSSE), so a backgrounded tab + retry-budget exhaustion
    // left the dashboard's order/position/account stream permanently dead until
    // page reload. forceReconnect() clears the sticky DEAD flag and resets the
    // attempt counter so we get a real fresh window.
    const reconnectIfWarranted = () => {
      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) return
        sseManager.forceReconnect(userId)
      } catch (err) {
        log.warn("forceReconnect failed", { userId, message: (err as any)?.message || String(err) })
      }
    }

    const handleOnline = () => {
      log.debug("online → forceReconnect", { userId })
      reconnectIfWarranted()
    }

    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return
      // Skip if connection is currently OPEN — visibility tick on already-live stream is noise.
      if (sseManager.isConnected(userId)) return
      log.debug("tab visible + stream not open → forceReconnect", { userId })
      reconnectIfWarranted()
    }

    window.addEventListener("online", handleOnline)
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      log.debug("cleaning up subscription", { userId })
      window.removeEventListener("online", handleOnline)
      document.removeEventListener("visibilitychange", handleVisibility)
      unsubscribe()
    }
  }, [userId, log])
}

/**
 * Shared SSE Hook (full surface — subscription + reactive connection state)
 *
 * Use this hook to subscribe to real-time events AND render connection-status
 * UI (badges, pills, "last event at" timestamps).
 *
 * If you only need to react to events and don't render any of the returned
 * fields, prefer `useSharedSSESubscribe` — it skips the polling + listeners
 * needed to keep the React state in sync with the singleton manager.
 *
 * All hooks sharing the same userId will use a SINGLE SSE connection.
 *
 * @param userId - User ID to subscribe to
 * @param onEvent - Callback function for events
 * @returns Connection state
 */
export function useSharedSSE(
  userId: string | undefined | null,
  onEvent: EventCallback
) {
  const onEventRef = useRef(onEvent)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const log = useRef(createClientLogger("SHARED-SSE-HOOK")).current

  // Keep callback ref updated
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  // Subscribe to events
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return

    log.debug("setting up subscription", { userId })

    // Subscribe with stable callback
    const unsubscribe = sseManager.subscribe(userId, (message) => {
      onEventRef.current(message)
    })

    unsubscribeRef.current = unsubscribe

    // Cleanup on unmount
    return () => {
      log.debug("cleaning up subscription", { userId })
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }
  }, [userId])

  // Only check connection state on client-side to avoid SSR issues
  const [connectionState, setConnectionState] = React.useState<'connecting' | 'open' | 'closed'>('closed')
  const [isConnected, setIsConnected] = React.useState(false)
  const [lastEventAt, setLastEventAt] = React.useState<number | null>(null)
  const [lastErrorAt, setLastErrorAt] = React.useState<number | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !userId) {
      setIsConnected(false)
      setConnectionState('closed')
      setLastEventAt(null)
      setLastErrorAt(null)
      return
    }

    // Check connection state
    const checkState = () => {
      setIsConnected(sseManager.isConnected(userId))
      setConnectionState(sseManager.getConnectionState(userId))
      setLastEventAt(sseManager.getLastEventAt(userId))
      setLastErrorAt(sseManager.getLastErrorAt(userId))
    }

    checkState()

    // Connection-state poll: only used to refresh the React state mirror of EventSource.readyState
    // for status pills. Real (re)connect signal comes from EventSource.onopen/onerror; this is
    // only a fallback for components that read connectionState. 30s avoids excessive re-renders.
    const interval = setInterval(checkState, 30000)

    const handleVisibilityOrNetwork = () => {
      // quick probe when user comes back / network changes — use forceReconnect
      // so DEAD state recovers (was: ensureConnection, which silently no-op'd
      // after the connection had been marked DEAD by retry-budget exhaustion).
      if (navigator.onLine && !sseManager.isConnected(userId)) {
        sseManager.forceReconnect(userId)
      }
      checkState()
    }

    window.addEventListener('online', handleVisibilityOrNetwork)
    window.addEventListener('offline', handleVisibilityOrNetwork)
    document.addEventListener('visibilitychange', handleVisibilityOrNetwork)
    
    return () => {
      clearInterval(interval)
      window.removeEventListener('online', handleVisibilityOrNetwork)
      window.removeEventListener('offline', handleVisibilityOrNetwork)
      document.removeEventListener('visibilitychange', handleVisibilityOrNetwork)
    }
  }, [userId])

  return {
    isConnected,
    connectionState,
    lastEventAt,
    lastErrorAt,
  }
}

// Module init logs intentionally omitted (noisy on route transitions).

