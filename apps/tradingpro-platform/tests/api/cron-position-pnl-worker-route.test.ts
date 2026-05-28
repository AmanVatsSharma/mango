/**
 * @file tests/api/cron-position-pnl-worker-route.test.ts
 * @module tests-api
 * @description Route-level resilience tests for /api/cron/position-pnl-worker.
 * @author StockTrade
 * @created 2026-02-16
 */

const processPositionPnLMock = jest.fn()
const runScheduledCleanupTickMock = jest.fn()

jest.mock("@/lib/services/position/PositionPnLWorker", () => ({
  positionPnLWorker: {
    processPositionPnL: (...args: any[]) => processPositionPnLMock(...args),
  },
}))

jest.mock("@/lib/server/workers/cleanup-auto-runner", () => ({
  runScheduledCleanupTick: (...args: any[]) => runScheduledCleanupTickMock(...args),
}))

import { GET, POST } from "@/app/api/cron/position-pnl-worker/route"

describe("/api/cron/position-pnl-worker", () => {
  const originalCronSecret = process.env.CRON_SECRET
  const originalPositionPnlSecret = process.env.POSITION_PNL_WORKER_SECRET

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.CRON_SECRET
    delete process.env.POSITION_PNL_WORKER_SECRET
    processPositionPnLMock.mockResolvedValue({
      success: true,
      scanned: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      elapsedMs: 10,
      heartbeat: { lastRunAtIso: new Date().toISOString() },
    })
    runScheduledCleanupTickMock.mockResolvedValue({
      source: "cron_position_pnl_worker",
      executed: false,
      skippedReason: "disabled",
      config: { enabled: false, retentionDays: 0, dailyRunHourIst: 6, lastRunDateIst: null },
    })
  })

  afterEach(() => {
    process.env.CRON_SECRET = originalCronSecret
    process.env.POSITION_PNL_WORKER_SECRET = originalPositionPnlSecret
  })

  it("returns unauthorized when cron secret does not match", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: "Bearer wrong-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" })
    expect(processPositionPnLMock).not.toHaveBeenCalled()
  })

  it.each(["undefined", "false", "0", "off", "disabled", "{}", '{"secrets":[]}'])(
    "ignores placeholder cron secret value %s and allows request",
    async (placeholderSecret) => {
      process.env.CRON_SECRET = placeholderSecret
      const req = new Request("http://localhost/api/cron/position-pnl-worker", {
        method: "GET",
      })

      const res = await GET(req)
      expect(res.status).toBe(200)
      expect(processPositionPnLMock).toHaveBeenCalled()
    },
  )

  it("accepts authorization when worker-specific secret contains surrounding whitespace", async () => {
    process.env.POSITION_PNL_WORKER_SECRET = "  expected-secret  "
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts authorization when configured cron secret is wrapped in quotes", async () => {
    process.env.CRON_SECRET = '"expected-secret"'
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts authorization when configured cron secret is a JSON array", async () => {
    process.env.CRON_SECRET = '["wrong-secret","expected-secret"]'
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts case-insensitive bearer scheme and trimmed token payload", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: "bearer   expected-secret   " },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts quoted bearer token payload", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: 'Bearer "expected-secret"' },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts first bearer token from comma-separated authorization header", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret, Basic ignored" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts bearer token when comma-separated auth header starts with non-bearer segment", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: "Basic ignored, Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts worker-specific secret when both worker and global secrets are configured", async () => {
    process.env.CRON_SECRET = "global-secret"
    process.env.POSITION_PNL_WORKER_SECRET = "worker-secret"
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: "Bearer worker-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts matching secret from comma-delimited configured secret list", async () => {
    process.env.CRON_SECRET = "wrong-secret, expected-secret"
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts matching secret from semicolon/newline-delimited configured secret list", async () => {
    process.env.CRON_SECRET = "wrong-secret;\nexpected-secret"
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts matching secret from JSON-object secret list wrappers", async () => {
    process.env.CRON_SECRET = '{"secrets":["wrong-secret","expected-secret"]}'
    const req = new Request("http://localhost/api/cron/position-pnl-worker", {
      method: "GET",
      headers: { authorization: "Bearer expected-secret" },
    })

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("returns unauthorized when auth header cannot be read and secret is configured", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/position-pnl-worker",
      get headers() {
        throw new Error("headers unavailable")
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ error: "Unauthorized" })
    expect(processPositionPnLMock).not.toHaveBeenCalled()
  })

  it("accepts authorization from plain-object header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/position-pnl-worker",
      headers: {
        Authorization: "Bearer expected-secret",
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts authorization from mixed-case plain-object header keys", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/position-pnl-worker",
      headers: {
        aUtHoRiZaTiOn: "Bearer expected-secret",
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts authorization from array-valued plain-object headers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/position-pnl-worker",
      headers: {
        authorization: ["Bearer expected-secret"],
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts authorization from nested plain-object header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/position-pnl-worker",
      headers: {
        headers: {
          authorization: "Bearer expected-secret",
        },
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts authorization from iterable header entry wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/position-pnl-worker",
      headers: [["authorization", "Bearer expected-secret"]],
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts authorization from entries()-based header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/position-pnl-worker",
      headers: {
        entries: () => [["authorization", "Bearer expected-secret"]],
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts authorization from flat raw-header arrays", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/position-pnl-worker",
      headers: ["authorization", "Bearer expected-secret", "x-other", "ignored"],
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts authorization from forEach()-based header wrappers", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/position-pnl-worker",
      headers: {
        forEach: (callback: (value: unknown, key: unknown) => void) => {
          callback("Bearer expected-secret", "authorization")
        },
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("accepts authorization from forEach()-based wrappers with swapped callback args", async () => {
    process.env.CRON_SECRET = "expected-secret"
    const req = {
      url: "http://localhost/api/cron/position-pnl-worker",
      headers: {
        forEach: (callback: (firstArg: unknown, secondArg: unknown) => void) => {
          callback("authorization", "Bearer expected-secret")
        },
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalled()
  })

  it("parses query params from URL-object request wrappers", async () => {
    const req = {
      url: new URL("http://localhost/api/cron/position-pnl-worker?limit=75&updateThreshold=3.5&dryRun=1"),
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 75,
      updateThreshold: 3.5,
      dryRun: true,
    })
  })

  it("parses query params from nested href URL wrappers", async () => {
    const req = {
      url: {
        href: "http://localhost/api/cron/position-pnl-worker?limit=91&updateThreshold=6&dryRun=yes",
      },
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 91,
      updateThreshold: 6,
      dryRun: true,
    })
  })

  it("parses query params from pathname/search URL wrappers", async () => {
    const req = {
      url: {
        pathname: "/api/cron/position-pnl-worker",
        search: "?limit=88&updateThreshold=4.2&dryRun=true",
      },
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 88,
      updateThreshold: 4.2,
      dryRun: true,
    })
  })

  it("parses query params from callable pathname/search URL wrappers", async () => {
    const req = {
      url: {
        pathname: () => "/api/cron/position-pnl-worker",
        search: () => new URLSearchParams("limit=63&updateThreshold=2&dryRun=1"),
      },
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 63,
      updateThreshold: 2,
      dryRun: true,
    })
  })

  it("parses query params from pathname/searchParams URL wrappers", async () => {
    const req = {
      url: {
        pathname: "/api/cron/position-pnl-worker",
        searchParams: new URLSearchParams("limit=72&updateThreshold=5&dryRun=on"),
      },
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 72,
      updateThreshold: 5,
      dryRun: true,
    })
  })

  it("parses query params from standalone searchParams URL wrappers", async () => {
    const req = {
      url: {
        searchParams: () => new URLSearchParams("limit=12&updateThreshold=1.5&dryRun=1"),
      },
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 12,
      updateThreshold: 1.5,
      dryRun: true,
    })
  })

  it("parses query params from function-valued URL wrappers", async () => {
    const req = {
      url: () => "http://localhost/api/cron/position-pnl-worker?limit=120&updateThreshold=2.5&dryRun=on",
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 120,
      updateThreshold: 2.5,
      dryRun: true,
    })
  })

  it("falls back to nextUrl wrappers when url accessor is unavailable", async () => {
    const req = {
      nextUrl: {
        pathname: "/api/cron/position-pnl-worker",
        searchParams: new URLSearchParams("limit=41&updateThreshold=2.25&dryRun=on"),
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
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 41,
      updateThreshold: 2.25,
      dryRun: true,
    })
  })

  it("uses safe defaults when request URL cannot be parsed", async () => {
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
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 500,
      updateThreshold: 1,
      dryRun: false,
    })
  })

  it("normalizes query params and accepts truthy dryRun variants", async () => {
    const req = {
      url: "/api/cron/position-pnl-worker?limit=99999&updateThreshold=-2&dryRun=YES",
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 2000,
      updateThreshold: 0,
      dryRun: true,
    })
  })

  it("accepts compact and status dryRun aliases", async () => {
    const req = {
      url: "/api/cron/position-pnl-worker?dryRun=enabled",
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 500,
      updateThreshold: 1,
      dryRun: true,
    })
  })

  it("supports explicit intraday EOD backstop trigger with dry-run", async () => {
    const req = new Request(
      "http://localhost/api/cron/position-pnl-worker?eod=1&dryRun=1&intradayEodPreCloseBufferMinutes=25&intradayEodMaxAutoClosesPerTick=77",
      { method: "GET" },
    )

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 500,
      updateThreshold: 1,
      dryRun: true,
      forceRun: true,
      intradayEodForceRun: true,
      intradayEodPreCloseBufferMinutes: 25,
      intradayEodMaxAutoClosesPerTick: 77,
    })
    await expect(res.json()).resolves.toMatchObject({
      mode: "intraday_eod_backstop",
      requested: {
        dryRun: true,
        forceRun: true,
        intradayEodForceRun: true,
        intradayEodPreCloseBufferMinutes: 25,
        intradayEodMaxAutoClosesPerTick: 77,
      },
    })
  })

  it("clamps intraday EOD backstop numeric query params to safe bounds", async () => {
    const req = new Request(
      "http://localhost/api/cron/position-pnl-worker?intradayEodSquareOff=1&intradayEodPreCloseBufferMinutes=-2&intradayEodMaxAutoClosesPerTick=999999",
      { method: "GET" },
    )

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 500,
      updateThreshold: 1,
      dryRun: false,
      forceRun: true,
      intradayEodForceRun: true,
      intradayEodPreCloseBufferMinutes: 1,
      intradayEodMaxAutoClosesPerTick: 5000,
    })
  })

  it("uses default numeric values when limit/updateThreshold query params are blank", async () => {
    const req = {
      url: "/api/cron/position-pnl-worker?limit=%20%20&updateThreshold=&dryRun=off",
      headers: {
        get: () => null,
      },
    } as unknown as Request

    const res = await GET(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 500,
      updateThreshold: 1,
      dryRun: false,
    })
  })

  it("returns 500 when worker execution fails", async () => {
    processPositionPnLMock.mockRejectedValueOnce(new Error("pnl-worker-failed"))
    const req = new Request("http://localhost/api/cron/position-pnl-worker", { method: "GET" })

    const res = await GET(req)

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: "pnl-worker-failed",
    })
  })

  it("normalizes and truncates worker error messages in 500 response", async () => {
    const longErrorMessage = `   pnl   worker   failed   ${"x".repeat(320)}`
    processPositionPnLMock.mockRejectedValueOnce({ message: longErrorMessage })
    const req = new Request("http://localhost/api/cron/position-pnl-worker", { method: "GET" })

    const res = await GET(req)

    expect(res.status).toBe(500)
    const payload = await res.json()
    expect(payload.success).toBe(false)
    expect(payload.error.startsWith("pnl worker failed ")).toBe(true)
    expect(payload.error.length).toBe(256)
  })

  it("supports POST by delegating to GET behavior", async () => {
    const req = new Request("http://localhost/api/cron/position-pnl-worker?dryRun=1", { method: "POST" })

    const res = await POST(req)

    expect(res.status).toBe(200)
    expect(processPositionPnLMock).toHaveBeenCalledWith({
      limit: 500,
      updateThreshold: 1,
      dryRun: true,
    })
  })
})
