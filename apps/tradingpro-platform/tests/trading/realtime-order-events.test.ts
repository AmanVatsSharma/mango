/**
 * @file tests/trading/realtime-order-events.test.ts
 * @module tests-trading
 * @description Regression tests for out-of-order realtime order event handling.
 * @author StockTrade
 * @created 2026-02-27
 */

import { buildOutOfOrderOrderStub } from "@/lib/hooks/use-realtime-orders"

describe("realtime order event stubs", () => {
  it("builds EXECUTED stub when execution event arrives before placement", () => {
    const stub = buildOutOfOrderOrderStub(
      "order_executed",
      {
        orderId: "ord-100",
        symbol: "NIFTY",
        quantity: 25,
        orderType: "MARKET",
        orderSide: "BUY",
        submittedPrice: 25100,
        executionPrice: 25105.25,
        filledQuantity: 25,
      },
      "2026-02-27T10:00:00.000Z",
    )

    expect(stub.id).toBe("ord-100")
    expect(stub.status).toBe("EXECUTED")
    expect(stub.averagePrice).toBe(25105.25)
    expect(stub.filledQuantity).toBe(25)
    expect(stub.executedAt).toBe("2026-02-27T10:00:00.000Z")
  })

  it("builds CANCELLED stub with normalized failure reason", () => {
    const stub = buildOutOfOrderOrderStub(
      "order_cancelled",
      {
        orderId: "ord-101",
        symbol: "BANKNIFTY",
        quantity: 15,
        orderType: "LIMIT",
        orderSide: "SELL",
        failureReason: "  Exchange rejected  ",
      },
      "2026-02-27T10:01:00.000Z",
    )

    expect(stub.id).toBe("ord-101")
    expect(stub.status).toBe("CANCELLED")
    expect(stub.failureReason).toBe("Exchange rejected")
    expect(stub.filledQuantity).toBe(0)
    expect(stub.executedAt).toBeNull()
  })
})

