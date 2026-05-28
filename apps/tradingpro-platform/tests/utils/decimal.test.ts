/**
 * @file tests/utils/decimal.test.ts
 * @module tests-utils
 * @description Unit tests for decimal numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import { Decimal } from "@prisma/client/runtime/library"
import { toNumber } from "@/lib/utils/decimal"

describe("decimal utils", () => {
  describe("toNumber", () => {
    it("parses finite numeric and string candidates", () => {
      expect(toNumber(42)).toBe(42)
      expect(toNumber(" 42.5 ")).toBe(42.5)
      expect(toNumber(new Decimal("99.25"))).toBe(99.25)
    })

    it("returns zero for nullish, blank, sentinel and malformed values", () => {
      expect(toNumber(null)).toBe(0)
      expect(toNumber(undefined)).toBe(0)
      expect(toNumber("   ")).toBe(0)
      expect(toNumber("undefined")).toBe(0)
      expect(toNumber("NaN")).toBe(0)
      expect(toNumber("Infinity")).toBe(0)
      expect(toNumber(Symbol("bad-decimal"))).toBe(0)
    })

    it("returns zero when decimal-like objects throw on toNumber", () => {
      const decimalLike = {
        toNumber() {
          throw new Error("decimal-to-number-failed")
        },
      }
      expect(toNumber(decimalLike)).toBe(0)
    })
  })
})
