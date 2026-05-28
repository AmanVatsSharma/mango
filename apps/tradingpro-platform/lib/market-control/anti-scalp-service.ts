/**
 * @file anti-scalp-service.ts
 * @module lib/market-control
 * @description Applies anti-scalping rules at position-close time:
 *                - Minimum holding seconds
 *                - Minimum favourable move %
 *                - Asymmetric (widened) exit spread
 *                - Max profit per trade / per day caps
 *
 *              Returns a verdict + an adjusted close price that the worker must use. Does not
 *              itself write to DB. Pairs with `scalper-flagger` (counter + auto-flag).
 * @author StockTrade
 * @created 2026-04-15
 */

import type { AntiScalpingV1 } from "./market-control-config.schema"

export type AntiScalpVerdict =
  | { allowed: true; adjustedClosePrice: number; penalties: string[]; reason: null }
  | { allowed: false; adjustedClosePrice: number; penalties: string[]; reason: string }

export interface AntiScalpCheckInput {
  /** Full anti-scalping rule-set (from market control config or executionContext snapshot). */
  rules: AntiScalpingV1
  /** Order side being closed — "BUY" when buying back a SHORT, "SELL" when selling a LONG. */
  closeSide: "BUY" | "SELL"
  /** Entry price of the position being closed. */
  entryPrice: number
  /** Raw last trade price at close attempt. */
  lastPrice: number
  /** Spread % locked at placement on the CLOSE order. */
  spreadPct: number
  /** Tilt bias from executionContext (if any). */
  tiltBiasPct?: number
  /** Seconds between the position open and this close attempt. */
  holdingSeconds: number
  /** Realised P&L (₹) already booked today for this user — used for max-per-day cap. */
  userRealisedPnlToday?: number
  /** Total exposure that will be realised by this close (₹) — for per-day % calc. */
  positionValueRupees?: number
  /** When true, skip all anti-scalp checks (VIP relaxed flag). */
  relaxed?: boolean
}

function quoteSide(ltp: number, spreadPct: number, side: "BUY" | "SELL"): number {
  const half = spreadPct / 2 / 100
  return side === "BUY" ? ltp * (1 + half) : ltp * (1 - half)
}

/**
 * Returns the favourable move % experienced by the position:
 *   LONG (closed via SELL): (last - entry) / entry × 100
 *   SHORT (closed via BUY): (entry - last) / entry × 100
 * Positive value means the user is in profit.
 */
export function favorableMovePct(
  entryPrice: number,
  lastPrice: number,
  closeSide: "BUY" | "SELL",
): number {
  if (entryPrice <= 0) return 0
  const delta =
    closeSide === "SELL" ? lastPrice - entryPrice : entryPrice - lastPrice
  return (delta / entryPrice) * 100
}

/**
 * Apply the full anti-scalping rule-set to a close attempt. Pure function.
 */
export function applyAntiScalp(input: AntiScalpCheckInput): AntiScalpVerdict {
  const { rules, closeSide, entryPrice, lastPrice, spreadPct, holdingSeconds, relaxed } = input
  const penalties: string[] = []

  // Baseline close price = spread-adjusted side quote (BUY at ask, SELL at bid).
  let adjustedClosePrice = quoteSide(lastPrice, spreadPct, closeSide)

  // Short-circuit if anti-scalp is disabled or the user is flagged as VIP-relaxed.
  if (!rules.enabled || relaxed) {
    return { allowed: true, adjustedClosePrice, penalties, reason: null }
  }

  const favorable = favorableMovePct(entryPrice, lastPrice, closeSide)

  // Rule 1: minimum holding seconds — only triggers on PROFITABLE early exits.
  const violatesMinHold =
    holdingSeconds < rules.minHoldingSeconds && favorable > 0

  // Rule 2: minimum favourable move % — position must move at least X% before a profit can be booked.
  const violatesMinMove =
    favorable > 0 && favorable < rules.minFavorableMovePct

  const violatesEither = violatesMinHold || violatesMinMove

  if (violatesEither && rules.rejectOnViolation) {
    penalties.push(violatesMinHold ? "min_holding_seconds" : "min_favorable_move_pct")
    return {
      allowed: false,
      adjustedClosePrice,
      penalties,
      reason: violatesMinHold
        ? `Held for ${holdingSeconds}s, required ≥ ${rules.minHoldingSeconds}s before profitable exit`
        : `Favorable move ${favorable.toFixed(3)}% below required ${rules.minFavorableMovePct}% before profitable exit`,
    }
  }

  // Rule 3: asymmetric exit spread — widen the close spread by the multiplier if either rule fired.
  if (violatesEither && rules.asymmetricExitSpreadMult > 1) {
    const widenedSpread = spreadPct * rules.asymmetricExitSpreadMult
    adjustedClosePrice = quoteSide(lastPrice, widenedSpread, closeSide)
    penalties.push(`asymmetric_exit_spread×${rules.asymmetricExitSpreadMult}`)
  }

  // Rule 4: cap profit per trade.
  if (
    rules.maxProfitPerTradePct > 0 &&
    favorable > rules.maxProfitPerTradePct
  ) {
    // Force close at exactly (entry + cap × entry) for LONG, (entry - cap × entry) for SHORT.
    const cap = rules.maxProfitPerTradePct / 100
    adjustedClosePrice =
      closeSide === "SELL"
        ? entryPrice * (1 + cap)
        : entryPrice * (1 - cap)
    penalties.push(`max_profit_per_trade_cap=${rules.maxProfitPerTradePct}%`)
  }

  // Rule 5: cap realised profit per day.
  if (
    rules.maxProfitPerDayPct > 0 &&
    typeof input.userRealisedPnlToday === "number" &&
    typeof input.positionValueRupees === "number" &&
    input.positionValueRupees > 0
  ) {
    const dayCapRupees = (rules.maxProfitPerDayPct / 100) * input.positionValueRupees
    if (input.userRealisedPnlToday >= dayCapRupees) {
      penalties.push(`max_profit_per_day_reached=${rules.maxProfitPerDayPct}%`)
      // Don't block — just zero out further profit on this trade.
      if (favorable > 0) {
        adjustedClosePrice = entryPrice
      }
    }
  }

  return { allowed: true, adjustedClosePrice, penalties, reason: null }
}
