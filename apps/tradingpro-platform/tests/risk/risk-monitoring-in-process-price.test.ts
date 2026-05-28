/**
 * File:        tests/risk/risk-monitoring-in-process-price.test.ts
 * Module:      Risk · RiskMonitoringService · in-process price source
 * Purpose:     Trading-m82 + Trading-bvz — proves getCurrentPrice now reads
 *              from the in-process serverMarketData singleton (the same
 *              cache PositionPnLWorker uses) instead of a HTTP self-call to
 *              /api/quotes. Eliminates price-source divergence between the
 *              two parallel auto-liquidation paths.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none — fetch is NOT mocked because the service must not
 *               call it any more; if it does, the test fails by accident
 *               of network access in CI.
 *
 * Key invariants:
 *   - getCurrentPrice asks the serverMarketData singleton via getQuote(token)
 *   - parseTokenFromInstrumentId is the bridge from "NSE_FO-12345" → 12345
 *   - When the in-process cache misses → falls back to Stock.ltp (preserved)
 *   - When both miss → throws "Unable to determine current price"
 *
 * Read order:
 *   1. mocks block (server market data + parser + Prisma stock + logger)
 *   2. tests in "cache hit / cache miss → DB fallback / both miss → throw" order
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

const getQuoteMock = jest.fn()
const parseTokenMock = jest.fn()
const stockFindFirstMock = jest.fn()

jest.mock("@/lib/market-data/server-market-data.service", () => ({
  getServerMarketDataService: () => ({
    getQuote: (...args: any[]) => getQuoteMock(...args),
  }),
}))

jest.mock("@/lib/market-data/utils/quote-lookup", () => {
  // Preserve other exports (e.g. parseFiniteMarketNumber) used by sibling
  // modules — only swap parseTokenFromInstrumentId for the spy.
  const actual = jest.requireActual("@/lib/market-data/utils/quote-lookup")
  return {
    ...actual,
    parseTokenFromInstrumentId: (...args: any[]) => parseTokenMock(...args),
  }
})

jest.mock("@/lib/prisma", () => ({
  prisma: {
    stock: {
      findFirst: (...args: any[]) => stockFindFirstMock(...args),
    },
    riskAlert: { create: jest.fn(async () => ({ id: "alert-1" })) },
    tradingAccount: { findUnique: jest.fn() },
  },
}))

jest.mock("@/lib/services/logging/TradingLogger", () => ({
  TradingLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}))

jest.mock("@/lib/services/risk/risk-thresholds-resolver", () => ({
  resolveThresholdsForUser: jest.fn(async () => ({
    riskLevelLowPct: 30,
    riskLevelMediumPct: 60,
    riskLevelHighPct: 75,
    autoCloseLevelPct: 80,
    maxDailyLossInr: null,
    source: "global" as const,
  })),
}))

jest.mock("@/lib/services/risk/risk-enforcement-settings", () => ({
  getRiskEnforcementSettings: jest.fn(async () => ({
    fullLiquidationOnAutoClose: false,
    squareOffOnWarningBand: false,
    source: "default" as const,
  })),
}))

import { RiskMonitoringService } from "@/lib/services/risk/RiskMonitoringService"

beforeEach(() => {
  jest.clearAllMocks()
})

describe("RiskMonitoringService.getCurrentPrice — in-process source (Trading-m82 + Trading-bvz)", () => {
  // The method is private; access via the class prototype for the test.
  const callGetCurrentPrice = (svc: RiskMonitoringService, instrumentId: string) =>
    (svc as unknown as { getCurrentPrice: (id: string) => Promise<number> }).getCurrentPrice(instrumentId)

  it("reads from serverMarketData.getQuote when the in-process cache has the tick", async () => {
    parseTokenMock.mockReturnValue(12345)
    getQuoteMock.mockReturnValue({ last_trade_price: 1234.5 })

    const svc = new RiskMonitoringService()
    const price = await callGetCurrentPrice(svc, "NSE_FO-12345")

    expect(parseTokenMock).toHaveBeenCalledWith("NSE_FO-12345")
    expect(getQuoteMock).toHaveBeenCalledWith(12345)
    expect(price).toBe(1234.5)
    // Critical: must NOT touch the DB when the in-process cache hit
    expect(stockFindFirstMock).not.toHaveBeenCalled()
  })

  it("falls back to Stock.ltp when the in-process cache misses (and DB is fresh)", async () => {
    parseTokenMock.mockReturnValue(12345)
    getQuoteMock.mockReturnValue(null)
    stockFindFirstMock.mockResolvedValue({
      ltp: 999,
      updatedAt: new Date(Date.now() - 60_000), // 1 min stale, well under 5-min default cap
    })

    const svc = new RiskMonitoringService()
    const price = await callGetCurrentPrice(svc, "NSE_FO-12345")
    expect(price).toBe(999)
  })

  it("falls back to Stock.ltp even when token can't be parsed (instrumentId is opaque)", async () => {
    parseTokenMock.mockReturnValue(null)
    stockFindFirstMock.mockResolvedValue({
      ltp: 500,
      updatedAt: new Date(),
    })

    const svc = new RiskMonitoringService()
    const price = await callGetCurrentPrice(svc, "WEIRD-INSTRUMENT")
    expect(price).toBe(500)
    // We MUST NOT have asked for a quote with token=null
    expect(getQuoteMock).not.toHaveBeenCalled()
  })

  it("throws 'Unable to determine current price' when both cache and DB miss", async () => {
    parseTokenMock.mockReturnValue(12345)
    getQuoteMock.mockReturnValue(null)
    stockFindFirstMock.mockResolvedValue(null)

    const svc = new RiskMonitoringService()
    await expect(callGetCurrentPrice(svc, "NSE_FO-12345")).rejects.toThrow("Unable to determine current price")
  })

  it("rejects stale Stock.ltp (older than STOCK_LTP_FALLBACK_MAX_AGE_MS) and throws", async () => {
    parseTokenMock.mockReturnValue(12345)
    getQuoteMock.mockReturnValue(null)
    stockFindFirstMock.mockResolvedValue({
      ltp: 999,
      updatedAt: new Date(Date.now() - 6 * 60 * 1000), // 6 min stale > 5 min cap
    })

    const svc = new RiskMonitoringService()
    await expect(callGetCurrentPrice(svc, "NSE_FO-12345")).rejects.toThrow("Unable to determine current price")
  })
})
