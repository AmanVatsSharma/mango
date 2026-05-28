/**
 * @file tests/trading/risk-monitor-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for client-side risk monitor threshold input normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import { normalizeRiskMonitorThresholdPercentInput } from "@/components/risk/risk-monitor-number-utils"

describe("risk-monitor-number-utils", () => {
  it("normalizes finite threshold input values and clamps within 0..100", () => {
    expect(normalizeRiskMonitorThresholdPercentInput("85.5", 80)).toBe(85.5)
    expect(normalizeRiskMonitorThresholdPercentInput("150", 80)).toBe(100)
    expect(normalizeRiskMonitorThresholdPercentInput("-10", 80)).toBe(0)
  })

  it("falls back for malformed/non-finite threshold values", () => {
    expect(normalizeRiskMonitorThresholdPercentInput("NaN", 80)).toBe(80)
    expect(normalizeRiskMonitorThresholdPercentInput("Infinity", 90)).toBe(90)
    expect(normalizeRiskMonitorThresholdPercentInput(Symbol("bad"), 75)).toBe(75)
  })
})
