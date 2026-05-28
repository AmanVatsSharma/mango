/**
 * @file user-segment-lookup.ts
 * @module lib/market-control
 * @description Cached wrapper around SegmentRepository.getSegmentsForUser. Resolves the list of
 *              UserSegment.id values the user currently belongs to, so the market-control resolver
 *              can apply the highest-priority segmentOverride for that user. 60s Redis cache keyed
 *              by user — `invalidateUserSegments` must be called whenever membership changes.
 * @author StockTrade
 * @created 2026-04-16
 */

import { SegmentRepository } from "@/lib/repositories/SegmentRepository"
import { isRedisEnabled, redisGet, redisSet, redisDel } from "@/lib/redis/redis-client"

const CACHE_KEY = (userId: string) => `mc:usegs:${userId}`
const CACHE_TTL_SECONDS = 60

/** Returns the list of active UserSegment.id values for a user. [] when user has no memberships. */
export async function getUserActiveSegmentIds(
  userId: string | null | undefined,
): Promise<string[]> {
  if (!userId) return []

  if (isRedisEnabled()) {
    const cached = await redisGet(CACHE_KEY(userId))
    if (cached) {
      try {
        const arr = JSON.parse(cached)
        if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string")
      } catch {
        // fall through to DB
      }
    }
  }

  const memberships = await SegmentRepository.getSegmentsForUser(userId)
  const ids = memberships
    .map((m) => m.segment)
    .filter((s) => s && s.isActive)
    .map((s) => s.id)

  if (isRedisEnabled()) {
    await redisSet(CACHE_KEY(userId), JSON.stringify(ids), CACHE_TTL_SECONDS)
  }
  return ids
}

/** Call whenever a user's segment membership changes. */
export async function invalidateUserSegments(userId: string): Promise<void> {
  if (!isRedisEnabled()) return
  await redisDel(CACHE_KEY(userId))
}
