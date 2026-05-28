/**
 * @file statement-event-builder.test.ts
 * @module tests-trading
 * @description Unit tests for statement line classification, dedupe, ordering, and event grouping.
 * @author StockTrade
 * @created 2026-04-01
 */

import { OrderStatus, TransactionType } from "@prisma/client"
import {
  buildStatementLinesFromEntities,
  compareStatementLinesAsc,
  groupStatementEvents,
  isMarginOnlyLedgerDescription,
} from "@/lib/services/statement/statement-event-builder"

describe("statement-event-builder", () => {
  const t0 = new Date("2026-03-01T10:00:00.000Z")
  const t1 = new Date("2026-03-01T10:00:00.100Z")

  it("isMarginOnlyLedgerDescription detects margin reserve lines", () => {
    expect(isMarginOnlyLedgerDescription("Margin blocked for order: BUY 1 NIFTY @ ₹100")).toBe(true)
    expect(isMarginOnlyLedgerDescription("Realized P&L credit: SELL 1 X. Profit: ₹10.")).toBe(false)
  })

  it("dedupes completed deposit when ledger cites Deposit ref tail", () => {
    const depositId = "aaaaaaaa-12345678"
    const { lines, dedupedDepositIds } = buildStatementLinesFromEntities({
      orders: [],
      transactions: [
        {
          id: "tx1",
          amount: 5000,
          type: TransactionType.CREDIT,
          description: `Deposit approved: ₹5,000 via UPI. UTR/Ref: ABC. Deposit ref: ${depositId.slice(-8)}. Approved by: Admin.`,
          createdAt: t1,
          orderId: null,
        },
      ],
      deposits: [
        {
          id: depositId,
          amount: 5000,
          method: "UPI",
          utr: "ABC",
          status: "COMPLETED",
          createdAt: t0,
          processedAt: t1,
        },
      ],
      withdrawals: [],
    })
    expect(dedupedDepositIds).toEqual([depositId])
    expect(lines.some((l) => l.id === `dep-${depositId}`)).toBe(false)
    expect(lines.find((l) => l.id === "tx-tx1")).toBeDefined()
  })

  it("margin ledger line has cashAmount 0", () => {
    const { lines } = buildStatementLinesFromEntities({
      orders: [],
      transactions: [
        {
          id: "m1",
          amount: 100,
          type: TransactionType.DEBIT,
          description: "Margin blocked for order: BUY 1 NIFTY @ ₹100. Amount: ₹100.",
          createdAt: t0,
          orderId: "o1",
        },
      ],
      deposits: [],
      withdrawals: [],
    })
    const m = lines.find((l) => l.id === "tx-m1")
    expect(m?.cashAmount).toBe(0)
    expect(m?.marginOnly).toBe(true)
  })

  it("groups ledger lines by orderId", () => {
    const { lines } = buildStatementLinesFromEntities({
      orders: [],
      transactions: [
        {
          id: "a",
          amount: 50,
          type: TransactionType.DEBIT,
          description: "Brokerage and charges",
          createdAt: t0,
          orderId: "ord1",
        },
        {
          id: "b",
          amount: 10,
          type: TransactionType.CREDIT,
          description: "Realized P&L credit",
          createdAt: t1,
          orderId: "ord1",
        },
      ],
      deposits: [],
      withdrawals: [],
    })
    const groups = groupStatementEvents(lines)
    const g = groups.find((x) => x.id === "evt-order-ord1")
    expect(g?.children.length).toBe(1)
    expect(g?.primary).toBeDefined()
  })

  it("compareStatementLinesAsc orders deposits before margin when timestamp equal", () => {
    const dep: Parameters<typeof compareStatementLinesAsc>[0] = {
      id: "dep-x",
      dateIso: t0.toISOString(),
      source: "deposit",
      description: "d",
      amount: 100,
      cashAmount: 100,
      marginOnly: false,
      kind: "funds",
      orderId: null,
      positionId: null,
      type: "deposit",
    }
    const margin: Parameters<typeof compareStatementLinesAsc>[1] = {
      id: "tx-m",
      dateIso: t0.toISOString(),
      source: "ledger",
      description: "Margin blocked",
      amount: -50,
      cashAmount: 0,
      marginOnly: true,
      kind: "margin",
      orderId: null,
      positionId: null,
      type: "debit",
    }
    expect(compareStatementLinesAsc(dep, margin)).toBeLessThan(0)
  })

  it("synthetic register line uses instrumentLabel when present", () => {
    const { lines } = buildStatementLinesFromEntities({
      orders: [
        {
          id: "o-fut",
          symbol: "NIFTY24JANFUT",
          orderSide: "BUY",
          quantity: 50,
          filledQuantity: 50,
          price: 100,
          averagePrice: 100,
          status: OrderStatus.EXECUTED,
          executedAt: t0,
          createdAt: t0,
          instrumentLabel: "NIFTY Jan Future (NSE FO)",
        },
      ],
      transactions: [],
      deposits: [],
      withdrawals: [],
    })
    const syn = lines.find((l) => l.id === "order-o-fut")
    expect(syn?.description).toContain("NIFTY Jan Future")
    expect(syn?.description).toContain("register only")
  })
})
