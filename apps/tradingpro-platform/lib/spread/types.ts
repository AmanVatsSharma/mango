/**
 * File:        lib/spread/types.ts
 * Module:      Spread · Domain Types
 * Purpose:     Shared types for the per-instrument / per-segment / per-tier spread
 *              markup engine. Quotes flow raw from upstream (Vedpragya market-data);
 *              the broker applies these markups before delivering to clients.
 *
 * Exports:
 *   - SpreadConfigRow              — DB row shape exposed to API + UI
 *   - SpreadConfigInput            — admin write input
 *   - SpreadResolutionScope        — query-time scope (symbol, segment, tier)
 *   - ResolvedSpread               — engine output (bps + per-side amounts)
 *   - SimulationInput / SimulationResult — slippage simulator I/O
 *
 * Side-effects: none — pure types
 *
 * Key invariants:
 *   - Markups are stored in BPS (basis points) — 100 bps = 1%, decimal precision 4.
 *   - Resolution precedence (most specific wins):
 *       1. instrument + segment + clientTier
 *       2. instrument + segment
 *       3. instrument
 *       4. segment + clientTier
 *       5. segment
 *       6. clientTier
 *       7. global default (all NULL fields)
 *   - Per-client winner spreadMultiplier (rung 2) is applied AFTER baseline resolution.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

export interface SpreadConfigRow {
  id: string
  instrument: string | null
  segment: string | null
  clientTier: string | null
  bidMarkupBps: number
  askMarkupBps: number
  isActive: boolean
  reason: string | null
  createdAt: string
  updatedAt: string
}

export interface SpreadConfigInput {
  instrument?: string | null
  segment?: string | null
  clientTier?: string | null
  bidMarkupBps: number
  askMarkupBps: number
  isActive?: boolean
  reason?: string | null
}

export interface SpreadResolutionScope {
  symbol: string
  segment: string | null
  clientTier: string | null
  /** Optional — if the client is on rung SPREAD_WIDEN, supply the multiplier here. */
  perClientMultiplier?: number | null
}

export interface ResolvedSpread {
  /** The matched config row id, or null if no config matched (zero markup). */
  configId: string | null
  bidMarkupBps: number
  askMarkupBps: number
  /** True = the per-client winner multiplier was applied on top of the baseline. */
  perClientApplied: boolean
  /** Effective multiplier used (1.0 if none). */
  effectiveMultiplier: number
}

export interface SimulationInput {
  symbol: string
  segment: string | null
  clientTier: string | null
  /** Mid-price in rupees. */
  mid: number
  /** Daily traded volume in lots — for revenue projection. */
  averageDailyVolume?: number
  /** Override bid/ask markup (bps) — what-if knob. */
  overrideBidBps?: number
  overrideAskBps?: number
  /** Optional per-client multiplier to apply (e.g., from winner control). */
  perClientMultiplier?: number | null
}

export interface SimulationResult {
  baseline: ResolvedSpread
  override: ResolvedSpread
  baselineBidPrice: number
  baselineAskPrice: number
  overrideBidPrice: number
  overrideAskPrice: number
  /** Δ revenue per round-trip in rupees (assumes one buy + one sell per turnover unit). */
  deltaRevenuePerLot: number
  /** Projected daily revenue impact = ΔrevPerLot × averageDailyVolume. */
  projectedDailyImpact: number | null
}
