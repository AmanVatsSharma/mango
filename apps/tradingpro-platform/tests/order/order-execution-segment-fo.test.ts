/**
 * File:        tests/order/order-execution-segment-fo.test.ts
 * Module:      Tests · Order · Segment-aware F&O behaviour
 * Purpose:     Lock the wiring between `normalizeInstrumentSegment` (watchlist storage)
 *              and `OrderExecutionService.placeOrder` so adding a BSE_FO / NCO_FO /
 *              CDS_FO / BCD_FO instrument to a watchlist and ordering from it produces:
 *                 - productType === "NRML"     (not CNC)
 *                 - lot-multiple enforcement when stock.lot_size > 1
 *                 - watchlist hydration filling missing F&O metadata
 *              Pre-2026-05 the service hand-enumerated NFO/FNO/NSE_FO/MCX/MCX_FO and
 *              silently misrouted the new venues to CNC + skipped lot enforcement.
 *
 * Exports:     none (jest test file)
 *
 * Depends on:
 *   - @/lib/services/order/OrderExecutionService — system under test
 *   - @/lib/services/order/place-order-watchlist-hydration (mocked) — to simulate a
 *     watchlist row populating thin client payloads
 *
 * Side-effects: none (all DB / market-data calls mocked).
 *
 * Key invariants:
 *   - Tests assert the exact `productType` written into `OrderRepository.create`,
 *     which is what the worker reads to compute fills + Position records. This is
 *     the single observable downstream of `resolveDefaultProductTypeForSegment`.
 *   - Lot-multiple test forces a quantity that fails the modulus check; the service
 *     must throw before order creation. Verifies `isFOSegment` triggers the gate
 *     for BSE_FO (not just NSE_FO).
 *
 * Read order:
 *   1. The shared mocks (jest.mock blocks) — pin every external collaborator.
 *   2. buildPlacementService() — common scaffolding.
 *   3. Each test — segment-specific assertion.
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

jest.mock("@/lib/server/workers/registry", () => ({
  getWorkersSnapshot: jest.fn(),
}))

jest.mock("@/lib/market-data/server-market-data.service", () => ({
  getServerMarketDataService: jest.fn(),
  SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS: 1_500,
}))

jest.mock("@/lib/services/utils/prisma-transaction", () => ({
  executeInTransaction: jest.fn(),
}))

jest.mock("@/lib/services/order/place-order-watchlist-hydration", () => ({
  hydratePlaceOrderFromWatchlist: jest.fn(),
}))

jest.mock("@/lib/winners/control-service", () => ({
  getControl: jest.fn().mockResolvedValue({ rung: "NONE" }),
}))

jest.mock("@/lib/market-control/market-control-loader", () => ({
  loadMarketControlConfig: jest.fn().mockResolvedValue({ perUserOverridesEnabled: false }),
}))

jest.mock("@/lib/market-control/market-control-resolver", () => ({
  resolveMarketControls: jest.fn().mockReturnValue({
    blocked: false,
    spreadPct: 0,
    appliedSegmentOverride: null,
    userOverrideApplied: false,
    marginMultiplier: 1,
    resolvedSegmentKey: "BSE_FO",
    tiltBiasPct: 0,
    forceWorstFill: false,
    killSwitch: false,
    antiScalping: {},
    priceTilt: {},
    orderBehavior: { limitOrder: {}, marketOrder: {} },
    symbolOverride: null,
  }),
}))

jest.mock("@/lib/market-control/user-group", () => ({
  getUserMarketGroup: jest.fn().mockResolvedValue("STANDARD"),
}))

jest.mock("@/lib/market-control/user-segment-lookup", () => ({
  getUserActiveSegmentIds: jest.fn().mockResolvedValue([]),
}))

jest.mock("@/lib/repositories/UserMarketControlOverrideRepository", () => ({
  UserMarketControlOverrideRepository: {
    findByUserId: jest.fn().mockResolvedValue(null),
  },
}))

import { OrderExecutionService } from "@/lib/services/order/OrderExecutionService"
import { OrderType, OrderSide } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { executeInTransaction } from "@/lib/services/utils/prisma-transaction"
import { hydratePlaceOrderFromWatchlist } from "@/lib/services/order/place-order-watchlist-hydration"

const executeInTransactionMock = executeInTransaction as jest.MockedFunction<typeof executeInTransaction>
const hydrateMock = hydratePlaceOrderFromWatchlist as jest.MockedFunction<
  typeof hydratePlaceOrderFromWatchlist
>

const buildLogger = () =>
  ({
    logOrder: jest.fn().mockResolvedValue(undefined),
    error: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn().mockResolvedValue(undefined),
    logSystemEvent: jest.fn().mockResolvedValue(undefined),
  }) as any

describe("OrderExecutionService — segment-aware F&O routing (BSE_FO / NCO_FO / CDS_FO / BCD_FO)", () => {
  beforeEach(() => {
    executeInTransactionMock.mockImplementation(async (fn: any) => fn({}))
    jest
      .spyOn(prisma.tradingAccount, "findUnique")
      .mockResolvedValue({ id: "acct-fo", userId: "user-fo" } as any)
  })

  afterEach(() => {
    executeInTransactionMock.mockReset()
    executeInTransactionMock.mockImplementation(async (fn: any) => fn({}))
    hydrateMock.mockReset()
    jest.restoreAllMocks()
  })

  it("defaults productType to NRML for BSE_FO when client sent no productType (was previously CNC)", async () => {
    // Simulate a thin client: only watchlistItemId + tradingAccountId. Hydration restores
    // BSE_FO segment + option metadata as if the user added a SENSEX option to a watchlist.
    hydrateMock.mockImplementation(async (input) => ({
      input: {
        ...input,
        symbol: "SENSEX25MAY80000CE",
        segment: "BSE_FO",
        exchange: "BSE_FO",
        token: 99001,
        instrumentType: "CE",
        optionType: "CE",
        strikePrice: 80000,
        expiry: "2026-05-29",
        lotSize: 10,
        ltp: 250,
        close: 245,
      },
      merged: true,
    }))

    const service = new OrderExecutionService(buildLogger())

    jest.spyOn(service as any, "resolveExecutionPriceForPlacement").mockResolvedValue({
      executionPrice: 250,
      pricingPath: "LIMIT",
      sourceDetail: "LIMIT_ORDER",
      workerHealth: "healthy",
    })
    jest.spyOn((service as any).marketRealism, "applyMarketRealism").mockResolvedValue({
      executionPrice: 250,
      spreadPercent: 0,
      slippagePercent: 0,
    })
    jest.spyOn((service as any).marginCalculator, "calculateMargin").mockResolvedValue({
      requiredMargin: 0,
      totalCharges: 0,
      totalRequired: 0,
      brokerage: 0,
      leverage: 1,
      turnover: 2500,
      segment: "BSE_FO",
      productType: "NRML",
      chargesBreakdown: {},
    })
    jest
      .spyOn((service as any).marginCalculator, "validateMargin")
      .mockResolvedValue({ isValid: true, availableMargin: 100000, requiredAmount: 0, shortfall: 0 })
    jest.spyOn(service as any, "ensureStockForOrder").mockResolvedValue({
      id: "stock-bse-fo",
      segment: "BSE_FO",
      lot_size: 10,
    })
    const orderCreate = jest
      .spyOn((service as any).orderRepo, "create")
      .mockResolvedValue({ id: "ord-bse-fo-1" })

    const result = await service.placeOrder({
      tradingAccountId: "acct-fo",
      userId: "user-fo",
      symbol: "PENDING",
      quantity: 10,
      price: 250,
      orderType: OrderType.LIMIT,
      orderSide: OrderSide.BUY,
      watchlistItemId: "wl-bse-fo-1",
    } as any)

    expect(result.success).toBe(true)
    expect(orderCreate).toHaveBeenCalledTimes(1)
    const orderCreateCall = orderCreate.mock.calls[0][0] as { productType: string }
    expect(orderCreateCall.productType).toBe("NRML")
  })

  it("defaults productType to NRML for NCO_FO future", async () => {
    hydrateMock.mockImplementation(async (input) => ({
      input: {
        ...input,
        symbol: "CASTOR25JUNFUT",
        segment: "NCO_FO",
        exchange: "NCO_FO",
        token: 99002,
        instrumentType: "FUT",
        expiry: "2026-06-20",
        lotSize: 10,
        ltp: 6500,
        close: 6480,
      },
      merged: true,
    }))

    const service = new OrderExecutionService(buildLogger())

    jest.spyOn(service as any, "resolveExecutionPriceForPlacement").mockResolvedValue({
      executionPrice: 6500,
      pricingPath: "LIMIT",
      sourceDetail: "LIMIT_ORDER",
      workerHealth: "healthy",
    })
    jest.spyOn((service as any).marketRealism, "applyMarketRealism").mockResolvedValue({
      executionPrice: 6500,
      spreadPercent: 0,
      slippagePercent: 0,
    })
    jest.spyOn((service as any).marginCalculator, "calculateMargin").mockResolvedValue({
      requiredMargin: 0,
      totalCharges: 0,
      totalRequired: 0,
      brokerage: 0,
      leverage: 1,
      turnover: 65000,
      segment: "NCO_FO",
      productType: "NRML",
      chargesBreakdown: {},
    })
    jest
      .spyOn((service as any).marginCalculator, "validateMargin")
      .mockResolvedValue({ isValid: true, availableMargin: 100000, requiredAmount: 0, shortfall: 0 })
    jest.spyOn(service as any, "ensureStockForOrder").mockResolvedValue({
      id: "stock-nco-fo",
      segment: "NCO_FO",
      lot_size: 10,
    })
    const orderCreate = jest
      .spyOn((service as any).orderRepo, "create")
      .mockResolvedValue({ id: "ord-nco-fo-1" })

    const result = await service.placeOrder({
      tradingAccountId: "acct-fo",
      userId: "user-fo",
      symbol: "PENDING",
      quantity: 10,
      price: 6500,
      orderType: OrderType.LIMIT,
      orderSide: OrderSide.BUY,
      watchlistItemId: "wl-nco-fo-1",
    } as any)

    expect(result.success).toBe(true)
    const orderCreateCall = orderCreate.mock.calls[0][0] as { productType: string }
    expect(orderCreateCall.productType).toBe("NRML")
  })

  it("rejects BSE_FO orders whose quantity is not a lot multiple", async () => {
    hydrateMock.mockImplementation(async (input) => ({
      input: {
        ...input,
        symbol: "SENSEX25MAY80000CE",
        segment: "BSE_FO",
        exchange: "BSE_FO",
        token: 99003,
        instrumentType: "CE",
        optionType: "CE",
        strikePrice: 80000,
        expiry: "2026-05-29",
        lotSize: 10,
        ltp: 250,
        close: 245,
      },
      merged: true,
    }))

    const service = new OrderExecutionService(buildLogger())

    jest.spyOn(service as any, "resolveExecutionPriceForPlacement").mockResolvedValue({
      executionPrice: 250,
      pricingPath: "LIMIT",
      sourceDetail: "LIMIT_ORDER",
      workerHealth: "healthy",
    })
    jest.spyOn((service as any).marketRealism, "applyMarketRealism").mockResolvedValue({
      executionPrice: 250,
      spreadPercent: 0,
      slippagePercent: 0,
    })
    jest.spyOn((service as any).marginCalculator, "calculateMargin").mockResolvedValue({
      requiredMargin: 0,
      totalCharges: 0,
      totalRequired: 0,
      brokerage: 0,
      leverage: 1,
      turnover: 1750,
      segment: "BSE_FO",
      productType: "NRML",
      chargesBreakdown: {},
    })
    jest
      .spyOn((service as any).marginCalculator, "validateMargin")
      .mockResolvedValue({ isValid: true, availableMargin: 100000, requiredAmount: 0, shortfall: 0 })
    jest.spyOn(service as any, "ensureStockForOrder").mockResolvedValue({
      id: "stock-bse-fo-bad-lot",
      segment: "BSE_FO",
      lot_size: 10,
    })
    const orderCreate = jest.spyOn((service as any).orderRepo, "create")

    // Quantity 7 is NOT a multiple of lot_size 10; service must throw before order create.
    // Non-MARKET-order placement errors propagate as exceptions, not {success:false} —
    // the API route layer turns them into 4xx responses.
    await expect(
      service.placeOrder({
        tradingAccountId: "acct-fo",
        userId: "user-fo",
        symbol: "PENDING",
        quantity: 7,
        price: 250,
        orderType: OrderType.LIMIT,
        orderSide: OrderSide.BUY,
        watchlistItemId: "wl-bse-fo-bad-lot",
      } as any),
    ).rejects.toThrow(/multiple of lot size/i)
    expect(orderCreate).not.toHaveBeenCalled()
  })
})
