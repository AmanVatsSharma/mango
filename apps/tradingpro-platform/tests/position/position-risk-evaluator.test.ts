/**
 * @file position-risk-evaluator.test.ts
 * @module tests/position
 * @description Unit tests for StopLoss/Target + risk threshold evaluator helpers.
 * @author StockTrade
 * @created 2026-02-13
 */

import {
  computeMarginUtilizationPercent,
  isStopLossHit,
  isTargetHit,
  pickRiskAutoClosePositions,
} from "@/lib/services/position/position-risk-evaluator"

describe("position-risk-evaluator", () => {
  describe("isStopLossHit", () => {
    it("detects stop-loss hit for long positions (<=)", () => {
      expect(isStopLossHit(10, 95, 100)).toBe(true)
      expect(isStopLossHit(10, 100, 100)).toBe(true)
      expect(isStopLossHit(10, 105, 100)).toBe(false)
    })

    it("detects stop-loss hit for short positions (>=)", () => {
      expect(isStopLossHit(-10, 105, 100)).toBe(true)
      expect(isStopLossHit(-10, 100, 100)).toBe(true)
      expect(isStopLossHit(-10, 95, 100)).toBe(false)
    })

    it("returns false when inputs are missing/invalid", () => {
      expect(isStopLossHit(0, 100, 100)).toBe(false)
      expect(isStopLossHit(10, 0, 100)).toBe(false)
      expect(isStopLossHit(10, 100, null)).toBe(false)
      expect(isStopLossHit(10, 100, -1)).toBe(false)
    })
  })

  describe("isTargetHit", () => {
    it("detects target hit for long positions (>=)", () => {
      expect(isTargetHit(10, 105, 100)).toBe(true)
      expect(isTargetHit(10, 100, 100)).toBe(true)
      expect(isTargetHit(10, 95, 100)).toBe(false)
    })

    it("detects target hit for short positions (<=)", () => {
      expect(isTargetHit(-10, 95, 100)).toBe(true)
      expect(isTargetHit(-10, 100, 100)).toBe(true)
      expect(isTargetHit(-10, 105, 100)).toBe(false)
    })

    it("returns false when inputs are missing/invalid", () => {
      expect(isTargetHit(0, 100, 100)).toBe(false)
      expect(isTargetHit(10, 0, 100)).toBe(false)
      expect(isTargetHit(10, 100, null)).toBe(false)
      expect(isTargetHit(10, 100, -1)).toBe(false)
    })
  })

  describe("computeMarginUtilizationPercent", () => {
    it("uses loss-only (net negative pnl) over total funds", () => {
      expect(computeMarginUtilizationPercent(-200, 1000)).toBeCloseTo(0.2, 8)
      expect(computeMarginUtilizationPercent(200, 1000)).toBeCloseTo(0, 8)
      expect(computeMarginUtilizationPercent(0, 1000)).toBeCloseTo(0, 8)
    })

    it("returns 0 when totalFunds is <= 0", () => {
      expect(computeMarginUtilizationPercent(-200, 0)).toBe(0)
      expect(computeMarginUtilizationPercent(-200, -1)).toBe(0)
    })
  })

  describe("pickRiskAutoClosePositions", () => {
    it("sorts losing positions worst-first and respects maxToClose", () => {
      const r = pickRiskAutoClosePositions({
        positions: [
          { positionId: "p1", symbol: "AAA", quantity: 10, unrealizedPnL: -50 },
          { positionId: "p2", symbol: "BBB", quantity: 10, unrealizedPnL: -200 },
          { positionId: "p3", symbol: "CCC", quantity: 10, unrealizedPnL: 100 },
        ],
        totalFunds: 1000,
        thresholds: { warningThreshold: 0.1, autoCloseThreshold: 0.2 },
        maxToClose: 1,
      })

      expect(r.shouldWarn).toBe(true)
      expect(r.shouldAutoClose).toBe(false)
      expect(r.positionsToClose.map((p) => p.positionId)).toEqual(["p2"])
    })

    it("flags auto-close when utilization breaches autoCloseThreshold", () => {
      const r = pickRiskAutoClosePositions({
        positions: [
          { positionId: "p1", symbol: "AAA", quantity: 10, unrealizedPnL: -150 },
          { positionId: "p2", symbol: "BBB", quantity: 10, unrealizedPnL: -100 },
        ],
        totalFunds: 1000,
        thresholds: { warningThreshold: 0.1, autoCloseThreshold: 0.2 },
      })

      expect(r.marginUtilizationPercent).toBeCloseTo(0.25, 8)
      expect(r.shouldWarn).toBe(true)
      expect(r.shouldAutoClose).toBe(true)
      expect(r.positionsToClose.map((p) => p.positionId)).toEqual(["p1", "p2"])
    })
  })

  describe("product default thresholds 75% / 80%", () => {
    const defaults = { warningThreshold: 0.75, autoCloseThreshold: 0.8 }

    it("warns at 75% utilization but does not auto-close below 80%", () => {
      const r = pickRiskAutoClosePositions({
        positions: [{ positionId: "p1", symbol: "X", quantity: 1, unrealizedPnL: -750 }],
        totalFunds: 1000,
        thresholds: defaults,
      })
      expect(r.marginUtilizationPercent).toBeCloseTo(0.75, 8)
      expect(r.shouldWarn).toBe(true)
      expect(r.shouldAutoClose).toBe(false)
    })

    it("auto-closes band at exactly 80% utilization", () => {
      const r = pickRiskAutoClosePositions({
        positions: [{ positionId: "p1", symbol: "X", quantity: 1, unrealizedPnL: -800 }],
        totalFunds: 1000,
        thresholds: defaults,
      })
      expect(r.shouldWarn).toBe(true)
      expect(r.shouldAutoClose).toBe(true)
    })

    it("is calm just below warning (74.9%)", () => {
      const r = pickRiskAutoClosePositions({
        positions: [{ positionId: "p1", symbol: "X", quantity: 1, unrealizedPnL: -749 }],
        totalFunds: 1000,
        thresholds: defaults,
      })
      expect(r.shouldWarn).toBe(false)
      expect(r.shouldAutoClose).toBe(false)
    })
  })
})

