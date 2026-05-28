/**
 * File:        lib/services/risk/risk-thresholds.ts
 * Module:      Risk · loss-utilization thresholds (warning + auto-close ratios)
 * Purpose:     Read/write the global risk thresholds with env fallback and an in-process
 *              cache. Used by the cron risk-monitoring route, the PositionPnLWorker hot loop,
 *              the admin /api/admin/risk/monitor + /api/admin/risk/thresholds routes, and the
 *              admin exposure-preview UI.
 *
 *              Trading-z9b (2026-05-08): the previous behaviour cached thresholds for 60s with
 *              no invalidation. When the admin lowered the auto-close threshold mid-crash,
 *              PositionPnLWorker (which calls `getRiskThresholds()` with default args) would
 *              keep using the stale value for up to 60s — exactly the worst time for a stale
 *              read. Fix: publish a Redis bust event from `upsertRiskThresholds` and subscribe
 *              from any container running the worker, so admin edits propagate within ms.
 *
 * Exports:
 *   - DEFAULT_RISK_UTILIZATION_THRESHOLDS — 75 / 80 product defaults
 *   - RISK_WARNING_THRESHOLD_KEY / RISK_AUTO_CLOSE_THRESHOLD_KEY — SystemSettings keys
 *   - RiskThresholds                       — { warningThreshold, autoCloseThreshold, source }
 *   - getRiskThresholds(input?)            — read with cache (default 60s TTL)
 *   - upsertRiskThresholds(input)          — write + bust local + publish to peers
 *   - bustRiskThresholdsCache()            — exposed for tests + admin tools
 *   - ensureRiskThresholdsPubSubSubscribed() — idempotent subscriber init
 *
 * Depends on:
 *   - @/lib/server/workers/system-settings — DB-backed key/value store (canonical source)
 *   - @/lib/services/risk/risk-config-pubsub — cross-container fanout
 *   - @/lib/observability/logger — Pino child logger
 *
 * Side-effects:
 *   - Mutates a globalThis cache slot.
 *   - On first call after cold-start, subscribes to a Redis channel for cross-container busts
 *     (no-op when Redis is disabled; safe in dev/test).
 *
 * Key invariants:
 *   - Values stored as ratios in [0, 1]; input accepted as either ratio or 0..100 percent.
 *   - autoClose >= warning is enforced via `reconcileThresholds`.
 *   - Cache is global to amortize across HMR + worker hot loops; tests can call
 *     `bustRiskThresholdsCache` to start fresh.
 *   - Admin write path: upsert → bust local cache → publish to peers. If publish fails,
 *     local cache is still busted, peers TTL out within 60s — no correctness issue, only
 *     a brief propagation delay.
 *
 * Read order:
 *   1. RiskThresholds — return shape
 *   2. getRiskThresholds — read path with cache + invalidation
 *   3. upsertRiskThresholds — write path + pub/sub fanout
 *
 * Author:      StockTrade / Cursor
 * Last-updated: 2026-05-08
 */

import { baseLogger } from "@/lib/observability/logger"
import { getLatestActiveGlobalSettings, upsertGlobalSetting } from "@/lib/server/workers/system-settings"
import {
  publishRiskThresholdsChanged,
  subscribeRiskThresholdsChanged,
} from "@/lib/services/risk/risk-config-pubsub"

export const RISK_WARNING_THRESHOLD_KEY = "risk_warning_threshold" as const
export const RISK_AUTO_CLOSE_THRESHOLD_KEY = "risk_auto_close_threshold" as const

export type RiskThresholds = {
  warningThreshold: number
  autoCloseThreshold: number
  source: "system_settings" | "env" | "default"
}

type CacheState = {
  fetchedAtMs: number
  value: RiskThresholds
}

type ModuleState = {
  cache: CacheState | null
  pubsubSubscribed: boolean
}

const log = baseLogger.child({ module: "risk-thresholds" })

/**
 * Product defaults when SystemSettings and env overrides are absent.
 * Loss utilization: warning at 75%, auto-close at 80% of total funds.
 */
export const DEFAULT_RISK_UTILIZATION_THRESHOLDS = {
  warningThreshold: 0.75,
  autoCloseThreshold: 0.8,
} as const

const DEFAULT_THRESHOLDS: Omit<RiskThresholds, "source"> = { ...DEFAULT_RISK_UTILIZATION_THRESHOLDS }

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

function normalizeRatio01(value: unknown): number | null {
  const n = toFiniteNumber(value)
  if (n == null) return null

  // Accept 0..100 as percent
  const ratio = n > 1 && n <= 100 ? n / 100 : n
  if (!Number.isFinite(ratio)) return null

  // Clamp into 0..1
  return Math.max(0, Math.min(1, ratio))
}

function envRatio01(key: string): number | null {
  const raw = process.env[key]
  if (raw == null) return null
  return normalizeRatio01(raw)
}

function reconcileThresholds(input: {
  warningThreshold: number
  autoCloseThreshold: number
}): { warningThreshold: number; autoCloseThreshold: number } {
  const warning = Math.max(0, Math.min(1, input.warningThreshold))
  const autoClose = Math.max(warning, Math.min(1, input.autoCloseThreshold))
  return { warningThreshold: warning, autoCloseThreshold: autoClose }
}

function getModuleState(): ModuleState {
  const g = globalThis as unknown as { __riskThresholdsState?: ModuleState }
  if (!g.__riskThresholdsState) {
    g.__riskThresholdsState = { cache: null, pubsubSubscribed: false }
  }
  return g.__riskThresholdsState
}

function getGlobalCache(): CacheState | null {
  return getModuleState().cache
}

function setGlobalCache(value: CacheState): void {
  getModuleState().cache = value
}

/**
 * Trading-z9b: clear the local threshold cache. Public so tests + future admin tooling can
 * call it without going through the upsert path.
 */
export function bustRiskThresholdsCache(): void {
  getModuleState().cache = null
}

/**
 * Trading-z9b: idempotent subscriber init for cross-container threshold busts. Lazily
 * registered on the first `getRiskThresholds()` call after cold-start so worker processes
 * (which may not import this module on hot paths) still get cache invalidation.
 */
export async function ensureRiskThresholdsPubSubSubscribed(): Promise<void> {
  const state = getModuleState()
  if (state.pubsubSubscribed) return
  state.pubsubSubscribed = true
  try {
    await subscribeRiskThresholdsChanged((payload) => {
      log.info({ payload }, "risk-thresholds bust received from peer; clearing local cache")
      bustRiskThresholdsCache()
    })
  } catch (err) {
    state.pubsubSubscribed = false
    log.warn({ err: String(err) }, "failed to subscribe to risk-thresholds pub/sub; will retry on next read")
  }
}

export async function getRiskThresholds(input?: { maxAgeMs?: number }): Promise<RiskThresholds> {
  const maxAgeMs = Math.max(0, input?.maxAgeMs ?? 60_000)
  const cached = getGlobalCache()
  if (cached && Date.now() - cached.fetchedAtMs <= maxAgeMs) return cached.value

  // Lazily subscribe on first uncached read so even containers that only call getRiskThresholds
  // (e.g. PositionPnLWorker) get cross-container invalidation.
  if (!getModuleState().pubsubSubscribed) {
    void ensureRiskThresholdsPubSubSubscribed()
  }

  // SystemSettings is canonical
  try {
    const rows = await getLatestActiveGlobalSettings([RISK_WARNING_THRESHOLD_KEY, RISK_AUTO_CLOSE_THRESHOLD_KEY])
    const warningRaw = rows.get(RISK_WARNING_THRESHOLD_KEY)?.value ?? null
    const autoCloseRaw = rows.get(RISK_AUTO_CLOSE_THRESHOLD_KEY)?.value ?? null

    const warningParsed = normalizeRatio01(warningRaw)
    const autoCloseParsed = normalizeRatio01(autoCloseRaw)

    if (warningParsed != null && autoCloseParsed != null) {
      const reconciled = reconcileThresholds({ warningThreshold: warningParsed, autoCloseThreshold: autoCloseParsed })
      const value: RiskThresholds = { ...reconciled, source: "system_settings" }
      setGlobalCache({ fetchedAtMs: Date.now(), value })
      return value
    }
  } catch (e) {
    log.warn({ message: (e as any)?.message || String(e) }, "failed to read SystemSettings; falling back to env/default")
  }

  // Env fallback
  const envWarning = envRatio01("RISK_WARNING_THRESHOLD")
  const envAutoClose = envRatio01("RISK_AUTO_CLOSE_THRESHOLD")
  if (envWarning != null || envAutoClose != null) {
    const reconciled = reconcileThresholds({
      warningThreshold: envWarning ?? DEFAULT_THRESHOLDS.warningThreshold,
      autoCloseThreshold: envAutoClose ?? DEFAULT_THRESHOLDS.autoCloseThreshold,
    })
    const value: RiskThresholds = { ...reconciled, source: "env" }
    setGlobalCache({ fetchedAtMs: Date.now(), value })
    return value
  }

  const value: RiskThresholds = { ...DEFAULT_THRESHOLDS, source: "default" }
  setGlobalCache({ fetchedAtMs: Date.now(), value })
  return value
}

export async function upsertRiskThresholds(input: {
  warningThreshold: number
  autoCloseThreshold: number
}): Promise<RiskThresholds> {
  const warning = normalizeRatio01(input.warningThreshold)
  const autoClose = normalizeRatio01(input.autoCloseThreshold)
  if (warning == null || autoClose == null) {
    throw new Error("Invalid thresholds (must be numeric ratio 0..1 or percent 0..100)")
  }

  const reconciled = reconcileThresholds({ warningThreshold: warning, autoCloseThreshold: autoClose })

  await upsertGlobalSetting({
    key: RISK_WARNING_THRESHOLD_KEY,
    value: String(reconciled.warningThreshold),
    category: "RISK",
    description: "Risk warning threshold (loss utilization ratio 0..1).",
  })

  await upsertGlobalSetting({
    key: RISK_AUTO_CLOSE_THRESHOLD_KEY,
    value: String(reconciled.autoCloseThreshold),
    category: "RISK",
    description: "Risk auto-close threshold (loss utilization ratio 0..1).",
  })

  const value: RiskThresholds = { ...reconciled, source: "system_settings" }
  setGlobalCache({ fetchedAtMs: Date.now(), value })

  // Trading-z9b: fan out to peers so PositionPnLWorker in other containers picks the new
  // value on its next loop iteration (≤2s) instead of waiting up to 60s for TTL.
  try {
    await publishRiskThresholdsChanged({
      warningThreshold: reconciled.warningThreshold,
      autoCloseThreshold: reconciled.autoCloseThreshold,
    })
  } catch (e) {
    log.warn(
      { message: (e as any)?.message || String(e) },
      "risk-thresholds pub/sub publish failed; peers will TTL-expire within 60s",
    )
  }

  return value
}
