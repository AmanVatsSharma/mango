/**
 * File:        lib/house/scenario-var.ts
 * Module:      House Book · Scenario VaR Ladders
 * Purpose:     Project broker P&L impact across pre-defined market shocks (e.g., NIFTY ±2%).
 *              First-pass implementation — naive linear delta on net broker exposure.
 *              Greeks-aware F&O scenario math lands in Phase 13 (House Risk Controls).
 *
 * Exports:
 *   - buildScenarioLadders(snapshot): ScenarioLadder[]
 *
 * Depends on:
 *   - ./types — HouseExposureSnapshot, ScenarioLadder, ScenarioRung
 *
 * Side-effects: none — pure function over an exposure snapshot.
 *
 * Key invariants:
 *   - shockPct is applied as a fractional delta on the net signed notional
 *     (broker POV). Result: brokerPnlImpact = netNotional × shockPct / 100.
 *   - Negative brokerPnlImpact = broker loses money in that scenario.
 *   - Symbol filtering for "NIFTY" basket uses substring match — coarse but
 *     conservative (catches NIFTY, NIFTY50, NIFTY-FUT, NIFTYBEES, etc.).
 *   - "ALL" scenario is the whole-book linear shock — useful as the worst-case
 *     ceiling reference; real-world cross-symbol correlation is < 1, so this
 *     overstates loss (intentional — conservative for risk dashboards).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import type { HouseExposureSnapshot, ScenarioLadder, ScenarioRung } from "./types"

const SHOCK_LADDER: number[] = [-5, -2, -1, -0.5, 0, 0.5, 1, 2, 5]

interface ScenarioBasket {
  scenario: string
  match: (symbol: string) => boolean
}

const BASKETS: ScenarioBasket[] = [
  { scenario: "ALL", match: () => true },
  { scenario: "NIFTY", match: (s) => /NIFTY/i.test(s) && !/BANKNIFTY/i.test(s) },
  { scenario: "BANKNIFTY", match: (s) => /BANKNIFTY/i.test(s) },
  { scenario: "RELIANCE", match: (s) => /^RELIANCE/i.test(s) },
]

/**
 * Build one ladder per known scenario basket. Empty baskets are skipped.
 */
export function buildScenarioLadders(snapshot: HouseExposureSnapshot): ScenarioLadder[] {
  const ladders: ScenarioLadder[] = []

  for (const basket of BASKETS) {
    const matched = snapshot.topSymbols.filter((s) => basket.match(s.symbol))
    const basketNet = matched.reduce((sum, s) => sum + s.netNotional, 0)

    // Skip empty baskets except ALL — ALL is meaningful even on zero book (renders flat line).
    if (basket.scenario !== "ALL" && matched.length === 0) continue

    const referenceNotional =
      basket.scenario === "ALL" ? snapshot.netNotional : basketNet

    const rungs: ScenarioRung[] = SHOCK_LADDER.map((shockPct) => ({
      shockPct,
      brokerPnlImpact: referenceNotional * (shockPct / 100),
    }))

    ladders.push({
      scenario: basket.scenario,
      symbols: matched.map((s) => s.symbol),
      rungs,
    })
  }

  return ladders
}
