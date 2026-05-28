/**
 * @file tests/api/admin-market-data-health-route.test.ts
 * @module tests-api
 * @description Route-level tests for /api/admin/market-data-health probe behavior.
 * @author StockTrade
 * @created 2026-02-24
 */

const ensureInitializedMock = jest.fn()
const waitForFreshQuoteMock = jest.fn()
const getHealthMock = jest.fn()

jest.mock("@/lib/rbac/admin-api", () => ({
  handleAdminApi: async (_req: Request, _opts: any, handler: any) =>
    handler({
      logger: {
        warn: jest.fn(),
      },
    }),
}))

jest.mock("@/lib/market-data/server-market-data.service", () => ({
  SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS: 1_500,
  getServerMarketDataService: () => ({
    ensureInitialized: (...args: any[]) => ensureInitializedMock(...args),
    waitForFreshQuote: (...args: any[]) => waitForFreshQuoteMock(...args),
    getHealth: (...args: any[]) => getHealthMock(...args),
  }),
}))

import { GET } from "@/app/api/admin/market-data-health/route"

describe("GET /api/admin/market-data-health", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ensureInitializedMock.mockResolvedValue(undefined)
    waitForFreshQuoteMock.mockResolvedValue(null)
    getHealthMock.mockReturnValue({
      isConnected: true,
      lastMessageAgeMs: 100,
      cachedQuotes: 10,
      wantedSubscriptions: 10,
      subscribedSubscriptions: 10,
      usingDemoApiKey: false,
    })
  })

  it("returns fresh probe when waitForFreshQuote resolves a quote", async () => {
    waitForFreshQuoteMock.mockResolvedValue({
      instrumentToken: 26000,
      last_trade_price: 24950.25,
      receivedAt: Date.now() - 500,
      upstreamTimestamp: "2026-02-24T10:00:00.000Z",
    })

    const req = new Request("http://localhost/api/admin/market-data-health?token=26000&timeoutMs=1000&maxAgeMs=5000")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      data: {
        probe: {
          token: 26000,
          status: "fresh",
          lastTradePrice: 24950.25,
        },
      },
    })
    expect(waitForFreshQuoteMock).toHaveBeenCalledWith(
      26000,
      expect.objectContaining({
        timeoutMs: 1000,
        maxAgeMs: 5000,
        resubscribeRetryTimeoutMs: 1_500,
      }),
    )
  })

  it("returns stale_or_missing when feed is connected but quote is unavailable", async () => {
    waitForFreshQuoteMock.mockResolvedValue(null)
    getHealthMock.mockReturnValue({ isConnected: true })

    const req = new Request("http://localhost/api/admin/market-data-health?token=26000")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      data: {
        probe: {
          token: 26000,
          status: "stale_or_missing",
        },
      },
    })
  })

  it("returns feed_disconnected when feed is disconnected and quote is unavailable", async () => {
    waitForFreshQuoteMock.mockResolvedValue(null)
    getHealthMock.mockReturnValue({ isConnected: false })

    const req = new Request("http://localhost/api/admin/market-data-health?token=26000")
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      data: {
        probe: {
          token: 26000,
          status: "feed_disconnected",
        },
      },
    })
  })
})
