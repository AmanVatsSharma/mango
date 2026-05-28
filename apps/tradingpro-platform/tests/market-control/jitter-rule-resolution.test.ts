/**
 * File:        tests/market-control/jitter-rule-resolution.test.ts
 * Module:      Market Control · jitter rule (Trading-mfk)
 * Purpose:     Locks in Trading-mfk: the JitterRuleV1 schema is part of the
 *              MarketControlConfigV1 segment definition; resolveMarketControls() surfaces
 *              the per-segment jitter rule on EffectiveControls; legacy blobs without
 *              jitter still parse cleanly with the product default applied.
 *
 * Exports:     none (Jest)
 *
 * Side-effects: none — pure-function tests.
 *
 * Key invariants:
 *   - Default jitter rule: enabled=true, intervalMs=250, intensityPct=0.15, convergence=0.1
 *   - intervalMs must be 50..5000; out-of-range values fail Zod parse
 *   - Per-segment jitter overrides surface on EffectiveControls.jitter
 *   - Legacy blobs (no jitter field) get the default after parseMarketControlConfigJson
 *   - resolveMarketControls always returns a valid jitter object (never undefined)
 *
 * Read order:
 *   1. test "schema defaults" — ensures the Zod default applies
 *   2. test "out-of-range rejected" — schema bounds
 *   3. test "resolver surfaces per-segment jitter" — main flow
 *   4. test "legacy blob upgrade preserves defaults"
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import {
  jitterRuleSchema,
  segmentRuleSchema,
  parseMarketControlConfigJson,
  DEFAULT_MARKET_CONTROL_CONFIG_V1,
} from "@/lib/market-control/market-control-config.schema"
import { resolveMarketControls } from "@/lib/market-control/market-control-resolver"

describe("Trading-mfk — JitterRuleV1 schema", () => {
  it("applies product defaults when no fields are provided", () => {
    const parsed = jitterRuleSchema.parse({})
    expect(parsed).toEqual({
      enabled: true,
      intervalMs: 250,
      intensityPct: 0.15,
      convergence: 0.1,
    })
  })

  it("rejects intervalMs below the 50ms floor", () => {
    expect(() => jitterRuleSchema.parse({ intervalMs: 10 })).toThrow()
  })

  it("rejects intervalMs above the 5000ms ceiling", () => {
    expect(() => jitterRuleSchema.parse({ intervalMs: 60_000 })).toThrow()
  })

  it("rejects convergence > 1 (must be a 0..1 ratio)", () => {
    expect(() => jitterRuleSchema.parse({ convergence: 2 })).toThrow()
  })

  it("clamps to schema bounds for intensityPct (0..5)", () => {
    expect(() => jitterRuleSchema.parse({ intensityPct: -0.5 })).toThrow()
    expect(() => jitterRuleSchema.parse({ intensityPct: 100 })).toThrow()
  })
})

describe("Trading-mfk — segmentRuleSchema includes jitter with default", () => {
  it("a minimal segmentRule still gets a valid jitter object", () => {
    const parsed = segmentRuleSchema.parse({
      spread: { min: 0.05, max: 0.2, distribution: "uniform" },
      slippage: { min: 0.05, max: 0.15 },
      sizeTiers: {
        small: 10_000,
        medium: 100_000,
        large: 500_000,
        multSmall: 1.0,
        multMedium: 1.5,
        multLarge: 2.0,
      },
      tiltBiasPct: 0,
      volMultiplier: 1.0,
      timeOfDay: [],
      killSwitch: { buyDisabled: false, sellDisabled: false, reason: "" },
      // jitter intentionally omitted — must default
    })
    expect(parsed.jitter).toEqual({
      enabled: true,
      intervalMs: 250,
      intensityPct: 0.15,
      convergence: 0.1,
    })
  })
})

describe("Trading-mfk — resolveMarketControls surfaces jitter on EffectiveControls", () => {
  it("DEFAULT segment jitter flows to effective.jitter", () => {
    const effective = resolveMarketControls(DEFAULT_MARKET_CONTROL_CONFIG_V1, {
      segment: "NSE_EQ",
      symbol: "RELIANCE",
      orderSide: "BUY",
      quantity: 1,
      orderValueRupees: 1000,
    })
    expect(effective.jitter).toEqual({
      enabled: true,
      intervalMs: 250,
      intensityPct: 0.15,
      convergence: 0.1,
    })
  })

  it("per-segment jitter override flows through (e.g. MCX wants tighter convergence)", () => {
    // Construct the config object directly — re-parsing DEFAULT_MARKET_CONTROL_CONFIG_V1
    // through the schema trips an unrelated pre-existing bug where pctRange caps
    // fillDelayMs at 50 but the default is 1500. The resolver doesn't itself validate, so
    // we exercise it with a hand-built config that mirrors the parts we care about.
    const config = {
      ...DEFAULT_MARKET_CONTROL_CONFIG_V1,
      segments: {
        ...DEFAULT_MARKET_CONTROL_CONFIG_V1.segments,
        MCX: {
          ...DEFAULT_MARKET_CONTROL_CONFIG_V1.segments.MCX,
          jitter: { enabled: true, intervalMs: 500, intensityPct: 0.05, convergence: 0.5 },
        },
      },
    }

    const mcxEffective = resolveMarketControls(config, {
      segment: "MCX",
      symbol: "GOLD",
      orderSide: "BUY",
      quantity: 1,
      orderValueRupees: 1000,
    })
    expect(mcxEffective.jitter).toEqual({
      enabled: true,
      intervalMs: 500,
      intensityPct: 0.05,
      convergence: 0.5,
    })

    // NSE_EQ on the same config still gets the product default
    const nseEffective = resolveMarketControls(config, {
      segment: "NSE_EQ",
      symbol: "RELIANCE",
      orderSide: "BUY",
      quantity: 1,
      orderValueRupees: 1000,
    })
    expect(nseEffective.jitter.intervalMs).toBe(250)
  })

  it("admin can disable jitter per segment (e.g. for stress-tests)", () => {
    const config = {
      ...DEFAULT_MARKET_CONTROL_CONFIG_V1,
      segments: {
        ...DEFAULT_MARKET_CONTROL_CONFIG_V1.segments,
        NSE_EQ: {
          ...DEFAULT_MARKET_CONTROL_CONFIG_V1.segments.NSE_EQ,
          jitter: { enabled: false, intervalMs: 250, intensityPct: 0.15, convergence: 0.1 },
        },
      },
    }

    const effective = resolveMarketControls(config, {
      segment: "NSE_EQ",
      symbol: "RELIANCE",
      orderSide: "BUY",
      quantity: 1,
      orderValueRupees: 1000,
    })
    expect(effective.jitter.enabled).toBe(false)
  })
})

describe("Trading-mfk — legacy blob upgrade preserves jitter defaults", () => {
  it("a legacy BidAskSpreadConfigV1 blob (no jitter field) parses to defaults", () => {
    const legacyBlob = {
      version: 1,
      segments: {
        NSE_EQ: { min: 0.04, max: 0.18 },
        DEFAULT: { min: 0.05, max: 0.2 },
      },
    }
    const upgraded = parseMarketControlConfigJson(legacyBlob)
    expect(upgraded.segments.NSE_EQ.jitter).toEqual({
      enabled: true,
      intervalMs: 250,
      intensityPct: 0.15,
      convergence: 0.1,
    })
  })

  it("null input returns the product default which has jitter populated everywhere", () => {
    const out = parseMarketControlConfigJson(null)
    for (const seg of Object.keys(out.segments)) {
      expect(out.segments[seg].jitter.enabled).toBe(true)
      expect(out.segments[seg].jitter.intervalMs).toBe(250)
    }
  })
})
