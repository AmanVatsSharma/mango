/**
 * @file apply-quote-enhancements.test.ts
 * @module market-display
 * @description Unit tests for enhanceQuotesTick jitter gating and enhancement pipeline.
 * @author StockTrade
 * @created 2026-03-24
 */

import { enhanceQuotesTick } from "@/lib/market-display/apply-quote-enhancements"
import {
  DEFAULT_MARKET_DISPLAY_CONFIG_V1,
  MARKET_DISPLAY_SEGMENT_KEYS,
  defaultMarketDataConfigGlobal,
  type MarketDisplayConfigV1,
  type MarketDisplaySegmentKey,
} from "@/lib/market-display/market-display-config.schema"
import * as enhancement from "@/lib/market-display/market-display-enhancement"
import type { EnhancedQuote } from "@/lib/market-data/providers/types"

jest.mock("@/lib/market-display/market-display-enhancement", () => {
  const actual = jest.requireActual<typeof enhancement>(
    "@/lib/market-display/market-display-enhancement",
  )
  return {
    ...actual,
    calculateJitter: jest.fn(actual.calculateJitter),
  }
})

const calculateJitterMock = enhancement.calculateJitter as jest.MockedFunction<
  typeof enhancement.calculateJitter
>

function baseDisplay(overrides: Partial<MarketDisplayConfigV1["global"]> = {}): MarketDisplayConfigV1 {
  return {
    ...DEFAULT_MARKET_DISPLAY_CONFIG_V1,
    global: {
      ...DEFAULT_MARKET_DISPLAY_CONFIG_V1.global,
      jitter: {
        ...DEFAULT_MARKET_DISPLAY_CONFIG_V1.global.jitter,
        enabled: true,
        interval: 5000,
        intensity: 0,
        convergence: 0,
        ...overrides.jitter,
      },
      interpolation: {
        ...DEFAULT_MARKET_DISPLAY_CONFIG_V1.global.interpolation,
        enabled: false,
        ...overrides.interpolation,
      },
      deviation: {
        ...DEFAULT_MARKET_DISPLAY_CONFIG_V1.global.deviation,
        ...overrides.deviation,
      },
    },
  }
}

const emptySets = {
  tokenToSegment: new Map<string, "default">(),
  indexTokenStrs: new Set<string>(),
  positionTokenStrs: new Set<string>(),
  watchlistTokenStrs: new Set<string>(),
}

function allSegmentsJitterOpen(open: boolean): Record<MarketDisplaySegmentKey, boolean> {
  const o = {} as Record<MarketDisplaySegmentKey, boolean>
  for (const k of MARKET_DISPLAY_SEGMENT_KEYS) {
    o[k] = open
  }
  return o
}

describe("enhanceQuotesTick", () => {
  beforeEach(() => {
    calculateJitterMock.mockReset()
    calculateJitterMock.mockImplementation(
      jest.requireActual<typeof enhancement>(
        "@/lib/market-display/market-display-enhancement",
      ).calculateJitter,
    )
  })

  function globalUiForJitterTest(): (typeof defaultMarketDataConfigGlobal) {
    return {
      ...defaultMarketDataConfigGlobal,
      jitter: {
        ...defaultMarketDataConfigGlobal.jitter,
        enabled: true,
        interval: 5000,
        intensity: 0,
        convergence: 0,
      },
    }
  }

  it("does not re-roll jitter until interval elapses", () => {
    let jitterCalls = 0
    calculateJitterMock.mockImplementation(() => {
      jitterCalls += 1
      return jitterCalls === 1 ? 12 : 99
    })

    const display = baseDisplay()
    const globalUi = globalUiForJitterTest()

    const raw: Record<string, EnhancedQuote> = {
      "26000": {
        instrumentToken: 26000,
        actual_price: 50_000,
        display_price: 50_000,
        last_trade_price: 50_000,
        trend: "neutral",
        jitter_offset: 0,
        deviation_offset: 0,
        timestamp: 1_000,
        lastUpdateTime: 1_000,
      },
    }

    const a = enhanceQuotesTick({
      nowMs: 1_000,
      rawByToken: raw,
      displayConfig: display,
      globalUiConfig: globalUi,
      ...emptySets,
      segmentJitterSessionOpen: allSegmentsJitterOpen(true),
      jitterOffsets: {},
      jitterLastAtByToken: {},
      interpolationByToken: {},
      previousActualByToken: {},
      lastDisplayByToken: {},
    })

    expect(jitterCalls).toBe(1)
    expect(calculateJitterMock).toHaveBeenCalledTimes(1)
    expect(a.jitterOffsets["26000"]).toBe(12)
    expect(a.jitterLastAtByToken["26000"]).toBe(1_000)

    const b = enhanceQuotesTick({
      nowMs: 2_000,
      rawByToken: raw,
      displayConfig: display,
      globalUiConfig: globalUi,
      ...emptySets,
      segmentJitterSessionOpen: allSegmentsJitterOpen(true),
      jitterOffsets: a.jitterOffsets,
      jitterLastAtByToken: a.jitterLastAtByToken,
      interpolationByToken: {},
      previousActualByToken: a.previousActualByToken,
      lastDisplayByToken: a.lastDisplayByToken,
    })

    expect(jitterCalls).toBe(1)
    expect(calculateJitterMock).toHaveBeenCalledTimes(1)
    expect(b.jitterOffsets["26000"]).toBe(12)
  })

  it("re-rolls after interval", () => {
    let jitterCalls = 0
    calculateJitterMock.mockImplementation(() => {
      jitterCalls += 1
      return jitterCalls === 1 ? 12 : 99
    })

    const display = baseDisplay()
    const globalUi = globalUiForJitterTest()

    const raw: Record<string, EnhancedQuote> = {
      "26000": {
        instrumentToken: 26000,
        actual_price: 50_000,
        display_price: 50_000,
        last_trade_price: 50_000,
        trend: "neutral",
        jitter_offset: 0,
        deviation_offset: 0,
        timestamp: 1_000,
        lastUpdateTime: 1_000,
      },
    }

    const a = enhanceQuotesTick({
      nowMs: 0,
      rawByToken: raw,
      displayConfig: display,
      globalUiConfig: globalUi,
      ...emptySets,
      segmentJitterSessionOpen: allSegmentsJitterOpen(true),
      jitterOffsets: {},
      jitterLastAtByToken: {},
      interpolationByToken: {},
      previousActualByToken: {},
      lastDisplayByToken: {},
    })

    const b = enhanceQuotesTick({
      nowMs: 6000,
      rawByToken: raw,
      displayConfig: display,
      globalUiConfig: globalUi,
      ...emptySets,
      segmentJitterSessionOpen: allSegmentsJitterOpen(true),
      jitterOffsets: a.jitterOffsets,
      jitterLastAtByToken: a.jitterLastAtByToken,
      interpolationByToken: {},
      previousActualByToken: a.previousActualByToken,
      lastDisplayByToken: a.lastDisplayByToken,
    })

    expect(jitterCalls).toBe(2)
    expect(calculateJitterMock).toHaveBeenCalledTimes(2)
    expect(b.jitterOffsets["26000"]).toBe(99)
  })

  it("applies jitter only when segmentJitterSessionOpen for that token segment is true", () => {
    calculateJitterMock.mockReturnValue(42)

    const display = baseDisplay()
    const globalUi = globalUiForJitterTest()
    const raw: Record<string, EnhancedQuote> = {
      "999": {
        instrumentToken: 999,
        actual_price: 50_000,
        display_price: 50_000,
        last_trade_price: 50_000,
        trend: "neutral",
        jitter_offset: 0,
        deviation_offset: 0,
        timestamp: 1,
        lastUpdateTime: 1,
      },
    }

    const segMap = allSegmentsJitterOpen(false)
    segMap.MCX_FO = true

    const mcxOnly = enhanceQuotesTick({
      nowMs: 10_000,
      rawByToken: raw,
      displayConfig: display,
      globalUiConfig: globalUi,
      tokenToSegment: new Map([["999", "MCX_FO"]]),
      indexTokenStrs: new Set(),
      positionTokenStrs: new Set(),
      watchlistTokenStrs: new Set(["999"]),
      segmentJitterSessionOpen: segMap,
      jitterOffsets: {},
      jitterLastAtByToken: {},
      interpolationByToken: {},
      previousActualByToken: {},
      lastDisplayByToken: {},
    })

    expect(calculateJitterMock).toHaveBeenCalled()
    expect(mcxOnly.jitterOffsets["999"]).toBe(42)

    calculateJitterMock.mockClear()
    const nseClosed = enhanceQuotesTick({
      nowMs: 10_000,
      rawByToken: raw,
      displayConfig: display,
      globalUiConfig: globalUi,
      tokenToSegment: new Map([["999", "NSE_EQ"]]),
      indexTokenStrs: new Set(),
      positionTokenStrs: new Set(),
      watchlistTokenStrs: new Set(["999"]),
      segmentJitterSessionOpen: segMap,
      jitterOffsets: {},
      jitterLastAtByToken: {},
      interpolationByToken: {},
      previousActualByToken: {},
      lastDisplayByToken: {},
    })

    expect(calculateJitterMock).not.toHaveBeenCalled()
    expect(nseClosed.jitterOffsets["999"]).toBe(0)
  })
})
