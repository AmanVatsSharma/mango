/**
 * @file tests/api/cron-order-worker-route.test.ts
 * @module tests-api
 * @description Route-level resilience tests for /api/cron/order-worker.
 * @author StockTrade
 * @created 2026-02-16
 */

const processPendingOrdersMock = jest.fn()
const runScheduledCleanupTickMock = jest.fn()

jest.mock("@/lib/services/order/OrderExecutionWorker", () => ({
  orderExecutionWorker: {
    processPendingOrders: (...args: any[]) => processPendingOrdersMock(...args),
  },
}))

jest.mock("@/lib/server/workers/cleanup-auto-runner", () => ({
  runScheduledCleanupTick: (...args: any[]) => runScheduledCleanupTickMock(...args),
}))

import { GET, POST } from "@/app/api/cron/order-worker/route"

describe("/api/cron/order-worker", () => {
  const originalCronSecret = process.env.CRON_SECRET
  const originalOrderWorkerSecret = process.env.ORDER_WORKER_SECRET

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.CRON_SECRET
    delete process.env.ORDER_WORKER_SECRET
    processPendingOrdersMock.mockResolvedValue({
      scanned: 0,
      executed: 0,
      cancelled: 0,
      errors: [],
    })
    runScheduledCleanupTickMock.mockResolvedValue({
      source: "cron_order_worker",
      executed: false,
      skippedReason: "disabled",
      config: { enabled: false, retentionDays: 0, dailyRunHourIst: 6, lastRunDateIst: null },
    })
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret
    process.env.ORDER_WORKER_SECRET = originalOrderWorkerSecret
  })

  it("returns unauthorized when cron secret is configured and auth mismatches", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: "Bearer wrong-secret" },
    })

    const res = await GET(req)
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" })
    expect(processPendingOrdersMock).not.toHaveBeenCalled()
  })

  it.each(["undefined", "false", "0", "off", "disabled", "{}", '{"secrets":[]}'])(
    "ignores placeholder cron secret value %s and allows request",
    async (placeholderSecret) => {
      process.env.CRON_SECRET = placeholderSecret
      const req = new Request("http://localhost/api/cron/order-worker", {
        method: "GET",
      })

      const res = await GET(req)
      expect(res.status).toBe(200)
      expect(processPendingOrdersMock).toHaveBeenCalled()
    },
  )

  it("accepts authorization when configured cron secret contains surrounding whitespace", async () => {
    process.env.CRON_SECRET = "  expected-secret  "
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts authorization when configured cron secret is wrapped in quotes", async () => {
    process.env.CRON_SECRET = '"expected-secret"'
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts authorization when configured cron secret is a JSON array", async () => {
    process.env.CRON_SECRET = '["wrong-secret","expected-secret"]'
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts case-insensitive bearer scheme and trimmed token payload", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: "bearer    expected-secret   " },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts quoted bearer token payload", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: 'Bearer "expected-secret"' },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts first bearer token from comma-separated authorization header", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret, Basic ignored" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts bearer token when comma-separated auth header starts with non-bearer segment", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: "Basic ignored, Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts worker-specific secret when both worker and global secrets are configured", async () => {
    process.env.CRON_SECRET = "global-secret"
    process.env.ORDER_WORKER_SECRET = "worker-secret"
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: "Bearer worker-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts matching secret from comma-delimited configured secret list", async () => {
    process.env.CRON_SECRET = "wrong-secret, expected-secret"
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts matching secret from semicolon/newline-delimited configured secret list", async () => {
    process.env.CRON_SECRET = "wrong-secret;\nexpected-secret"
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts matching secret from JSON-object secret list wrappers", async () => {
    process.env.CRON_SECRET = '{"secrets":["wrong-secret","expected-secret"]}'
    const req = new Request("http://localhost/api/cron/order-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("returns unauthorized when auth header cannot be read and secret is configured", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/order-worker",
      get headers() {
        throw new Error("headers unavailable")
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" })
    expect(processPendingOrdersMock).not.toHaveBeenCalled()
  })

  it("accepts authorization from plain-object header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/order-worker",
      headers: {
        Authorization: "Bearer expected-secret",
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts authorization from mixed-case plain-object header keys", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/order-worker",
      headers: {
        aUtHoRiZaTiOn: "Bearer expected-secret",
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts authorization from array-valued plain-object headers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/order-worker",
      headers: {
        authorization: ["Bearer expected-secret"],
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts authorization from nested plain-object header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/order-worker",
      headers: {
        headers: {
          authorization: "Bearer expected-secret",
        },
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts authorization from iterable header entry wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/order-worker",
      headers: [["authorization", "Bearer expected-secret"]],
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts authorization from entries()-based header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/order-worker",
      headers: {
        entries: () => [["authorization", "Bearer expected-secret"]],
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts authorization from flat raw-header arrays", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/order-worker",
      headers: ["authorization", "Bearer expected-secret", "x-other", "ignored"],
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts authorization from forEach()-based header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/order-worker",
      headers: {
        forEach: (callback: (value: unknown, key: unknown) => void) => {
          callback("Bearer expected-secret", "authorization")
        },
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("accepts authorization from forEach()-based wrappers with swapped callback args", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/order-worker",
      headers: {
        forEach: (callback: (firstArg: unknown, secondArg: unknown) => void) => {
          callback("authorization", "Bearer expected-secret")
        },
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalled()
  })

  it("parses query params from URL-object request wrappers", async () => {
    const req = {
      url: new URL("http://localhost/api/cron/order-worker?limit=42&maxAgeMs=1200"),
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 42,
      maxAgeMs: 1200,
    })
  })

  it("parses query params from nested href URL wrappers", async () => {
    const req = {
      url: {
        href: "http://localhost/api/cron/order-worker?limit=33&maxAgeMs=777",
      },
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 33,
      maxAgeMs: 777,
    })
  })

  it("parses query params from pathname/search URL wrappers", async () => {
    const req = {
      url: {
        pathname: "/api/cron/order-worker",
        search: "?limit=28&maxAgeMs=444",
      },
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 28,
      maxAgeMs: 444,
    })
  })

  it("parses query params from callable pathname/search URL wrappers", async () => {
    const req = {
      url: {
        pathname: () => "/api/cron/order-worker",
        search: () => new URLSearchParams("limit=19&maxAgeMs=800"),
      },
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 19,
      maxAgeMs: 800,
    })
  })

  it("parses query params from pathname/searchParams URL wrappers", async () => {
    const req = {
      url: {
        pathname: "/api/cron/order-worker",
        searchParams: new URLSearchParams("limit=31&maxAgeMs=901"),
      },
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 31,
      maxAgeMs: 901,
    })
  })

  it("parses query params from standalone searchParams URL wrappers", async () => {
    const req = {
      url: {
        searchParams: () => new URLSearchParams("limit=7&maxAgeMs=11"),
      },
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 7,
      maxAgeMs: 11,
    })
  })

  it("parses query params from function-valued URL wrappers", async () => {
    const req = {
      url: () => "http://localhost/api/cron/order-worker?limit=17&maxAgeMs=900",
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 17,
      maxAgeMs: 900,
    })
  })

  it("falls back to nextUrl wrappers when url accessor is unavailable", async () => {
    const req = {
      nextUrl: {
        pathname: "/api/cron/order-worker",
        searchParams: new URLSearchParams("limit=45&maxAgeMs=123"),
      },
      headers: {
        get: () => null,
      },
      get url() {
        throw new Error("url unavailable")
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 45,
      maxAgeMs: 123,
    })
  })

  it("falls back to defaults when request URL is unavailable", async () => {
    const req = {
      headers: {
        get: () => null,
      },
      get url() {
        throw new Error("url unavailable")
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 25,
      maxAgeMs: 0,
    })
  })

  it("normalizes query params for limit and maxAgeMs", async () => {
    const req = {
      url: "/api/cron/order-worker?limit=9999&maxAgeMs=-10",
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 200,
      maxAgeMs: 0,
    })
  })

  it("uses default limit when query params are blank strings", async () => {
    const req = {
      url: "/api/cron/order-worker?limit=%20%20&maxAgeMs=",
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 25,
      maxAgeMs: 0,
    })
  })

  it("returns 500 when worker fails", async () => {
    processPendingOrdersMock.mockRejectedValueOnce(new Error("order-worker-failed"))
    const req = new Request("http://localhost/api/cron/order-worker", { method: "GET" })

    const res = await GET(req)

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "order-worker-failed",
    })
  })

  it("normalizes and truncates worker error messages in 500 response", async () => {
    const longErrorMessage = `   order   worker   failed   ${"x".repeat(320)}`
    processPendingOrdersMock.mockRejectedValueOnce({ message: longErrorMessage })
    const req = new Request("http://localhost/api/cron/order-worker", { method: "GET" })

    const res = await GET(req)

    expect(res.status).toBe(500)
    const payload = await res.json()
    expect(payload.success).toBe(false)
    expect(payload.error.startsWith("order worker failed ")).toBe(true)
    expect(payload.error.length).toBe(256)
  })

  it("supports POST by delegating to GET behavior", async () => {
    const req = new Request("http://localhost/api/cron/order-worker?limit=10&maxAgeMs=500", { method: "POST" })

    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(processPendingOrdersMock).toHaveBeenCalledWith({
      limit: 10,
      maxAgeMs: 500,
    })
  })
})
