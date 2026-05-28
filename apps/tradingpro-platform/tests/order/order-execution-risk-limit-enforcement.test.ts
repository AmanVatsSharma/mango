/**
 * File:        tests/order/order-execution-risk-limit-enforcement.test.ts
 * Module:      Order · Validation · RiskLimit enforcement (multi-fix)
 * Purpose:     Trading-cgn (maxDailyTrades) — proves validateOrder counts
 *              today's orders against RiskLimit.maxDailyTrades and rejects
 *              when the cap is hit. Pre-fix the column was stored but never
 *              read at admission. (maxPositionSize lives in placeOrder
 *              post-price-resolution and is covered by the existing flow.)
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none (mocks Prisma)
 *
 * Key invariants:
 *   - maxDailyTrades = 0 (default) → unlimited, no count query, no reject
 *   - maxDailyTrades = N, count < N → pass
 *   - maxDailyTrades = N, count >= N → DailyTradeCapTradingError (statusCode 403)
 *   - count query uses IST 00:00 boundary, not UTC
 *
 * Read order:
 *   1. mocks block (Prisma riskLimit + tradingAccount + order count, winner-control)
 *   2. tests in "no-cap / under-cap / at-cap / over-cap" order
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

const tradingAccountFindUniqueMock = jest.fn()
const riskLimitFindUniqueMock = jest.fn()
const orderCountMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findUnique: (...args: any[]) => tradingAccountFindUniqueMock(...args),
    },
    riskLimit: {
      findUnique: (...args: any[]) => riskLimitFindUniqueMock(...args),
    },
    order: {
      count: (...args: any[]) => orderCountMock(...args),
    },
    position: {
      findFirst: jest.fn(async () => null),
    },
  },
}))

jest.mock("@/lib/winners/control-service", () => ({
  getControl: jest.fn(async () => ({ rung: "NONE" })),
}))

jest.mock("@/lib/observability/logger", () => ({
  baseLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
  withRequest: () => ({ child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }),
}))

import { OrderExecutionService } from "@/lib/services/order/OrderExecutionService"
import { DailyTradeCapTradingError } from "@/lib/services/risk/trading-funds-errors"
import { OrderType, OrderSide } from "@prisma/client"

const baseInput = {
  tradingAccountId: "ta-1",
  symbol: "TESTSYM",
  quantity: 1,
  price: 100,
  orderType: OrderType.MARKET,
  orderSide: OrderSide.BUY,
  productType: "MIS",
  segment: "NSE",
} as any

beforeEach(() => {
  jest.clearAllMocks()
  tradingAccountFindUniqueMock.mockResolvedValue({
    id: "ta-1",
    userId: "user-A",
    balance: 100000,
    availableMargin: 100000,
  })
})

describe("OrderExecutionService.validateOrder — maxDailyTrades", () => {
  it("default 0 (unlimited) skips the count query entirely", async () => {
    riskLimitFindUniqueMock.mockResolvedValue({
      status: "ACTIVE",
      maxLeverage: null,
      maxPositionSize: null,
      maxDailyTrades: 0,
    })

    const svc = new OrderExecutionService()
    const validate = (svc as unknown as {
      validateOrder: (i: any) => Promise<void>
    }).validateOrder.bind(svc)

    await expect(validate(baseInput)).resolves.toBeUndefined()
    expect(orderCountMock).not.toHaveBeenCalled()
  })

  it("count < cap → passes", async () => {
    riskLimitFindUniqueMock.mockResolvedValue({
      status: "ACTIVE",
      maxLeverage: null,
      maxPositionSize: null,
      maxDailyTrades: 10,
    })
    orderCountMock.mockResolvedValue(3)

    const svc = new OrderExecutionService()
    const validate = (svc as unknown as {
      validateOrder: (i: any) => Promise<void>
    }).validateOrder.bind(svc)

    await expect(validate(baseInput)).resolves.toBeUndefined()
    expect(orderCountMock).toHaveBeenCalledTimes(1)
  })

  it("count == cap → rejects with DailyTradeCapTradingError (statusCode 403)", async () => {
    riskLimitFindUniqueMock.mockResolvedValue({
      status: "ACTIVE",
      maxLeverage: null,
      maxPositionSize: null,
      maxDailyTrades: 5,
    })
    orderCountMock.mockResolvedValue(5)

    const svc = new OrderExecutionService()
    const validate = (svc as unknown as {
      validateOrder: (i: any) => Promise<void>
    }).validateOrder.bind(svc)

    await expect(validate(baseInput)).rejects.toThrow(DailyTradeCapTradingError)
    await expect(validate(baseInput)).rejects.toMatchObject({ statusCode: 403 })
  })

  it("count > cap → rejects (defensive — handles drift)", async () => {
    riskLimitFindUniqueMock.mockResolvedValue({
      status: "ACTIVE",
      maxLeverage: null,
      maxPositionSize: null,
      maxDailyTrades: 5,
    })
    orderCountMock.mockResolvedValue(7)

    const svc = new OrderExecutionService()
    const validate = (svc as unknown as {
      validateOrder: (i: any) => Promise<void>
    }).validateOrder.bind(svc)

    await expect(validate(baseInput)).rejects.toThrow(DailyTradeCapTradingError)
  })

  it("count query filters by tradingAccountId AND createdAt >= IST start of day", async () => {
    riskLimitFindUniqueMock.mockResolvedValue({
      status: "ACTIVE",
      maxLeverage: null,
      maxPositionSize: null,
      maxDailyTrades: 10,
    })
    orderCountMock.mockResolvedValue(0)

    const svc = new OrderExecutionService()
    const validate = (svc as unknown as {
      validateOrder: (i: any) => Promise<void>
    }).validateOrder.bind(svc)

    await validate(baseInput)
    const callArg = orderCountMock.mock.calls[0][0]
    expect(callArg.where.tradingAccountId).toBe("ta-1")
    expect(callArg.where.createdAt.gte).toBeInstanceOf(Date)
    // The boundary date should be within the last 24h (rough sanity check —
    // it's IST midnight, never older than 24h from now).
    const ageMs = Date.now() - callArg.where.createdAt.gte.getTime()
    expect(ageMs).toBeGreaterThanOrEqual(0)
    expect(ageMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 1000) // +1s slack
  })
})
