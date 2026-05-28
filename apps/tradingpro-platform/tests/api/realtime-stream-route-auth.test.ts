/**
 * File:        tests/api/realtime-stream-route-auth.test.ts
 * Module:      Realtime · SSE entrypoint · Auth regression
 * Purpose:     Security regression suite for /api/realtime/stream — proves the
 *              session.user.id is the sole authority for SSE subscription.
 *              The pre-fix handler treated `?userId=` as authoritative; this
 *              suite would have failed against that version.
 *
 * Exports:     none (Jest test file)
 *
 * Depends on:
 *   - @/auth                                                — mocked NextAuth resolver
 *   - @/lib/services/realtime/RealtimeEventEmitter          — mocked emitter
 *   - @/lib/observability/logger                            — passthrough mock
 *
 * Side-effects: none (in-memory mocks only)
 *
 * Key invariants:
 *   - userId param MUST equal session.user.id when both present, else 403
 *   - missing session → 401 regardless of param
 *   - matching param → 200 with subscribe call carrying session.user.id
 *
 * Read order:
 *   1. mocks block (auth, emitter, logger)
 *   2. test cases — unhappy path first
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

const authMock = jest.fn()
const subscribeMock = jest.fn()
const unsubscribeMock = jest.fn()

jest.mock("@/auth", () => ({
  auth: (...args: any[]) => authMock(...args),
}))

jest.mock("@/lib/services/realtime/RealtimeEventEmitter", () => ({
  getRealtimeEventEmitter: () => ({
    subscribe: (...args: any[]) => subscribeMock(...args),
    unsubscribe: (...args: any[]) => unsubscribeMock(...args),
  }),
}))

jest.mock("@/lib/observability/logger", () => ({
  withRequest: () => ({
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
}))

import { GET } from "@/app/api/realtime/stream/route"

function makeRequest(url: string): any {
  const u = new URL(url)
  const controller = new AbortController()
  return {
    nextUrl: u,
    headers: new Headers(),
    signal: controller.signal,
  }
}

describe("/api/realtime/stream auth boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns 401 when no session is present", async () => {
    authMock.mockResolvedValue(null)
    const req = makeRequest("https://example.test/api/realtime/stream")
    const res = await GET(req)
    expect(res.status).toBe(401)
    expect(subscribeMock).not.toHaveBeenCalled()
  })

  it("returns 401 when session has no user.id, even if userId param is set", async () => {
    authMock.mockResolvedValue({ user: {} })
    const req = makeRequest("https://example.test/api/realtime/stream?userId=user-A")
    const res = await GET(req)
    expect(res.status).toBe(401)
    expect(subscribeMock).not.toHaveBeenCalled()
  })

  it("returns 403 when userId param does not match session user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-A" } })
    const req = makeRequest("https://example.test/api/realtime/stream?userId=user-B")
    const res = await GET(req)
    expect(res.status).toBe(403)
    expect(subscribeMock).not.toHaveBeenCalled()
  })

  it("returns 200 when no userId param is supplied (uses session)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-A" } })
    const req = makeRequest("https://example.test/api/realtime/stream")
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(subscribeMock).toHaveBeenCalledWith("user-A", expect.anything())
  })

  it("returns 200 when userId param matches session", async () => {
    authMock.mockResolvedValue({ user: { id: "user-A" } })
    const req = makeRequest("https://example.test/api/realtime/stream?userId=user-A")
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(subscribeMock).toHaveBeenCalledWith("user-A", expect.anything())
  })

  it("never subscribes another user's id even if param is set", async () => {
    authMock.mockResolvedValue({ user: { id: "user-A" } })
    const req = makeRequest("https://example.test/api/realtime/stream?userId=user-B")
    await GET(req)
    expect(subscribeMock).not.toHaveBeenCalledWith("user-B", expect.anything())
  })
})
