/**
 * File:        tests/services/websocket-manager-lifecycle.test.ts
 * Module:      WebSocket · WebSocketManager · Trading-7dc max-retries lifecycle hardening
 * Purpose:     Trading-7dc — proves the legacy WebSocketManager now emits a
 *              `max_retries_reached` lifecycle event when reconnect is exhausted, instead of
 *              silently `console.error`-ing and stopping (which left consumers blind to the
 *              connection death and silently dropped all subsequent server pushes).
 *
 * Exports:     none (Jest)
 *
 * Side-effects: installs a fake WebSocket on globalThis; fakes timers; restored afterEach.
 *
 * Key invariants:
 *   - `connected` event fires on successful open
 *   - `reconnecting` event fires for every retry attempt with attempt/maxAttempts/nextDelayMs
 *   - `max_retries_reached` fires exactly once after the cap is hit
 *   - explicit `disconnect()` does NOT trigger max_retries (deliberate stop, not failure)
 *   - subsequent `connect()` resets the "we gave up" flag so a future exhaustion re-fires
 *
 * Read order:
 *   1. FakeWebSocket — minimal stand-in; we drive open/close manually
 *   2. test "emits max_retries_reached" — main assertion
 *   3. test "does not fire on explicit disconnect" — guards against false alarms
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

type LifecycleEvent =
  | { type: "connected" }
  | { type: "disconnected"; reason: string }
  | { type: "reconnecting"; attempt: number; maxAttempts: number; nextDelayMs: number }
  | { type: "max_retries_reached"; attempts: number }

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = FakeWebSocket.CONNECTING
  onopen: ((ev: any) => void) | null = null
  onclose: ((ev: any) => void) | null = null
  onerror: ((ev: any) => void) | null = null
  onmessage: ((ev: any) => void) | null = null

  // Helper: tests call this to immediately fail the connection
  static instances: FakeWebSocket[] = []
  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({})
  }
  send() {}
}

beforeEach(() => {
  jest.resetModules()
  jest.useFakeTimers()
  FakeWebSocket.instances = []
  ;(globalThis as any).WebSocket = FakeWebSocket
  ;(globalThis as any).window = { location: { protocol: "https:", host: "test.local" } }
})

afterEach(() => {
  jest.useRealTimers()
  delete (globalThis as any).WebSocket
  delete (globalThis as any).window
})

describe("WebSocketManager lifecycle — Trading-7dc max-retries event", () => {
  it("fires max_retries_reached after exhausting reconnect attempts (was silent before)", () => {
    const { getWebSocketManager } = require("@/lib/services/websocket/WebSocketManager")
    const mgr = getWebSocketManager()
    const events: LifecycleEvent[] = []
    mgr.onLifecycle((e: LifecycleEvent) => events.push(e))

    mgr.connect("user-1")

    // First socket opens, then dies — drives 5 reconnect cycles.
    // Default maxReconnectAttempts = 5, default reconnectDelay = 1000ms (exponential backoff).
    // Loop: simulate close → setTimeout fires → new socket → close → ...
    for (let i = 0; i < 6; i++) {
      const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
      // Force-close immediately (without going via mgr.disconnect — that flips shouldReconnect)
      ws.readyState = FakeWebSocket.CLOSED
      ws.onclose?.({})
      // Drain the scheduled reconnect timer
      jest.runOnlyPendingTimers()
    }

    const maxRetriesEvents = events.filter((e) => e.type === "max_retries_reached")
    expect(maxRetriesEvents).toHaveLength(1)
    expect(maxRetriesEvents[0]).toMatchObject({ type: "max_retries_reached", attempts: 5 })

    // hasGivenUp() reflects the dead state for late-mounting UI consumers
    expect(mgr.hasGivenUp()).toBe(true)
  })

  it("does NOT fire max_retries on an explicit disconnect (deliberate stop is not failure)", () => {
    const { getWebSocketManager } = require("@/lib/services/websocket/WebSocketManager")
    const mgr = getWebSocketManager()
    const events: LifecycleEvent[] = []
    mgr.onLifecycle((e: LifecycleEvent) => events.push(e))

    mgr.connect("user-1")
    mgr.disconnect()
    jest.runAllTimers()

    expect(events.some((e) => e.type === "max_retries_reached")).toBe(false)
  })

  it("emits 'reconnecting' for each attempt with monotonic attempt counter", () => {
    const { getWebSocketManager } = require("@/lib/services/websocket/WebSocketManager")
    const mgr = getWebSocketManager()
    const events: LifecycleEvent[] = []
    mgr.onLifecycle((e: LifecycleEvent) => events.push(e))

    mgr.connect("user-1")

    for (let i = 0; i < 6; i++) {
      const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
      ws.readyState = FakeWebSocket.CLOSED
      ws.onclose?.({})
      jest.runOnlyPendingTimers()
    }

    const reconnectingEvents = events.filter((e) => e.type === "reconnecting") as Array<
      Extract<LifecycleEvent, { type: "reconnecting" }>
    >
    expect(reconnectingEvents.length).toBe(5) // attempts 1..5; the 6th close → max_retries
    reconnectingEvents.forEach((ev, i) => {
      expect(ev.attempt).toBe(i + 1)
      expect(ev.maxAttempts).toBe(5)
      expect(ev.nextDelayMs).toBe(1000 * Math.pow(2, i))
    })
  })
})
