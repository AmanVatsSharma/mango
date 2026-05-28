/**
 * File:        tests/realtime/realtime-emitter-redis-subscribe-retry.test.ts
 * Module:      Realtime · RealtimeEventEmitter · Redis subscribe retry
 * Purpose:     Trading-t3c — proves the Redis per-user subscribe path now
 *              retries with exponential backoff on failure and exposes a
 *              health probe so ops surfaces can detect dead cross-replica
 *              fanout. Pre-fix the failure was logged once and silently
 *              dropped — multi-replica deploys lost cross-process events
 *              for the affected user with no signal.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: uses jest.useFakeTimers for the backoff sleeps
 *
 * Key invariants:
 *   - On first-attempt success → healthy, no retries
 *   - On transient failure (succeeds on attempt 2) → healthy after retry
 *   - On all-attempts failure → unhealthy with attempts == max
 *   - isRealtimeFanoutHealthyForUser returns true when Redis disabled
 *   - Health entry cleared on unsubscribe of last connection
 *
 * Read order:
 *   1. mocks block (Redis bus + Singleton reset)
 *   2. tests in "happy / transient / permanent / probe / cleanup" order
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

type Controller = { enqueue: jest.Mock; close?: jest.Mock }

const subscribeMock = jest.fn()

jest.mock("@/lib/services/realtime/redis-realtime-bus", () => ({
  isRedisRealtimeEnabled: jest.fn(() => true),
  publishUserMessage: jest.fn(async () => {}),
  publishBroadcastMessage: jest.fn(async () => {}),
  subscribeBroadcastMessages: jest.fn(async () => () => {}),
  subscribeUserMessages: (userId: string, cb: any) => subscribeMock(userId, cb),
}))

// Reset module so each test gets a fresh singleton with empty health map.
beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

const makeController = (): Controller => ({ enqueue: jest.fn() })

describe("RealtimeEventEmitter Redis subscribe retry + health", () => {
  it("first-attempt success → healthy, no retries", async () => {
    subscribeMock.mockResolvedValueOnce(() => {})

    const { getRealtimeEventEmitter } = require("@/lib/services/realtime/RealtimeEventEmitter")
    const emitter = getRealtimeEventEmitter()
    emitter.subscribe("u-A", makeController())

    // Drain microtasks for the subscribe promise
    await Promise.resolve()
    await Promise.resolve()

    expect(subscribeMock).toHaveBeenCalledTimes(1)
    expect(emitter.isRealtimeFanoutHealthyForUser("u-A")).toBe(true)
  })

  it("transient failure then success → healthy after retry", async () => {
    subscribeMock
      .mockRejectedValueOnce(new Error("transient blip 1"))
      .mockResolvedValueOnce(() => {})

    const { getRealtimeEventEmitter } = require("@/lib/services/realtime/RealtimeEventEmitter")
    const emitter = getRealtimeEventEmitter()
    emitter.subscribe("u-B", makeController())

    // Drain initial attempt
    await Promise.resolve()
    await Promise.resolve()
    // Advance through the backoff window (500ms base × 2^0 = 500ms)
    await jest.advanceTimersByTimeAsync(600)
    await Promise.resolve()

    expect(subscribeMock).toHaveBeenCalledTimes(2)
    expect(emitter.isRealtimeFanoutHealthyForUser("u-B")).toBe(true)
  })

  it("all attempts fail → unhealthy", async () => {
    subscribeMock
      .mockRejectedValueOnce(new Error("a"))
      .mockRejectedValueOnce(new Error("b"))
      .mockRejectedValueOnce(new Error("c"))

    const { getRealtimeEventEmitter } = require("@/lib/services/realtime/RealtimeEventEmitter")
    const emitter = getRealtimeEventEmitter()
    emitter.subscribe("u-C", makeController())

    // Drain attempt 1
    await Promise.resolve()
    await Promise.resolve()
    // Backoff for attempt 2 = 500ms
    await jest.advanceTimersByTimeAsync(600)
    await Promise.resolve()
    // Backoff for attempt 3 = 1000ms
    await jest.advanceTimersByTimeAsync(1100)
    await Promise.resolve()

    expect(subscribeMock).toHaveBeenCalledTimes(3)
    expect(emitter.isRealtimeFanoutHealthyForUser("u-C")).toBe(false)
  })

  it("isRealtimeFanoutHealthyForUser returns true when Redis is disabled (no need to track)", () => {
    const { getRealtimeEventEmitter } = require("@/lib/services/realtime/RealtimeEventEmitter")
    const redisBus = require("@/lib/services/realtime/redis-realtime-bus")
    redisBus.isRedisRealtimeEnabled.mockReturnValueOnce(false)

    const emitter = getRealtimeEventEmitter()
    expect(emitter.isRealtimeFanoutHealthyForUser("any-user")).toBe(true)
  })

  it("isRealtimeFanoutHealthyForUser returns true for users with no record (treat absence as not-yet-failed)", () => {
    const { getRealtimeEventEmitter } = require("@/lib/services/realtime/RealtimeEventEmitter")
    const emitter = getRealtimeEventEmitter()
    expect(emitter.isRealtimeFanoutHealthyForUser("never-subscribed")).toBe(true)
  })

  it("health entry cleared on unsubscribe of last connection (no leak)", async () => {
    subscribeMock.mockRejectedValueOnce(new Error("a"))
                 .mockRejectedValueOnce(new Error("b"))
                 .mockRejectedValueOnce(new Error("c"))

    const { getRealtimeEventEmitter } = require("@/lib/services/realtime/RealtimeEventEmitter")
    const emitter = getRealtimeEventEmitter()
    const ctrl = makeController()
    emitter.subscribe("u-D", ctrl)

    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(600)
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(1100)
    await Promise.resolve()

    expect(emitter.isRealtimeFanoutHealthyForUser("u-D")).toBe(false)

    emitter.unsubscribe("u-D", ctrl)
    // After unsubscribe, the entry should be cleared so a re-subscribe gets a fresh budget.
    expect(emitter.isRealtimeFanoutHealthyForUser("u-D")).toBe(true)
  })
})
