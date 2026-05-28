/**
 * File:        lib/services/risk/risk-config-pubsub.ts
 * Module:      Risk · cross-container RiskConfig change propagation (Trading-ee3 / Trading-z9b)
 * Purpose:     Lightweight Redis pub/sub channels so any container that mutates RiskConfig (or
 *              the global risk thresholds) can notify peers to invalidate their in-process
 *              caches immediately. Without this, admin edits would only propagate after the
 *              local TTL expired (30s for RiskConfig, 60s for thresholds) — way too slow during
 *              a market crash when the admin is lowering the auto-close threshold.
 *
 * Exports:
 *   - RISK_CONFIG_CHANNEL                     — channel name constant
 *   - RISK_THRESHOLDS_CHANNEL                 — channel name constant
 *   - RiskConfigChangedPayload                — wire format for risk-config bust
 *   - RiskThresholdsChangedPayload            — wire format for thresholds bust
 *   - publishRiskConfigChanged(payload)       — admin-write side
 *   - subscribeRiskConfigChanged(handler)     — cache-bust side
 *   - publishRiskThresholdsChanged(payload)   — admin-write side
 *   - subscribeRiskThresholdsChanged(handler) — cache-bust side
 *
 * Depends on:
 *   - @/lib/redis/redis-client — pub/sub primitives. No-ops cleanly when Redis is disabled
 *     (dev / unit-test environments) so callers don't need to guard.
 *
 * Side-effects:
 *   - publish() emits one message per call (cross-container). subscribe() opens a Redis
 *     subscriber connection (managed by the redis-client helper) and returns an unsubscribe.
 *
 * Key invariants:
 *   - When Redis is unavailable, BOTH publish and subscribe are no-ops. Callers in single-
 *     container environments still get correct behaviour because the cache layer also calls
 *     the local bust function directly on every admin write — Redis is only for fan-out to
 *     other containers, not for local correctness.
 *   - Payloads are intentionally small (just timestamp + optional scope) to keep the channel
 *     a hot path. Receivers re-fetch from DB; we never ship the actual config over Redis.
 *
 * Read order:
 *   1. RiskConfigChangedPayload — wire shape
 *   2. publishRiskConfigChanged — admin-write side (call after a successful POST/PUT)
 *   3. subscribeRiskConfigChanged — cache layer hooks into this on module init
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { isRedisEnabled, redisPublish, redisSubscribe } from "@/lib/redis/redis-client"

export const RISK_CONFIG_CHANNEL = "risk-config:changed" as const
export const RISK_THRESHOLDS_CHANNEL = "risk-thresholds:changed" as const

export type RiskConfigChangedPayload = {
  /** Optional id of the modified row, for future targeted invalidation. */
  configId?: string | null
  /** Optional summary for ops dashboards / debug logs. */
  summary?: string
  ts: string
}

export type RiskThresholdsChangedPayload = {
  warningThreshold: number
  autoCloseThreshold: number
  ts: string
}

export async function publishRiskConfigChanged(
  payload: Omit<RiskConfigChangedPayload, "ts">,
): Promise<void> {
  if (!isRedisEnabled()) return
  const full: RiskConfigChangedPayload = { ...payload, ts: new Date().toISOString() }
  await redisPublish(RISK_CONFIG_CHANNEL, JSON.stringify(full))
}

export async function subscribeRiskConfigChanged(
  handler: (payload: RiskConfigChangedPayload) => void,
): Promise<() => void> {
  if (!isRedisEnabled()) return () => {}
  return redisSubscribe(RISK_CONFIG_CHANNEL, (message) => {
    try {
      const parsed = JSON.parse(message) as RiskConfigChangedPayload
      handler(parsed)
    } catch {
      // Bad payload — ignore. The next valid message will trigger a bust anyway, and
      // admin writes also bust their local cache directly so we won't miss the event.
    }
  })
}

export async function publishRiskThresholdsChanged(
  payload: Omit<RiskThresholdsChangedPayload, "ts">,
): Promise<void> {
  if (!isRedisEnabled()) return
  const full: RiskThresholdsChangedPayload = { ...payload, ts: new Date().toISOString() }
  await redisPublish(RISK_THRESHOLDS_CHANNEL, JSON.stringify(full))
}

export async function subscribeRiskThresholdsChanged(
  handler: (payload: RiskThresholdsChangedPayload) => void,
): Promise<() => void> {
  if (!isRedisEnabled()) return () => {}
  return redisSubscribe(RISK_THRESHOLDS_CHANNEL, (message) => {
    try {
      const parsed = JSON.parse(message) as RiskThresholdsChangedPayload
      handler(parsed)
    } catch {
      // ignore malformed payloads
    }
  })
}
