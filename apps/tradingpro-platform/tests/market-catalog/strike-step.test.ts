/**
 * @file strike-step.test.ts
 * @module tests/market-catalog
 * @description Strike-step registry tests — known underlyings, defaults, override behavior.
 * @author StockTrade
 * @created 2026-05-01
 */

import { DEFAULT_STRIKE_STEP, resolveStrikeStep } from "@/lib/market-catalog/strike-step"

describe("resolveStrikeStep", () => {
  it("returns 50 for NIFTY", () => {
    expect(resolveStrikeStep("NIFTY")).toBe(50)
    expect(resolveStrikeStep("nifty")).toBe(50)
    expect(resolveStrikeStep("NIFTY 50")).toBe(50)
  })

  it("returns 100 for BANKNIFTY", () => {
    expect(resolveStrikeStep("BANKNIFTY")).toBe(100)
    expect(resolveStrikeStep("Bank Nifty")).toBe(100)
  })

  it("returns 25 for MIDCPNIFTY", () => {
    expect(resolveStrikeStep("MIDCPNIFTY")).toBe(25)
  })

  it("returns DEFAULT for an unknown underlying", () => {
    expect(resolveStrikeStep("RELIANCE")).toBe(DEFAULT_STRIKE_STEP)
    expect(resolveStrikeStep("XYZ123")).toBe(DEFAULT_STRIKE_STEP)
  })

  it("override always wins", () => {
    expect(resolveStrikeStep("NIFTY", 250)).toBe(250)
    expect(resolveStrikeStep("UNKNOWN", 5)).toBe(5)
  })

  it("ignores zero/negative override", () => {
    expect(resolveStrikeStep("NIFTY", 0)).toBe(50)
    expect(resolveStrikeStep("NIFTY", -10)).toBe(50)
  })
})
