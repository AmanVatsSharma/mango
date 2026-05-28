/**
 * @file market-control-loader.ts
 * @module lib/market-control
 * @description Thin DB accessor for MARKET_CONTROL_CONFIG_V1 with a short process-level cache so
 *              the hot order path does not hit SystemSettings on every placement.
 *              Cache TTL = 5 seconds. Admin PUTs should call `invalidateMarketControlConfigCache()`.
 * @author StockTrade
 * @created 2026-04-15
 */

import { prisma } from "@/lib/prisma"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import {
  DEFAULT_MARKET_CONTROL_CONFIG_V1,
  parseMarketControlConfigJson,
  type MarketControlConfigV1,
} from "./market-control-config.schema"
import { subscribeConfigChanged } from "./market-control-pubsub"

const CACHE_TTL_MS = 5_000

let cached: { value: MarketControlConfigV1; fetchedAt: number } | null = null
let inflight: Promise<MarketControlConfigV1> | null = null
let pubSubStarted = false

function ensurePubSubSubscribed(): void {
  if (pubSubStarted) return
  pubSubStarted = true
  subscribeConfigChanged(() => {
    cached = null
  }).catch(() => {
    pubSubStarted = false
  })
}

async function fetchFromDb(): Promise<MarketControlConfigV1> {
  // Try the new key first.
  const newRow = await prisma.systemSettings.findFirst({
    where: { key: ADMIN_SETTING_KEYS.MARKET_CONTROL_CONFIG_V1, ownerId: null },
    orderBy: { updatedAt: "desc" },
    select: { value: true },
  })
  if (newRow?.value) {
    try {
      return parseMarketControlConfigJson(JSON.parse(newRow.value))
    } catch {
      // fall through
    }
  }

  // Fallback: read legacy BID_ASK_SPREAD_CONFIG_V1 and upgrade on the fly.
  const legacyRow = await prisma.systemSettings.findFirst({
    where: { key: ADMIN_SETTING_KEYS.BID_ASK_SPREAD_CONFIG_V1, ownerId: null },
    orderBy: { updatedAt: "desc" },
    select: { value: true },
  })
  if (legacyRow?.value) {
    try {
      return parseMarketControlConfigJson(JSON.parse(legacyRow.value))
    } catch {
      // fall through
    }
  }

  return DEFAULT_MARKET_CONTROL_CONFIG_V1
}

export async function loadMarketControlConfig(): Promise<MarketControlConfigV1> {
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

/** Clears the process cache. Call after an admin PUT. */
export function invalidateMarketControlConfigCache(): void {
  cached = null
}

/**
 * Returns the synchronously-cached config if available, else DEFAULT. Use only in paths where
 * an async read is impossible (e.g. strict timing sections). Always prefer `loadMarketControlConfig`.
 */
export function getCachedMarketControlConfigSync(): MarketControlConfigV1 {
  return cached?.value ?? DEFAULT_MARKET_CONTROL_CONFIG_V1
}
