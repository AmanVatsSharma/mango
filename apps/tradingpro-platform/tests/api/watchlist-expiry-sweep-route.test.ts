/**
 * @file watchlist-expiry-sweep-route.test.ts
 * @module tests-api
 * @description Cron auth + sweep behavior for /api/cron/watchlist-expiry-sweep.
 * @author StockTrade
 * @created 2026-05-01
 */

const deleteManyMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    watchlistItem: {
      deleteMany: (...args: any[]) => deleteManyMock(...args),
    },
  },
}))

jest.mock("@/lib/observability/logger", () => ({
  withRequest: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}))

import { GET } from "@/app/api/cron/watchlist-expiry-sweep/route"

const URL_BASE = "http://localhost/api/cron/watchlist-expiry-sweep"

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = "test-cron-secret"
})

afterEach(() => {
  delete process.env.CRON_SECRET
})

function buildRequest(opts: { auth?: string; queryParam?: string } = {}): Request {
  const url = opts.queryParam ? `${URL_BASE}?secret=${opts.queryParam}` : URL_BASE
  const headers: Record<string, string> = {}
  if (opts.auth) headers["authorization"] = opts.auth
  return new Request(url, { method: "GET", headers })
}

describe("GET /api/cron/watchlist-expiry-sweep", () => {
  it("rejects request with no auth", async () => {
    const res = await GET(buildRequest())
    expect(res.status).toBe(401)
    expect(deleteManyMock).not.toHaveBeenCalled()
  })

  it("rejects request with wrong Bearer", async () => {
    const res = await GET(buildRequest({ auth: "Bearer not-the-secret" }))
    expect(res.status).toBe(401)
    expect(deleteManyMock).not.toHaveBeenCalled()
  })

  it("rejects when CRON_SECRET unset", async () => {
    delete process.env.CRON_SECRET
    const res = await GET(buildRequest({ auth: "Bearer test-cron-secret" }))
    expect(res.status).toBe(401)
    expect(deleteManyMock).not.toHaveBeenCalled()
  })

  it("accepts correct Bearer and runs deleteMany with future-only filter", async () => {
    deleteManyMock.mockResolvedValue({ count: 3 })
    const res = await GET(buildRequest({ auth: "Bearer test-cron-secret" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.deleted).toBe(3)
    expect(deleteManyMock).toHaveBeenCalledTimes(1)
    const call = deleteManyMock.mock.calls[0][0]
    expect(call.where.expiry.not).toBeNull()
    expect(call.where.expiry.lt).toBeInstanceOf(Date)
  })

  it("accepts ?secret= query parameter as fallback", async () => {
    deleteManyMock.mockResolvedValue({ count: 0 })
    const res = await GET(buildRequest({ queryParam: "test-cron-secret" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.deleted).toBe(0)
  })

  it("is idempotent — second run with no expired rows returns 0", async () => {
    deleteManyMock.mockResolvedValue({ count: 0 })
    const res = await GET(buildRequest({ auth: "Bearer test-cron-secret" }))
    const body = await res.json()
    expect(body.data.deleted).toBe(0)
  })

  it("returns 500 on Prisma failure", async () => {
    deleteManyMock.mockRejectedValue(new Error("connection lost"))
    const res = await GET(buildRequest({ auth: "Bearer test-cron-secret" }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
  })
})
