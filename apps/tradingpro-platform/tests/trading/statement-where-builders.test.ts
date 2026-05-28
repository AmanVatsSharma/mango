/**
 * @file statement-where-builders.test.ts
 * @module tests/trading
 * @description Unit tests for executed-order statement window Prisma where shape.
 * @author StockTrade
 * @created 2026-03-30
 */

import { OrderStatus } from "@prisma/client"
import { executedOrdersStatementWhere } from "@/lib/services/statement/statement-where-builders"

describe("executedOrdersStatementWhere", () => {
  const start = new Date("2026-01-01T00:00:00.000Z")
  const end = new Date("2026-01-31T23:59:59.999Z")
  const ta = "acct-1"

  it("scopes to trading account and EXECUTED with executedAt-in-range OR legacy createdAt", () => {
    const w = executedOrdersStatementWhere(ta, start, end)
    expect(w.tradingAccountId).toBe(ta)
    expect(w.status).toBe(OrderStatus.EXECUTED)
    expect(Array.isArray(w.OR)).toBe(true)
    expect(w.OR).toHaveLength(2)
    expect(w.OR?.[0]).toEqual({
      executedAt: { gte: start, lte: end },
    })
    expect(w.OR?.[1]).toEqual({
      AND: [{ executedAt: null }, { createdAt: { gte: start, lte: end } }],
    })
  })
})
