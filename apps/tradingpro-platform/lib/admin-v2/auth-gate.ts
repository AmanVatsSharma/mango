/**
 * File:        lib/admin-v2/auth-gate.ts
 * Module:      admin-v2
 * Purpose:     Access control for the parallel /admin-v2/ shell. Phase 17 upgrades the
 *              simple allowlist to a two-tier gate: explicit allowlist (dogfooding) OR
 *              percentage-based traffic ramp (ADMIN_V2_TRAFFIC_PCT). Both can be active
 *              simultaneously — allowlist always wins.
 *
 * Exports:
 *   - isAdminV2Allowed(userId)  — boolean; used by v2 layout server component
 *   - getRolloutStatus()        — serializable config snapshot for the rollout API
 *   - ADMIN_V2_DENIED_REDIRECT  — URL to send disallowed users back to
 *
 * Side-effects: none (pure env-var reads + deterministic math).
 *
 * Key invariants:
 *   - Allowlist check always runs first; userId in allowlist → always allow regardless of PCT
 *   - Hash bucketing is pure: f(userId) → [0, 99]. Same userId always → same bucket.
 *     This guarantees sticky sessions across restarts and deploys.
 *   - ADMIN_V2_TRAFFIC_PCT=0  → only allowlist users get v2 (same as before Phase 17)
 *   - ADMIN_V2_TRAFFIC_PCT=100 → everyone gets v2 (use for full cutover / Phase 18 prep)
 *   - Module-level cache invalidates on env-var change (safe for hot reloads in dev)
 *
 * Read order:
 *   1. hashBucket(userId) — the deterministic hash
 *   2. parseAllowlist()   — env-var parsing + caching
 *   3. isAdminV2Allowed   — the public boolean gate
 *   4. getRolloutStatus   — config snapshot for the admin API
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import "server-only"

const ALLOWLIST_KEY = "ADMIN_V2_ALLOWLIST"
const TRAFFIC_PCT_KEY = "ADMIN_V2_TRAFFIC_PCT"

// ── Cache ──────────────────────────────────────────────────────────────────

let cachedAllowlist: Set<string> | null = null
let cachedAllowlistRaw: string | undefined = undefined

let cachedTrafficPct: number | null = null
let cachedTrafficPctRaw: string | undefined = undefined

// ── Hash bucketing ─────────────────────────────────────────────────────────

/**
 * Maps userId → integer bucket in [0, 99] using a djb2-style hash.
 * Pure function: same input always produces the same output.
 * Collision rate is ~1/100 per bucket, evenly distributed.
 */
function hashBucket(userId: string): number {
  let h = 5381
  for (let i = 0; i < userId.length; i++) {
    // djb2: h = h * 33 XOR charCode
    h = ((h << 5) + h) ^ userId.charCodeAt(i)
    h = h >>> 0 // keep unsigned 32-bit
  }
  return h % 100
}

// ── Env-var parsers ────────────────────────────────────────────────────────

function parseAllowlist(): Set<string> {
  const raw = process.env[ALLOWLIST_KEY]
  if (raw === cachedAllowlistRaw && cachedAllowlist !== null) return cachedAllowlist
  cachedAllowlistRaw = raw
  cachedAllowlist = new Set(
    (raw ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  )
  return cachedAllowlist
}

function parseTrafficPct(): number {
  const raw = process.env[TRAFFIC_PCT_KEY]
  if (raw === cachedTrafficPctRaw && cachedTrafficPct !== null) return cachedTrafficPct
  cachedTrafficPctRaw = raw
  const parsed = raw ? parseInt(raw, 10) : 0
  cachedTrafficPct = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0
  return cachedTrafficPct
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns true if the userId is allowed into /admin-v2/.
 *
 * Gate order (first match wins):
 *   1. Explicit allowlist (ADMIN_V2_ALLOWLIST) → always allow
 *   2. Percentage ramp (ADMIN_V2_TRAFFIC_PCT) → hash bucket < pct → allow
 *   3. Deny
 */
export function isAdminV2Allowed(userId: string | null | undefined): boolean {
  if (!userId) return false

  const allowlist = parseAllowlist()
  if (allowlist.has(userId)) return true

  const pct = parseTrafficPct()
  if (pct <= 0) return false
  if (pct >= 100) return true

  return hashBucket(userId) < pct
}

export type RolloutEffectiveMode = "none" | "allowlist_only" | "percentage" | "all"

export interface RolloutStatus {
  allowlistCount: number
  trafficPct: number
  effectiveMode: RolloutEffectiveMode
}

/**
 * Returns a serializable snapshot of the current rollout config for the admin API.
 * Safe to call on every request (internal caches make it O(1)).
 */
export function getRolloutStatus(): RolloutStatus {
  const allowlist = parseAllowlist()
  const pct = parseTrafficPct()

  let effectiveMode: RolloutEffectiveMode
  if (pct >= 100) effectiveMode = "all"
  else if (pct > 0) effectiveMode = "percentage"
  else if (allowlist.size > 0) effectiveMode = "allowlist_only"
  else effectiveMode = "none"

  return { allowlistCount: allowlist.size, trafficPct: pct, effectiveMode }
}

/** Where to send users denied access to /admin-v2/. They keep using v1. */
export const ADMIN_V2_DENIED_REDIRECT = "/admin-console"
