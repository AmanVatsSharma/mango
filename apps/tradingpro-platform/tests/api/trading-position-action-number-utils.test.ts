/**
 * @file tests/api/trading-position-action-number-utils.test.ts
 * @module tests-api
 * @description Unit tests for trading position action numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  computeFiniteRealizedPnl,
  resolveExitPriceFromQuoteCandidate,
} from "@/app/api/trading/positions/position-action-number-utils"

describe("trading position action number utils", () => {
  it("resolves exit price from valid quote candidates", () => {
    expect(resolveExitPriceFromQuoteCandidate(123.45, 100)).toBe(123.45)
    expect(resolveExitPriceFromQuoteCandidate(" 101.5 ", 100)).toBe(101.5)
  })

  it("falls back to average price for invalid or non-positive quote candidates", () => {
    expect(resolveExitPriceFromQuoteCandidate(null, 100)).toBe(100)
    expect(resolveExitPriceFromQuoteCandidate(" ", 100)).toBe(100)
    expect(resolveExitPriceFromQuoteCandidate("NaN", 100)).toBe(100)
    expect(resolveExitPriceFromQuoteCandidate(0, 100)).toBe(100)
    expect(resolveExitPriceFromQuoteCandidate(-50, 100)).toBe(100)
    expect(resolveExitPriceFromQuoteCandidate(Symbol("bad-ltp"), 100)).toBe(100)
  })

  it("computes finite realized pnl with normalized numeric inputs", () => {
    expect(
      computeFiniteRealizedPnl({
        exitPrice: "110.5",
        averagePrice: 100,
        quantity: "2",
      }),
    ).toBe(21)
  })

  it("returns zero realized pnl when multiplication overflows to infinity", () => {
    expect(
      computeFiniteRealizedPnl({
        exitPrice: 1e308,
        averagePrice: -1e308,
        quantity: 1e10,
      }),
    ).toBe(0)
  })
})
