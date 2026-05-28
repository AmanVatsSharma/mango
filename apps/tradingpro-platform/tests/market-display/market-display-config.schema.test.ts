/**
 * @file market-display-config.schema.test.ts
 * @module market-display
 * @description Unit tests for market display config parsing and merge helpers.
 * @author StockTrade
 * @created 2026-03-24
 */

import {
  DEFAULT_MARKET_DISPLAY_CONFIG_V1,
  defaultMarketDataConfigGlobal,
  mergeEnhancementPatch,
  parseMarketDisplayConfigJson,
  resolveMergedMarketConfig,
  marketDisplayConfigV1Schema,
} from "@/lib/market-display/market-display-config.schema"

describe("market-display-config.schema", () => {
  it("parseMarketDisplayConfigJson returns defaults for empty input", () => {
    expect(parseMarketDisplayConfigJson("")).toEqual(DEFAULT_MARKET_DISPLAY_CONFIG_V1)
    expect(parseMarketDisplayConfigJson(null)).toEqual(DEFAULT_MARKET_DISPLAY_CONFIG_V1)
  })

  it("parseMarketDisplayConfigJson parses valid JSON", () => {
    const raw = JSON.stringify({
      version: 1,
      global: {
        jitter: { enabled: true, interval: 300, intensity: 0.2, convergence: 0.15 },
        deviation: { enabled: false, percentage: 0, absolute: 0 },
        interpolation: { enabled: true, steps: 40, duration: 2000 },
      },
      quoteFreshness: { liveMaxAgeMs: 8000, displayMaxAgeMs: 90000, pnlServerMaxAgeMs: 12000 },
    })
    const parsed = parseMarketDisplayConfigJson(raw)
    expect(parsed.global.jitter.enabled).toBe(true)
    expect(parsed.global.jitter.interval).toBe(300)
    expect(parsed.global.jitter.maxAbsPctOfLtp).toBe(defaultMarketDataConfigGlobal.jitter.maxAbsPctOfLtp)
    expect(parsed.global.interpolation.easing).toBe("linear")
    expect(parsed.quoteFreshness.liveMaxAgeMs).toBe(8000)
  })

  it("mergeEnhancementPatch applies partial jitter", () => {
    const base = defaultMarketDataConfigGlobal
    const merged = mergeEnhancementPatch(base, { jitter: { enabled: true, intensity: 0.5 } })
    expect(merged.jitter.enabled).toBe(true)
    expect(merged.jitter.intensity).toBe(0.5)
    expect(merged.jitter.interval).toBe(base.jitter.interval)
    expect(merged.jitter.maxAbsPctOfLtp).toBe(base.jitter.maxAbsPctOfLtp)
  })

  it("mergeEnhancementPatch can override jitter maxAbsPctOfLtp and interpolation easing", () => {
    const base = defaultMarketDataConfigGlobal
    const merged = mergeEnhancementPatch(base, {
      jitter: { maxAbsPctOfLtp: 1.5 },
      interpolation: { easing: "easeOut" },
    })
    expect(merged.jitter.maxAbsPctOfLtp).toBe(1.5)
    expect(merged.interpolation.easing).toBe("easeOut")
  })

  it("resolveMergedMarketConfig stacks segment then surface", () => {
    const global = defaultMarketDataConfigGlobal
    const merged = resolveMergedMarketConfig({
      global,
      segmentPatch: { jitter: { intensity: 0.9 } },
      surfacePatch: { jitter: { enabled: true } },
    })
    expect(merged.jitter.enabled).toBe(true)
    expect(merged.jitter.intensity).toBe(0.9)
  })

  it("marketDisplayConfigV1Schema.parse({}) yields defaults", () => {
    const v = marketDisplayConfigV1Schema.parse({})
    expect(v.version).toBe(1)
    expect(v.global.jitter.enabled).toBe(false)
    expect(v.quoteFreshness.liveMaxAgeMs).toBe(5_000)
    expect(v.quoteFreshness.redisMarketQuoteMaxAgeMs).toBe(7_500)
    expect(v.quoteFreshness.positionPnlQuoteMaxAgeMs).toBe(15_000)
    expect(v.quoteFreshness.marketQuoteRedisWriteMinIntervalMs).toBe(100)
    expect(v.ui.respectSegmentTradingHoursForJitter).toBe(true)
    expect(v.ui.positionsRowPriceBasis).toBe("smoothed_display")
    expect(v.ui.positionCloseExitPricePolicy).toBe("server_live_only")
    expect(v.ui.staleQuotePriceMode).toBe("strict")
    expect(v.ui.quoteBadgesEnabled).toBe(true)
  })
})
