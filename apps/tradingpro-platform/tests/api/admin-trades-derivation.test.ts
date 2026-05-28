/**
 * @file tests/api/admin-trades-derivation.test.ts
 * @module tests-api
 * @description Unit tests for admin trades derivation helpers (pure functions — no Prisma mock).
 *              Focus on pinning the realized-P&L discriminator strings against the exact prefixes
 *              authored by PositionManagementService.
 * @author StockTrade
 * @created 2026-04-15
 */

import {
  REALIZED_PNL_DESCRIPTION_PREFIXES,
  isRealizedPnLTransaction,
  deriveTradeSide,
  deriveTradeStatus,
  computeAverageEntryPrice,
  computeAverageExitPrice,
  computeHeldMs,
  deriveEntryAt,
  deriveExitAt,
  type DerivationOrderLike,
} from "@/lib/server/admin-trades-derivation"

function mkOrder(partial: Partial<DerivationOrderLike>): DerivationOrderLike {
  return {
    id: partial.id ?? "o1",
    orderPurpose: partial.orderPurpose ?? "OPEN",
    orderSide: partial.orderSide ?? "BUY",
    status: partial.status ?? "EXECUTED",
    quantity: partial.quantity ?? 100,
    filledQuantity: partial.filledQuantity ?? 100,
    price: partial.price ?? null,
    averagePrice: partial.averagePrice ?? null,
    createdAt: partial.createdAt ?? new Date("2026-04-15T09:30:00Z"),
    executedAt: partial.executedAt ?? new Date("2026-04-15T09:30:00Z"),
  }
}

describe("admin-trades-derivation", () => {
  describe("REALIZED_PNL_DESCRIPTION_PREFIXES", () => {
    it("pins the exact strings authored by PositionManagementService", () => {
      expect(REALIZED_PNL_DESCRIPTION_PREFIXES).toEqual([
        "Realized P&L",
        "Position closed",
        "Position partially closed",
      ])
    })
  })

  describe("isRealizedPnLTransaction", () => {
    it("matches Realized P&L prefix with positionId", () => {
      expect(
        isRealizedPnLTransaction({ positionId: "p1", description: "Realized P&L: +500" }),
      ).toBe(true)
    })

    it("matches Position closed prefix", () => {
      expect(
        isRealizedPnLTransaction({ positionId: "p1", description: "Position closed — RELIANCE" }),
      ).toBe(true)
    })

    it("matches Position partially closed prefix", () => {
      expect(
        isRealizedPnLTransaction({
          positionId: "p1",
          description: "Position partially closed — NIFTY",
        }),
      ).toBe(true)
    })

    it("rejects when positionId is missing", () => {
      expect(
        isRealizedPnLTransaction({ positionId: null, description: "Realized P&L: +500" }),
      ).toBe(false)
    })

    it("rejects unrelated descriptions", () => {
      expect(
        isRealizedPnLTransaction({ positionId: "p1", description: "Deposit credit" }),
      ).toBe(false)
    })

    it("rejects null description", () => {
      expect(isRealizedPnLTransaction({ positionId: "p1", description: null })).toBe(false)
    })
  })

  describe("deriveTradeSide", () => {
    it("returns LONG when first OPEN order is BUY", () => {
      const orders = [mkOrder({ orderPurpose: "OPEN", orderSide: "BUY" })]
      expect(deriveTradeSide(orders, 100)).toBe("LONG")
    })

    it("returns SHORT when first OPEN order is SELL", () => {
      const orders = [mkOrder({ orderPurpose: "OPEN", orderSide: "SELL" })]
      expect(deriveTradeSide(orders, -50)).toBe("SHORT")
    })

    it("uses earliest OPEN order by createdAt, not first in array", () => {
      const orders = [
        mkOrder({
          id: "late",
          orderPurpose: "OPEN",
          orderSide: "SELL",
          createdAt: new Date("2026-04-15T12:00:00Z"),
        }),
        mkOrder({
          id: "early",
          orderPurpose: "OPEN",
          orderSide: "BUY",
          createdAt: new Date("2026-04-15T09:00:00Z"),
        }),
      ]
      expect(deriveTradeSide(orders, 0)).toBe("LONG")
    })

    it("falls back to quantity sign when no OPEN orders", () => {
      expect(deriveTradeSide([], -30)).toBe("SHORT")
      expect(deriveTradeSide([], 30)).toBe("LONG")
    })
  })

  describe("deriveTradeStatus", () => {
    const basePosition = {
      quantity: 100,
      averagePrice: 250,
      closedAt: null,
      createdAt: new Date("2026-04-15T09:00:00Z"),
    }

    it("returns OPEN when quantity != 0 and no executed CLOSE", () => {
      expect(
        deriveTradeStatus(basePosition, [mkOrder({ orderPurpose: "OPEN", status: "EXECUTED" })]),
      ).toBe("OPEN")
    })

    it("returns CLOSED when quantity is 0", () => {
      expect(
        deriveTradeStatus(
          { ...basePosition, quantity: 0 },
          [
            mkOrder({ orderPurpose: "OPEN", status: "EXECUTED" }),
            mkOrder({ id: "c1", orderPurpose: "CLOSE", orderSide: "SELL", status: "EXECUTED" }),
          ],
        ),
      ).toBe("CLOSED")
    })

    it("returns PARTIAL when quantity != 0 and at least one executed CLOSE", () => {
      expect(
        deriveTradeStatus(
          { ...basePosition, quantity: 50 },
          [
            mkOrder({ orderPurpose: "OPEN", status: "EXECUTED", quantity: 100 }),
            mkOrder({ id: "c1", orderPurpose: "CLOSE", orderSide: "SELL", status: "EXECUTED", quantity: 50 }),
          ],
        ),
      ).toBe("PARTIAL")
    })
  })

  describe("computeAverageEntryPrice", () => {
    it("is quantity-weighted across multiple OPEN orders", () => {
      const orders = [
        mkOrder({ orderPurpose: "OPEN", status: "EXECUTED", filledQuantity: 100, averagePrice: 100 }),
        mkOrder({
          id: "o2",
          orderPurpose: "OPEN",
          status: "EXECUTED",
          filledQuantity: 100,
          averagePrice: 200,
        }),
      ]
      expect(computeAverageEntryPrice(orders, null)).toBe(150)
    })

    it("falls back to positionAvg when no executed OPEN orders", () => {
      expect(computeAverageEntryPrice([], 123.45)).toBe(123.45)
    })

    it("ignores non-EXECUTED OPEN orders", () => {
      const orders = [
        mkOrder({ orderPurpose: "OPEN", status: "PENDING", filledQuantity: 100, averagePrice: 999 }),
        mkOrder({
          id: "o2",
          orderPurpose: "OPEN",
          status: "EXECUTED",
          filledQuantity: 100,
          averagePrice: 200,
        }),
      ]
      expect(computeAverageEntryPrice(orders, null)).toBe(200)
    })
  })

  describe("computeAverageExitPrice", () => {
    it("returns null when no CLOSE orders executed", () => {
      expect(
        computeAverageExitPrice([mkOrder({ orderPurpose: "OPEN", status: "EXECUTED" })]),
      ).toBeNull()
    })

    it("is quantity-weighted across CLOSE orders", () => {
      const orders = [
        mkOrder({
          orderPurpose: "CLOSE",
          orderSide: "SELL",
          status: "EXECUTED",
          filledQuantity: 50,
          averagePrice: 100,
        }),
        mkOrder({
          id: "c2",
          orderPurpose: "CLOSE",
          orderSide: "SELL",
          status: "EXECUTED",
          filledQuantity: 150,
          averagePrice: 200,
        }),
      ]
      // (50*100 + 150*200) / 200 = 35000/200 = 175
      expect(computeAverageExitPrice(orders)).toBe(175)
    })
  })

  describe("computeHeldMs", () => {
    it("returns difference for closed trade", () => {
      const entry = new Date("2026-04-15T09:00:00Z")
      const exit = new Date("2026-04-15T11:30:00Z")
      expect(computeHeldMs(entry, exit)).toBe(2.5 * 60 * 60 * 1000)
    })

    it("uses Date.now() for open trade", () => {
      const entry = new Date(Date.now() - 1000)
      const ms = computeHeldMs(entry, null)
      expect(ms).toBeGreaterThanOrEqual(1000)
    })

    it("clamps to zero for inverted ranges", () => {
      expect(computeHeldMs(new Date("2026-04-15T11:00:00Z"), new Date("2026-04-15T09:00:00Z"))).toBe(0)
    })
  })

  describe("deriveEntryAt / deriveExitAt", () => {
    it("entryAt returns earliest executedAt of OPEN orders", () => {
      const orders = [
        mkOrder({
          orderPurpose: "OPEN",
          status: "EXECUTED",
          executedAt: new Date("2026-04-15T10:00:00Z"),
        }),
        mkOrder({
          id: "o2",
          orderPurpose: "OPEN",
          status: "EXECUTED",
          executedAt: new Date("2026-04-15T09:00:00Z"),
        }),
      ]
      expect(deriveEntryAt(orders, new Date("2026-04-15T12:00:00Z"))).toBe(
        new Date("2026-04-15T09:00:00Z").toISOString(),
      )
    })

    it("entryAt falls back to position.createdAt when no executed OPEN", () => {
      expect(deriveEntryAt([], new Date("2026-04-15T09:00:00Z"))).toBe(
        new Date("2026-04-15T09:00:00Z").toISOString(),
      )
    })

    it("exitAt prefers position.closedAt", () => {
      const closedAt = new Date("2026-04-15T15:00:00Z")
      expect(deriveExitAt([], closedAt)).toBe(closedAt.toISOString())
    })

    it("exitAt uses latest CLOSE executedAt when position.closedAt is null", () => {
      const orders = [
        mkOrder({
          orderPurpose: "CLOSE",
          orderSide: "SELL",
          status: "EXECUTED",
          executedAt: new Date("2026-04-15T13:00:00Z"),
        }),
        mkOrder({
          id: "c2",
          orderPurpose: "CLOSE",
          orderSide: "SELL",
          status: "EXECUTED",
          executedAt: new Date("2026-04-15T14:30:00Z"),
        }),
      ]
      expect(deriveExitAt(orders, null)).toBe(new Date("2026-04-15T14:30:00Z").toISOString())
    })

    it("exitAt returns null for open trade with no closes", () => {
      expect(deriveExitAt([], null)).toBeNull()
    })
  })
})
