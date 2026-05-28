/**
 * @file strike-step.ts
 * @module lib/market-catalog
 * @description Per-underlying strike step registry. NSE listed weekly/monthly options trade at
 *              fixed strike intervals: NIFTY = 50, BANKNIFTY = 100, FINNIFTY = 50, etc. The
 *              ATM-window resolver uses this to compute strike_min / strike_max around the
 *              spot price. Recipes may override via strikeStrategy.step.
 *
 *              When in doubt the lookup falls back to a sensible default (50) — the resolver
 *              will then ask Vedpragya for a slightly wider range than necessary, which is
 *              harmless (it filters server-side anyway).
 *
 * Exports:
 *   - resolveStrikeStep(symbol, override?) → number   — final step for resolver math
 *   - DEFAULT_STRIKE_STEP                              — 50, used when nothing matches
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - Lookup is case-insensitive on the underlying symbol root (NIFTY, NIFTY50, NIFTY 50 all match).
 *   - The override (if provided) wins unconditionally — recipe authors know best.
 *
 * Read order:
 *   1. STRIKE_STEPS — the registry data.
 *   2. resolveStrikeStep — single entry point.
 *
 * Author:        BharatERP
 * Last-updated:  2026-05-01
 */

export const DEFAULT_STRIKE_STEP = 50

/**
 * Underlying root → strike step. Matched by exact root after stripping spaces and digits-suffix.
 * Add new underlyings here as the platform expands listings.
 */
const STRIKE_STEPS: Record<string, number> = {
  NIFTY: 50,
  BANKNIFTY: 100,
  FINNIFTY: 50,
  MIDCPNIFTY: 25,
  SENSEX: 100,
  BANKEX: 100,
  // Stock options most commonly use 5/10/20 — admins should set explicit override on the recipe.
}

function normalizeUnderlying(symbol: string): string {
  return symbol.toUpperCase().replace(/\s+/g, "").replace(/(50|100)$/, "")
}

/**
 * Resolve the strike step for an underlying. Override always wins.
 * Returns DEFAULT_STRIKE_STEP if the underlying isn't in the registry — safe-but-loose.
 */
export function resolveStrikeStep(underlyingSymbol: string, override?: number): number {
  if (typeof override === "number" && override > 0) return override
  const root = normalizeUnderlying(underlyingSymbol)
  return STRIKE_STEPS[root] ?? DEFAULT_STRIKE_STEP
}
