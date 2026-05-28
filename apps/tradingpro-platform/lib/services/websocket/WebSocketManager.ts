/**
 * File:        lib/services/websocket/WebSocketManager.ts
 * Module:      WebSocket · legacy native-WS manager (NOT the Socket.IO market-data path)
 * Purpose:     Optional client-side WebSocket transport for order/position/balance push events.
 *              Distinct from the Socket.IO-based market-data provider (lib/market-data/...).
 *
 * Exports:
 *   - getWebSocketManager() → WebSocketManager   — singleton accessor (browser-only)
 *   - WebSocketEvent                              — union of supported event names
 *   - WebSocketMessage                            — wire format
 *   - WebSocketCallback                           — listener signature
 *   - WebSocketLifecycleEvent                     — Trading-7dc: lifecycle events emitted to callers
 *   - WebSocketLifecycleCallback                  — Trading-7dc: lifecycle listener signature
 *   - WebSocketManager                            — class (for typing only; instantiate via getWebSocketManager)
 *
 * Side-effects:
 *   - Opens/closes a native WebSocket on `connect()` / `disconnect()`
 *   - Console logging (this module pre-dates the Pino logger; left in place)
 *
 * Key invariants:
 *   - Reconnect is bounded by `maxReconnectAttempts` (default 5). Trading-7dc: when the bound is
 *     hit, we now emit a `max_retries_reached` lifecycle event so consumers can surface the
 *     death loudly (banner / toast / re-trigger UI) instead of the previous silent
 *     `console.error` + stop. Without this, downstream UI never learnt the manager had given up.
 *   - shouldReconnect=false (explicit `disconnect()` / unmount) does NOT emit max_retries — that
 *     is a deliberate stop, not a failure.
 *
 * Read order:
 *   1. WebSocketLifecycleEvent — what failure surfaces look like to consumers
 *   2. reconnect() — where the max-retries event is fired
 *   3. onLifecycle() — how consumers subscribe
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

"use client"

console.log("🌐 [WEBSOCKET-MANAGER] Module loaded")

export type WebSocketEvent =
  | 'order_placed'
  | 'order_executed'
  | 'order_cancelled'
  | 'position_opened'
  | 'position_closed'
  | 'position_updated'
  | 'balance_updated'
  | 'margin_blocked'
  | 'margin_released'

export interface WebSocketMessage {
  event: WebSocketEvent
  data: any
  timestamp: string
  userId: string
}

export type WebSocketCallback = (message: WebSocketMessage) => void

/**
 * Trading-7dc: lifecycle events let consumers react to connection-level state instead of
 * silently losing data when the manager runs out of reconnect attempts.
 */
export type WebSocketLifecycleEvent =
  | { type: 'connected' }
  | { type: 'disconnected'; reason: 'unmount' | 'remote_close' | 'error' }
  | { type: 'reconnecting'; attempt: number; maxAttempts: number; nextDelayMs: number }
  | { type: 'max_retries_reached'; attempts: number }

export type WebSocketLifecycleCallback = (event: WebSocketLifecycleEvent) => void

class WebSocketManager {
  private ws: WebSocket | null = null
  private url: string
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private listeners: Map<WebSocketEvent, Set<WebSocketCallback>>
  private lifecycleListeners: Set<WebSocketLifecycleCallback> = new Set()
  private isConnecting = false
  private shouldReconnect = true
  private heartbeatInterval: NodeJS.Timeout | null = null
  private maxRetriesEmitted = false

  constructor(url?: string) {
    this.url = url || this.getWebSocketUrl()
    this.listeners = new Map()
    console.log("🏗️ [WEBSOCKET-MANAGER] Manager instance created")
  }

  /**
   * Get WebSocket URL from environment or construct from window.location
   */
  private getWebSocketUrl(): string {
    if (typeof window === 'undefined') return ''

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    return `${protocol}//${host}/api/ws`
  }

  /**
   * Connect to WebSocket server
   */
  connect(userId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      console.log("⚠️ [WEBSOCKET-MANAGER] Already connected or connecting")
      return
    }

    this.isConnecting = true
    this.shouldReconnect = true
    // A fresh connect() call is a deliberate retry — clear the "we gave up" flag so a future
    // exhaustion will emit again. (Without this, a manual reconnect after exhaustion would
    // never re-emit the failure event on a second exhaustion.)
    this.maxRetriesEmitted = false

    try {
      console.log("🔌 [WEBSOCKET-MANAGER] Connecting to:", this.url)
      this.ws = new WebSocket(`${this.url}?userId=${userId}`)

      this.ws.onopen = () => {
        console.log("✅ [WEBSOCKET-MANAGER] Connected")
        this.isConnecting = false
        this.reconnectAttempts = 0
        this.startHeartbeat()
        this.emitLifecycle({ type: 'connected' })
      }

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          console.log("📨 [WEBSOCKET-MANAGER] Message received:", message.event)
          this.handleMessage(message)
        } catch (error) {
          console.error("❌ [WEBSOCKET-MANAGER] Failed to parse message:", error)
        }
      }

      this.ws.onerror = (error) => {
        console.error("❌ [WEBSOCKET-MANAGER] Error:", error)
        this.isConnecting = false
      }

      this.ws.onclose = () => {
        console.log("🔌 [WEBSOCKET-MANAGER] Disconnected")
        this.isConnecting = false
        this.stopHeartbeat()
        this.emitLifecycle({
          type: 'disconnected',
          reason: this.shouldReconnect ? 'remote_close' : 'unmount',
        })

        if (this.shouldReconnect) {
          this.reconnect(userId)
        }
      }
    } catch (error) {
      console.error("❌ [WEBSOCKET-MANAGER] Connection failed:", error)
      this.isConnecting = false
      this.emitLifecycle({ type: 'disconnected', reason: 'error' })
      this.reconnect(userId)
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    console.log("🔌 [WEBSOCKET-MANAGER] Disconnecting")
    this.shouldReconnect = false
    this.stopHeartbeat()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * Reconnect with exponential backoff. Trading-7dc: emits `max_retries_reached` to all
   * lifecycle listeners when the cap is hit so the UI can surface the death loudly instead
   * of the previous silent stop.
   */
  private reconnect(userId: string): void {
    if (!this.shouldReconnect) {
      return
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (!this.maxRetriesEmitted) {
        console.error(
          "❌ [WEBSOCKET-MANAGER] Max reconnect attempts reached — emitting max_retries_reached lifecycle event",
        )
        this.maxRetriesEmitted = true
        this.emitLifecycle({ type: 'max_retries_reached', attempts: this.reconnectAttempts })
      }
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(
      `🔄 [WEBSOCKET-MANAGER] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    )
    this.emitLifecycle({
      type: 'reconnecting',
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      nextDelayMs: delay,
    })

    setTimeout(() => {
      this.connect(userId)
    }, delay)
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000) // Every 30 seconds
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: WebSocketMessage): void {
    const listeners = this.listeners.get(message.event)

    if (listeners && listeners.size > 0) {
      listeners.forEach(callback => {
        try {
          callback(message)
        } catch (error) {
          console.error("❌ [WEBSOCKET-MANAGER] Callback error:", error)
        }
      })
    }
  }

  /**
   * Emit lifecycle event to all subscribers. Errors in listeners are isolated.
   */
  private emitLifecycle(event: WebSocketLifecycleEvent): void {
    if (this.lifecycleListeners.size === 0) return
    this.lifecycleListeners.forEach((cb) => {
      try {
        cb(event)
      } catch (err) {
        console.error("❌ [WEBSOCKET-MANAGER] Lifecycle listener error:", err)
      }
    })
  }

  /**
   * Subscribe to event
   */
  on(event: WebSocketEvent, callback: WebSocketCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }

    this.listeners.get(event)!.add(callback)
    console.log(`👂 [WEBSOCKET-MANAGER] Subscribed to: ${event}`)

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(event)
      if (listeners) {
        listeners.delete(callback)
        console.log(`👋 [WEBSOCKET-MANAGER] Unsubscribed from: ${event}`)
      }
    }
  }

  /**
   * Trading-7dc: subscribe to lifecycle events (connected / disconnected / reconnecting /
   * max_retries_reached). Returns an unsubscribe function. UI consumers should listen for
   * `max_retries_reached` and surface a banner with a "Retry connection" button that calls
   * `connect(userId)` again — the manager will reset its retry counter and emit fresh
   * lifecycle events.
   */
  onLifecycle(callback: WebSocketLifecycleCallback): () => void {
    this.lifecycleListeners.add(callback)
    return () => {
      this.lifecycleListeners.delete(callback)
    }
  }

  /**
   * Send message to server
   */
  send(event: string, data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, data }))
      console.log(`📤 [WEBSOCKET-MANAGER] Sent: ${event}`)
    } else {
      console.warn("⚠️ [WEBSOCKET-MANAGER] Cannot send, not connected")
    }
  }

  /**
   * Get connection state
   */
  getState(): 'connecting' | 'open' | 'closing' | 'closed' {
    if (!this.ws) return 'closed'

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting'
      case WebSocket.OPEN:
        return 'open'
      case WebSocket.CLOSING:
        return 'closing'
      case WebSocket.CLOSED:
        return 'closed'
      default:
        return 'closed'
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Trading-7dc: has the manager exhausted its reconnect attempts? Useful for UI on mount
   * so a freshly-rendered banner can show the dead state without waiting for a new event.
   */
  hasGivenUp(): boolean {
    return this.maxRetriesEmitted
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null

/**
 * Get WebSocket manager instance
 */
export function getWebSocketManager(): WebSocketManager {
  if (typeof window === 'undefined') {
    // Server-side, return dummy instance
    return new WebSocketManager()
  }

  if (!wsManager) {
    wsManager = new WebSocketManager()
  }

  return wsManager
}

export type { WebSocketManager }

console.log("✅ [WEBSOCKET-MANAGER] Module initialized")
