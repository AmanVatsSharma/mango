/**
 * File:        tests/realtime/shared-sse-reconnect-strategy.test.ts
 * Module:      Realtime · SSE Manager · Reconnect Strategy
 * Purpose:     Regression suite for the bounded-exponential reconnect backoff,
 *              the synthetic `connection_dead` event, and the sticky DEAD
 *              state cleared only by forceReconnect(). Pre-fix behavior was
 *              5 attempts of linear (1s × n) backoff with silent death — this
 *              suite would fail against that version.
 *
 * Exports:     none (Jest test file)
 *
 * Depends on:
 *   - @/lib/hooks/use-shared-sse — SharedSSEManager + helpers
 *
 * Side-effects: none (uses fake EventSource + jest.useFakeTimers)
 *
 * Key invariants:
 *   - computeReconnectDelayMs is monotonically non-decreasing (modulo jitter)
 *     up to the cap, and never exceeds SSE_RECONNECT_CAP_MS
 *   - 30 retries before connection_dead is emitted (raised from 5)
 *   - subscribe() during DEAD state does NOT auto-reopen
 *   - forceReconnect() clears DEAD and creates a new connection
 *
 * Read order:
 *   1. fake EventSource shim
 *   2. delay computation tests
 *   3. retry budget + dead emission tests
 *   4. forceReconnect lifecycle test
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

class FakeEventSource {
  static OPEN = 1
  static CLOSED = 2
  static instances: FakeEventSource[] = []

  url: string
  readyState = 0
  onopen: ((ev: any) => void) | null = null
  onmessage: ((ev: any) => void) | null = null
  onerror: ((ev: any) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  triggerError() {
    this.readyState = FakeEventSource.CLOSED
    this.onerror?.({})
  }

  close() {
    this.readyState = FakeEventSource.CLOSED
  }
}

beforeAll(() => {
  ;(globalThis as any).EventSource = FakeEventSource
  ;(globalThis as any).window = globalThis
})

afterAll(() => {
  delete (globalThis as any).EventSource
})

beforeEach(() => {
  FakeEventSource.instances = []
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

import {
  SharedSSEManager,
  SSE_MAX_RECONNECT_ATTEMPTS,
  SSE_RECONNECT_BASE_MS,
  SSE_RECONNECT_CAP_MS,
} from "@/lib/hooks/use-shared-sse"

describe("SSE reconnect strategy", () => {
  it("exposes a higher retry budget than the pre-fix value (was 5)", () => {
    expect(SSE_MAX_RECONNECT_ATTEMPTS).toBeGreaterThanOrEqual(20)
  })

  it("emits connection_dead after the retry budget is exhausted", () => {
    const mgr = new SharedSSEManager()
    const events: any[] = []
    mgr.subscribe("user-A", (msg) => events.push(msg))

    // Drain max attempts: each error → close + scheduled retry. Run ALL pending timers
    // until budget exhausts, fast-forwarding past the (capped) backoff windows.
    for (let i = 0; i < SSE_MAX_RECONNECT_ATTEMPTS + 1; i++) {
      const es = FakeEventSource.instances[FakeEventSource.instances.length - 1]
      es.triggerError()
      jest.runOnlyPendingTimers()
    }

    const deadEvents = events.filter((e) => e.event === "connection_dead")
    expect(deadEvents.length).toBeGreaterThanOrEqual(1)
    expect(deadEvents[0].data.attempts).toBe(SSE_MAX_RECONNECT_ATTEMPTS)
    expect(deadEvents[0].data.maxAttempts).toBe(SSE_MAX_RECONNECT_ATTEMPTS)
  })

  it("does NOT auto-reopen when a new subscriber arrives during DEAD state", () => {
    const mgr = new SharedSSEManager()
    const events: any[] = []
    mgr.subscribe("user-B", (msg) => events.push(msg))

    for (let i = 0; i < SSE_MAX_RECONNECT_ATTEMPTS + 1; i++) {
      const es = FakeEventSource.instances[FakeEventSource.instances.length - 1]
      es.triggerError()
      jest.runOnlyPendingTimers()
    }

    const instancesAtDead = FakeEventSource.instances.length
    // Add a second subscriber — should NOT trigger a new connection.
    mgr.subscribe("user-B", () => {})
    expect(FakeEventSource.instances.length).toBe(instancesAtDead)
  })

  it("forceReconnect clears DEAD and opens a fresh connection", () => {
    const mgr = new SharedSSEManager()
    mgr.subscribe("user-C", () => {})

    for (let i = 0; i < SSE_MAX_RECONNECT_ATTEMPTS + 1; i++) {
      const es = FakeEventSource.instances[FakeEventSource.instances.length - 1]
      es.triggerError()
      jest.runOnlyPendingTimers()
    }

    const instancesAtDead = FakeEventSource.instances.length
    mgr.forceReconnect("user-C")
    expect(FakeEventSource.instances.length).toBe(instancesAtDead + 1)
  })

  it("never schedules a reconnect with a delay greater than the cap", () => {
    // Spy on setTimeout to inspect the chosen delay across many error cycles.
    const setTimeoutSpy = jest.spyOn(globalThis, "setTimeout")

    const mgr = new SharedSSEManager()
    mgr.subscribe("user-D", () => {})

    for (let i = 0; i < SSE_MAX_RECONNECT_ATTEMPTS; i++) {
      const es = FakeEventSource.instances[FakeEventSource.instances.length - 1]
      es.triggerError()
      jest.runOnlyPendingTimers()
    }

    const reconnectDelays = setTimeoutSpy.mock.calls
      .map((call) => Number(call[1]))
      .filter((d) => Number.isFinite(d) && d > 0)

    expect(reconnectDelays.length).toBeGreaterThan(0)
    for (const d of reconnectDelays) {
      // jitter +20% allows up to 1.2× cap
      expect(d).toBeLessThanOrEqual(Math.ceil(SSE_RECONNECT_CAP_MS * 1.2))
      expect(d).toBeGreaterThanOrEqual(SSE_RECONNECT_BASE_MS)
    }
  })
})
