/**
 * @file market-control-config.schema.ts
 * @module lib/market-control
 * @description Zod schema + TS types for MARKET_CONTROL_CONFIG_V1 — the unified admin super-controls for
 *              synthetic bid/ask spread, slippage, order behaviour, anti-scalping, price tilt and kill
 *              switches. Stored in SystemSettings under MARKET_CONTROL_CONFIG_V1 key.
 *
 *              Replaces BID_ASK_SPREAD_CONFIG_V1. On read, a legacy blob is auto-upgraded into this
 *              schema by `parseMarketControlConfigJson` so no data migration is required.
 *
 *              Cascade hierarchy (outermost wins as a baseline, inner layers multiply/override):
 *              Exchange → Segment → Symbol → User/Segment-override
 *
 * Exports:
 *   - exchangeKeys                        — readonly tuple of exchange identifiers
 *   - SEGMENT_TO_EXCHANGE                 — maps each segment key to its parent exchange
 *   - exchangeRuleSchema                  — Zod schema for per-exchange baseline rules
 *   - marketControlConfigV1Schema         — top-level Zod schema (includes exchangeOverrides)
 *   - DEFAULT_MARKET_CONTROL_CONFIG_V1    — safe default with all exchange overrides empty
 *   - parseMarketControlConfigJson()      — parse + legacy-upgrade raw JSON
 *   - symbolOverrideKey()                 — canonical "SEGMENT:SYMBOL" key builder
 *   - ExchangeKey, ExchangeRuleV1, MarketControlConfigV1 (+ others) — TS types
 *
 * @author StockTrade
 * @created 2026-04-15
 * @updated 2026-04-25 — Added Exchange tier (exchangeKeys, exchangeRuleSchema, SEGMENT_TO_EXCHANGE); added enabled flag to symbolOverrideSchema
 */

import { z } from "zod"
import {
  DEFAULT_BID_ASK_SPREAD_CONFIG_V1,
  parseBidAskSpreadConfigJson,
  type BidAskSpreadConfigV1,
} from "@/lib/market-display/bid-ask-spread-config.schema"

/* ────────────────────────────────────────────────────────────────────────────────
 * Primitives
 * ────────────────────────────────────────────────────────────────────────────── */

const pctRange = z.object({
  min: z.number().min(0).max(50),
  max: z.number().min(0).max(50),
})

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "must be HH:MM (24h)")

/* ────────────────────────────────────────────────────────────────────────────────
 * Segment rules — spread, slippage, size tiers, time-of-day, kill switch
 * ────────────────────────────────────────────────────────────────────────────── */

export const spreadRuleSchema = pctRange.extend({
  distribution: z.enum(["uniform", "weighted_worst"]).default("uniform"),
})

export const slippageRuleSchema = pctRange

/**
 * Trading-mfk: per-segment client-side jitter rule. Consumed by the WebSocket market-data
 * provider (and by the demo /market-demo MarketDataConfig component as its DEFAULT) to
 * apply micro-movements between server tick updates so the price ticker feels alive
 * during the 5s server-poll window.
 *
 * Semantics:
 *   - `enabled`         — master toggle
 *   - `intervalMs`      — how often jitter recomputes (typical 100–500ms)
 *   - `intensityPct`    — magnitude of each jitter step in % of price (typical 0.05–0.5)
 *   - `convergence`     — 0..1 fraction of (real_price - displayed_price) the jitter
 *                          mean-reverts toward each step. 0 = pure random walk; 1 = snap
 *                          to real price every step. Higher = tighter coupling to real LTP.
 *
 * Why not boolean: per-segment knobs let admins tighten jitter on volatile MCX (less fake
 * movement) and loosen it on quiet equity (more visible animation).
 */
export const jitterRuleSchema = z.object({
  enabled: z.boolean().default(true),
  intervalMs: z.number().int().min(50).max(5_000).default(250),
  intensityPct: z.number().min(0).max(5).default(0.15),
  convergence: z.number().min(0).max(1).default(0.1),
})

export const sizeTiersSchema = z.object({
  small: z.number().nonnegative().default(10_000),
  medium: z.number().nonnegative().default(100_000),
  large: z.number().nonnegative().default(500_000),
  multSmall: z.number().min(0).max(10).default(1.0),
  multMedium: z.number().min(0).max(10).default(1.5),
  multLarge: z.number().min(0).max(10).default(2.0),
})

export const timeOfDayWindowSchema = z.object({
  from: hhmm,
  to: hhmm,
  label: z.string().max(40).optional(),
  spreadMult: z.number().min(0).max(10).default(1.0),
  slipMult: z.number().min(0).max(10).default(1.0),
})

export const killSwitchSchema = z.object({
  buyDisabled: z.boolean().default(false),
  sellDisabled: z.boolean().default(false),
  reason: z.string().max(240).default(""),
})

export const segmentRuleSchema = z.object({
  spread: spreadRuleSchema,
  slippage: slippageRuleSchema,
  sizeTiers: sizeTiersSchema,
  /** -1..+1 — positive nudges price against the customer on each fill. 0 = neutral. */
  tiltBiasPct: z.number().min(-1).max(1).default(0),
  /** Multiplier applied to spread when realised volatility is considered high. */
  volMultiplier: z.number().min(0).max(10).default(1.0),
  timeOfDay: z.array(timeOfDayWindowSchema).default([]),
  killSwitch: killSwitchSchema.default({ buyDisabled: false, sellDisabled: false, reason: "" }),
  /**
   * Trading-mfk: per-segment jitter rule. Optional with default — admins who don't
   * configure jitter still get the product default (visible animation enabled).
   */
  jitter: jitterRuleSchema.default({
    enabled: true,
    intervalMs: 250,
    intensityPct: 0.15,
    convergence: 0.1,
  }),
})

/* ────────────────────────────────────────────────────────────────────────────────
 * Symbol-level overrides (sparse — any field replaces the segment default)
 * ────────────────────────────────────────────────────────────────────────────── */

export const symbolOverrideSchema = z.object({
  /** Master toggle — false hides the instrument from all search results and blocks order placement. */
  enabled: z.boolean().default(true),
  spread: spreadRuleSchema.optional(),
  slippage: slippageRuleSchema.optional(),
  killSwitch: killSwitchSchema.optional(),
  notes: z.string().max(240).optional(),
})

/* ────────────────────────────────────────────────────────────────────────────────
 * User-group overrides
 * ────────────────────────────────────────────────────────────────────────────── */

export const userGroupKeys = ["VIP", "STANDARD", "HIGH_RISK", "SCALPER"] as const
export type UserGroupKey = (typeof userGroupKeys)[number]

/** @deprecated — use segmentOverrideSchema keyed by UserSegment.id instead. Kept for legacy blobs. */
export const userGroupOverrideSchema = z.object({
  spreadMult: z.number().min(0).max(10).default(1.0),
  slipMult: z.number().min(0).max(10).default(1.0),
  antiScalpRelaxed: z.boolean().default(false),
  forceWorstFill: z.boolean().default(false),
  notes: z.string().max(240).optional(),
})

/**
 * Per-segment override keyed by UserSegment.id (cuid). Populated dynamically from the DB; the
 * admin panel fetches segments via /api/admin/segments and edits an entry per row.
 * `priority` is the tiebreaker when a user belongs to multiple segments (highest wins).
 */
export const segmentOverrideSchema = z.object({
  spreadMult: z.number().min(0).max(10).default(1.0),
  slipMult: z.number().min(0).max(10).default(1.0),
  antiScalpRelaxed: z.boolean().default(false),
  forceWorstFill: z.boolean().default(false),
  marginMultiplier: z.number().min(0.5).max(5).default(1.0),
  tiltBiasPct: z.number().min(-1).max(1).default(0),
  priority: z.number().int().default(0),
  notes: z.string().max(240).optional(),
})

/** Per-user override applied after segment overrides; loaded from UserMarketControlOverride table. */
export const userOverrideSchema = z.object({
  enabled: z.boolean().default(true),
  spreadMult: z.number().min(0).max(10).default(1.0),
  slipMult: z.number().min(0).max(10).default(1.0),
  antiScalpRelaxed: z.boolean().default(false),
  forceWorstFill: z.boolean().default(false),
  marginMultiplier: z.number().min(0.5).max(5).default(1.0),
  tiltBiasPct: z.number().min(-1).max(1).default(0),
  reason: z.string().max(240).optional(),
})

/* ────────────────────────────────────────────────────────────────────────────────
 * Order behaviour — market + limit fill policy
 * ────────────────────────────────────────────────────────────────────────────── */

export const orderBehaviorSchema = z.object({
  marketOrder: z.object({
    requireFreshQuoteMs: z.number().int().min(0).max(60_000).default(2_000),
    maxDeviationPct: z.number().min(0).max(50).default(1.0),
    rejectOnKillSwitch: z.boolean().default(true),
    rejectOnStaleQuote: z.boolean().default(true),
    /**
     * EMERGENCY LEVER. When true, MARKET orders SKIP the server WS quote wait entirely and
     * execute at the client-supplied price (price → ltp → close). Default false.
     *
     * Use ONLY when the upstream WS feed is mis-routed and the server cannot get fresh ticks
     * but the frontend can. Orders priced this way are tagged `pricingPath: "ADMIN_BYPASS"`
     * in the order context so post-mortems can trace them. Every use writes a console warn.
     *
     * SECURITY: leaving this ON means clients dictate the execution price — price-deviation
     * checks against the server tape are skipped. Audit row written every toggle change.
     */
    bypassServerQuote: z.boolean().default(false),
  }),
  limitOrder: z.object({
    marketability: z.enum(["ask_bid", "touch", "cross"]).default("ask_bid"),
    fillAt: z.enum(["limit", "side_quote", "better"]).default("better"),
    fillDelayMs: pctRange.default({ min: 0, max: 1_500 }),
    partialFillProb: z.number().min(0).max(1).default(0),
    expireAfterMin: z.number().int().min(1).max(10_080).default(1_440),
    /**
     * EMERGENCY LEVER. When true, LIMIT orders are REJECTED at placement with a fixed
     * admin-controlled message ("LIMIT orders are temporarily disabled by the admin").
     * Default false.
     *
     * Pairs with `marketOrder.bypassServerQuote` — when the WS feed is broken, LIMIT orders
     * still depend on a fresh quote for marketability checks, so disabling them prevents
     * the same stale-quote rejection from happening downstream in the worker.
     */
    disabled: z.boolean().default(false),
  }),
})

/* ────────────────────────────────────────────────────────────────────────────────
 * Anti-scalping
 * ────────────────────────────────────────────────────────────────────────────── */

export const scalperAutoFlagSchema = z.object({
  enabled: z.boolean().default(true),
  tradesPerMinuteThreshold: z.number().int().min(1).max(1_000).default(5),
  quickRoundTripsPerHour: z.number().int().min(1).max(1_000).default(8),
  minProfitableRoundTripPct: z.number().min(0).max(100).default(0.3),
  demoteToGroup: z.enum(userGroupKeys).default("SCALPER"),
})

export const antiScalpingSchema = z.object({
  enabled: z.boolean().default(true),
  minHoldingSeconds: z.number().int().min(0).max(86_400).default(30),
  minFavorableMovePct: z.number().min(0).max(100).default(0.15),
  asymmetricExitSpreadMult: z.number().min(0).max(10).default(1.5),
  maxProfitPerTradePct: z.number().min(0).max(10_000).default(5.0),
  maxProfitPerDayPct: z.number().min(0).max(10_000).default(10.0),
  scalperAutoFlag: scalperAutoFlagSchema,
  /** false = apply penalty (extra spread). true = reject the closing order outright. */
  rejectOnViolation: z.boolean().default(false),
})

/* ────────────────────────────────────────────────────────────────────────────────
 * Price tilt (house bias on price stream)
 * ────────────────────────────────────────────────────────────────────────────── */

export const priceTiltSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["off", "per_position", "per_user", "against_net_book"]).default("off"),
  biasBps: z.number().min(0).max(1_000).default(2),
  maxTotalDriftPct: z.number().min(0).max(50).default(0.3),
})

/* ────────────────────────────────────────────────────────────────────────────────
 * Exchange tier — sits above segments in the cascade hierarchy
 * ────────────────────────────────────────────────────────────────────────────── */

export const exchangeKeys = ["NSE", "BSE", "MCX", "NSE_FO_DERIVS"] as const
export type ExchangeKey = (typeof exchangeKeys)[number]

/**
 * Exchange-level baseline rule. All segment rules under this exchange are computed as:
 *   effectiveSpread = exchangeRule.spreadBasePct + (segmentSpread * exchangeRule.volMultiplier)
 *   effectiveSlippage = min(segmentSlippage, exchangeRule.slippageCapPct || ∞)
 *
 * Kill switch at exchange level blocks all child segments regardless of their individual setting.
 * `enabledSegments` controls which MARKET_CONTROL_SEGMENT_KEYS are active for this exchange.
 */
export const exchangeRuleSchema = z.object({
  /** Absolute spread floor added on top of every child segment's spread (percentage). */
  spreadBasePct: z.number().min(0).max(5).default(0),
  /** Hard cap on slippage before segment multipliers are applied (0 = no cap). */
  slippageCapPct: z.number().min(0).max(5).default(0),
  /** Exchange-level volatility baseline multiplier applied to segment vol multipliers. */
  volMultiplier: z.number().min(0).max(10).default(1.0),
  /** When buyDisabled/sellDisabled, the entire exchange is halted regardless of segment rules. */
  killSwitch: killSwitchSchema.default({ buyDisabled: false, sellDisabled: false, reason: "" }),
  /** Which MARKET_CONTROL_SEGMENT_KEYS are active under this exchange. Empty = all active. */
  enabledSegments: z.array(z.string()).default([]),
  /** IST trading hours override. When set, overrides the market-timing module for this exchange. */
  tradingHours: z
    .object({ open: hhmm, close: hhmm })
    .optional(),
  notes: z.string().max(240).default(""),
})

export type ExchangeRuleV1 = z.infer<typeof exchangeRuleSchema>

/** Maps each segment key to its parent exchange for cascade lookups and UI grouping. */
export const SEGMENT_TO_EXCHANGE: Record<MarketControlSegmentKey, ExchangeKey> = {
  NSE_EQ: "NSE",
  NSE_FO: "NSE_FO_DERIVS",
  BSE_EQ: "BSE",
  MCX: "MCX",
  CDS: "NSE",
  CRYPTO: "NSE",
  DEFAULT: "NSE",
}

/** Inverse map: exchange → list of segment keys that belong to it. */
export const EXCHANGE_TO_SEGMENTS: Record<ExchangeKey, MarketControlSegmentKey[]> = {
  NSE: ["NSE_EQ", "CDS", "CRYPTO", "DEFAULT"],
  NSE_FO_DERIVS: ["NSE_FO"],
  BSE: ["BSE_EQ"],
  MCX: ["MCX"],
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Top-level config
 * ────────────────────────────────────────────────────────────────────────────── */

export const MARKET_CONTROL_SEGMENT_KEYS = [
  "NSE_EQ",
  "NSE_FO",
  "BSE_EQ",
  "MCX",
  "CDS",
  "CRYPTO",
  "DEFAULT",
] as const
export type MarketControlSegmentKey = (typeof MARKET_CONTROL_SEGMENT_KEYS)[number]

export const marketControlConfigV1Schema = z.object({
  version: z.literal(1).default(1),
  /**
   * Exchange-level baseline rules. Keyed by ExchangeKey (sparse — unset key = no exchange override).
   * Applied first in the cascade before segment rules are evaluated.
   */
  exchangeOverrides: z.record(z.string(), exchangeRuleSchema).default({}),
  segments: z.record(z.string(), segmentRuleSchema),
  symbolOverrides: z.record(z.string(), symbolOverrideSchema).default({}),
  /** @deprecated — use `segmentOverrides`. Kept for legacy-config back-compat. */
  userGroupOverrides: z.record(z.enum(userGroupKeys), userGroupOverrideSchema).default({
    VIP: { spreadMult: 0.5, slipMult: 0.5, antiScalpRelaxed: true, forceWorstFill: false },
    STANDARD: { spreadMult: 1.0, slipMult: 1.0, antiScalpRelaxed: false, forceWorstFill: false },
    HIGH_RISK: { spreadMult: 1.8, slipMult: 1.5, antiScalpRelaxed: false, forceWorstFill: false },
    SCALPER: { spreadMult: 2.5, slipMult: 2.0, antiScalpRelaxed: false, forceWorstFill: true },
  }),
  /** Keyed by UserSegment.id (cuid) — dynamically populated from DB. */
  segmentOverrides: z.record(z.string(), segmentOverrideSchema).default({}),
  /** Feature toggle for the per-user override layer. UI hides personal override when false. */
  perUserOverridesEnabled: z.boolean().default(true),
  orderBehavior: orderBehaviorSchema,
  antiScalping: antiScalpingSchema,
  priceTilt: priceTiltSchema,
})

export type MarketControlConfigV1 = z.infer<typeof marketControlConfigV1Schema>
export type SegmentRuleV1 = z.infer<typeof segmentRuleSchema>
export type SymbolOverrideV1 = z.infer<typeof symbolOverrideSchema>
export type UserGroupOverrideV1 = z.infer<typeof userGroupOverrideSchema>
export type SegmentOverrideV1 = z.infer<typeof segmentOverrideSchema>
export type UserOverrideV1 = z.infer<typeof userOverrideSchema>
export type OrderBehaviorV1 = z.infer<typeof orderBehaviorSchema>
export type AntiScalpingV1 = z.infer<typeof antiScalpingSchema>
export type PriceTiltV1 = z.infer<typeof priceTiltSchema>
export type KillSwitchV1 = z.infer<typeof killSwitchSchema>
export type JitterRuleV1 = z.infer<typeof jitterRuleSchema>
// ExchangeRuleV1 is declared alongside exchangeRuleSchema above

/* ────────────────────────────────────────────────────────────────────────────────
 * Defaults
 * ────────────────────────────────────────────────────────────────────────────── */

const makeSegmentDefault = (min: number, max: number, slipMin: number, slipMax: number): SegmentRuleV1 => ({
  spread: { min, max, distribution: "uniform" },
  slippage: { min: slipMin, max: slipMax },
  sizeTiers: { small: 10_000, medium: 100_000, large: 500_000, multSmall: 1.0, multMedium: 1.5, multLarge: 2.0 },
  tiltBiasPct: 0,
  volMultiplier: 1.0,
  timeOfDay: [],
  killSwitch: { buyDisabled: false, sellDisabled: false, reason: "" },
  // Trading-mfk: product default for jitter — visible animation, mild micro-movements,
  // 10% mean-reversion to real price each step. Admins can override per-segment.
  jitter: { enabled: true, intervalMs: 250, intensityPct: 0.15, convergence: 0.1 },
})

export const DEFAULT_MARKET_CONTROL_CONFIG_V1: MarketControlConfigV1 = {
  version: 1,
  exchangeOverrides: {},
  segments: {
    NSE_EQ: makeSegmentDefault(0.05, 0.20, 0.05, 0.15),
    NSE_FO: makeSegmentDefault(0.10, 0.35, 0.10, 0.20),
    BSE_EQ: makeSegmentDefault(0.05, 0.20, 0.08, 0.18),
    MCX: makeSegmentDefault(0.15, 0.50, 0.15, 0.30),
    CDS: makeSegmentDefault(0.03, 0.10, 0.03, 0.08),
    CRYPTO: makeSegmentDefault(0.20, 0.80, 0.20, 0.50),
    DEFAULT: makeSegmentDefault(0.08, 0.30, 0.10, 0.25),
  },
  symbolOverrides: {},
  userGroupOverrides: {
    VIP: { spreadMult: 0.5, slipMult: 0.5, antiScalpRelaxed: true, forceWorstFill: false },
    STANDARD: { spreadMult: 1.0, slipMult: 1.0, antiScalpRelaxed: false, forceWorstFill: false },
    HIGH_RISK: { spreadMult: 1.8, slipMult: 1.5, antiScalpRelaxed: false, forceWorstFill: false },
    SCALPER: { spreadMult: 2.5, slipMult: 2.0, antiScalpRelaxed: false, forceWorstFill: true },
  },
  segmentOverrides: {},
  perUserOverridesEnabled: true,
  orderBehavior: {
    marketOrder: {
      requireFreshQuoteMs: 2_000,
      maxDeviationPct: 1.0,
      rejectOnKillSwitch: true,
      rejectOnStaleQuote: true,
      bypassServerQuote: false,
    },
    limitOrder: {
      marketability: "ask_bid",
      fillAt: "better",
      fillDelayMs: { min: 0, max: 1_500 },
      partialFillProb: 0,
      expireAfterMin: 1_440,
      disabled: false,
    },
  },
  antiScalping: {
    enabled: true,
    minHoldingSeconds: 30,
    minFavorableMovePct: 0.15,
    asymmetricExitSpreadMult: 1.5,
    maxProfitPerTradePct: 5.0,
    maxProfitPerDayPct: 10.0,
    scalperAutoFlag: {
      enabled: true,
      tradesPerMinuteThreshold: 5,
      quickRoundTripsPerHour: 8,
      minProfitableRoundTripPct: 0.3,
      demoteToGroup: "SCALPER",
    },
    rejectOnViolation: false,
  },
  priceTilt: {
    enabled: false,
    mode: "off",
    biasBps: 2,
    maxTotalDriftPct: 0.3,
  },
}

/* ────────────────────────────────────────────────────────────────────────────────
 * Parsing & legacy upgrade
 * ────────────────────────────────────────────────────────────────────────────── */

/**
 * Parse a raw JSON blob into MarketControlConfigV1.
 * Accepts:
 *   1. A valid v1 blob — returned as-is.
 *   2. A legacy BidAskSpreadConfigV1 blob — upgraded in-memory by copying spread ranges into the
 *      new segments map while leaving everything else at defaults.
 *   3. `null`/invalid — returns DEFAULT_MARKET_CONTROL_CONFIG_V1.
 */
export function parseMarketControlConfigJson(raw: unknown): MarketControlConfigV1 {
  if (raw == null) return DEFAULT_MARKET_CONTROL_CONFIG_V1

  const direct = marketControlConfigV1Schema.safeParse(raw)
  if (direct.success) return direct.data

  // Attempt legacy upgrade.
  const legacy: BidAskSpreadConfigV1 = parseBidAskSpreadConfigJson(raw)
  const upgraded: MarketControlConfigV1 = {
    ...DEFAULT_MARKET_CONTROL_CONFIG_V1,
    exchangeOverrides: {},
    segments: { ...DEFAULT_MARKET_CONTROL_CONFIG_V1.segments },
  }
  for (const [segKey, range] of Object.entries(legacy.segments)) {
    const base =
      upgraded.segments[segKey] ??
      DEFAULT_MARKET_CONTROL_CONFIG_V1.segments[segKey] ??
      DEFAULT_MARKET_CONTROL_CONFIG_V1.segments.DEFAULT
    upgraded.segments[segKey] = {
      ...base,
      spread: { min: range.min, max: range.max, distribution: base.spread.distribution },
    }
  }
  return upgraded
}

/** Build a canonical symbol-override key: "SEGMENT:SYMBOL" (both upper-cased). */
export function symbolOverrideKey(segment: string, symbol: string): string {
  return `${segment.toUpperCase().trim()}:${symbol.toUpperCase().trim()}`
}

/** Re-export legacy defaults so callers can still migrate from either side. */
export { DEFAULT_BID_ASK_SPREAD_CONFIG_V1 }
