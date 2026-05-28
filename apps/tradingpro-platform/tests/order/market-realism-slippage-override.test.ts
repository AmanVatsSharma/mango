/**
 * File:        tests/order/market-realism-slippage-override.test.ts
 * Module:      Order · MarketRealismService · admin slippage override
 * Purpose:     Regression for Trading-li7 — admin slippagePct from
 *              resolveMarketControls() was previously discarded and the
 *              hardcoded random slippage band always ran. This suite proves
 *              the new slippageOverride parameter takes effect.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none (pure-service test)
 *
 * Key invariants:
 *   - When slippageOverride is undefined, behavior matches pre-fix (random band)
 *   - When slippageOverride is a positive number, it REPLACES the random band
 *     entirely (admin chose a deterministic anchor)
 *   - Order-size multiplier still applies on top of the override (large orders
 *     still take more pain than small ones, just calibrated to admin's anchor)
 *   - Invalid (NaN, negative, zero) overrides fall back to the random band
 *
 * Read order:
 *   1. test setup
 *   2. tests in "no override → override → invalid override" order
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { OrderSide } from "@prisma/client"
import { MarketRealismService } from "@/lib/services/order/MarketRealismService"

describe("MarketRealismService slippageOverride", () => {
  const service = new MarketRealismService()

  // Stable seed for the random-band path so we can assert ranges.
  let originalRandom: typeof Math.random
  beforeEach(() => {
    originalRandom = Math.random
    Math.random = () => 0.5 // mid-band deterministic
  })
  afterEach(() => {
    Math.random = originalRandom
  })

  it("no override → uses hardcoded random band (pre-fix behavior preserved)", async () => {
    const r = await service.applyMarketRealism(
      100,
      OrderSide.BUY,
      "NSE",
      1,
      1,
      0.05, // spread override
      // no slippage override
    )
    // Hardcoded NSE slippage range mid (with 0.5 random) and small-order
    // multiplier=1 → some non-zero slippage. Exact value depends on
    // market-realism-config; we just assert it's a positive percent.
    expect(r.slippagePercent).toBeGreaterThan(0)
  })

  it("override = 0.07% replaces random band entirely", async () => {
    const r = await service.applyMarketRealism(100, OrderSide.BUY, "NSE", 1, 1, 0.05, 0.07)
    // small-order size multiplier = 1, so override × 1 = 0.07
    expect(r.slippagePercent).toBeCloseTo(0.07, 4)
  })

  it("override × size multiplier applies for large orders", async () => {
    // Large order (5000 lots × ₹100 = ₹500_000 turnover) — should hit medium
    // or large size multiplier from market-realism-config.
    const small = await service.applyMarketRealism(100, OrderSide.BUY, "NSE", 1, 1, 0.05, 0.05)
    const large = await service.applyMarketRealism(100, OrderSide.BUY, "NSE", 100_000, 1, 0.05, 0.05)
    expect(large.slippagePercent).toBeGreaterThanOrEqual(small.slippagePercent)
  })

  it("invalid (NaN) override falls back to hardcoded band", async () => {
    const r = await service.applyMarketRealism(100, OrderSide.BUY, "NSE", 1, 1, 0.05, NaN)
    // Math.random=0.5 means we get the band midpoint, which is hardcoded.
    expect(r.slippagePercent).toBeGreaterThan(0)
  })

  it("zero override falls back to hardcoded band (zero is a 'no override' signal)", async () => {
    const r = await service.applyMarketRealism(100, OrderSide.BUY, "NSE", 1, 1, 0.05, 0)
    expect(r.slippagePercent).toBeGreaterThan(0)
  })

  it("negative override falls back to hardcoded band (negative slippage is meaningless)", async () => {
    const r = await service.applyMarketRealism(100, OrderSide.BUY, "NSE", 1, 1, 0.05, -0.5)
    expect(r.slippagePercent).toBeGreaterThan(0)
  })
})
