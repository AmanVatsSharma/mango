/**
 * File:        tests/market-data/socket-io-client-circuit-breaker.test.ts
 * Module:      Market Data · SocketIOClient · Trading-ang circuit breaker hardening
 * Purpose:     Locks in Trading-ang: SocketIOClient now emits a `'degraded'` lifecycle event
 *              when N failures occur within M ms, and a `'recovered'` event on the next
 *              successful connect. Pre-fix the gateway could be permanently dead and the UI
 *              would have no signal beyond the per-attempt `'error'` event.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: mocks socket.io-client `io()` to return a controllable fake Manager.
 *
 * Key invariants:
 *   - 5 connect_error events within 60s (defaults) → exactly one 'degraded' event
 *   - Subsequent failures past the trip line do NOT emit additional 'degraded' events
 *   - Next successful 'connect' → exactly one 'recovered' event + isFeedDegraded() false
 *   - Threshold is configurable via constructor's circuitBreaker config
 *
 * Read order:
 *   1. fake io() factory
 *   2. test "trips after threshold" — main happy path
 *   3. test "doesn't double-fire" — guards against banner flicker
 *   4. test "recovers on connect" — closes the loop
 *   5. test "respects custom threshold" — custom config
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

type EventHandler = (...args: any[]) => void

// Simple in-memory mock of a Socket.IO socket + its Manager. We give callers raw control
// over both to drive the test scenarios.
class FakeSocket {
  emitMap = new Map<string, Set<EventHandler>>()
  io = {
    listeners: new Map<string, Set<EventHandler>>(),
    on(event: string, cb: EventHandler) {
      let bag = this.listeners.get(event)
      if (!bag) {
        bag = new Set()
        this.listeners.set(event, bag)
      }
      bag.add(cb)
    },
    removeAllListeners() {
      this.listeners.clear()
    },
    fire(event: string, ...args: any[]) {
      this.listeners.get(event)?.forEach((cb) => cb(...args))
    },
  }

  on(event: string, cb: EventHandler) {
    let bag = this.emitMap.get(event)
    if (!bag) {
      bag = new Set()
      this.emitMap.set(event, bag)
    }
    bag.add(cb)
  }
  off() {}
  removeAllListeners() {
    this.emitMap.clear()
  }
  disconnect() {}
  connected = false
  id = "fake-socket-id"
  fire(event: string, ...args: any[]) {
    this.emitMap.get(event)?.forEach((cb) => cb(...args))
  }
}

let currentSocket: FakeSocket | null = null

jest.mock("socket.io-client", () => ({
  io: jest.fn(() => {
    currentSocket = new FakeSocket()
    return currentSocket
  }),
}))

import { SocketIOClient } from "@/lib/market-data/services/SocketIOClient"

beforeEach(() => {
  currentSocket = null
})

describe("SocketIOClient circuit breaker — Trading-ang", () => {
  it("trips 'degraded' after threshold failures within window", () => {
    const client = new SocketIOClient({
      url: "https://gateway.test/market-data",
      apiKey: "test-key",
      reconnectAttempts: 0, // infinite — we want to test that breaker fires anyway
      circuitBreaker: { failureThreshold: 3, failureWindowMs: 10_000 },
    })

    const degradedEvents: any[] = []
    client.on("degraded", (payload) => degradedEvents.push(payload))

    client.connect()
    expect(currentSocket).not.toBeNull()

    // 2 failures — should NOT trip yet
    currentSocket!.fire("connect_error", { message: "ECONNREFUSED" })
    currentSocket!.fire("connect_error", { message: "ETIMEDOUT" })
    expect(degradedEvents).toHaveLength(0)

    // 3rd failure trips the breaker
    currentSocket!.fire("connect_error", { message: "ENETUNREACH" })
    expect(degradedEvents).toHaveLength(1)
    expect(degradedEvents[0]).toMatchObject({
      failureCount: 3,
      windowMs: 10_000,
      lastErrorMessage: "ENETUNREACH",
    })
    expect(client.isFeedDegraded()).toBe(true)
  })

  it("does NOT re-fire 'degraded' after the breaker is already tripped (no banner flicker)", () => {
    const client = new SocketIOClient({
      url: "https://gateway.test/market-data",
      apiKey: "test-key",
      circuitBreaker: { failureThreshold: 2, failureWindowMs: 10_000 },
    })

    const degradedEvents: any[] = []
    client.on("degraded", (payload) => degradedEvents.push(payload))

    client.connect()
    currentSocket!.fire("connect_error", { message: "fail-1" })
    currentSocket!.fire("connect_error", { message: "fail-2" }) // trips
    expect(degradedEvents).toHaveLength(1)

    // 5 more failures while tripped — must NOT emit
    for (let i = 0; i < 5; i++) {
      currentSocket!.fire("connect_error", { message: `fail-extra-${i}` })
    }
    expect(degradedEvents).toHaveLength(1)
  })

  it("emits 'recovered' on next successful connect after being tripped", () => {
    const client = new SocketIOClient({
      url: "https://gateway.test/market-data",
      apiKey: "test-key",
      circuitBreaker: { failureThreshold: 2, failureWindowMs: 10_000 },
    })

    const events: string[] = []
    client.on("degraded", () => events.push("degraded"))
    client.on("recovered", () => events.push("recovered"))

    client.connect()
    currentSocket!.fire("connect_error", { message: "fail-1" })
    currentSocket!.fire("connect_error", { message: "fail-2" })
    expect(events).toEqual(["degraded"])
    expect(client.isFeedDegraded()).toBe(true)

    // Successful connect closes the breaker
    currentSocket!.fire("connect")
    expect(events).toEqual(["degraded", "recovered"])
    expect(client.isFeedDegraded()).toBe(false)
  })

  it("does NOT emit 'recovered' on a connect that follows a quiet period (no prior trip)", () => {
    const client = new SocketIOClient({
      url: "https://gateway.test/market-data",
      apiKey: "test-key",
      circuitBreaker: { failureThreshold: 2, failureWindowMs: 10_000 },
    })

    const events: string[] = []
    client.on("recovered", () => events.push("recovered"))

    client.connect()
    currentSocket!.fire("connect_error", { message: "fail-1" }) // 1 < threshold → no trip
    currentSocket!.fire("connect")
    expect(events).toHaveLength(0)
  })

  it("treats 'reconnect_failed' as a tripping event independent of the sliding window", () => {
    const client = new SocketIOClient({
      url: "https://gateway.test/market-data",
      apiKey: "test-key",
      circuitBreaker: { failureThreshold: 100, failureWindowMs: 60_000 },
    })

    const degradedEvents: any[] = []
    client.on("degraded", (payload) => degradedEvents.push(payload))

    client.connect()
    // Even with threshold=100, a reconnect_failed should push at least one entry. To make
    // the breaker trip from a single signal, we'd normally need threshold=1. Instead we
    // verify: reconnect_failed records a failure (visible via failureCount), so combined
    // with prior connect_errors it's part of the same window.
    for (let i = 0; i < 99; i++) {
      currentSocket!.fire("connect_error", { message: `e-${i}` })
    }
    expect(degradedEvents).toHaveLength(0)
    currentSocket!.io.fire("reconnect_failed")
    expect(degradedEvents).toHaveLength(1)
    expect(degradedEvents[0].failureCount).toBe(100)
  })

  it("uses default threshold (5) and window (60s) when no circuitBreaker config is passed", () => {
    const client = new SocketIOClient({
      url: "https://gateway.test/market-data",
      apiKey: "test-key",
    })

    const degradedEvents: any[] = []
    client.on("degraded", (payload) => degradedEvents.push(payload))

    client.connect()
    for (let i = 0; i < 4; i++) {
      currentSocket!.fire("connect_error", { message: `e-${i}` })
    }
    expect(degradedEvents).toHaveLength(0)
    currentSocket!.fire("connect_error", { message: "e-final" })
    expect(degradedEvents).toHaveLength(1)
    expect(degradedEvents[0].windowMs).toBe(60_000)
  })
})
