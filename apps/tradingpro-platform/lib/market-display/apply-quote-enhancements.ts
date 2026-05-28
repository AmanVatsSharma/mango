/**
 * @file apply-quote-enhancements.ts
 * @module market-display
 * @description One tick of jitter + deviation + optional interpolation toward target display prices.
 * @author StockTrade
 * @created 2026-03-24
 * @updated 2026-03-24
 *
 * Notes:
 * - Jitter is gated per `segmentJitterSessionOpen[segment]` (exchange hours), not a single global flag.
 */

import type { EnhancedQuote, MarketDataConfig } from "@/lib/market-data/providers/types"
import type { SubscriptionKey } from "@/lib/market-data/providers/types"
import type { MarketDisplayConfigV1 } from "@/lib/market-display/market-display-config.schema"
import {
  resolveMergedMarketConfig,
  resolveSurfaceForToken,
  type MarketDisplaySegmentKey,
  type MarketDisplaySurfaceKey,
} from "@/lib/market-display/market-display-config.schema"
import {
  applyInterpolationEasing,
  calculateDeviation,
  calculateJitter,
  calculateTrend,
  clampJitterByPctOfLtp,
  linearInterpolate,
  steppedProgress,
} from "@/lib/market-display/market-display-enhancement"
import { normalizeSubscriptionKey, parseTokenFromInstrumentId } from "@/lib/market-data/utils/quote-lookup"

export type InterpolationState = {
  startPrice: number
  targetPrice: number
  startTime: number
  duration: number
  isActive: boolean
}

export function buildTokenStrSetFromSubscriptionKeys(keys: SubscriptionKey[]): Set<string> {
  const out = new Set<string>()
  for (const k of keys) {
    if (typeof k === "number" && Number.isFinite(k) && k > 0) {
      out.add(String(Math.trunc(k)))
      continue
    }
    if (typeof k === "string") {
      const t = parseTokenFromInstrumentId(normalizeSubscriptionKey(k))
      if (t !== null) out.add(String(t))
    }
  }
  return out
}

export type EnhanceQuotesTickInput = {
  nowMs: number
  rawByToken: Record<string, EnhancedQuote>
  displayConfig: MarketDisplayConfigV1
  globalUiConfig: MarketDataConfig
  tokenToSegment: Map<string, MarketDisplaySegmentKey>
  indexTokenStrs: Set<string>
  positionTokenStrs: Set<string>
  watchlistTokenStrs: Set<string>
  /** Per display-segment bucket: true when that segment's regular session allows jitter (e.g. MCX vs NSE hours). */
  segmentJitterSessionOpen: Record<MarketDisplaySegmentKey, boolean>
  jitterOffsets: Record<string, number>
  jitterLastAtByToken: Record<string, number>
  interpolationByToken: Record<string, InterpolationState>
  previousActualByToken: Record<string, number>
  lastDisplayByToken: Record<string, number>
  /**
   * When set, only recompute enhancement for these tokens; others copied from `baselineEnhanced`.
   */
  processOnlyKeys?: Set<string> | null
  /** Required when `processOnlyKeys` is set: last full enhanced map for carry-over. */
  baselineEnhanced?: Record<string, EnhancedQuote> | null
}

export function enhanceQuotesTick(input: EnhanceQuotesTickInput): {
  next: Record<string, EnhancedQuote>
  jitterOffsets: Record<string, number>
  jitterLastAtByToken: Record<string, number>
  interpolationByToken: Record<string, InterpolationState>
  previousActualByToken: Record<string, number>
  lastDisplayByToken: Record<string, number>
} {
  const only = input.processOnlyKeys
  const baseline = input.baselineEnhanced ?? {}

  const next: Record<string, EnhancedQuote> = only ? { ...baseline } : {}
  const nextJitter = { ...input.jitterOffsets }
  const nextJitterLastAt = { ...input.jitterLastAtByToken }
  const nextInterp = { ...input.interpolationByToken }
  const nextPrevActual = { ...input.previousActualByToken }
  const nextLastDisplay = { ...input.lastDisplayByToken }

  const globalBase = input.globalUiConfig
  const { nowMs } = input

  const allKeys = Object.keys(input.rawByToken)
  for (const tokenStr of allKeys) {
    const raw = input.rawByToken[tokenStr]
    if (!raw) continue

    if (only && !only.has(tokenStr)) {
      if (baseline[tokenStr]) {
        next[tokenStr] = baseline[tokenStr]
      } else {
        const actual = raw.actual_price
        next[tokenStr] = {
          ...raw,
          last_trade_price: actual,
          actual_price: actual,
          display_price: actual,
          trend: raw.trend ?? "neutral",
          jitter_offset: 0,
          deviation_offset: 0,
        }
      }
      continue
    }

    const actual = raw.actual_price
    const segment = input.tokenToSegment.get(tokenStr) ?? "default"
    const surface: MarketDisplaySurfaceKey = resolveSurfaceForToken({
      tokenStr,
      indexTokenStrs: input.indexTokenStrs,
      positionTokenStrs: input.positionTokenStrs,
      watchlistTokenStrs: input.watchlistTokenStrs,
    })

    const segmentPatch = input.displayConfig.segments?.[segment]
    const surfaces = input.displayConfig.surfaces ?? {}
    const surfacePatch =
      surface === "positions"
        ? surfaces.positions
        : surface === "indices"
          ? surfaces.indices
          : surfaces.watchlist

    const merged = resolveMergedMarketConfig({
      global: globalBase,
      segmentPatch: segmentPatch ?? undefined,
      surfacePatch: surfacePatch ?? undefined,
    })

    const prevActual = nextPrevActual[tokenStr] ?? actual
    const trend = calculateTrend(actual, prevActual)
    const priceMoved = Math.abs(actual - prevActual) > 0.01
    nextPrevActual[tokenStr] = actual

    const deviationOffset = calculateDeviation(actual, merged.deviation)

    const jitterWindowOpen = input.segmentJitterSessionOpen[segment] ?? false
    let jitterOffset = nextJitter[tokenStr] ?? 0
    if (merged.jitter.enabled && jitterWindowOpen) {
      const lastJitterAt = nextJitterLastAt[tokenStr]
      const due =
        lastJitterAt === undefined ||
        !Number.isFinite(lastJitterAt) ||
        nowMs - lastJitterAt >= merged.jitter.interval
      if (due) {
        jitterOffset = calculateJitter(
          actual,
          merged.jitter.intensity,
          merged.jitter.convergence,
          jitterOffset,
        )
        nextJitterLastAt[tokenStr] = nowMs
      }
      jitterOffset = clampJitterByPctOfLtp(jitterOffset, actual, merged.jitter.maxAbsPctOfLtp)
      nextJitter[tokenStr] = jitterOffset
    } else {
      jitterOffset = 0
      nextJitter[tokenStr] = 0
      delete nextJitterLastAt[tokenStr]
    }

    const targetDisplay = actual + deviationOffset + jitterOffset

    const priorDisplay = nextLastDisplay[tokenStr]
    const previousDisplay =
      typeof priorDisplay === "number" && Number.isFinite(priorDisplay) ? priorDisplay : actual

    let displayPrice = targetDisplay

    if (merged.interpolation.enabled) {
      let state = nextInterp[tokenStr]
      if (priceMoved || !state || !state.isActive) {
        state = {
          startPrice: previousDisplay,
          targetPrice: targetDisplay,
          startTime: nowMs,
          duration: merged.interpolation.duration,
          isActive: true,
        }
        nextInterp[tokenStr] = state
      } else {
        state.targetPrice = targetDisplay
      }

      const elapsed = nowMs - state.startTime
      const rawProgress = state.duration > 0 ? Math.min(1, elapsed / state.duration) : 1
      const stepped = steppedProgress(rawProgress, merged.interpolation.steps)
      const eased = applyInterpolationEasing(stepped, merged.interpolation.easing)
      displayPrice = linearInterpolate(state.startPrice, state.targetPrice, eased)
      if (rawProgress >= 1) {
        state.isActive = false
        displayPrice = state.targetPrice
      }
    }

    nextLastDisplay[tokenStr] = displayPrice

    next[tokenStr] = {
      ...raw,
      last_trade_price: actual,
      actual_price: actual,
      display_price: displayPrice,
      trend,
      jitter_offset: jitterOffset,
      deviation_offset: deviationOffset,
    }
  }

  if (!only) {
    return {
      next,
      jitterOffsets: nextJitter,
      jitterLastAtByToken: nextJitterLastAt,
      interpolationByToken: nextInterp,
      previousActualByToken: nextPrevActual,
      lastDisplayByToken: nextLastDisplay,
    }
  }

  for (const k of Object.keys(input.rawByToken)) {
    if (!next[k] && input.rawByToken[k]) {
      const r = input.rawByToken[k]
      const a = r.actual_price
      next[k] = {
        ...r,
        last_trade_price: a,
        actual_price: a,
        display_price: a,
        trend: r.trend ?? "neutral",
        jitter_offset: 0,
        deviation_offset: 0,
      }
    }
  }

  return {
    next,
    jitterOffsets: nextJitter,
    jitterLastAtByToken: nextJitterLastAt,
    interpolationByToken: nextInterp,
    previousActualByToken: nextPrevActual,
    lastDisplayByToken: nextLastDisplay,
  }
}
