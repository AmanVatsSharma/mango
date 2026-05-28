/**
 * @file RealtimeEventEmitter.ts
 * @module realtime
 * @description Server-Sent Events (SSE) event emitter for real-time updates
 * Manages SSE connections per user and emits events to connected clients
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-03
 *
 * Notes:
 * - Trading dashboard presence (Redis / admin UI) is touched on subscribe and heartbeat, cleared when last SSE drops.
 * - Publishes admin presence deltas (Redis pub/sub) only when a user’s first SSE connects or last disconnects.
 */

import type { SSEMessage } from '@/types/realtime'
import { baseLogger } from '@/lib/observability/logger'
import {
  isRedisRealtimeEnabled,
  publishBroadcastMessage,
  publishUserMessage,
  subscribeBroadcastMessages,
  subscribeAdminPnlBroadcast,
  subscribeAdminEventsBroadcast,
  subscribeUserMessages,
} from "@/lib/services/realtime/redis-realtime-bus"
import {
  clearTradingDashboardPresence,
  publishTradingDashboardPresenceDelta,
  touchTradingDashboardPresence,
} from "@/lib/services/realtime/trading-dashboard-presence"

/**
 * Realtime Event Emitter
 * 
 * Manages SSE connections and broadcasts events to connected clients.
 * Thread-safe event emission using Set for multiple connections per user.
 */
export class RealtimeEventEmitter {
  private readonly log = baseLogger.child({ module: "realtime-emitter" })
  private connections: Map<string, Set<ReadableStreamDefaultController<Uint8Array>>> = new Map()
  private redisUnsubs: Map<string, () => void> = new Map()
  private broadcastUnsub: (() => void) | null = null
  private adminPnlUnsub: (() => void) | null = null
  private adminEventsUnsub: (() => void) | null = null
  // Admin SSE connections — shared pool for both PNL and lifecycle events.
  private adminConnections: Set<ReadableStreamDefaultController<Uint8Array>> = new Set()

  // Trading-t3c: per-user Redis-fanout health. `healthy: true` means the
  // user's cross-process subscription is up; `false` means all retry
  // attempts failed and events from OTHER replicas will not arrive at
  // this user's SSE on this process. Lets ops dashboards / health
  // endpoints surface multi-replica fanout death rather than discovering
  // it from missing-event reports.
  private redisFanoutHealth: Map<
    string,
    { healthy: boolean; lastAttemptAt: number; attempts: number; lastErrorMessage?: string }
  > = new Map()
  private readonly REDIS_SUBSCRIBE_RETRY_ATTEMPTS = 3
  private readonly REDIS_SUBSCRIBE_BASE_DELAY_MS = 500
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private readonly HEARTBEAT_INTERVAL = 30_000

  constructor() {
    this.log.info("initialized")
    this.startHeartbeat()
    void this.setupBroadcastSubscription()
    void this.setupAdminPnlSubscription()
    void this.setupAdminEventsSubscription()
  }

  /**
   * Trading-t3c: subscribe a user to the per-user Redis pub/sub channel
   * with bounded exponential-backoff retry. Marks redisFanoutHealth so
   * ops surfaces (admin dashboard, health endpoint) can see when a user's
   * cross-process subscription is dead even though their SSE is up.
   *
   * Fail-open philosophy: a failed Redis subscribe does NOT close the SSE
   * connection — same-process events still flow normally; only cross-replica
   * fanout is degraded. Marking unhealthy makes the degradation visible.
   */
  private async subscribeUserWithRetry(userId: string): Promise<void> {
    let lastError: unknown = null
    for (let attempt = 1; attempt <= this.REDIS_SUBSCRIBE_RETRY_ATTEMPTS; attempt++) {
      try {
        const unsub = await subscribeUserMessages(userId, (payload) => {
          // Redis-delivered messages should not be re-published; deliver locally only.
          this.emitLocal(userId, payload)
        })
        // Check if unsubscribe happened during the await (last subscriber left)
        if (!this.connections.has(userId)) {
          try { unsub() } catch { /* ignore */ }
          // Don't update health — user is gone.
          return
        }
        this.redisUnsubs.set(userId, unsub)
        this.redisFanoutHealth.set(userId, {
          healthy: true,
          lastAttemptAt: Date.now(),
          attempts: attempt,
        })
        if (attempt > 1) {
          this.log.info({ userId, attempt }, "redis subscribe recovered after retries")
        }
        return
      } catch (e) {
        lastError = e
        const isLast = attempt === this.REDIS_SUBSCRIBE_RETRY_ATTEMPTS
        const delay = this.REDIS_SUBSCRIBE_BASE_DELAY_MS * Math.pow(2, attempt - 1)
        this.log.warn(
          { userId, attempt, isLast, message: (e as any)?.message || String(e) },
          "redis subscribe failed",
        )
        if (!isLast) await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
    // All retries exhausted — mark unhealthy. Use error-level log so ops dashboards pick it up.
    this.redisFanoutHealth.set(userId, {
      healthy: false,
      lastAttemptAt: Date.now(),
      attempts: this.REDIS_SUBSCRIBE_RETRY_ATTEMPTS,
      lastErrorMessage: (lastError as any)?.message || String(lastError),
    })
    this.log.error(
      { userId, message: (lastError as any)?.message || String(lastError) },
      "redis subscribe permanently failed — cross-replica events will not reach this user on this process",
    )
  }

  /**
   * Trading-t3c: ops-facing probe — true when this user's cross-process
   * Redis subscription is up. Same-process delivery is unaffected by this
   * value. Returns true when Redis is disabled (no subscription needed)
   * or when the user has no record (treats absence as "not yet failed").
   */
  isRealtimeFanoutHealthyForUser(userId: string): boolean {
    if (!isRedisRealtimeEnabled()) return true
    const entry = this.redisFanoutHealth.get(userId)
    if (!entry) return true
    return entry.healthy
  }

  /**
   * Subscribe once per process to the cross-process broadcast channel.
   * On receive, fan out to every local SSE connection regardless of userId.
   */
  private async setupBroadcastSubscription(): Promise<void> {
    if (!isRedisRealtimeEnabled() || this.broadcastUnsub) return
    try {
      this.broadcastUnsub = await subscribeBroadcastMessages((payload) => {
        this.fanoutLocalToAllUsers(payload)
      })
      this.log.info("broadcast channel subscribed")
    } catch (e) {
      this.log.warn({ message: (e as any)?.message || String(e) }, "broadcast subscribe failed")
    }
  }

  /**
   * Subscribe once per process to the admin PNL broadcast channel.
   * On receive, fan out to every connected admin SSE stream.
   */
  private async setupAdminPnlSubscription(): Promise<void> {
    if (!isRedisRealtimeEnabled() || this.adminPnlUnsub) return
    try {
      this.adminPnlUnsub = await subscribeAdminPnlBroadcast((payload) => {
        this.fanoutLocalToAdminConnections(payload)
      })
      this.log.info("admin PNL broadcast channel subscribed")
    } catch (e) {
      this.log.warn({ message: (e as any)?.message || String(e) }, "admin PNL broadcast subscribe failed")
    }
  }

  /**
   * Subscribe once per process to the admin events broadcast channel.
   * On receive, fan out to every connected admin SSE stream.
   * Used for position close/open events so all admin consoles stay in sync.
   */
  private async setupAdminEventsSubscription(): Promise<void> {
    if (!isRedisRealtimeEnabled() || this.adminEventsUnsub) return
    try {
      this.adminEventsUnsub = await subscribeAdminEventsBroadcast((payload) => {
        this.fanoutLocalToAdminConnections(payload)
      })
      this.log.info("admin events broadcast channel subscribed")
    } catch (e) {
      this.log.warn({ message: (e as any)?.message || String(e) }, "admin events broadcast subscribe failed")
    }
  }

  /**
   * Emit a position lifecycle event to all admin SSE streams.
   * Called directly from admin API routes (position close/open) — no Redis round-trip
   * for same-process delivery; cross-process delivery via publishAdminEventsBroadcast.
   */
  emitAdminEvent(event: SSEMessage["event"], data: SSEMessage["data"]): void {
    const message: SSEMessage = { event, data, timestamp: new Date().toISOString() }
    // Same-process fanout.
    this.fanoutLocalToAdminConnections(message)
    // Cross-process fanout.
    if (isRedisRealtimeEnabled()) {
      // Dynamic import to avoid circular — publishAdminEventsBroadcast is only used here.
      void import("@/lib/services/realtime/redis-realtime-bus").then(({ publishAdminEventsBroadcast }) => {
        publishAdminEventsBroadcast(message).catch(() => {})
      })
    }
  }

  /**
   * Subscribe an admin SSE connection to ALL position PNL broadcasts.
   * Use this for admin consoles that need live MTM across all positions.
   */
  subscribeAdmin(controller: ReadableStreamDefaultController<Uint8Array>): void {
    this.adminConnections.add(controller)
    this.log.info({ adminConnections: this.adminConnections.size }, "admin subscribed")
    // Lazy-start both Redis subscriptions on first admin subscriber.
    if (isRedisRealtimeEnabled()) {
      if (!this.adminPnlUnsub) void this.setupAdminPnlSubscription()
      if (!this.adminEventsUnsub) void this.setupAdminEventsSubscription()
    }
  }

  /**
   * Unsubscribe an admin SSE connection from PNL broadcasts.
   */
  unsubscribeAdmin(controller: ReadableStreamDefaultController<Uint8Array>): void {
    this.adminConnections.delete(controller)
    this.log.info({ adminConnections: this.adminConnections.size }, "admin unsubscribed")
  }

  /**
   * Fan out a message to every connected admin SSE stream.
   */
  private fanoutLocalToAdminConnections(message: SSEMessage): void {
    if (this.adminConnections.size === 0) return
    const messageText = `data: ${JSON.stringify(message)}\n\n`
    const encoder = new TextEncoder()
    const encoded = encoder.encode(messageText)
    this.log.debug({ event: message.event, adminConnections: this.adminConnections.size }, "fanoutToAdmins")
    const dead: ReadableStreamDefaultController<Uint8Array>[] = []
    this.adminConnections.forEach((controller) => {
      try {
        controller.enqueue(encoded)
      } catch {
        dead.push(controller)
      }
    })
    dead.forEach((c) => this.adminConnections.delete(c))
    if (dead.length > 0) {
      this.log.info({ dead: dead.length, remaining: this.adminConnections.size }, "cleaned dead admin connections")
    }
  }

  /**
   * Same-process fanout for admin PNL batch (called directly from worker, no Redis round-trip).
   * Wraps the payload in the SSE message envelope and fans out.
   */
  fanoutAdminPnlBatch(payload: import("@/types/realtime").PositionsPnLUpdatedEventData): void {
    if (this.adminConnections.size === 0) return
    const message: SSEMessage = {
      event: "positions_pnl_updated",
      data: payload,
      timestamp: new Date().toISOString(),
    }
    this.fanoutLocalToAdminConnections(message)
  }

  /**
   * Subscribe a user to realtime events
   * @param userId - User ID to subscribe
   * @param controller - SSE stream controller
   */
  subscribe(userId: string, controller: ReadableStreamDefaultController<Uint8Array>): void {
    this.log.info({ userId }, "subscribe")
    
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set())
    }
    
    this.connections.get(userId)!.add(controller)
    
    this.log.info({ userId, totalConnections: this.getConnectionCount() }, "subscribed")

    // Cross-process: ensure Redis subscription exists for this user (one per userId).
    // Trading-t3c: pre-fix the .catch() block only logged a warn — the SSE
    // connection went up but cross-process events from other replicas never
    // arrived for this user, with no retry, no health flag, and no admin
    // signal. Now: retry with exponential backoff and mark the user's fanout
    // as unhealthy if all retries fail so ops can see the gap.
    if (isRedisRealtimeEnabled() && !this.redisUnsubs.has(userId)) {
      void this.subscribeUserWithRetry(userId)
    }
    
    // Send initial connection message
    try {
      const welcomeMessage = `data: ${JSON.stringify({
        event: 'connected',
        data: { userId, timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString()
      })}\n\n`
      controller.enqueue(new TextEncoder().encode(welcomeMessage))
    } catch (error) {
      this.log.error({ userId, message: (error as any)?.message || String(error) }, "welcome_message_failed")
    }

    touchTradingDashboardPresence(userId)
    const afterSubscribeCount = this.connections.get(userId)?.size ?? 0
    if (afterSubscribeCount === 1) {
      publishTradingDashboardPresenceDelta(userId, true)
    }
  }

  /**
   * Unsubscribe a user from realtime events
   * @param userId - User ID to unsubscribe
   * @param controller - SSE stream controller to remove
   */
  unsubscribe(userId: string, controller: ReadableStreamDefaultController<Uint8Array>): void {
    this.log.info({ userId }, "unsubscribe")
    
    const userConnections = this.connections.get(userId)
    if (userConnections) {
      userConnections.delete(controller)
      
      // Clean up empty user entries
      if (userConnections.size === 0) {
        this.connections.delete(userId)

        const redisUnsub = this.redisUnsubs.get(userId)
        if (redisUnsub) {
          try {
            redisUnsub()
          } catch {
            // ignore
          }
          this.redisUnsubs.delete(userId)
        }
        // Trading-t3c: clear health entry so a returning user gets a fresh
        // retry budget instead of the prior failure marker.
        this.redisFanoutHealth.delete(userId)

        publishTradingDashboardPresenceDelta(userId, false)
        clearTradingDashboardPresence(userId)
      }
    }
    
    this.log.info({ userId, totalConnections: this.getConnectionCount() }, "unsubscribed")
  }

  /**
   * Emit an event to a specific user
   * @param userId - User ID to emit event to
   * @param event - Event type
   * @param data - Event data payload
   */
  emit(userId: string, event: SSEMessage['event'], data: SSEMessage['data']): void {
    const message: SSEMessage = {
      event,
      data,
      timestamp: new Date().toISOString()
    }

    // Deliver locally to any connected SSE clients in THIS process.
    this.emitLocal(userId, message)

    // Publish to Redis bus so other processes (e.g. workers) can reach the app server SSE connections.
    if (isRedisRealtimeEnabled()) {
      publishUserMessage(userId, message).catch(() => {})
    }
  }

  /**
   * Emit a broadcast event to every connected SSE client (no userId targeting).
   * Used for system-wide notifications (target=ALL/USERS/ADMINS).
   */
  emitBroadcast(event: SSEMessage["event"], data: SSEMessage["data"]): void {
    const message: SSEMessage = {
      event,
      data,
      timestamp: new Date().toISOString(),
    }

    this.fanoutLocalToAllUsers(message)

    if (isRedisRealtimeEnabled()) {
      publishBroadcastMessage(message).catch(() => {})
    }
  }

  /**
   * Fan out a single message to every local connection across all userIds.
   */
  private fanoutLocalToAllUsers(message: SSEMessage): void {
    if (this.connections.size === 0) return
    this.connections.forEach((_controllers, userId) => {
      this.emitLocal(userId, message)
    })
  }

  /**
   * Emit to local connections ONLY (no Redis publish).
   */
  private emitLocal(userId: string, message: SSEMessage): void {
    const userConnections = this.connections.get(userId)
    if (!userConnections || userConnections.size === 0) return

    const messageText = `data: ${JSON.stringify(message)}\n\n`
    const encoder = new TextEncoder()
    const encoded = encoder.encode(messageText)

    this.log.debug({ userId, event: message.event, connections: userConnections.size }, "emitLocal")

    const deadConnections: ReadableStreamDefaultController<Uint8Array>[] = []
    userConnections.forEach((controller) => {
      try {
        controller.enqueue(encoded)
      } catch (error) {
        this.log.warn(
          { userId, event: message.event, message: (error as any)?.message || String(error) },
          "emit_failed_dead_connection",
        )
        deadConnections.push(controller)
      }
    })

    deadConnections.forEach((controller) => userConnections.delete(controller))
    if (deadConnections.length > 0) {
      this.log.info({ userId, dead: deadConnections.length }, "cleaned_dead_connections")
      if (userConnections.size === 0) {
        this.connections.delete(userId)
        const redisUnsub = this.redisUnsubs.get(userId)
        if (redisUnsub) {
          try {
            redisUnsub()
          } catch {
            // ignore
          }
          this.redisUnsubs.delete(userId)
        }
        publishTradingDashboardPresenceDelta(userId, false)
        clearTradingDashboardPresence(userId)
      }
    }
  }

  /**
   * Get total number of active connections
   */
  getConnectionCount(): number {
    let total = 0
    this.connections.forEach((connections) => {
      total += connections.size
    })
    return total
  }

  /**
   * Get number of connections for a specific user
   */
  getUserConnectionCount(userId: string): number {
    return this.connections.get(userId)?.size || 0
  }

  /**
   * Get total admin SSE connections
   */
  getAdminConnectionCount(): number {
    return this.adminConnections.size
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    // In test runs, avoid leaking timers that keep Jest alive.
    if (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID) {
      this.log.debug("test environment detected; heartbeat disabled")
      return
    }

    this.heartbeatInterval = setInterval(() => {
      const heartbeatMessage = `: heartbeat\n\n`
      const encoder = new TextEncoder()
      const encoded = encoder.encode(heartbeatMessage)

      let totalSent = 0
      const deadConnections: Array<{ userId: string; controller: ReadableStreamDefaultController<Uint8Array> }> = []
      const deadAdminConnections: ReadableStreamDefaultController<Uint8Array>[] = []

      this.connections.forEach((connections, userId) => {
        connections.forEach((controller) => {
          try {
            controller.enqueue(encoded)
            totalSent++
          } catch (error) {
            // Connection is dead
            deadConnections.push({ userId, controller })
          }
        })
      })

      // Also heartbeat admin connections
      this.adminConnections.forEach((controller) => {
        try {
          controller.enqueue(encoded)
          totalSent++
        } catch {
          deadAdminConnections.push(controller)
        }
      })

      // Clean up dead connections
      deadConnections.forEach(({ userId, controller }) => {
        const userConnections = this.connections.get(userId)
        if (userConnections) {
          userConnections.delete(controller)
          if (userConnections.size === 0) {
            this.connections.delete(userId)
            publishTradingDashboardPresenceDelta(userId, false)
            clearTradingDashboardPresence(userId)
          }
        }
      })

      // Clean up dead admin connections
      deadAdminConnections.forEach((c) => this.adminConnections.delete(c))

      this.connections.forEach((set, presenceUserId) => {
        if (set.size > 0) {
          touchTradingDashboardPresence(presenceUserId)
        }
      })

      if (totalSent > 0 || deadConnections.length > 0) {
        this.log.debug({ totalSent, cleaned: deadConnections.length }, "heartbeat")
      }
    }, this.HEARTBEAT_INTERVAL)

    // Do not keep the Node process alive solely for heartbeat.
    ;(this.heartbeatInterval as any)?.unref?.()
  }

  /**
   * Stop heartbeat and cleanup
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.broadcastUnsub) {
      try { this.broadcastUnsub() } catch { /* ignore */ }
      this.broadcastUnsub = null
    }
    if (this.adminPnlUnsub) {
      try { this.adminPnlUnsub() } catch { /* ignore */ }
      this.adminPnlUnsub = null
    }
    if (this.adminEventsUnsub) {
      try { this.adminEventsUnsub() } catch { /* ignore */ }
      this.adminEventsUnsub = null
    }
    this.connections.clear()
    this.adminConnections.clear()
    this.log.info("stopped")
  }
}

// Singleton instance
let eventEmitter: RealtimeEventEmitter | null = null

/**
 * Get the singleton event emitter instance
 */
export function getRealtimeEventEmitter(): RealtimeEventEmitter {
  if (!eventEmitter) {
    eventEmitter = new RealtimeEventEmitter()
  }
  return eventEmitter
}

