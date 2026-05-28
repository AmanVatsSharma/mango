/**
 * @file market-control-resolver.ts
 * @module lib/market-control
 * @description Pure function that takes a MarketControlConfigV1 + an order context and returns
 *              the EffectiveControls used by OrderExecutionService and OrderExecutionWorker.
 *
 *              Override hierarchy (lowest → highest priority):
 *                1. segments.DEFAULT
 *                2. segments[segment]
 *                3. segments[segment].timeOfDay[matching window]    (spreadMult, slipMult)
 *                4. segments[segment].volMultiplier (when `highVolatility` flag set)
 *                5. symbolOverrides["SEG:SYMBOL"]
 *                6. userGroupOverrides[group] (spreadMult, slipMult, forceWorstFill, antiScalpRelaxed)
 *
 *              The resolver is intentionally dependency-free so it can run in the Node worker, the
 *              Next.js API route, and a Jest test without any module mocking.
 * @author StockTrade
 * @created 2026-04-15
 */

import type {
  AntiScalpingV1,
  JitterRuleV1,
  KillSwitchV1,
  MarketControlConfigV1,
  OrderBehaviorV1,
  PriceTiltV1,
  SegmentOverrideV1,
  SegmentRuleV1,
  SymbolOverrideV1,
  UserGroupKey,
  UserGroupOverrideV1,
  UserOverrideV1,
} from "./market-control-config.schema"
import { symbolOverrideKey } from "./market-control-config.schema"

export interface ResolveContext {
  segment: string
  symbol: string
  orderSide: "BUY" | "SELL"
  /** @deprecated — use userSegmentIds. Kept so legacy callers still compile. */
  userGroup?: UserGroupKey | null
  /** UserSegment.id list the user belongs to. Highest-priority override wins. */
  userSegmentIds?: string[]
  /** Per-user override loaded from UserMarketControlOverride table. */
  userOverride?: UserOverrideV1 | null
  quantity: number
  /** Typical lot size — used for derivative size-tier calculations. */
  lotSize?: number
  /** Approximate order value in rupees, used for size-tier selection. Falls back to qty × 0 if omitted. */
  orderValueRupees?: number
  /** Current time (IST). Defaults to new Date(). */
  now?: Date
  /** Caller signals that realised volatility is currently high (resolver multiplies spread). */
  highVolatility?: boolean
}

export interface EffectiveControls {
  /** Spread % (picked once; call `pickSpreadPct` for a fresh draw). */
  spreadPct: number
  spreadMin: number
  spreadMax: number
  /** Slippage % (picked once). */
  slippagePct: number
  slippageMin: number
  slippageMax: number
  /** Multiplier applied to slippage based on order-value tier. */
  sizeMultiplier: number
  /** -1..+1 extra bias against the customer in %. */
  tiltBiasPct: number
  /** The segment key actually used after normalisation. */
  resolvedSegmentKey: string
  /** True when the resolved rule set denies the requested side. */
  blocked: boolean
  blockedReason: string | null
  killSwitch: KillSwitchV1
  /** Full copies of the relevant rule-sets for downstream consumers (anti-scalp, worker, UI). */
  segmentRule: SegmentRuleV1
  symbolOverride: SymbolOverrideV1 | null
  /** @deprecated kept for legacy consumers. */
  userGroupOverride: UserGroupOverrideV1 | null
  /** The UserSegment override actually applied (highest priority among matching). */
  appliedSegmentOverride: { segmentId: string; override: SegmentOverrideV1 } | null
  userOverrideApplied: UserOverrideV1 | null
  /** Margin multiplier stacked from segment + user override (1.0 when nothing applies). */
  marginMultiplier: number
  orderBehavior: OrderBehaviorV1
  antiScalping: AntiScalpingV1
  priceTilt: PriceTiltV1
  /** When true the caller should always pick the worst end of the spread range. */
  forceWorstFill: boolean
  /**
   * Trading-mfk: resolved client-side jitter rule (per-segment, falls through to product
   * default). Consumed by the WebSocket market-data provider to animate ticks between the
   * 5s server-poll windows. Per-user / per-segment override of jitter intensity is not yet
   * wired (would belong on segmentOverrideV1 / userOverrideV1) — for now the resolver
   * surfaces the segment value as-is so consumers can persist it.
   */
  jitter: JitterRuleV1
}

/** Normalise an arbitrary segment string to the canonical key used in config. */
export function normaliseSegmentKey(segment: string, config: MarketControlConfigV1): string {
  const upper = segment.toUpperCase().trim()
  if (config.segments[upper]) return upper
  for (const key of Object.keys(config.segments)) {
    if (upper.includes(key) || key.includes(upper)) return key
  }
  return "DEFAULT"
}

function hhmmToMinutes(s: string): number {
  const [h, m] = s.split(":").map(Number)
  return h * 60 + m
}

function istMinutesOfDay(now: Date): number {
  // Asia/Kolkata is UTC+5:30 with no DST.
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  return (utcMin + 5 * 60 + 30) % (24 * 60)
}

function matchTimeOfDay(rule: SegmentRuleV1, now: Date) {
  if (!rule.timeOfDay || rule.timeOfDay.length === 0) return null
  const cur = istMinutesOfDay(now)
  for (const w of rule.timeOfDay) {
    const from = hhmmToMinutes(w.from)
    const to = hhmmToMinutes(w.to)
    const inWindow = from <= to ? cur >= from && cur <= to : cur >= from || cur <= to
    if (inWindow) return w
  }
  return null
}

function sizeMultiplierForValue(rule: SegmentRuleV1, orderValue: number): number {
  if (orderValue >= rule.sizeTiers.large) return rule.sizeTiers.multLarge
  if (orderValue >= rule.sizeTiers.medium) return rule.sizeTiers.multMedium
  return rule.sizeTiers.multSmall
}

/**
 * Draw a spread % from an effective [min, max] range honouring distribution + forceWorstFill.
 * Exported separately so OrderExecutionWorker can draw a fresh number without re-running the
 * entire hierarchy.
 */
export function pickSpreadPct(
  min: number,
  max: number,
  distribution: "uniform" | "weighted_worst",
  forceWorstFill: boolean,
  rng: () => number = Math.random,
): number {
  if (!(max > min)) return min
  if (forceWorstFill) return max
  if (distribution === "weighted_worst") {
    const t = Math.pow(rng(), 0.5) // skew toward 1 (worst end)
    return min + t * (max - min)
  }
  return min + rng() * (max - min)
}

/**
 * Main entry point. Produces the EffectiveControls for a single order context.
 * Caller is responsible for persisting the snapshot on the Order row so the worker can replay it.
 */
export function resolveMarketControls(
  config: MarketControlConfigV1,
  ctx: ResolveContext,
): EffectiveControls {
  const now = ctx.now ?? new Date()
  const segmentKey = normaliseSegmentKey(ctx.segment, config)
  const baseSegment =
    config.segments[segmentKey] ??
    config.segments.DEFAULT

  // Merge time-of-day multipliers into the segment spread/slippage.
  const todWindow = matchTimeOfDay(baseSegment, now)
  const volMult = ctx.highVolatility ? baseSegment.volMultiplier : 1.0
  const todSpreadMult = (todWindow?.spreadMult ?? 1.0) * volMult
  const todSlipMult = todWindow?.slipMult ?? 1.0

  let spreadMin = baseSegment.spread.min * todSpreadMult
  let spreadMax = baseSegment.spread.max * todSpreadMult
  let slippageMin = baseSegment.slippage.min * todSlipMult
  let slippageMax = baseSegment.slippage.max * todSlipMult
  let distribution = baseSegment.spread.distribution

  // Symbol override (fully replaces the given field).
  const sOverride =
    config.symbolOverrides[symbolOverrideKey(segmentKey, ctx.symbol)] ?? null
  if (sOverride?.spread) {
    spreadMin = sOverride.spread.min
    spreadMax = sOverride.spread.max
    distribution = sOverride.spread.distribution
  }
  if (sOverride?.slippage) {
    slippageMin = sOverride.slippage.min
    slippageMax = sOverride.slippage.max
  }

  // UserSegment override (highest-priority match wins). Falls back to legacy userGroup key.
  const segOverrides = config.segmentOverrides ?? {}
  let appliedSegmentOverride: { segmentId: string; override: SegmentOverrideV1 } | null = null
  if (ctx.userSegmentIds && ctx.userSegmentIds.length > 0) {
    let bestPriority = -Infinity
    for (const segId of ctx.userSegmentIds) {
      const ov = segOverrides[segId]
      if (!ov) continue
      if (ov.priority > bestPriority) {
        bestPriority = ov.priority
        appliedSegmentOverride = { segmentId: segId, override: ov }
      }
    }
  }

  // Legacy user-group fallback — only applied if there is no matching UserSegment override.
  const ugOverride =
    !appliedSegmentOverride && ctx.userGroup
      ? config.userGroupOverrides[ctx.userGroup] ?? null
      : null

  let tiltBiasPct = baseSegment.tiltBiasPct ?? 0
  let marginMultiplier = 1.0

  if (appliedSegmentOverride) {
    const ov = appliedSegmentOverride.override
    spreadMin *= ov.spreadMult
    spreadMax *= ov.spreadMult
    slippageMin *= ov.slipMult
    slippageMax *= ov.slipMult
    tiltBiasPct += ov.tiltBiasPct
    marginMultiplier *= ov.marginMultiplier
  } else if (ugOverride) {
    spreadMin *= ugOverride.spreadMult
    spreadMax *= ugOverride.spreadMult
    slippageMin *= ugOverride.slipMult
    slippageMax *= ugOverride.slipMult
  }

  // Per-user override beats everything.
  const userOv = ctx.userOverride && ctx.userOverride.enabled ? ctx.userOverride : null
  if (userOv) {
    spreadMin *= userOv.spreadMult
    spreadMax *= userOv.spreadMult
    slippageMin *= userOv.slipMult
    slippageMax *= userOv.slipMult
    tiltBiasPct += userOv.tiltBiasPct
    marginMultiplier *= userOv.marginMultiplier
  }

  // Kill-switch resolution: symbol > segment (symbol wins if explicitly set).
  const killSwitch: KillSwitchV1 =
    sOverride?.killSwitch ?? baseSegment.killSwitch ?? {
      buyDisabled: false,
      sellDisabled: false,
      reason: "",
    }

  const blocked =
    (ctx.orderSide === "BUY" && killSwitch.buyDisabled) ||
    (ctx.orderSide === "SELL" && killSwitch.sellDisabled)
  const blockedReason = blocked
    ? killSwitch.reason || `${ctx.orderSide} disabled for ${segmentKey}/${ctx.symbol}`
    : null

  // Size-tier slippage multiplier.
  const orderValue = ctx.orderValueRupees ?? 0
  const sizeMult = sizeMultiplierForValue(baseSegment, orderValue)

  const forceWorstFill =
    Boolean(userOv?.forceWorstFill) ||
    Boolean(appliedSegmentOverride?.override.forceWorstFill) ||
    Boolean(ugOverride?.forceWorstFill)
  const spreadPct = pickSpreadPct(spreadMin, spreadMax, distribution, forceWorstFill)
  const slippageRandom = slippageMin + Math.random() * Math.max(0, slippageMax - slippageMin)
  const slippagePct = slippageRandom * sizeMult

  return {
    spreadPct,
    spreadMin,
    spreadMax,
    slippagePct,
    slippageMin,
    slippageMax,
    sizeMultiplier: sizeMult,
    tiltBiasPct,
    resolvedSegmentKey: segmentKey,
    blocked,
    blockedReason,
    killSwitch,
    segmentRule: baseSegment,
    symbolOverride: sOverride,
    userGroupOverride: ugOverride,
    appliedSegmentOverride,
    userOverrideApplied: userOv,
    marginMultiplier,
    orderBehavior: config.orderBehavior,
    antiScalping: config.antiScalping,
    priceTilt: config.priceTilt,
    forceWorstFill,
    // Trading-mfk: surface the resolved per-segment jitter rule. Defaults are guaranteed
    // by zod, so this is always populated even on legacy-upgraded blobs.
    jitter: baseSegment.jitter ?? {
      enabled: true,
      intervalMs: 250,
      intensityPct: 0.15,
      convergence: 0.1,
    },
  }
}

/**
 * Compute ask and bid from a given LTP and an effective spread %.
 * Half the spread goes to each side. BUY executes at ASK; SELL at BID.
 */
export function quoteFromLtp(
  ltp: number,
  spreadPct: number,
): { ask: number; bid: number } {
  const half = spreadPct / 2 / 100
  return {
    ask: ltp * (1 + half),
    bid: ltp * (1 - half),
  }
}

/**
 * Apply a stored EffectiveControls snapshot at fill time. Takes a fresh LTP and returns the fill
 * price for the given side without re-running any RNG — the spread has already been drawn at
 * placement time and persisted in the snapshot.
 */
export function fillPriceFromSnapshot(
  ltp: number,
  orderSide: "BUY" | "SELL",
  snapshot: Pick<EffectiveControls, "spreadPct" | "tiltBiasPct">,
): number {
  const { ask, bid } = quoteFromLtp(ltp, snapshot.spreadPct)
  const sidePrice = orderSide === "BUY" ? ask : bid
  const tilt = snapshot.tiltBiasPct ?? 0
  const tiltMul = orderSide === "BUY" ? 1 + tilt / 100 : 1 - tilt / 100
  return sidePrice * tiltMul
}
