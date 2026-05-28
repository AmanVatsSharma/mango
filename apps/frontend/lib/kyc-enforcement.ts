/**
 * File:        lib/kyc-enforcement.ts
 * Module:      KYC · Edge enforcement gate
 * Purpose:     Resolve whether KYC enforcement is enabled, with an Edge-safe sync env path
 *              and an opt-in async DB path for non-hot-path callers.
 *
 * Exports:
 *   - getKycEnforcementFromEnv() → boolean                 — sync, Edge-safe, no I/O
 *   - isKycEnforcementEnabledSync() → boolean              — alias for env-based read in hot paths
 *   - isKycEnforcementEnabled(baseOrigin?) → Promise<boolean> — kept for non-hot-path callers; reads env, no fetch
 *   - invalidateKycEnforcementRuntimeCache() → void        — cache clear (legacy compat)
 *
 * Depends on: none (intentional — Edge runtime cannot import Node libs)
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Edge middleware MUST NOT fetch a Node API route per request — that's a
 *     measurable per-request latency tax + serializes cold starts. The previous
 *     implementation fetched /api/kyc/config; this file removes that path entirely.
 *   - The DB-backed config (admin toggle) is now refreshed only by the admin write path
 *     via revalidateTag('kyc-config'); env is the source of truth at the Edge.
 *
 * Read order:
 *   1. getKycEnforcementFromEnv — env contract
 *   2. isKycEnforcementEnabled — async wrapper kept for source compatibility
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

const CACHE_TTL_MS = 5000

let cachedValue: boolean | null = null
let cacheTimestamp = 0

export function getKycEnforcementFromEnv(): boolean {
  const envValue = process.env.KYC_ENFORCEMENT_ENABLED
  if (!envValue) {
    return true
  }
  return envValue !== "false"
}

/** Sync alias for hot paths (Edge middleware). Same semantics as getKycEnforcementFromEnv. */
export function isKycEnforcementEnabledSync(): boolean {
  return getKycEnforcementFromEnv()
}

/**
 * Async kept for source compatibility with existing callers that `await` it.
 * No fetch — returns the env value immediately. The legacy `baseOrigin` arg is ignored.
 */
export async function isKycEnforcementEnabled(_baseOrigin?: string): Promise<boolean> {
  const now = Date.now()
  if (cachedValue !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedValue
  }
  const value = getKycEnforcementFromEnv()
  cachedValue = value
  cacheTimestamp = now
  return value
}

export function invalidateKycEnforcementRuntimeCache(): void {
  cachedValue = null
  cacheTimestamp = 0
}
