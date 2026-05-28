/**
 * @file tests/position/position-number-utils.test.ts
 * @module tests-position
 * @description Unit tests for shared position numeric parsing helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseFinitePositionNumber } from "@/lib/services/position/position-number-utils"

describe("position-number-utils", () => {
  it("parses finite numbers and numeric strings", () => {
    expect(parseFinitePositionNumber(100)).toBe(100)
    expect(parseFinitePositionNumber(" 12.5 ")).toBe(12.5)
    expect(parseFinitePositionNumber("0")).toBe(0)
  })

  it("returns null for sentinel, blank, boolean, and non-coercible values", () => {
    expect(parseFinitePositionNumber(null)).toBeNull()
    expect(parseFinitePositionNumber(undefined)).toBeNull()
    expect(parseFinitePositionNumber("")).toBeNull()
    expect(parseFinitePositionNumber("undefined")).toBeNull()
    expect(parseFinitePositionNumber("NaN")).toBeNull()
    expect(parseFinitePositionNumber(true)).toBeNull()
    expect(parseFinitePositionNumber(Symbol("bad-position-number"))).toBeNull()
  })
})
