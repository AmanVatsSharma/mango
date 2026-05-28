/**
 * @file tests/order/order-number-utils.test.ts
 * @module tests-order
 * @description Unit tests for shared order numeric parsing helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFiniteOrderNumber } from "@/lib/services/order/order-number-utils"

describe("order-number-utils", () => {
  it("parses finite numeric and string candidates", () => {
    expect(parseFiniteOrderNumber(10)).toBe(10)
    expect(parseFiniteOrderNumber(" 7.5 ")).toBe(7.5)
    expect(parseFiniteOrderNumber("0")).toBe(0)
  })

  it("returns null for nullish, sentinel, boolean, and non-coercible values", () => {
    expect(parseFiniteOrderNumber(null)).toBeNull()
    expect(parseFiniteOrderNumber(undefined)).toBeNull()
    expect(parseFiniteOrderNumber("")).toBeNull()
    expect(parseFiniteOrderNumber("undefined")).toBeNull()
    expect(parseFiniteOrderNumber("NaN")).toBeNull()
    expect(parseFiniteOrderNumber(false)).toBeNull()
    expect(parseFiniteOrderNumber(Symbol("bad-order-number"))).toBeNull()
  })
})
