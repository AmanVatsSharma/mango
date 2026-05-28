/**
 * @file tests/workers/worker-script-env.test.ts
 * @module tests-workers
 * @description Unit tests for worker script env-number normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeScriptFloatEnv,
  normalizeScriptIntEnv,
  parseFiniteEnvNumber,
} from "@/scripts/worker-script-env"

describe("worker-script-env helpers", () => {
  it("returns finite numeric values from valid string/number inputs", () => {
    expect(parseFiniteEnvNumber(" 42 ")).toBe(42)
    expect(parseFiniteEnvNumber("3.5")).toBe(3.5)
    expect(parseFiniteEnvNumber(17)).toBe(17)
  })

  it("treats blank, sentinel, and boolean carriers as invalid", () => {
    expect(parseFiniteEnvNumber(null)).toBeNull()
    expect(parseFiniteEnvNumber(undefined)).toBeNull()
    expect(parseFiniteEnvNumber("   ")).toBeNull()
    expect(parseFiniteEnvNumber("undefined")).toBeNull()
    expect(parseFiniteEnvNumber("NaN")).toBeNull()
    expect(parseFiniteEnvNumber(true)).toBeNull()
    expect(parseFiniteEnvNumber(Symbol("env-number"))).toBeNull()
  })

  it("normalizes integer env values with fallback + bounds", () => {
    expect(normalizeScriptIntEnv("999", 25, { min: 1, max: 200 })).toBe(200)
    expect(normalizeScriptIntEnv("-50", 25, { min: 0 })).toBe(0)
    expect(normalizeScriptIntEnv("  ", 25, { min: 1, max: 200 })).toBe(25)
    expect(normalizeScriptIntEnv(false, 750, { min: 50 })).toBe(750)
  })

  it("normalizes float env values with fallback + bounds", () => {
    expect(normalizeScriptFloatEnv("-2.5", 1, { min: 0 })).toBe(0)
    expect(normalizeScriptFloatEnv("1.25", 1, { min: 0, max: 2 })).toBe(1.25)
    expect(normalizeScriptFloatEnv("   ", 1, { min: 0 })).toBe(1)
    expect(normalizeScriptFloatEnv(true, 1, { min: 0 })).toBe(1)
  })
})
