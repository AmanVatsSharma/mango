/**
 * @file market-catalog-loader.ts
 * @module lib/market-catalog
 * @description Thin DB accessor for MARKET_CATALOG_V1 with a short process-level cache. Avoids
 *              hitting SystemSettings on every user-facing catalog read. Cache TTL is short
 *              (5s) but admin PUTs invalidate immediately via the pubsub channel below — so
 *              perceived staleness across an N-container deployment is bounded by Redis RTT.
 *
 *              Mirror of `lib/market-control/market-control-loader.ts`. Same semantics; different key.
 *
 * Exports:
 *   - loadMarketCatalog()                   — cached read; returns DEFAULT on miss/parse failure.
 *   - invalidateMarketCatalogCache()        — clear local cache (call after a successful PUT).
 *   - getCachedMarketCatalogSync()          — synchronous read of the last-cached value (or DEFAULT).
 *
 * Side-effects:
 *   - Lazy-subscribes to MARKET_CATALOG_CHANNEL on first call.
 *   - In-memory mutation of the module-scoped cache cell.
 *
 * Key invariants:
 *   - Cache TTL = 5_000ms. Bounded staleness in single-container or Redis-disabled mode.
 *   - parseMarketCatalogJson is defensive — corrupt rows degrade to DEFAULT_MARKET_CATALOG_V1.
 *   - Concurrent fetch suppression via the `inflight` promise — at most one DB hit in flight.
 *
 * Read order:
 *   1. fetchFromDb — single DB read.
 *   2. loadMarketCatalog — public entry point with cache + pubsub.
 *
 * Author:        BharatERP
 * Last-updated:  2026-05-01
 */

import { prisma } from "@/lib/prisma"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import {
  DEFAULT_MARKET_CATALOG_V1,
  parseMarketCatalogJson,
  type MarketCatalogV1,
} from "./catalog-schema"
import { subscribeCatalogChanged } from "./market-catalog-pubsub"

const CACHE_TTL_MS = 5_000

let cached: { value: MarketCatalogV1; fetchedAt: number } | null = null
let inflight: Promise<MarketCatalogV1> | null = null
let pubSubStarted = false

function ensurePubSubSubscribed(): void {
  if (pubSubStarted) return
  pubSubStarted = true
  subscribeCatalogChanged(() => {
    cached = null
  }).catch(() => {
    pubSubStarted = false
  })
}

async function fetchFromDb(): Promise<MarketCatalogV1> {
  const row = await prisma.systemSettings.findFirst({
    where: { key: ADMIN_SETTING_KEYS.MARKET_CATALOG_V1, ownerId: null, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { value: true },
  })
  if (!row?.value) return { ...DEFAULT_MARKET_CATALOG_V1 }
  return parseMarketCatalogJson(row.value)
}

export async function loadMarketCatalog(): Promise<MarketCatalogV1> {
  ensurePubSubSubscribed()
  const now = Date.now()
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.value
  if (inflight) return inflight
  inflight = fetchFromDb()
    .then((value) => {
      cached = { value, fetchedAt: Date.now() }
      return value
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function invalidateMarketCatalogCache(): void {
  cached = null
}

export function getCachedMarketCatalogSync(): MarketCatalogV1 {
  return cached?.value ?? DEFAULT_MARKET_CATALOG_V1
}
