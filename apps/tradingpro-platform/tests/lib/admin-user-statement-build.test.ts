/**
 * @file admin-user-statement-build.test.ts
 * @module tests-lib
 * @description Unit tests for admin statement row merge, ledger-first dedupe, and running balances.
 * @author StockTrade
 * @created 2026-03-30
 */

import { OrderStatus, TransactionType } from "@prisma/client"
import {
  applyRunningBalancesAndSortDesc,
  buildStatementRowsFromEntities,
  collectOrderIdsWithLedger,
} from "@/lib/services/admin/admin-user-statement-build"

describe("admin-user-statement-build", () => {
  const t0 = new Date("2026-03-01T10:00:00.000Z")
  const t1 = new Date("2026-03-02T10:00:00.000Z")

  it("collectOrderIdsWithLedger gathers linked order ids", () => {
    const s = collectOrderIdsWithLedger([{ orderId: "o1" }, { orderId: null }, { orderId: "o2" }])
    expect([...s].sort()).toEqual(["o1", "o2"])
  })

  it("skips synthetic order row when a ledger transaction references the same order", () => {
    const rows = buildStatementRowsFromEntities({
      orders: [
        {
          id: "ord-1",
          symbol: "NIFTY",
          orderSide: "BUY",
          quantity: 1,
          filledQuantity: 1,
          price: 100,
          averagePrice: 100,
          status: OrderStatus.EXECUTED,
          executedAt: t1,
          createdAt: t1,
        },
      ],
      transactions: [
        {
          id: "tx-1",
          amount: 100,
          type: TransactionType.DEBIT,
          description: "fill",
          createdAt: t1,
          orderId: "ord-1",
        },
      ],
      deposits: [],
      withdrawals: [],
    })
    const orderSynthetic = rows.find((r) => r.id === "order-ord-1")
    const ledger = rows.find((r) => r.id === "tx-tx-1")
    expect(orderSynthetic).toBeUndefined()
    expect(ledger).toBeDefined()
    expect(ledger?.type).toBe("debit")
  })

  it("keeps synthetic order row when no ledger row exists for that order", () => {
    const rows = buildStatementRowsFromEntities({
      orders: [
        {
          id: "ord-2",
          symbol: "NIFTY",
          orderSide: "SELL",
          quantity: 2,
          filledQuantity: 2,
          price: 50,
          averagePrice: 50,
          status: OrderStatus.EXECUTED,
          executedAt: t1,
          createdAt: t1,
        },
      ],
      transactions: [],
      deposits: [],
      withdrawals: [],
    })
    expect(rows.some((r) => r.id === "order-ord-2")).toBe(true)
    expect(rows[0].amount).toBe(100)
  })

  it("applyRunningBalancesAndSortDesc ends at current balance and sorts newest first", () => {
    const merged = [
      { id: "a", dateIso: t0.toISOString(), type: "deposit" as const, description: "d", amount: 500 },
      { id: "b", dateIso: t1.toISOString(), type: "debit" as const, description: "x", amount: -200 },
    ]
    const current = 700
    const out = applyRunningBalancesAndSortDesc(merged, current)
    expect(out.map((r) => r.id)).toEqual(["b", "a"])
    const newest = out[0]
    const oldest = out[1]
    expect(newest.balance).toBe(700)
    // Chronological first event was deposit +500 → balance after that row is 900; then debit −200 → 700 (newest).
    expect(oldest.balance).toBe(900)
  })
})
