/**
 * @file session-jti-cache.ts
 * @module lib/redis
 * @description Optional Redis cache for active JWT jti validation; Postgres remains authoritative.
 * @author StockTrade
 * @created 2026-03-28
 */

import { isRedisEnabled, redisDel, redisGet, redisSet } from "@/lib/redis/redis-client"

function keyFor(jti: string): string {
  return `session:jti:active:${jti}`
}

export async function markJtiActive(userId: string, jti: string, ttlSeconds: number): Promise<void> {
  if (!isRedisEnabled()) return
  await redisSet(keyFor(jti), userId, ttlSeconds)
}

export async function markJtiInactive(jti: string): Promise<void> {
  if (!isRedisEnabled()) return
  await redisDel(keyFor(jti))
}

/** Fast path: if cache says jti belongs to user, still verify DB when in doubt. */
export async function redisPeekJtiUser(jti: string): Promise<string | null> {
  if (!isRedisEnabled()) return null
  return redisGet(keyFor(jti))
}
