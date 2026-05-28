/**
 * @file market-catalog-pubsub.ts
 * @module lib/market-catalog
 * @description Cross-container invalidation channel for MARKET_CATALOG_V1 edits. When an admin
 *              PUTs the catalog, every other container subscribed to this Redis channel drops
 *              its in-memory loader cache so users see the new catalog within ~250ms instead
 *              of waiting up to 30s for the local TTL.
 *
 *              Mirror of `lib/market-control/market-control-pubsub.ts` — same shape and intent.
 *
 * Exports:
 *   - MARKET_CATALOG_CHANNEL                — Redis channel name
 *   - publishCatalogChanged(payload)        — fire-and-forget publish (no-op if Redis disabled)
 *   - subscribeCatalogChanged(handler)      — subscribe; returns an unsubscribe function
 *   - CatalogChangedPayload                 — TS payload type
 *
 * Side-effects:
 *   - Reads/writes to Redis via @/lib/redis/redis-client (idempotent + best-effort).
 *
 * Key invariants:
 *   - When Redis is not enabled, both functions degrade silently — local TTL still bounds staleness.
 *   - Bad payloads on the wire are swallowed by the subscriber (defensive).
 *
 * Read order:
 *   1. ConfigChangedPayload — wire shape.
 *   2. publishCatalogChanged / subscribeCatalogChanged — usage.
 *
 * Author:        BharatERP
 * Last-updated:  2026-05-01
 */

import { isRedisEnabled, redisPublish, redisSubscribe } from "@/lib/redis/redis-client"

export const MARKET_CATALOG_CHANNEL = "market-catalog:config-changed"

export type CatalogChangedPayload = {
  scope: "global" | "user-override" | "segment-override"
  /** Optional id for targeted invalidation (userId or segmentId). */
  target?: string | null
  /** Optional summary for dashboard toasts. */
  summary?: string
  ts: string
}

export async function publishCatalogChanged(payload: Omit<CatalogChangedPayload, "ts">): Promise<void> {
  if (!isRedisEnabled()) return
  const full: CatalogChangedPayload = { ...payload, ts: new Date().toISOString() }
  await redisPublish(MARKET_CATALOG_CHANNEL, JSON.stringify(full))
}

export async function subscribeCatalogChanged(
  handler: (payload: CatalogChangedPayload) => void,
): Promise<() => void> {
  if (!isRedisEnabled()) return () => {}
  return redisSubscribe(MARKET_CATALOG_CHANNEL, (message) => {
    try {
      const parsed = JSON.parse(message) as CatalogChangedPayload
      handler(parsed)
    } catch {
      // ignore bad payload
    }
  })
}
