/**
 * @file trading-dashboard-presence.ts
 * @module lib/services/realtime
 * @description Redis-backed (or in-process fallback) presence for users with an active trading SSE connection.
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-04-03
 *
 * Notes:
 * - TTL is refreshed from RealtimeEventEmitter heartbeat; must exceed heartbeat interval.
 * - getTradingDashboardPresenceMap uses dynamic import to avoid circular dependency with RealtimeEventEmitter.
 * - Publishes 0↔1 deltas on admin Redis channel from RealtimeEventEmitter only (not on each heartbeat).
 */

import { isRedisEnabled, redisDel, redisMGet, redisPublish, redisSet } from "@/lib/redis/redis-client"

/** Redis pub/sub channel for admin SSE presence fan-out (cross-instance). */
export const ADMIN_TRADING_PRESENCE_CHANNEL = "admin:presence:delta"

export type AdminTradingPresenceDeltaPayload = {
  userId: string
  online: boolean
  ts: string
}

export function publishTradingDashboardPresenceDelta(userId: string, online: boolean): void {
  if (!isRedisEnabled()) return
  const body: AdminTradingPresenceDeltaPayload = {
    userId,
    online,
    ts: new Date().toISOString(),
  }
  void redisPublish(ADMIN_TRADING_PRESENCE_CHANNEL, JSON.stringify(body))
}

/** Seconds; keep greater than RealtimeEventEmitter heartbeat (30s). */
export const TRADING_DASHBOARD_PRESENCE_TTL_SECONDS = 90

export function tradingDashboardPresenceKey(userId: string): string {
  return `presence:trading-sse:${userId}`
}

export function touchTradingDashboardPresence(userId: string): void {
  if (!isRedisEnabled()) return
  const key = tradingDashboardPresenceKey(userId)
  void redisSet(key, "1", TRADING_DASHBOARD_PRESENCE_TTL_SECONDS)
}

export function clearTradingDashboardPresence(userId: string): void {
  if (!isRedisEnabled()) return
  void redisDel(tradingDashboardPresenceKey(userId))
}

export async function getTradingDashboardPresenceMap(userIds: string[]): Promise<Record<string, boolean>> {
  if (userIds.length === 0) return {}

  if (isRedisEnabled()) {
    const keys = userIds.map(tradingDashboardPresenceKey)
    const vals = await redisMGet(keys)
    return Object.fromEntries(
      userIds.map((id, i) => {
        const v = vals[i]
        return [id, v != null && v !== ""]
      }),
    )
  }

  const { getRealtimeEventEmitter } = await import("@/lib/services/realtime/RealtimeEventEmitter")
  const emitter = getRealtimeEventEmitter()
  return Object.fromEntries(userIds.map((id) => [id, emitter.getUserConnectionCount(id) > 0]))
}
