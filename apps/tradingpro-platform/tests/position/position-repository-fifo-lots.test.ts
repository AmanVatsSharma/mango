/**
 * @file position-repository-fifo-lots.test.ts
 * @module tests-position
 * @description Verifies lot-wise FIFO offset behavior in PositionRepository.
 * @author StockTrade
 * @created 2026-02-24
 */

const positionFindManyMock = jest.fn()
const positionUpdateMock = jest.fn()
const positionCreateMock = jest.fn()

jest.mock("@/lib/prisma", () => ({
  prisma: {
    position: {
      findMany: (...args: any[]) => positionFindManyMock(...args),
      update: (...args: any[]) => positionUpdateMock(...args),
      create: (...args: any[]) => positionCreateMock(...args),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

import { PositionRepository } from "@/lib/repositories/PositionRepository"

function buildLot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "lot-default",
    quantity: 1,
    averagePrice: 100,
    unrealizedPnL: 0,
    dayPnL: 0,
    Stock: null,
    ...overrides,
  } as any
}

describe("PositionRepository FIFO lot upsert", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("creates a fresh lot when no opposite-side lot exists", async () => {
    positionFindManyMock.mockResolvedValue([])
    positionCreateMock.mockResolvedValue(buildLot({ id: "lot-new", quantity: 25 }))

    const repo = new PositionRepository()
    const result = await repo.upsert(
      "acct-1",
      "stock-1",
      "NIFTY26FEB25000CE",
      25,
      120.5,
      {
        productType: "MIS",
        segment: "NFO",
        instrumentId: "NFO-26000",
        optionType: "CE",
        strikePrice: 25000,
        token: 26000,
      },
    )

    expect(positionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tradingAccountId: "acct-1",
          stockId: "stock-1",
          productType: "MIS",
          quantity: { lt: 0 },
        }),
      }),
    )
    expect(positionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tradingAccountId: "acct-1",
          stockId: "stock-1",
          symbol: "NIFTY26FEB25000CE",
          productType: "MIS",
          isIntraday: true,
          quantity: 25,
        }),
      }),
    )
    expect(result.id).toBe("lot-new")
  })

  it("consumes opposite lots in FIFO order before finishing", async () => {
    positionFindManyMock.mockResolvedValue([
      buildLot({ id: "lot-oldest", quantity: -10, unrealizedPnL: 100, dayPnL: 40 }),
      buildLot({ id: "lot-next", quantity: -8, unrealizedPnL: 80, dayPnL: 32 }),
    ])
    positionUpdateMock
      .mockResolvedValueOnce(buildLot({ id: "lot-oldest", quantity: 0 }))
      .mockResolvedValueOnce(buildLot({ id: "lot-next", quantity: -3 }))

    const repo = new PositionRepository()
    const result = await repo.upsert("acct-1", "stock-1", "NIFTY26FEB25000CE", 15, 118, {
      productType: "MIS",
    })

    expect(positionUpdateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "lot-oldest" },
        data: expect.objectContaining({ quantity: 0, closedAt: expect.any(Date) }),
      }),
    )
    expect(positionUpdateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: "lot-next" },
        data: expect.objectContaining({ quantity: -3, closedAt: null }),
      }),
    )
    expect(positionCreateMock).not.toHaveBeenCalled()
    expect(result.id).toBe("lot-next")
  })

  it("creates a remainder lot after FIFO offset exhausts opposite side", async () => {
    positionFindManyMock.mockResolvedValue([
      buildLot({ id: "lot-short-1", quantity: -10, unrealizedPnL: 50, dayPnL: 20 }),
    ])
    positionUpdateMock.mockResolvedValueOnce(buildLot({ id: "lot-short-1", quantity: 0 }))
    positionCreateMock.mockResolvedValueOnce(buildLot({ id: "lot-remainder", quantity: 4 }))

    const repo = new PositionRepository()
    const result = await repo.upsert("acct-1", "stock-1", "NIFTY26FEB25000CE", 14, 119.25, {
      productType: "MIS",
    })

    expect(positionUpdateMock).toHaveBeenCalledTimes(1)
    expect(positionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quantity: 4,
          productType: "MIS",
        }),
      }),
    )
    expect(result.id).toBe("lot-remainder")
  })

  it("segregates offsets by product type and never crosses MIS/DELIVERY", async () => {
    positionFindManyMock.mockResolvedValue([])
    positionCreateMock.mockResolvedValue(buildLot({ id: "lot-delivery", quantity: -6 }))

    const repo = new PositionRepository()
    const result = await repo.upsert("acct-1", "stock-1", "RELIANCE", -6, 2500, {
      productType: "DELIVERY",
      isIntraday: false,
      segment: "NSE",
    })

    expect(positionFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          stockId: "stock-1",
          productType: "DELIVERY",
          quantity: { gt: 0 },
        }),
      }),
    )
    expect(positionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productType: "DELIVERY",
          isIntraday: false,
          quantity: -6,
        }),
      }),
    )
    expect(result.id).toBe("lot-delivery")
  })
})
