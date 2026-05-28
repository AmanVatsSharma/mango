/**
 * @file tests/realtime/realtime-emitter-redis-bridge.test.ts
 * @module tests-realtime
 * @description Unit tests for Redis-backed cross-process realtime bridge (publish/subscribe integration).
 * @author StockTrade
 * @created 2026-02-12
 */

type Controller = { enqueue: jest.Mock }

jest.mock("@/lib/services/realtime/redis-realtime-bus", () => {
  return {
    isRedisRealtimeEnabled: jest.fn(() => true),
    publishUserMessage: jest.fn(async () => {}),
    subscribeUserMessages: jest.fn(async (_userId: string, onMessage: any) => {
      ;(globalThis as any).__onRedisMessage = onMessage
      return () => {
        ;(globalThis as any).__onRedisMessage = null
      }
    }),
  }
})

import { getRealtimeEventEmitter } from "@/lib/services/realtime/RealtimeEventEmitter"

const redisBus = jest.requireMock("@/lib/services/realtime/redis-realtime-bus") as {
  isRedisRealtimeEnabled: jest.Mock
  publishUserMessage: jest.Mock
  subscribeUserMessages: jest.Mock
}

describe("RealtimeEventEmitter Redis bridge", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(globalThis as any).__onRedisMessage = null
  })

  it("publishes to Redis on emit (even if no local subscribers)", () => {
    const emitter = getRealtimeEventEmitter()
    emitter.emit("u-1", "order_placed" as any, { orderId: "o-1" } as any)
    expect(redisBus.publishUserMessage).toHaveBeenCalled()
  })

  it("delivers Redis-sourced payloads to local controllers without re-publishing", async () => {
    const emitter = getRealtimeEventEmitter()
    const controller: Controller = { enqueue: jest.fn() }
    emitter.subscribe("u-1", controller as any)

    // Wait a tick for subscribeUserMessages promise to resolve
    await Promise.resolve()

    const onRedis = (globalThis as any).__onRedisMessage as ((payload: any) => void) | null
    expect(typeof onRedis).toBe("function")

    redisBus.publishUserMessage.mockClear()

    onRedis!({ event: "balance_updated", data: { tradingAccountId: "a-1", balance: 1, availableMargin: 1, usedMargin: 0 }, timestamp: new Date().toISOString() })

    expect(controller.enqueue).toHaveBeenCalled()
    expect(redisBus.publishUserMessage).not.toHaveBeenCalled()
  })
})

