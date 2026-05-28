/**
 * @file session-bootstrap-utils.test.ts
 * @module tests
 * @description Regression tests for auth session bootstrap retry and timeout handling.
 * @author StockTrade
 * @created 2026-02-22
 */

import {
  fetchSessionSnapshot,
  hasHydratedSessionUser,
  pollForHydratedSession,
} from "@/components/auth/session-bootstrap-utils"

describe("session-bootstrap-utils", () => {
  it("accepts only payloads that contain user.id", () => {
    expect(hasHydratedSessionUser(null)).toBe(false)
    expect(hasHydratedSessionUser({})).toBe(false)
    expect(hasHydratedSessionUser({ user: {} })).toBe(false)
    expect(hasHydratedSessionUser({ user: { id: "" } })).toBe(false)
    expect(hasHydratedSessionUser({ user: { id: "user-1" } })).toBe(true)
  })

  it("marks session snapshot ready when endpoint returns hydrated session", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({ user: { id: "user-1" } }),
    })) as unknown as typeof fetch

    const result = await fetchSessionSnapshot({
      fetchImpl,
      requestTimeoutMs: 100,
    })

    expect(result.isReady).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("times out hanging session requests via abort controller", async () => {
    const fetchImpl = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined
        if (!signal) return
        signal.addEventListener("abort", () => {
          const abortError = new Error("aborted")
          ;(abortError as Error & { name: string }).name = "AbortError"
          reject(abortError)
        })
      })
    }) as unknown as typeof fetch

    const result = await fetchSessionSnapshot({
      fetchImpl,
      requestTimeoutMs: 10,
    })

    expect(result.isReady).toBe(false)
    expect(result.error).toBeDefined()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("retries until a hydrated session appears", async () => {
    let callCount = 0
    const fetchImpl = jest.fn(async () => {
      callCount += 1
      const payload = callCount < 3 ? { user: {} } : { user: { id: "ready-user" } }
      return {
        ok: true,
        json: async () => payload,
      }
    }) as unknown as typeof fetch

    const ready = await pollForHydratedSession({
      attempts: 5,
      delayMs: 0,
      requestTimeoutMs: 100,
      fetchImpl,
    })

    expect(ready).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it("returns false after max retries and reports attempt failures", async () => {
    const onAttemptFailure = jest.fn()
    const fetchImpl = jest.fn(async () => {
      throw new Error("network down")
    }) as unknown as typeof fetch

    const ready = await pollForHydratedSession({
      attempts: 3,
      delayMs: 0,
      requestTimeoutMs: 100,
      fetchImpl,
      onAttemptFailure,
    })

    expect(ready).toBe(false)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(onAttemptFailure).toHaveBeenCalledTimes(3)
  })
})
