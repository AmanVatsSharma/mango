/**
 * @file market-display-enhancement.test.ts
 * @module market-display
 * @description Unit tests for pure market display math helpers.
 * @author StockTrade
 * @created 2026-03-24
 */

import {
  applyInterpolationEasing,
  clampJitterByPctOfLtp,
  steppedProgress,
} from "@/lib/market-display/market-display-enhancement"

describe("market-display-enhancement", () => {
  describe("clampJitterByPctOfLtp", () => {
    it("clamps symmetrically to pct of LTP", () => {
      const ltp = 10_000
      const cap = (ltp * 0.2) / 100 // 20
      expect(clampJitterByPctOfLtp(50, ltp, 0.2)).toBe(cap)
      expect(clampJitterByPctOfLtp(-50, ltp, 0.2)).toBe(-cap)
      expect(clampJitterByPctOfLtp(5, ltp, 0.2)).toBe(5)
    })

    it("returns jitter unchanged for invalid inputs", () => {
      expect(clampJitterByPctOfLtp(5, 0, 0.2)).toBe(5)
      expect(clampJitterByPctOfLtp(5, 100, 0)).toBe(5)
    })
  })

  describe("steppedProgress", () => {
    it("maps progress into discrete plateaus", () => {
      expect(steppedProgress(0, 5)).toBe(0)
      expect(steppedProgress(0.19, 5)).toBe(0)
      expect(steppedProgress(0.21, 5)).toBe(0.25)
      expect(steppedProgress(1, 5)).toBe(1)
    })

    it("treats steps <= 1 as continuous", () => {
      expect(steppedProgress(0.37, 1)).toBe(0.37)
    })
  })

  describe("applyInterpolationEasing", () => {
    it("easeOut is above linear for mid values", () => {
      const t = 0.5
      const linear = applyInterpolationEasing(t, "linear")
      const ease = applyInterpolationEasing(t, "easeOut")
      expect(linear).toBe(0.5)
      expect(ease).toBeGreaterThan(0.5)
      expect(ease).toBeCloseTo(0.75, 5)
    })
  })
})
