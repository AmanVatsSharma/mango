/**
 * @file tests/realtime/shared-sse-manager.test.ts
 * @module tests-realtime
 * @description Focused tests for shared SSE reconnect and connected-event behavior.
 * @author StockTrade
 * @created 2026-02-27
 */

import type { SSEMessage } from "@/lib/hooks/use-shared-sse"
import { SharedSSEManager } from "@/lib/hooks/use-shared-sse"

class MockEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: MockEventSource[] = []

  readyState = MockEventSource.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((error: unknown) => void) | null = null
  close = jest.fn(() => {
    this.readyState = MockEventSource.CLOSED
  })

  constructor(public readonly url: string) {
    MockEventSource.instances.push(this)
  }

  emitOpen(): void {
    this.readyState = MockEventSource.OPEN
    this.onopen?.()
  }

  emitMessage(payload: SSEMessage): void {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  emitClosedError(): void {
    this.readyState = MockEventSource.CLOSED
    this.onerror?.(new Error("socket closed"))
  }
}

describe("SharedSSEManager", () => {
  beforeEach(() => {
    MockEventSource.instances = []
    ;(globalThis as any).window = {}
    ;(globalThis as any).EventSource = MockEventSource
  })

  afterEach(() => {
    delete (globalThis as any).window
    delete (globalThis as any).EventSource
    jest.useRealTimers()
  })

  it("broadcasts connected event to subscribers on socket open", () => {
    const manager = new SharedSSEManager()
    const callback = jest.fn()

    manager.subscribe("user-1", callback)
    expect(MockEventSource.instances).toHaveLength(1)

    MockEventSource.instances[0].emitOpen()

    expect(callback).toHaveBeenCalled()
    const firstMessage = callback.mock.calls[0]?.[0] as SSEMessage
    expect(firstMessage.event).toBe("connected")
    expect(firstMessage.data).toMatchObject({ userId: "user-1" })
  })

  it("attempts reconnect when stream errors in CLOSED state", () => {
    jest.useFakeTimers()
    const manager = new SharedSSEManager()
    const callback = jest.fn()

    manager.subscribe("user-2", callback)
    expect(MockEventSource.instances).toHaveLength(1)

    MockEventSource.instances[0].emitClosedError()
    jest.advanceTimersByTime(1100)

    expect(MockEventSource.instances.length).toBeGreaterThanOrEqual(2)
  })
})

