/**
 * File:        lib/redis/order-idempotency.ts
 * Module:      Redis · Order Idempotency
 * Purpose:     Prevents duplicate order placement on mobile retries by caching the first
 *              successful response keyed by user-scoped idempotency key. Designed for the
 *              mobile RN client which sends a UUID v4 `Idempotency-Key` header and retries
 *              on network failure (4G drops) via TanStack Query's retry logic.
 *
 * Exports:
 *   - extractIdempotencyKey(req) → string | null   — reads + validates the header
 *   - acquireIdempotencySlot(userId, key, ttl)      — atomic SET NX; true = won
 *   - readIdempotencyCached(userId, key)            — read a previously stored response
 *   - storeIdempotencyResponse(userId, key, body, ttl) — persist the response JSON
 *   - IDEMPOTENCY_TTL_SECONDS                       — default 60s
 *
 * Depends on:
 *   - @/lib/redis/redis-client — redisSetNx, redisGet, redisSet
 *
 * Side-effects:
 *   - Redis reads/writes (gracefully no-ops when Redis is disabled).
 *
 * Key invariants:
 *   - Key is user-scoped: `idem:order:{userId}:{clientKey}`. Two users with the same
 *     idempotency key string cannot interfere with each other.
 *   - UUID v4 validation is strict — non-UUID keys are rejected (400) rather than silently
 *     processed, preventing accidental collisions from short or predictable keys.
 *   - On Redis error, `acquireIdempotencySlot` returns `true` (fail-open) — the order
 *     processes normally. The duplicate-prevention guarantee degrades gracefully.
 *   - A "processing" sentinel distinguishes an in-flight first request from a completed one.
 *     Retries arriving while the first is still in-flight get a 409.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { redisGet, redisSet, redisSetNx } from "./redis-client"

export const IDEMPOTENCY_TTL_SECONDS = 60

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const PROCESSING_SENTINEL = "__processing__"

function cacheKey(userId: string, clientKey: string): string {
  return `idem:order:${userId}:${clientKey}`
}

/** Reads the `Idempotency-Key` header and validates it is a UUID v4. Returns null if absent or invalid. */
export function extractIdempotencyKey(req: Request): string | null {
  const raw = req.headers.get("Idempotency-Key")
  if (!raw) return null
  const trimmed = raw.trim()
  if (!UUID_V4_RE.test(trimmed)) return null
  return trimmed
}

/**
 * Try to claim the idempotency slot atomically.
 * Returns `true` when the slot was just claimed (this is the first request).
 * Returns `false` when the slot already exists (duplicate or still-processing).
 */
export async function acquireIdempotencySlot(
  userId: string,
  clientKey: string,
  ttlSeconds = IDEMPOTENCY_TTL_SECONDS,
): Promise<boolean> {
  return redisSetNx(cacheKey(userId, clientKey), PROCESSING_SENTINEL, ttlSeconds)
}

/**
 * Read the cached response for a completed first request.
 * Returns `null` when not found, `"__processing__"` when the first request is still in flight,
 * or the serialized response body string.
 */
export async function readIdempotencyCached(
  userId: string,
  clientKey: string,
): Promise<string | null> {
  return redisGet(cacheKey(userId, clientKey))
}

/**
 * Store the final response body so retries can replay it without re-processing the order.
 * Always called after a successful order placement — overwrites the processing sentinel.
 */
export async function storeIdempotencyResponse(
  userId: string,
  clientKey: string,
  body: unknown,
  ttlSeconds = IDEMPOTENCY_TTL_SECONDS,
): Promise<void> {
  await redisSet(cacheKey(userId, clientKey), JSON.stringify(body), ttlSeconds)
}
