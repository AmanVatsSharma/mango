/**
 * @file user-group.ts
 * @module lib/market-control
 * @description Per-user market-control group lookup. Groups live in Redis under
 *              `mc:user-group:{userId}` with no TTL; STANDARD is returned for any user without
 *              an explicit assignment. The scalper-flagger writes this key when auto-flagging.
 * @author StockTrade
 * @created 2026-04-15
 */

import { isRedisEnabled, redisGet, redisSet, redisDel } from "@/lib/redis/redis-client"
import { userGroupKeys, type UserGroupKey } from "./market-control-config.schema"

const KEY = (userId: string) => `mc:user-group:${userId}`
const DEFAULT_GROUP: UserGroupKey = "STANDARD"

function isValidGroup(v: unknown): v is UserGroupKey {
  return typeof v === "string" && (userGroupKeys as readonly string[]).includes(v)
}

export async function getUserMarketGroup(userId: string | null | undefined): Promise<UserGroupKey> {
  if (!userId) return DEFAULT_GROUP
  if (!isRedisEnabled()) return DEFAULT_GROUP
  const raw = await redisGet(KEY(userId))
  if (raw && isValidGroup(raw)) return raw
  return DEFAULT_GROUP
}

export async function setUserMarketGroup(
  userId: string,
  group: UserGroupKey,
  ttlSeconds?: number,
): Promise<void> {
  if (!isRedisEnabled()) return
  await redisSet(KEY(userId), group, ttlSeconds)
}

export async function clearUserMarketGroup(userId: string): Promise<void> {
  if (!isRedisEnabled()) return
  await redisDel(KEY(userId))
}
