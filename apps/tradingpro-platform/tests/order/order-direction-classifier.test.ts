/**
 * File:        tests/order/order-direction-classifier.test.ts
 * Module:      Order Execution · open-vs-close classifier (Trading-upr)
 * Purpose:     Locks in the OPEN/CLOSE classification used by the maxDailyLoss bypass.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none (pure function tests)
 *
 * Key invariants:
 *   - Flat user → OPEN regardless of side
 *   - Long user → BUY = OPEN, SELL = CLOSE
 *   - Short user → SELL = OPEN, BUY = CLOSE
 *   - Different symbol → OPEN (positions don't offset)
 *   - Symbol comparison is case-insensitive trimmed
 *   - Multiple position rows for the same symbol sum (rare but covered)
 *
 * Read order:
 *   1. test "flat → OPEN" — baseline
 *   2. test "long + BUY → OPEN, long + SELL → CLOSE" — happy paths
 *   3. test "short + SELL → OPEN, short + BUY → CLOSE" — short-side mirror
 *   4. test "different symbol → OPEN"
 *   5. test "case-insensitive matching"
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { classifyOrderDirection } from "@/lib/services/order/order-direction-classifier"

describe("classifyOrderDirection — Trading-upr", () => {
  it("flat user (no positions) → OPEN regardless of side", () => {
    expect(
      classifyOrderDirection({
        orderSide: "BUY",
        symbol: "RELIANCE",
        existingPositions: [],
      }),
    ).toBe("OPEN")
    expect(
      classifyOrderDirection({
        orderSide: "SELL",
        symbol: "RELIANCE",
        existingPositions: [],
      }),
    ).toBe("OPEN")
  })

  it("long user + BUY → OPEN (growing long)", () => {
    expect(
      classifyOrderDirection({
        orderSide: "BUY",
        symbol: "RELIANCE",
        existingPositions: [{ symbol: "RELIANCE", quantity: 10 }],
      }),
    ).toBe("OPEN")
  })

  it("long user + SELL → CLOSE (reducing long)", () => {
    expect(
      classifyOrderDirection({
        orderSide: "SELL",
        symbol: "RELIANCE",
        existingPositions: [{ symbol: "RELIANCE", quantity: 10 }],
      }),
    ).toBe("CLOSE")
  })

  it("short user + SELL → OPEN (growing short)", () => {
    expect(
      classifyOrderDirection({
        orderSide: "SELL",
        symbol: "RELIANCE",
        existingPositions: [{ symbol: "RELIANCE", quantity: -10 }],
      }),
    ).toBe("OPEN")
  })

  it("short user + BUY → CLOSE (covering short)", () => {
    expect(
      classifyOrderDirection({
        orderSide: "BUY",
        symbol: "RELIANCE",
        existingPositions: [{ symbol: "RELIANCE", quantity: -10 }],
      }),
    ).toBe("CLOSE")
  })

  it("position in DIFFERENT symbol → OPEN (positions don't offset across symbols)", () => {
    expect(
      classifyOrderDirection({
        orderSide: "BUY",
        symbol: "RELIANCE",
        existingPositions: [{ symbol: "TCS", quantity: 100 }],
      }),
    ).toBe("OPEN")
  })

  it("symbol comparison is case-insensitive + trimmed", () => {
    expect(
      classifyOrderDirection({
        orderSide: "SELL",
        symbol: "  reliance  ",
        existingPositions: [{ symbol: "RELIANCE", quantity: 10 }],
      }),
    ).toBe("CLOSE")
  })

  it("multiple position rows for same symbol sum to net signed quantity", () => {
    // User has +10 long and -3 short on the same symbol → net +7 long
    expect(
      classifyOrderDirection({
        orderSide: "SELL",
        symbol: "RELIANCE",
        existingPositions: [
          { symbol: "RELIANCE", quantity: 10 },
          { symbol: "RELIANCE", quantity: -3 },
        ],
      }),
    ).toBe("CLOSE")
  })

  it("zero-quantity position is treated as flat → OPEN", () => {
    expect(
      classifyOrderDirection({
        orderSide: "BUY",
        symbol: "RELIANCE",
        existingPositions: [{ symbol: "RELIANCE", quantity: 0 }],
      }),
    ).toBe("OPEN")
  })

  it("orderSide is case-insensitive (treats lower-case 'sell' the same)", () => {
    expect(
      classifyOrderDirection({
        orderSide: "sell",
        symbol: "RELIANCE",
        existingPositions: [{ symbol: "RELIANCE", quantity: 10 }],
      }),
    ).toBe("CLOSE")
  })
})
