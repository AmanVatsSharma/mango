/**
 * @file market-display-config.schema.ts
 * @module market-display
 * @description Zod schema, defaults, and merge helpers for `market_display_config_v1` SystemSettings JSON.
 * @author StockTrade
 * @created 2026-03-24
 * @updated 2026-03-30
 *
 * Changelog: quoteFreshness.redisMarketQuoteMaxAgeMs, positionPnlQuoteMaxAgeMs, marketQuoteRedisWriteMinIntervalMs (2026-03-30). ui.positionCloseUseClientPriceWhenWithinBand, adminPositionCloseMaxDeviationBps, positionCloseReferenceDivergenceMaxBps (2026-03-30). ui.adminSquareOffAllowLastSubscriptionTick (2026-03-30). ui.positionSquareOffPriceAuthority (2026-03-27).
 *
 * Notes:
 * - Shared by API route, admin console, and WebSocketMarketDataProvider.
 * - Segment keys align with `resolveSubscriptionExchangePrefix` in quote-lookup.
 */

import { z } from "zod"
import type { MarketDataConfig } from "@/lib/market-data/providers/types"
import {
  normalizeSubscriptionKey,
  parseTokenFromInstrumentId,
  resolveSubscriptionExchangePrefix,
} from "@/lib/market-data/utils/quote-lookup"
import type { SubscriptionKey } from "@/lib/market-data/providers/types"

export const MARKET_DISPLAY_CONFIG_VERSION = 1 as const

export const MARKET_DISPLAY_SEGMENT_KEYS = [
  "NSE_EQ",
  "NSE_FO",
  "BSE_EQ",
  "BSE_FO",
  "MCX_FO",
  "default",
] as const

export type MarketDisplaySegmentKey = (typeof MARKET_DISPLAY_SEGMENT_KEYS)[number]

export type MarketDisplaySurfaceKey = "positions" | "watchlist" | "indices"

const jitterOverrideSchema = z
  .object({
    enabled: z.boolean().optional(),
    interval: z.number().min(50).max(5000).optional(),
    intensity: z.number().min(0).max(5).optional(),
    convergence: z.number().min(0).max(1).optional(),
    maxAbsPctOfLtp: z.number().min(0.01).max(5).optional(),
  })
  .strict()

const deviationOverrideSchema = z
  .object({
    enabled: z.boolean().optional(),
    percentage: z.number().min(0).max(100).optional(),
    absolute: z.number().min(0).max(1_000_000).optional(),
  })
  .strict()

const interpolationEasingSchema = z.enum(["linear", "easeOut"])

const interpolationOverrideSchema = z
  .object({
    enabled: z.boolean().optional(),
    steps: z.number().int().min(1).max(500).optional(),
    duration: z.number().min(100).max(60_000).optional(),
    easing: interpolationEasingSchema.optional(),
  })
  .strict()

const enhancementPatchSchema = z
  .object({
    jitter: jitterOverrideSchema.optional(),
    deviation: deviationOverrideSchema.optional(),
    interpolation: interpolationOverrideSchema.optional(),
  })
  .strict()
  .optional()

export type MarketDisplayEnhancementPatch = z.infer<NonNullable<typeof enhancementPatchSchema>>

const quoteFreshnessSchema = z
  .object({
    liveMaxAgeMs: z.number().int().min(500).max(120_000).default(5_000),
    displayMaxAgeMs: z.number().int().min(1_000).max(600_000).default(60_000),
    pnlServerMaxAgeMs: z.number().int().min(1_000).max(120_000).default(15_000),
    /** Max age to accept `market:quote:<token>` reads (list overlay + closes). */
    redisMarketQuoteMaxAgeMs: z.number().int().min(500).max(120_000).default(7_500),
    /** Max age of embedded tick (`quoteReceivedAtMs`) for trusting `currentPrice` in `positions:pnl`. */
    positionPnlQuoteMaxAgeMs: z.number().int().min(1_000).max(120_000).default(15_000),
    /**
     * Min interval between Redis writes per token from live ticks (0 = write every tick).
     * In-memory quotes still update every tick.
     */
    marketQuoteRedisWriteMinIntervalMs: z.number().int().min(0).max(5_000).default(100),
  })
  .strict()
  .default({
    liveMaxAgeMs: 5_000,
    displayMaxAgeMs: 60_000,
    pnlServerMaxAgeMs: 15_000,
    redisMarketQuoteMaxAgeMs: 7_500,
    positionPnlQuoteMaxAgeMs: 15_000,
    marketQuoteRedisWriteMinIntervalMs: 100,
  })

const positionsRowPriceBasisSchema = z.enum(["smoothed_display", "exchange_ltp"])
const positionCloseExitPricePolicySchema = z.enum([
  "server_live_only",
  "server_live_then_redis_snapshot",
])
const staleQuotePriceModeSchema = z.enum(["strict", "last_tick"])
const positionSquareOffPriceAuthoritySchema = z.enum(["server", "client_assisted"])
const positionsTabMtmDisplayModeSchema = z.enum([
  "live_hybrid",
  "live_quote_preferred",
  "server_snapshot_preferred",
])

const uiPolicySchema = z
  .object({
    disconnectedPriceMode: z.enum(["last", "dash"]).default("last"),
    staleBadgeAfterMs: z
      .union([z.number().int().min(500).max(600_000), z.null()])
      .optional()
      .default(null),
    positionFreezeEnabled: z.boolean().default(true),
    /** When true, MCX jitter can run after NSE close (per-segment hours). When false, use legacy single NSE window for all. */
    respectSegmentTradingHoursForJitter: z.boolean().default(true),
    /** Positions row: show smoothed display price vs exchange LTP for the visible mark. */
    positionsRowPriceBasis: positionsRowPriceBasisSchema.default("smoothed_display"),
    /** Square-off: allow last worker Redis mark when live quote unavailable. */
    positionCloseExitPricePolicy: positionCloseExitPricePolicySchema.default("server_live_only"),
    /**
     * server: executed exit mark prefers live server quote; client exitPrice only if fresh metadata + within maxDeviationBps of server/ref.
     * client_assisted: trust client mark when ltpAgeMs/ltpTimestamp proves freshness (same as legacy net-close).
     */
    positionSquareOffPriceAuthority: positionSquareOffPriceAuthoritySchema.default("client_assisted"),
    /** Positions tab open MTM: live hybrid vs prefer worker snapshot when fresh (independent of square-off authority). */
    positionsTabMtmDisplayMode: positionsTabMtmDisplayModeSchema.default("live_hybrid"),
    /** Max |client−reference|/reference for accepting client exit in server authority mode (basis points, 100 = 1%). */
    positionSquareOffClientMaxDeviationBps: z.number().int().min(0).max(100_000).default(100),
    /**
     * When true, admin-only square-off (PATCH close + admin net-close) may use the last cached server subscription tick
     * (`getQuote` with no freshness gate) if no fresh live quote is available. Retail/client flows ignore this flag.
     */
    adminSquareOffAllowLastSubscriptionTick: z.boolean().default(false),
    /**
     * When true, if the operator sends an exit price within `positionSquareOffClientMaxDeviationBps` of the server/Redis
     * reference, **book that client price** instead of the reference. Outside the band → reject (422).
     */
    positionCloseUseClientPriceWhenWithinBand: z.boolean().default(false),
    /**
     * Optional stricter band for admin PATCH / admin net-close only; null = use `positionSquareOffClientMaxDeviationBps`.
     */
    adminPositionCloseMaxDeviationBps: z
      .union([z.number().int().min(0).max(100_000), z.null()])
      .optional()
      .default(null),
    /**
     * When set, and both a fresh server quote and a Redis snapshot exist, reject close if they diverge by more than this (bps).
     */
    positionCloseReferenceDivergenceMaxBps: z
      .union([z.number().int().min(0).max(100_000), z.null()])
      .optional()
      .default(null),
    /**
     * strict: hide numeric price when quote is older than display max age.
     * last_tick: keep showing last received LTP/display price (watchlist + positions aligned).
     */
    staleQuotePriceMode: staleQuotePriceModeSchema.default("strict"),
    /** Master switch for LIVE/STALE/FROZEN-style feed badges on positions. */
    quoteBadgesEnabled: z.boolean().default(true),
  })
  .strict()
  .default({
    disconnectedPriceMode: "last",
    staleBadgeAfterMs: null,
    positionFreezeEnabled: true,
    respectSegmentTradingHoursForJitter: true,
    positionsRowPriceBasis: "smoothed_display",
    positionCloseExitPricePolicy: "server_live_only",
    positionSquareOffPriceAuthority: "client_assisted",
    positionsTabMtmDisplayMode: "live_quote_preferred",
    positionSquareOffClientMaxDeviationBps: 100,
    adminSquareOffAllowLastSubscriptionTick: false,
    positionCloseUseClientPriceWhenWithinBand: false,
    adminPositionCloseMaxDeviationBps: null,
    positionCloseReferenceDivergenceMaxBps: null,
    staleQuotePriceMode: "strict",
    quoteBadgesEnabled: true,
  })

const segmentRecordSchema = z
  .record(z.string(), enhancementPatchSchema)
  .default({})

const surfaceRecordSchema = z
  .object({
    positions: enhancementPatchSchema,
    watchlist: enhancementPatchSchema,
    indices: enhancementPatchSchema,
  })
  .strict()
  .optional()
  .default({})

export const defaultMarketDataConfigGlobal: MarketDataConfig = {
  jitter: {
    enabled: false,
    interval: 250,
    intensity: 0.15,
    convergence: 0.1,
    maxAbsPctOfLtp: 0.2,
  },
  deviation: {
    enabled: false,
    percentage: 0,
    absolute: 0,
  },
  interpolation: {
    enabled: false,
    steps: 50,
    duration: 2800,
    easing: "linear",
  },
}

const globalEnhancementSchema = z
  .object({
    jitter: z
      .object({
        enabled: z.boolean().default(defaultMarketDataConfigGlobal.jitter.enabled),
        interval: z.number().min(50).max(5000).default(defaultMarketDataConfigGlobal.jitter.interval),
        intensity: z.number().min(0).max(5).default(defaultMarketDataConfigGlobal.jitter.intensity),
        convergence: z
          .number()
          .min(0)
          .max(1)
          .default(defaultMarketDataConfigGlobal.jitter.convergence),
        maxAbsPctOfLtp: z
          .number()
          .min(0.01)
          .max(5)
          .default(defaultMarketDataConfigGlobal.jitter.maxAbsPctOfLtp),
      })
      .strict()
      .default(defaultMarketDataConfigGlobal.jitter),
    deviation: z
      .object({
        enabled: z.boolean().default(defaultMarketDataConfigGlobal.deviation.enabled),
        percentage: z.number().min(0).max(100).default(defaultMarketDataConfigGlobal.deviation.percentage),
        absolute: z.number().min(0).max(1_000_000).default(defaultMarketDataConfigGlobal.deviation.absolute),
      })
      .strict()
      .default(defaultMarketDataConfigGlobal.deviation),
    interpolation: z
      .object({
        enabled: z.boolean().default(defaultMarketDataConfigGlobal.interpolation.enabled),
        steps: z.number().int().min(1).max(500).default(defaultMarketDataConfigGlobal.interpolation.steps),
        duration: z.number().min(100).max(60_000).default(defaultMarketDataConfigGlobal.interpolation.duration),
        easing: interpolationEasingSchema.default(defaultMarketDataConfigGlobal.interpolation.easing),
      })
      .strict()
      .default(defaultMarketDataConfigGlobal.interpolation),
  })
  .strict()
  .default({
    jitter: defaultMarketDataConfigGlobal.jitter,
    deviation: defaultMarketDataConfigGlobal.deviation,
    interpolation: defaultMarketDataConfigGlobal.interpolation,
  })

export const marketDisplayConfigV1Schema = z
  .object({
    version: z.literal(1).default(1),
    global: globalEnhancementSchema,
    segments: segmentRecordSchema,
    surfaces: surfaceRecordSchema,
    quoteFreshness: quoteFreshnessSchema,
    ui: uiPolicySchema,
  })
  .strict()

export type MarketDisplayConfigV1 = z.infer<typeof marketDisplayConfigV1Schema>

export type PositionsRowPriceBasis = MarketDisplayConfigV1["ui"]["positionsRowPriceBasis"]
export type PositionCloseExitPricePolicy = MarketDisplayConfigV1["ui"]["positionCloseExitPricePolicy"]
export type PositionSquareOffPriceAuthority = MarketDisplayConfigV1["ui"]["positionSquareOffPriceAuthority"]
export type PositionsTabMtmDisplayMode = MarketDisplayConfigV1["ui"]["positionsTabMtmDisplayMode"]
export type StaleQuotePriceMode = MarketDisplayConfigV1["ui"]["staleQuotePriceMode"]

export const DEFAULT_MARKET_DISPLAY_CONFIG_V1: MarketDisplayConfigV1 =
  marketDisplayConfigV1Schema.parse({})

function mergeJitter(
  base: MarketDataConfig["jitter"],
  patch?: z.infer<typeof jitterOverrideSchema>,
): MarketDataConfig["jitter"] {
  if (!patch) return { ...base }
  return {
    enabled: patch.enabled ?? base.enabled,
    interval: patch.interval ?? base.interval,
    intensity: patch.intensity ?? base.intensity,
    convergence: patch.convergence ?? base.convergence,
    maxAbsPctOfLtp: patch.maxAbsPctOfLtp ?? base.maxAbsPctOfLtp,
  }
}

function mergeDeviation(
  base: MarketDataConfig["deviation"],
  patch?: z.infer<typeof deviationOverrideSchema>,
): MarketDataConfig["deviation"] {
  if (!patch) return { ...base }
  return {
    enabled: patch.enabled ?? base.enabled,
    percentage: patch.percentage ?? base.percentage,
    absolute: patch.absolute ?? base.absolute,
  }
}

function mergeInterpolation(
  base: MarketDataConfig["interpolation"],
  patch?: z.infer<typeof interpolationOverrideSchema>,
): MarketDataConfig["interpolation"] {
  if (!patch) return { ...base }
  return {
    enabled: patch.enabled ?? base.enabled,
    steps: patch.steps ?? base.steps,
    duration: patch.duration ?? base.duration,
    easing: patch.easing ?? base.easing,
  }
}

export function mergeEnhancementPatch(
  base: MarketDataConfig,
  patch?: MarketDisplayEnhancementPatch,
): MarketDataConfig {
  if (!patch) {
    return {
      jitter: { ...base.jitter },
      deviation: { ...base.deviation },
      interpolation: { ...base.interpolation },
    }
  }
  return {
    jitter: mergeJitter(base.jitter, patch.jitter),
    deviation: mergeDeviation(base.deviation, patch.deviation),
    interpolation: mergeInterpolation(base.interpolation, patch.interpolation),
  }
}

export function resolveMergedMarketConfig(input: {
  global: MarketDataConfig
  segmentPatch?: MarketDisplayEnhancementPatch
  surfacePatch?: MarketDisplayEnhancementPatch
}): MarketDataConfig {
  const afterSegment = mergeEnhancementPatch(input.global, input.segmentPatch)
  return mergeEnhancementPatch(afterSegment, input.surfacePatch)
}

export function parseMarketDisplayConfigJson(raw: string | null | undefined): MarketDisplayConfigV1 {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return DEFAULT_MARKET_DISPLAY_CONFIG_V1
  }
  try {
    const parsed: unknown = JSON.parse(String(raw))
    const result = marketDisplayConfigV1Schema.safeParse(parsed)
    if (!result.success) {
      return DEFAULT_MARKET_DISPLAY_CONFIG_V1
    }
    return result.data
  } catch {
    return DEFAULT_MARKET_DISPLAY_CONFIG_V1
  }
}

export function normalizeSegmentKey(value: string | null | undefined): MarketDisplaySegmentKey {
  if (!value || typeof value !== "string") return "default"
  const upper = value.trim().toUpperCase()
  if ((MARKET_DISPLAY_SEGMENT_KEYS as readonly string[]).includes(upper)) {
    return upper as MarketDisplaySegmentKey
  }
  return "default"
}

/**
 * Maps instrument token string -> segment bucket for enhancement overrides.
 */
export function buildTokenToSegmentMap(subscriptionKeys: SubscriptionKey[]): Map<string, MarketDisplaySegmentKey> {
  const map = new Map<string, MarketDisplaySegmentKey>()
  for (const key of subscriptionKeys) {
    if (typeof key === "number" && Number.isFinite(key) && key > 0) {
      map.set(String(Math.trunc(key)), "default")
      continue
    }
    if (typeof key !== "string") continue
    const normalized = normalizeSubscriptionKey(key)
    const prefix = resolveSubscriptionExchangePrefix(normalized)
    const segment = normalizeSegmentKey(prefix ?? "default")
    const token = parseTokenFromInstrumentId(normalized)
    if (token !== null) {
      map.set(String(token), segment)
    }
  }
  return map
}

export function resolveSurfaceForToken(input: {
  tokenStr: string
  indexTokenStrs: Set<string>
  positionTokenStrs: Set<string>
  watchlistTokenStrs: Set<string>
}): MarketDisplaySurfaceKey {
  if (input.indexTokenStrs.has(input.tokenStr)) return "indices"
  if (input.positionTokenStrs.has(input.tokenStr)) return "positions"
  if (input.watchlistTokenStrs.has(input.tokenStr)) return "watchlist"
  return "watchlist"
}
