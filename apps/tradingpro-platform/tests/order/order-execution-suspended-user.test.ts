/**
 * File:        tests/order/order-execution-suspended-user.test.ts
 * Module:      Order · Validation · SUSPENDED user enforcement
 * Purpose:     Trading-p7p sub-fix 1/5 — proves OrderExecutionService rejects
 *              orders when RiskLimit.status === "SUSPENDED" before any margin
 *              or mitigation logic runs. Pre-fix the column was stored but
 *              silently ignored at admission.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none (mocks Prisma)
 *
 * Key invariants:
 *   - SUSPENDED → throws UserSuspendedTradingError (statusCode 403)
 *   - ACTIVE / WARNING / no-row → does NOT throw the suspension error
 *   - RiskLimit lookup failure → fail-open (does NOT halt platform on infra blip)
 *
 * Read order:
 *   1. mocks block (Prisma riskLimit + tradingAccount, winner-control, etc.)
 *   2. tests in "block / pass / fail-open" order
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

const tradingAccountFindUniqueMock = jest.fn()
const riskLimitFindUniqueMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findUnique: (...args: any[]) => tradingAccountFindUniqueMock(...args),
    },
    riskLimit: {
      findUnique: (...args: any[]) => riskLimitFindUniqueMock(...args),
    },
    position: {
      findFirst: jest.fn(async () => null),
    },
  },
}))

// Stub everything else the constructor imports — we only want to hit
// validateOrder() and assert the SUSPENDED branch.
jest.mock("@/lib/winners/control-service", () => ({
  getControl: jest.fn(async () => ({ rung: "NONE" })),
}))

jest.mock("@/lib/observability/logger", () => ({
  baseLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
  withRequest: () => ({ child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }),
}))

import { OrderExecutionService } from "@/lib/services/order/OrderExecutionService"
import { UserSuspendedTradingError } from "@/lib/services/risk/trading-funds-errors"
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

describe("OrderExecutionService.validateOrder — SUSPENDED user", () => {
  it("rejects with UserSuspendedTradingError when RiskLimit.status is SUSPENDED", async () => {
    riskLimitFindUniqueMock.mockResolvedValue({ status: "SUSPENDED" })

    const svc = new OrderExecutionService()
    // validateOrder is private; access via the public placeOrder wrapper would
    // require massive additional mocking. We invoke the private through a
    // typed cast — acceptable in test scope.
    const validate = (svc as unknown as {
      validateOrder: (i: any) => Promise<void>
    }).validateOrder.bind(svc)

    await expect(validate(baseInput)).rejects.toThrow(UserSuspendedTradingError)
    await expect(validate(baseInput)).rejects.toMatchObject({ statusCode: 403 })
  })

  it("does NOT reject when RiskLimit.status is ACTIVE", async () => {
    riskLimitFindUniqueMock.mockResolvedValue({ status: "ACTIVE" })

    const svc = new OrderExecutionService()
    const validate = (svc as unknown as {
      validateOrder: (i: any) => Promise<void>
    }).validateOrder.bind(svc)

    await expect(validate(baseInput)).resolves.toBeUndefined()
  })

  it("does NOT reject when RiskLimit.status is WARNING (warning != suspended)", async () => {
    riskLimitFindUniqueMock.mockResolvedValue({ status: "WARNING" })

    const svc = new OrderExecutionService()
    const validate = (svc as unknown as {
      validateOrder: (i: any) => Promise<void>
    }).validateOrder.bind(svc)

    await expect(validate(baseInput)).resolves.toBeUndefined()
  })

  it("does NOT reject when no RiskLimit row exists for the user", async () => {
    riskLimitFindUniqueMock.mockResolvedValue(null)

    const svc = new OrderExecutionService()
    const validate = (svc as unknown as {
      validateOrder: (i: any) => Promise<void>
    }).validateOrder.bind(svc)

    await expect(validate(baseInput)).resolves.toBeUndefined()
  })

  it("fails OPEN when the RiskLimit lookup throws (transient DB error)", async () => {
    riskLimitFindUniqueMock.mockRejectedValue(new Error("DB transient"))

    const svc = new OrderExecutionService()
    const validate = (svc as unknown as {
      validateOrder: (i: any) => Promise<void>
    }).validateOrder.bind(svc)

    // Per the fail-open policy mirroring the winner-mitigation pattern, an
    // infra blip on this OPTIONAL read must NOT block trading.
    await expect(validate(baseInput)).resolves.toBeUndefined()
  })
})
