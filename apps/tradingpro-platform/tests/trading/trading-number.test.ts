/**
 * @file tests/trading/trading-number.test.ts
 * @module tests-trading
 * @description Unit tests for shared trading numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeClampedTradingInteger,
  normalizeOptionalTradingNumber,
  parseFiniteTradingNumber,
} from "@/lib/server/trading-number"

describe("trading-number", () => {
  describe("parseFiniteTradingNumber", () => {
    it("parses finite numeric candidates", () => {
      expect(parseFiniteTradingNumber(10)).toBe(10)
      expect(parseFiniteTradingNumber(" 42.5 ")).toBe(42.5)
      expect(parseFiniteTradingNumber("0")).toBe(0)
    })

    it("returns null for sentinel, blank, boolean and non-coercible values", () => {
      expect(parseFiniteTradingNumber(null)).toBeNull()
      expect(parseFiniteTradingNumber(undefined)).toBeNull()
      expect(parseFiniteTradingNumber("")).toBeNull()
      expect(parseFiniteTradingNumber("NaN")).toBeNull()
      expect(parseFiniteTradingNumber("undefined")).toBeNull()
      expect(parseFiniteTradingNumber(false)).toBeNull()
      expect(parseFiniteTradingNumber(Symbol("bad-number"))).toBeNull()
    })
  })

  describe("normalizeOptionalTradingNumber", () => {
    it("preserves valid zero values", () => {
      expect(normalizeOptionalTradingNumber(0)).toBe(0)
      expect(normalizeOptionalTradingNumber("0")).toBe(0)
    })

    it("falls back to null for invalid numeric values", () => {
      expect(normalizeOptionalTradingNumber("invalid")).toBeNull()
      expect(normalizeOptionalTradingNumber(Symbol("bad-optional"))).toBeNull()
    })
  })

  describe("normalizeClampedTradingInteger", () => {
    it("returns fallback for invalid values", () => {
      expect(normalizeClampedTradingInteger("invalid", 25, 1, 100)).toBe(25)
      expect(normalizeClampedTradingInteger(Symbol("bad-int"), 30, 1, 100)).toBe(30)
    })

    it("clamps normalized integer values to configured bounds", () => {
      expect(normalizeClampedTradingInteger("500", 25, 1, 100)).toBe(100)
      expect(normalizeClampedTradingInteger("-50", 25, 1, 100)).toBe(1)
      expect(normalizeClampedTradingInteger("40.9", 25, 1, 100)).toBe(40)
    })
  })
})
