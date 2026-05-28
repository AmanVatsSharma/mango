/**
 * @file redis-realtime-bus.ts
 * @module lib/services/realtime
 * @description Redis-backed cross-process realtime bus for SSE messages (workers ↔ app). Keeps browser transport as SSE.
 * @author StockTrade
 * @created 2026-02-12
 */

/**
 * NOTE: Avoid `import "server-only"` here.
 * The `server-only` package relies on Next.js bundler conditions and throws when executed via `tsx` in workers.
 */
import { randomUUID } from "crypto"
import { baseLogger } from "@/lib/observability/logger"
import type { SSEMessage } from "@/types/realtime"
import { isRedisEnabled, redisPublish, redisSubscribe } from "@/lib/redis/redis-client"

const log = baseLogger.child({ module: "redis-realtime-bus" })
const instanceId = randomUUID()

type RedisRealtimeEnvelope = {
  v: 1
  sourceInstanceId: string
  publishedAtIso: string
  payload: SSEMessage
}

function userChannel(userId: string): string {
  return `realtime:user:${userId}`
}

const BROADCAST_CHANNEL = "realtime:broadcast"
export const ADMIN_PNL_BROADCAST_CHANNEL = "realtime:admin-pnl-broadcast"
export const ADMIN_EVENTS_BROADCAST_CHANNEL = "realtime:admin-events-broadcast"

export function isRedisRealtimeEnabled(): boolean {
  return isRedisEnabled()
}

export async function publishUserMessage(userId: string, payload: SSEMessage): Promise<void> {
  if (!isRedisRealtimeEnabled()) return
  const env: RedisRealtimeEnvelope = {
    v: 1,
    sourceInstanceId: instanceId,
    publishedAtIso: new Date().toISOString(),
    payload,
  }
  await redisPublish(userChannel(userId), JSON.stringify(env))
}

export async function subscribeUserMessages(
  userId: string,
  onMessage: (payload: SSEMessage) => void,
): Promise<() => void> {
  if (!isRedisRealtimeEnabled()) return () => {}

  return await redisSubscribe(userChannel(userId), (message) => {
    try {
      const parsed = JSON.parse(message) as RedisRealtimeEnvelope
      if (!parsed || parsed.v !== 1) return
      if (parsed.sourceInstanceId === instanceId) return
      if (!parsed.payload) return
      onMessage(parsed.payload)
    } catch (e) {
      log.warn({ userId, message: (e as any)?.message || String(e) }, "failed to parse redis envelope")
    }
  })
}

/**
 * Broadcast a payload to ALL processes (each will fan out to its local connections).
 * Used for targets that don't have a known userId (system-wide notifications).
 */
export async function publishBroadcastMessage(payload: SSEMessage): Promise<void> {
  if (!isRedisRealtimeEnabled()) return
  const env: RedisRealtimeEnvelope = {
    v: 1,
    sourceInstanceId: instanceId,
    publishedAtIso: new Date().toISOString(),
    payload,
  }
  await redisPublish(BROADCAST_CHANNEL, JSON.stringify(env))
}

/**
 * Subscribe to the broadcast channel — call once per process.
 * Self-publishes are filtered (sourceInstanceId match).
 */
export async function subscribeBroadcastMessages(
  onMessage: (payload: SSEMessage) => void,
): Promise<() => void> {
  if (!isRedisRealtimeEnabled()) return () => {}

  return await redisSubscribe(BROADCAST_CHANNEL, (message) => {
    try {
      const parsed = JSON.parse(message) as RedisRealtimeEnvelope
      if (!parsed || parsed.v !== 1) return
      if (parsed.sourceInstanceId === instanceId) return
      if (!parsed.payload) return
      onMessage(parsed.payload)
    } catch (e) {
      log.warn({ message: (e as any)?.message || String(e) }, "failed to parse broadcast envelope")
    }
  })
}

/**
 * Broadcast a PNL update to all admin SSE streams across all processes.
 * Used by the PositionPnLWorker to fan out live MTM snapshots to admin consoles.
 * Self-publishes are filtered (sourceInstanceId match).
 */
export async function publishAdminPnlBroadcast(payload: SSEMessage): Promise<void> {
  if (!isRedisRealtimeEnabled()) return
  const env: RedisRealtimeEnvelope = {
    v: 1,
    sourceInstanceId: instanceId,
    publishedAtIso: new Date().toISOString(),
    payload,
  }
  await redisPublish(ADMIN_PNL_BROADCAST_CHANNEL, JSON.stringify(env))
}

/**
 * Subscribe to the admin PNL broadcast channel — call once per process.
 * Fans out to all connected admin SSE streams (RealtimeEventEmitter handles fanout).
 */
export async function subscribeAdminPnlBroadcast(
  onMessage: (payload: SSEMessage) => void,
): Promise<() => void> {
  if (!isRedisRealtimeEnabled()) return () => {}

  return await redisSubscribe(ADMIN_PNL_BROADCAST_CHANNEL, (message) => {
    try {
      const parsed = JSON.parse(message) as RedisRealtimeEnvelope
      if (!parsed || parsed.v !== 1) return
      if (parsed.sourceInstanceId === instanceId) return
      if (!parsed.payload) return
      onMessage(parsed.payload)
    } catch (e) {
      log.warn({ message: (e as any)?.message || String(e) }, "failed to parse admin-pnl broadcast envelope")
    }
  })
}

/**
 * Publish a position lifecycle event (close/open) to all admin SSE streams.
 * Used by admin position close/open routes to notify all admin consoles.
 */
export async function publishAdminEventsBroadcast(payload: SSEMessage): Promise<void> {
  if (!isRedisRealtimeEnabled()) return
  const env: RedisRealtimeEnvelope = {
    v: 1,
    sourceInstanceId: instanceId,
    publishedAtIso: new Date().toISOString(),
    payload,
  }
  await redisPublish(ADMIN_EVENTS_BROADCAST_CHANNEL, JSON.stringify(env))
}

/**
 * Subscribe to the admin events broadcast channel — call once per process.
 * Used for position close/open events that all admin consoles should receive.
 */
export async function subscribeAdminEventsBroadcast(
  onMessage: (payload: SSEMessage) => void,
): Promise<() => void> {
  if (!isRedisRealtimeEnabled()) return () => {}

  return await redisSubscribe(ADMIN_EVENTS_BROADCAST_CHANNEL, (message) => {
    try {
      const parsed = JSON.parse(message) as RedisRealtimeEnvelope
      if (!parsed || parsed.v !== 1) return
      if (parsed.sourceInstanceId === instanceId) return
      if (!parsed.payload) return
      onMessage(parsed.payload)
    } catch (e) {
      log.warn({ message: (e as any)?.message || String(e) }, "failed to parse admin-events broadcast envelope")
    }
  })
}

