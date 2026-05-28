/**
 * @file market-control-pubsub.ts
 * @module lib/market-control
 * @description Cross-container change propagation for MARKET_CONTROL_CONFIG_V1 edits. Any container
 *              that PUTs the config publishes a small JSON event on `market-control:config-changed`
 *              so other workers/API containers can invalidate their in-memory caches immediately
 *              (instead of waiting up to 5s). Also used by the socket.io gateway to broadcast
 *              kill-switch changes to connected clients.
 * @author StockTrade
 * @created 2026-04-16
 */

import { isRedisEnabled, redisPublish, redisSubscribe } from "@/lib/redis/redis-client"

export const MARKET_CONTROL_CHANNEL = "market-control:config-changed"

export type ConfigChangedPayload = {
  /** "config" | "user-override" | "segment-override" — whatever changed. */
  scope: "config" | "user-override" | "segment-override"
  /** Optional id for targeted invalidation (userId or segmentId). */
  target?: string | null
  /** Optional summary for dashboard toasts. */
  summary?: string
  ts: string
}

export async function publishConfigChanged(payload: Omit<ConfigChangedPayload, "ts">): Promise<void> {
  if (!isRedisEnabled()) return
  const full: ConfigChangedPayload = { ...payload, ts: new Date().toISOString() }
  await redisPublish(MARKET_CONTROL_CHANNEL, JSON.stringify(full))
}

export async function subscribeConfigChanged(
  handler: (payload: ConfigChangedPayload) => void,
): Promise<() => void> {
  if (!isRedisEnabled()) return () => {}
  return redisSubscribe(MARKET_CONTROL_CHANNEL, (message) => {
    try {
      const parsed = JSON.parse(message) as ConfigChangedPayload
      handler(parsed)
    } catch {
      // ignore bad payload
    }
  })
}
