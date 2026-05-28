/**
 * @file tests/server/validation-order-schema.test.ts
 * @module tests-server
 * @description Regression tests for strict finite order validation schemas.
 * @author StockTrade
 * @created 2026-02-16
 */

import { cancelOrderSchema, modifyOrderSchema, placeOrderSchema } from "@/lib/server/validation"

const tradingAccountId = "11111111-1111-4111-8111-111111111111"
const orderId = "22222222-2222-4222-8222-222222222222"

describe("order validation schemas", () => {
  it("accepts finite valid place-order payload values", () => {
    const parsed = placeOrderSchema.parse({
      tradingAccountId,
      symbol: "NIFTY",
      quantity: 2,
      price: 150.5,
      orderType: "LIMIT",
      orderSide: "BUY",
      token: 26000,
      ltp: 150.5,
      close: 149.2,
      strikePrice: 0,
      lotSize: 15,
    })

    expect(parsed.quantity).toBe(2)
    expect(parsed.price).toBe(150.5)
    expect(parsed.token).toBe(26000)
  })

  it("rejects non-finite place-order numeric fields", () => {
    expect(() =>
      placeOrderSchema.parse({
        tradingAccountId,
        symbol: "NIFTY",
        quantity: 2,
        price: Number.POSITIVE_INFINITY,
        orderType: "LIMIT",
        orderSide: "BUY",
      }),
    ).toThrow()

    expect(() =>
      placeOrderSchema.parse({
        tradingAccountId,
        symbol: "NIFTY",
        quantity: 2,
        orderType: "MARKET",
        orderSide: "BUY",
        ltp: Number.NaN,
      }),
    ).toThrow()
  })

  it("rejects invalid modify-order numeric values", () => {
    expect(() => modifyOrderSchema.parse({ orderId, price: Number.POSITIVE_INFINITY })).toThrow()
    expect(() => modifyOrderSchema.parse({ orderId, quantity: 0 })).toThrow()
    expect(() => modifyOrderSchema.parse({ orderId, quantity: 1.5 })).toThrow()
  })

  it("requires at least one modify field and validates cancel payload", () => {
    expect(() => modifyOrderSchema.parse({ orderId })).toThrow("Provide price or quantity")
    expect(cancelOrderSchema.parse({ orderId })).toEqual({ orderId })
  })
})
