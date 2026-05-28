/**
 * @file bid-ask-spread-config.schema.ts
 * @module lib/market-display
 * @description Zod schema and defaults for per-segment synthetic bid/ask spread configuration.
 *              Stored in SystemSettings under BID_ASK_SPREAD_CONFIG_V1 key.
 *              Spread is randomized per order within [min, max] range to prevent user exploitation.
 * @author StockTrade
 * @created 2026-04-15
 */

import { z } from "zod"

const spreadRangeSchema = z.object({
  /** Minimum spread percentage (both sides combined, e.g. 0.10 = 0.05% each side) */
  min: z.number().min(0).max(10),
  /** Maximum spread percentage (both sides combined) */
  max: z.number().min(0).max(10),
})

export const bidAskSpreadConfigV1Schema = z.object({
  segments: z.record(z.string(), spreadRangeSchema),
})

export type BidAskSpreadRangeV1 = z.infer<typeof spreadRangeSchema>
export type BidAskSpreadConfigV1 = z.infer<typeof bidAskSpreadConfigV1Schema>

/**
 * Segment keys used in spread config.
 * Must cover every segment the platform trades on.
 */
export const BID_ASK_SPREAD_SEGMENT_KEYS = [
  "NSE_EQ",
  "NSE_FO",
  "BSE_EQ",
  "MCX",
  "CDS",
  "CRYPTO",
  "DEFAULT",
] as const

export type BidAskSpreadSegmentKey = (typeof BID_ASK_SPREAD_SEGMENT_KEYS)[number]

/**
 * Default spread config — mirrors the hardcoded values in market-realism-config.ts.
 * Used as fallback when no DB config is saved.
 */
export const DEFAULT_BID_ASK_SPREAD_CONFIG_V1: BidAskSpreadConfigV1 = {
  segments: {
    NSE_EQ:  { min: 0.05, max: 0.20 },
    NSE_FO:  { min: 0.10, max: 0.35 },
    BSE_EQ:  { min: 0.05, max: 0.20 },
    MCX:     { min: 0.15, max: 0.50 },
    CDS:     { min: 0.03, max: 0.10 },
    CRYPTO:  { min: 0.20, max: 0.80 },
    DEFAULT: { min: 0.08, max: 0.30 },
  },
}

/**
 * Resolve the spread range for a given segment string.
 * Normalises the segment key and falls back to DEFAULT if no exact match.
 */
export function resolveSpreadRange(
  config: BidAskSpreadConfigV1,
  segment: string
): BidAskSpreadRangeV1 {
  const normalised = segment.toUpperCase().trim()
  if (config.segments[normalised]) return config.segments[normalised]
  // Partial match (e.g. "NFO" → "NSE_FO", "NSE" → "NSE_EQ")
  for (const key of Object.keys(config.segments)) {
    if (normalised.includes(key) || key.includes(normalised)) {
      return config.segments[key]
    }
  }
  return config.segments["DEFAULT"] ?? { min: 0.08, max: 0.30 }
}

/**
 * Pick a random spread percentage within the configured range for a segment.
 * Called once per order-sheet open; the result is locked for that session.
 */
export function pickRandomSpread(
  config: BidAskSpreadConfigV1,
  segment: string
): number {
  const range = resolveSpreadRange(config, segment)
  return range.min + Math.random() * (range.max - range.min)
}

/**
 * Parse a raw JSON value from SystemSettings into BidAskSpreadConfigV1.
 * Returns the default config on any parse error.
 */
export function parseBidAskSpreadConfigJson(
  raw: unknown
): BidAskSpreadConfigV1 {
  const result = bidAskSpreadConfigV1Schema.safeParse(raw)
  if (result.success) return result.data
  return DEFAULT_BID_ASK_SPREAD_CONFIG_V1
}
