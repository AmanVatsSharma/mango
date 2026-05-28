/**
 * File:        hooks/admin/use-admin-pnl-sse.ts
 * Module:      Admin · Realtime PNL Hooks
 * Purpose:     Enterprise-grade SSE hook for admin consoles to receive live position PNL updates.
 *              Connects to /api/admin/presence/pnl-stream which fans out ALL positions' PNL
 *              across all users — not scoped to a single userId.
 *
 * Exports:
 *   - useAdminPnLSSE(config)
 *       → { connectionState, isConnected, lastEventAt, lastErrorAt, latestBatch, applyUpdates(), forceReconnect() }
 *   - useAdminPnLSSEState(userId, options)
 *       → same surface + live React state mirror of connection status
 *
 * Depends on:
 *   - hooks/admin/ — admin-specific hooks directory
 *   - SSE endpoint: /api/admin/presence/pnl-stream
 *
 * Side-effects:
 *   - Opens one EventSource per session (keyed by an internal symbol)
 *   - Registers window online/visibilitychange listeners for tab-back recovery
 *
 * Key invariants:
 *   - Does NOT require userId prop — endpoint validates session server-side.
 *   - Reconnect: bounded exponential backoff base=1s, cap=60s, ±20% jitter, max 30 attempts.
 *   - On budget exhausted: synthetic `connection_dead` state; call forceReconnect() to reset.
 *   - Deduplication: each position update is keyed by `positionId + updatedAtMs`; re-delivered
 *     same-tick events (from reconnect or multi-process fanout) are dropped.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-11
 */

"use client"

import { useEffect, useRef, useState, useCallback, type RefObject } from "react"

/* ─────────────────────────────────────────────────────────────────────────────
 * Types
 * ─────────────────────────────────────────────────────────────────────────── */

export type AdminPnlConnectionState = "connecting" | "open" | "closed" | "dead"

export interface AdminPnlUpdate {
  positionId: string
  unrealizedPnL: number
  dayPnL: number
  currentPrice?: number
  prevClose?: number
  quoteReceivedAtMs?: number
  updatedAtMs: number
}

export interface AdminPnlBatch {
  updates: AdminPnlUpdate[]
  receivedAt: number
  source: "sse"
}

export interface UseAdminPnLSSEOptions {
  /** Called immediately on every batch — useful for imperative updates (no re-render). */
  onBatch?: (batch: AdminPnlBatch) => void
  /** Enable tab-back / network recovery (default: true). */
  autoRecover?: boolean
  /** Time in ms after which the LTP is considered stale and a reconnect is triggered (default: 30s). */
  staleThresholdMs?: number
}

export interface UseAdminPnLSSEState {
  connectionState: AdminPnlConnectionState
  isConnected: boolean
  lastEventAt: number | null
  lastErrorAt: number | null
  latestBatch: AdminPnlBatch | null
  /** Apply a batch to React state. Returns whether anything changed. */
  applyUpdates: (batch: AdminPnlBatch) => boolean
  /** Manually trigger reconnect after connection_dead state. */
  forceReconnect: () => void
}

/* ─────────────────────────────────────────────────────────────────────────────
 * SSE reconnection constants (mirrors use-shared-sse.ts for consistency)
 * ─────────────────────────────────────────────────────────────────────────── */

const RECONNECT_BASE_MS = 1_000
const RECONNECT_CAP_MS = 60_000
const RECONNECT_JITTER = 0.2
const MAX_RECONNECT_ATTEMPTS = 30
const FORCE_RECONNECT_THROTTLE_MS = 1_500
const SSE_ENDPOINT = "/api/admin/presence/pnl-stream"

function computeReconnectDelay(attempt: number): number {
  const exp = RECONNECT_BASE_MS * Math.pow(2, Math.max(0, attempt - 1))
  const capped = Math.min(RECONNECT_CAP_MS, exp)
  const jitter = capped * RECONNECT_JITTER * (Math.random() * 2 - 1)
  return Math.max(RECONNECT_BASE_MS, Math.floor(capped + jitter))
}

/** Deduplication key — same positionId + updatedAtMs means same event. */
function dedupKey(u: AdminPnlUpdate): string {
  return `${u.positionId}:${u.updatedAtMs}`
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Singleton SSE manager per session
 * Manages a single EventSource and fans out to all subscribers.
 * ─────────────────────────────────────────────────────────────────────────── */

type AdminPnLCallback = (batch: AdminPnlBatch) => void
type StatusCallback = (state: AdminPnlConnectionState) => void

class AdminPnLSSEConnectionManager {
  private es: EventSource | null = null
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private subscribers: Set<AdminPnLCallback> = new Set()
  private statusSubscribers: Set<StatusCallback> = new Set()
  private lastEventAt = 0
  private lastErrorAt = 0
  private state: AdminPnlConnectionState = "closed"
  private dead = false
  private lastForceReconnectAt = 0
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null
  private staleThresholdMs: number

  constructor(staleThresholdMs = 30_000) {
    this.staleThresholdMs = staleThresholdMs
  }

  private setState(s: AdminPnlConnectionState) {
    this.state = s
    this.statusSubscribers.forEach((cb) => cb(s))
  }

  private emitBatch(batch: AdminPnlBatch) {
    this.lastEventAt = Date.now()
    this.subscribers.forEach((cb) => cb(batch))
  }

  connect() {
    if (typeof window === "undefined") return
    if (this.es) return
    if (this.dead) return

    this.setState("connecting")
    this.es = new EventSource(SSE_ENDPOINT)

    this.es.onopen = () => {
      this.reconnectAttempt = 0
      this.lastEventAt = Date.now()
      this.setState("open")
    }

    this.es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data)
        const event = parsed?.event
        const data = parsed?.data

        if (event === "connected") {
          this.lastEventAt = Date.now()
          this.setState("open")
          return
        }

        if (event === "positions_pnl_updated") {
          if (!Array.isArray(data?.updates)) return
          const batch: AdminPnlBatch = {
            updates: data.updates,
            receivedAt: Date.now(),
            source: "sse",
          }
          this.emitBatch(batch)
          return
        }
      } catch {
        /* malformed message */
      }
    }

    this.es.onerror = () => {
      this.lastErrorAt = Date.now()
      if (!this.es) return

      if (this.es.readyState === EventSource.CLOSED || this.subscribers.size === 0) {
        this.setState("closed")
        return
      }

      if (this.reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
        this.dead = true
        this.setState("dead")
        this.close()
        return
      }

      this.reconnectAttempt++
      this.setState("connecting")
      const delay = computeReconnectDelay(this.reconnectAttempt)
      this.close()
      this.reconnectTimer = setTimeout(() => {
        if (this.subscribers.size > 0 && !this.dead) {
          this.connect()
        }
      }, delay)
    }

    // Stale heartbeat check — if no events for staleThresholdMs, force a reconnect.
    this.staleCheckTimer = setInterval(() => {
      if (this.state !== "open") return
      if (this.subscribers.size === 0) return
      const elapsed = Date.now() - this.lastEventAt
      if (elapsed > this.staleThresholdMs) {
        // Stale — reconnect silently
        this.reconnectAttempt++
        this.close()
        if (this.reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
          const delay = computeReconnectDelay(this.reconnectAttempt)
          this.reconnectTimer = setTimeout(() => {
            if (this.subscribers.size > 0 && !this.dead) this.connect()
          }, delay)
        }
      }
    }, this.staleThresholdMs / 2)
  }

  private close() {
    if (this.es) {
      this.es.close()
      this.es = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  destroy() {
    this.close()
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer)
      this.staleCheckTimer = null
    }
    this.subscribers.clear()
    this.statusSubscribers.clear()
    this.state = "closed"
    this.dead = false
    this.reconnectAttempt = 0
  }

  forceReconnect() {
    const now = Date.now()
    if (now - this.lastForceReconnectAt < FORCE_RECONNECT_THROTTLE_MS) return
    this.lastForceReconnectAt = now

    this.dead = false
    this.reconnectAttempt = 0
    this.close()
    this.connect()
  }

  subscribe(onBatch: AdminPnLCallback): () => void {
    this.subscribers.add(onBatch)
    if (this.subscribers.size === 1) {
      this.connect()
    }
    return () => {
      this.subscribers.delete(onBatch)
      if (this.subscribers.size === 0) {
        this.destroy()
      }
    }
  }

  subscribeStatus(onStatus: StatusCallback): () => void {
    this.statusSubscribers.add(onStatus)
    // Emit current state immediately
    onStatus(this.state)
    return () => {
      this.statusSubscribers.delete(onStatus)
    }
  }

  getState(): AdminPnlConnectionState { return this.state }
  getLastEventAt(): number { return this.lastEventAt }
  getLastErrorAt(): number { return this.lastErrorAt }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Singleton per session
 * ─────────────────────────────────────────────────────────────────────────── */

let _manager: AdminPnLSSEConnectionManager | null = null

function getManager(staleThresholdMs?: number): AdminPnLSSEConnectionManager {
  if (!_manager) {
    _manager = new AdminPnLSSEConnectionManager(staleThresholdMs ?? 30_000)
  }
  return _manager
}

/** Destroy the manager — call on full session logout. */
export function destroyAdminPnLSSE(): void {
  if (_manager) {
    _manager.destroy()
    _manager = null
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Hook: useAdminPnLSSEState — full state surface
 * ─────────────────────────────────────────────────────────────────────────── */

export function useAdminPnLSSEState(
  options: UseAdminPnLSSEOptions = {},
): UseAdminPnLSSEState {
  const { onBatch, autoRecover = true, staleThresholdMs = 30_000 } = options

  const onBatchRef = useRef(onBatch)
  useEffect(() => { onBatchRef.current = onBatch }, [onBatch])

  const manager = useRef<AdminPnLSSEConnectionManager | null>(null)
  // Lazily init so the ref is stable across renders.
  if (!manager.current) {
    manager.current = getManager(staleThresholdMs)
  }

  const [connectionState, setConnectionState] = useState<AdminPnlConnectionState>("closed")
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const [lastErrorAt, setLastErrorAt] = useState<number | null>(null)
  const [latestBatch, setLatestBatch] = useState<AdminPnlBatch | null>(null)

  // Deduplication map — prevents re-applying the same update after reconnect.
  const dedupRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const m = manager.current!
    if (!m) return

    const unsubStatus = m.subscribeStatus((s) => {
      setConnectionState(s)
      if (s === "open") setLastEventAt(m.getLastEventAt())
      if (s === "closed" || s === "dead") setLastErrorAt(m.getLastErrorAt())
    })

    const unsubBatch = m.subscribe((batch) => {
      // Deduplicate — drop updates we've already applied.
      const unique: AdminPnlUpdate[] = []
      for (const u of batch.updates) {
        const key = dedupKey(u)
        if (dedupRef.current.has(key)) continue
        dedupRef.current.add(key)
        unique.push(u)
      }
      // Keep dedup set bounded — drop entries older than 5 minutes.
      const cutoff = Date.now() - 5 * 60 * 1000
      dedupRef.current.forEach((k) => {
        const ts = Number(k.split(":")[1])
        if (isNaN(ts) || ts < cutoff) dedupRef.current.delete(k)
      })

      const dedupedBatch: AdminPnlBatch = { ...batch, updates: unique }
      setLatestBatch(dedupedBatch)
      onBatchRef.current?.(dedupedBatch)
    })

    // Tab-back / network recovery.
    const handleOnline = () => {
      if (navigator.onLine && m.getState() !== "open") {
        m.forceReconnect()
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && m.getState() !== "open") {
        m.forceReconnect()
      }
    }

    const cleanup = () => {
      unsubStatus()
      unsubBatch()
      window.removeEventListener("online", handleOnline)
      document.removeEventListener("visibilitychange", handleVisibility)
    }

    if (autoRecover) {
      window.addEventListener("online", handleOnline)
      document.addEventListener("visibilitychange", handleVisibility)
    }

    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyUpdates = useCallback((batch: AdminPnlBatch): boolean => {
    const hasUpdates = batch.updates.length > 0
    if (hasUpdates) {
      setLatestBatch(batch)
    }
    return hasUpdates
  }, [])

  const forceReconnect = useCallback(() => {
    manager.current?.forceReconnect()
  }, [])

  return {
    connectionState,
    isConnected: connectionState === "open",
    lastEventAt,
    lastErrorAt,
    latestBatch,
    applyUpdates,
    forceReconnect,
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Hook: useAdminPnLSSE — lean variant (no React state, imperative only)
 * Perfect for panels that already have their own polling state and just
 * need to apply SSE patches imperatively.
 * ─────────────────────────────────────────────────────────────────────────── */

export function useAdminPnLSSE(
  onBatch: (batch: AdminPnlBatch) => void,
  options: Omit<UseAdminPnLSSEOptions, "onBatch"> = {},
): { forceReconnect: () => void } {
  const onBatchRef = useRef(onBatch)
  useEffect(() => { onBatchRef.current = onBatch }, [onBatch])

  const { autoRecover, staleThresholdMs } = options
  const manager = useRef<AdminPnLSSEConnectionManager | null>(null)
  if (!manager.current) {
    manager.current = getManager(staleThresholdMs ?? 30_000)
  }

  // Deduplication ref — survives across re-renders but is cleared on component unmount.
  const dedupRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const m = manager.current!
    if (!m) return

    const unsub = m.subscribe((batch) => {
      // Deduplicate within this subscriber.
      const unique: AdminPnlUpdate[] = []
      for (const u of batch.updates) {
        const key = dedupKey(u)
        if (dedupRef.current.has(key)) continue
        dedupRef.current.add(key)
        unique.push(u)
      }
      const cutoff = Date.now() - 5 * 60 * 1000
      dedupRef.current.forEach((k) => {
        const ts = Number(k.split(":")[1])
        if (isNaN(ts) || ts < cutoff) dedupRef.current.delete(k)
      })

      if (unique.length > 0) {
        onBatchRef.current({ ...batch, updates: unique })
      }
    })

    // Auto-recover tab-back / network.
    const handleOnline = () => {
      if (navigator.onLine && m.getState() !== "open") m.forceReconnect()
    }
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && m.getState() !== "open") m.forceReconnect()
    }
    if (options.autoRecover !== false) {
      window.addEventListener("online", handleOnline)
      document.addEventListener("visibilitychange", handleVisibility)
    }

    return () => {
      unsub()
      window.removeEventListener("online", handleOnline)
      document.removeEventListener("visibilitychange", handleVisibility)
      dedupRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { forceReconnect: () => manager.current?.forceReconnect() }
}
