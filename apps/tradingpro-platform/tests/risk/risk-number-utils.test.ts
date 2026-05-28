/**
 * @file tests/risk/risk-number-utils.test.ts
 * @module tests-risk
 * @description Unit tests for risk numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeNonNegativeRiskNumber,
  normalizeRiskThresholdPair,
  parseFiniteRiskNumber,
} from "@/lib/services/risk/risk-number-utils"

describe("risk-number-utils", () => {
  describe("parseFiniteRiskNumber", () => {
    it("parses finite numeric values and numeric strings", () => {
      expect(parseFiniteRiskNumber(42)).toBe(42)
      expect(parseFiniteRiskNumber(" 42.5 ")).toBe(42.5)
      expect(parseFiniteRiskNumber("0")).toBe(0)
    })

    it("returns null for blank, sentinel, boolean and non-coercible values", () => {
      expect(parseFiniteRiskNumber(null)).toBeNull()
      expect(parseFiniteRiskNumber(undefined)).toBeNull()
      expect(parseFiniteRiskNumber("   ")).toBeNull()
      expect(parseFiniteRiskNumber("NaN")).toBeNull()
      expect(parseFiniteRiskNumber("undefined")).toBeNull()
      expect(parseFiniteRiskNumber(true)).toBeNull()
      expect(parseFiniteRiskNumber(Symbol("risk-number"))).toBeNull()
    })
  })

  describe("normalizeNonNegativeRiskNumber", () => {
    it("uses fallback for invalid and negative values", () => {
      expect(normalizeNonNegativeRiskNumber(-1, 5)).toBe(5)
      expect(normalizeNonNegativeRiskNumber("invalid", 7)).toBe(7)
      expect(normalizeNonNegativeRiskNumber(Symbol("invalid"), 9)).toBe(9)
    })

    it("keeps valid non-negative numeric values", () => {
      expect(normalizeNonNegativeRiskNumber(0, 10)).toBe(0)
      expect(normalizeNonNegativeRiskNumber("12.5", 10)).toBe(12.5)
    })
  })

  describe("normalizeRiskThresholdPair", () => {
    const fallback = {
      warningThreshold: 0.75,
      autoCloseThreshold: 0.8,
    }

    it("falls back for invalid thresholds and clamps range", () => {
      expect(
        normalizeRiskThresholdPair(
          {
            warningThreshold: "invalid" as any,
            autoCloseThreshold: 2 as any,
          },
          fallback,
        ),
      ).toEqual({
        warningThreshold: 0.75,
        autoCloseThreshold: 1,
      })
    })

    it("normalizes inverted thresholds to keep auto-close >= warning", () => {
      expect(
        normalizeRiskThresholdPair(
          {
            warningThreshold: 0.95,
            autoCloseThreshold: 0.6,
          },
          fallback,
        ),
      ).toEqual({
        warningThreshold: 0.95,
        autoCloseThreshold: 0.95,
      })
    })
  })
})
