/**
 * @file tests/trading/market-data-config-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for market-data configuration numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeDeviationAbsoluteInput,
  normalizeDeviationPercentageInput,
  normalizeInterpolationDurationInput,
  normalizeInterpolationStepsInput,
  normalizeJitterConvergenceInput,
  normalizeJitterIntensityInput,
  normalizeJitterIntervalInput,
} from "@/components/market-data-config-number-utils"

describe("market-data-config-number-utils", () => {
  it("normalizes jitter and deviation inputs with clamp/fallback behavior", () => {
    expect(normalizeJitterIntervalInput("300")).toBe(300)
    expect(normalizeJitterIntervalInput("99")).toBe(100)
    expect(normalizeJitterIntervalInput("NaN")).toBe(250)
    expect(normalizeJitterIntensityInput("1.5")).toBe(1)
    expect(normalizeJitterConvergenceInput("-1")).toBe(0)
    expect(normalizeDeviationPercentageInput("120")).toBe(100)
    expect(normalizeDeviationAbsoluteInput("-2")).toBe(0)
  })

  it("normalizes interpolation controls with integer clamping", () => {
    expect(normalizeInterpolationDurationInput("4500")).toBe(4500)
    expect(normalizeInterpolationDurationInput("20000")).toBe(10000)
    expect(normalizeInterpolationDurationInput("abc")).toBe(4500)
    expect(normalizeInterpolationStepsInput("55.9")).toBe(55)
    expect(normalizeInterpolationStepsInput("2")).toBe(10)
  })
})
