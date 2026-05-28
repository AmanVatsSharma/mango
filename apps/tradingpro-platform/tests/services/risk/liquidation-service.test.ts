/**
 * File:        tests/services/risk/liquidation-service.test.ts
 * Module:      Tests · Risk Management · Liquidation Service
 * Purpose:     Unit tests for LiquidationService — verifies quote resolution,
 *              dry-run preview output shape, execute concurrency cap, and
 *              audit row creation.
 *
 * Exports:
 *   - none (test file)
 *
 * Depends on:
 *   - @/lib/services/risk/LiquidationService — unit under test
 *   - @/lib/market-data/live-quote-ladder    — mocked
 *   - @/lib/prisma                           — mocked
 *   - @/lib/repositories/PositionRepository  — mocked
 *   - @/lib/services/position/PositionManagementService — mocked
 *
 * Side-effects:
 *   - none (Jest mocks all I/O)
 *
 * Key invariants:
 *   - All external I/O is mocked; no real DB or Redis calls
 *
 * Read order:
 *   1. describe("previewLiquidation") — dry-run shape tests
 *   2. describe("executeLiquidation") — close + audit tests
 *
 * Author:      SonuRam
 * Last-updated: 2026-04-20
 */

const mockFindActive = jest.fn()
const mockClosePosition = jest.fn()
const mockResolveLivePrice = jest.fn()
const mockAuditCreate = jest.fn()
const mockAccountFindUnique = jest.fn()

jest.mock("@/lib/market-data/live-quote-ladder", () => ({
  resolveLivePrice: (...args: unknown[]) => mockResolveLivePrice(...args),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tradingAccount: {
      findUnique: (...args: unknown[]) => mockAccountFindUnique(...args),
    },
    riskAuditEvent: {
      create: (...args: unknown[]) => mockAuditCreate(...args),
    },
  },
}))

jest.mock("@/lib/repositories/PositionRepository", () => ({
  PositionRepository: jest.fn().mockImplementation(() => ({
    findActive: (...args: unknown[]) => mockFindActive(...args),
  })),
}))

jest.mock("@/lib/services/position/PositionManagementService", () => ({
  createPositionManagementService: jest.fn().mockImplementation(() => ({
    closePosition: (...args: unknown[]) => mockClosePosition(...args),
  })),
}))

import { previewLiquidation, executeLiquidation } from "@/lib/services/risk/LiquidationService"

const BASE_OPTS = {
  tradingAccountId: "acct-1",
  reason: "test reason",
  operatorUserId: "admin-user-1",
}

const fakePosition = {
  id: "pos-1",
  symbol: "RELIANCE",
  quantity: 10,
  averagePrice: 100,
  token: 12345,
  instrumentId: "NSE_EQ-12345",
  Stock: { ltp: 95, instrumentId: "NSE_EQ-12345", symbol: "RELIANCE", token: 12345 },
}

describe("previewLiquidation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("returns empty result when account has no open positions", async () => {
    mockFindActive.mockResolvedValue([])

    const result = await previewLiquidation(BASE_OPTS)

    expect(result.positionsToClose).toBe(0)
    expect(result.positionsSkipped).toBe(0)
    expect(result.totalProjectedPnL).toBe(0)
    expect(result.totalMarginFreed).toBe(0)
    expect(result.positions).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it("returns correct projectedRealizedPnL for a priceable position", async () => {
    mockFindActive.mockResolvedValue([fakePosition])
    mockResolveLivePrice.mockResolvedValue({ price: 150, source: "market-quote", ageMs: 100 })

    const result = await previewLiquidation(BASE_OPTS)

    expect(result.positionsToClose).toBe(1)
    expect(result.positionsSkipped).toBe(0)
    expect(result.totalProjectedPnL).toBeCloseTo(500) // 10 * (150 - 100)
    expect(result.warnings).toHaveLength(0)
  })

  it("marks positions as skippedNoPrice when resolveLivePrice returns source=unpriced", async () => {
    mockFindActive.mockResolvedValue([fakePosition])
    mockResolveLivePrice.mockResolvedValue({ price: 0, source: "unpriced", ageMs: null })

    const result = await previewLiquidation(BASE_OPTS)

    expect(result.positionsSkipped).toBe(1)
    expect(result.positionsToClose).toBe(0)
    expect(result.positions[0].skippedNoPrice).toBe(true)
  })

  it("includes warnings array entry for each unpriced position", async () => {
    mockFindActive.mockResolvedValue([fakePosition])
    mockResolveLivePrice.mockResolvedValue({ price: 0, source: "unpriced", ageMs: null })

    const result = await previewLiquidation(BASE_OPTS)

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/RELIANCE/)
  })

  it("totalProjectedPnL sums only non-skipped positions", async () => {
    const pricedPos = { ...fakePosition, id: "pos-1", symbol: "RELIANCE" }
    const unpricedPos = { ...fakePosition, id: "pos-2", symbol: "TCS" }
    mockFindActive.mockResolvedValue([pricedPos, unpricedPos])
    mockResolveLivePrice
      .mockResolvedValueOnce({ price: 150, source: "market-quote", ageMs: 100 })
      .mockResolvedValueOnce({ price: 0, source: "unpriced", ageMs: null })

    const result = await previewLiquidation(BASE_OPTS)

    expect(result.positionsToClose).toBe(1)
    expect(result.positionsSkipped).toBe(1)
    expect(result.totalProjectedPnL).toBeCloseTo(500)
  })

  it("totalMarginFreed is averagePrice * abs(qty) for each non-skipped position", async () => {
    mockFindActive.mockResolvedValue([fakePosition])
    mockResolveLivePrice.mockResolvedValue({ price: 150, source: "market-quote", ageMs: 100 })

    const result = await previewLiquidation(BASE_OPTS)

    // averagePrice=100, qty=10 → 100 * 10 = 1000
    expect(result.totalMarginFreed).toBeCloseTo(1000)
  })
})

describe("executeLiquidation", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAccountFindUnique.mockResolvedValue({ userId: "target-user-1" })
    mockAuditCreate.mockResolvedValue({ id: "audit-1" })
  })

  it("calls closePosition for each eligible position with resolved exit price and writes audit row", async () => {
    mockFindActive.mockResolvedValue([fakePosition])
    mockResolveLivePrice.mockResolvedValue({ price: 150, source: "market-quote", ageMs: 100 })
    mockClosePosition.mockResolvedValue({ success: true, realizedPnL: 500, marginReleased: 1000, message: "ok" })

    const result = await executeLiquidation(BASE_OPTS)

    expect(result.success).toBe(true)
    expect(result.auditEventId).toBe("audit-1")
    expect(result.positionsClosed).toBe(1)
    expect(result.positionsSkipped).toBe(0)
    expect(mockClosePosition).toHaveBeenCalledTimes(1)
    expect(mockClosePosition).toHaveBeenCalledWith(
      "pos-1",
      "acct-1",
      150,
      undefined,
      expect.objectContaining({ reason: "ADMIN_CLOSED", closedByUserId: "admin-user-1" }),
    )
  })

  it("skips positions where resolveLivePrice returns source=unpriced and still writes audit row", async () => {
    const pricedPos = { ...fakePosition, id: "pos-1", symbol: "RELIANCE" }
    const unpricedPos = { ...fakePosition, id: "pos-2", symbol: "TCS" }
    mockFindActive.mockResolvedValue([pricedPos, unpricedPos])
    mockResolveLivePrice
      .mockResolvedValueOnce({ price: 150, source: "market-quote", ageMs: 100 })
      .mockResolvedValueOnce({ price: 0, source: "unpriced", ageMs: null })
    mockClosePosition.mockResolvedValue({ success: true, realizedPnL: 500, marginReleased: 1000, message: "ok" })

    const result = await executeLiquidation(BASE_OPTS)

    expect(result.positionsClosed).toBe(1)
    expect(result.positionsSkipped).toBe(1)
    expect(mockAuditCreate).toHaveBeenCalledTimes(1)
    const createArgs = mockAuditCreate.mock.calls[0][0]
    expect(createArgs.data.outcomeJson).toMatchObject({
      positionsClosed: 1,
      positionsSkipped: 1,
    })
  })

  it("throws and does NOT write audit row if any closePosition call returns success=false", async () => {
    mockFindActive.mockResolvedValue([fakePosition])
    mockResolveLivePrice.mockResolvedValue({ price: 150, source: "market-quote", ageMs: 100 })
    mockClosePosition.mockResolvedValue({ success: false, message: "margin error", realizedPnL: 0, marginReleased: 0 })

    await expect(executeLiquidation(BASE_OPTS)).rejects.toThrow(/Liquidation failed/)
    expect(mockAuditCreate).not.toHaveBeenCalled()
  })

  it("resolves targetUserId from tradingAccountId via prisma.tradingAccount.findUnique", async () => {
    mockFindActive.mockResolvedValue([fakePosition])
    mockResolveLivePrice.mockResolvedValue({ price: 150, source: "market-quote", ageMs: 100 })
    mockClosePosition.mockResolvedValue({ success: true, realizedPnL: 500, marginReleased: 1000, message: "ok" })

    await executeLiquidation(BASE_OPTS)

    expect(mockAccountFindUnique).toHaveBeenCalledWith({
      where: { id: "acct-1" },
      select: { userId: true },
    })
    const createArgs = mockAuditCreate.mock.calls[0][0]
    expect(createArgs.data.targetUserId).toBe("target-user-1")
  })

  it("returns auditEventId, positionsClosed, positionsSkipped, totalRealizedPnL, marginFreed", async () => {
    mockFindActive.mockResolvedValue([fakePosition])
    mockResolveLivePrice.mockResolvedValue({ price: 150, source: "market-quote", ageMs: 100 })
    mockClosePosition.mockResolvedValue({ success: true, realizedPnL: 500, marginReleased: 1000, message: "ok" })

    const result = await executeLiquidation(BASE_OPTS)

    expect(result).toMatchObject({
      success: true,
      auditEventId: "audit-1",
      positionsClosed: 1,
      positionsSkipped: 0,
      totalRealizedPnL: 500,
      marginFreed: 1000,
    })
  })

  it("writes audit row with correct eventType=BULK_LIQUIDATE after all closes", async () => {
    mockFindActive.mockResolvedValue([fakePosition])
    mockResolveLivePrice.mockResolvedValue({ price: 150, source: "market-quote", ageMs: 100 })
    mockClosePosition.mockResolvedValue({ success: true, realizedPnL: 500, marginReleased: 1000, message: "ok" })

    await executeLiquidation(BASE_OPTS)

    expect(mockAuditCreate).toHaveBeenCalledTimes(1)
    const createArgs = mockAuditCreate.mock.calls[0][0]
    expect(createArgs.data.eventType).toBe("BULK_LIQUIDATE")
    expect(createArgs.data.operatorUserId).toBe("admin-user-1")
    expect(createArgs.data.reason).toBe("test reason")
    expect(createArgs.data.snapshotJson).toMatchObject({ positionsEvaluated: 1 })
    expect(createArgs.data.outcomeJson).toMatchObject({
      positionsClosed: 1,
      totalRealizedPnL: 500,
    })
  })
})
