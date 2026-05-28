/**
 * File:        lib/services/risk/risk-config-cache.ts
 * Module:      Risk · shared cached RiskConfig loader (Trading-ee3 / Trading-1z9)
 * Purpose:     Single canonical implementation of "fetch the winning active RiskConfig row for
 *              this instrument" with a 30-second in-process cache and Redis pub/sub
 *              invalidation. Replaces three duplicated `prisma.riskConfig.findMany` query sites
 *              (MarginCalculator.getRiskConfig, resolveActiveRiskConfigForInstrument, and
 *              app/api/risk/config/route.ts) so a future schema/filter/index change only has
 *              to be made once.
 *
 * Exports:
 *   - CachedRiskConfigRow                                   — full-row shape returned by loader
 *   - loadActiveRiskConfigForInstrument(input)              — single read entrypoint (cached)
 *   - bustRiskConfigCache()                                 — admin-write side; clears local cache
 *   - getRiskConfigCacheStats()                             — for observability tests
 *   - ensureRiskConfigPubSubSubscribed()                    — idempotent subscriber init for cross-container busts
 *
 * Depends on:
 *   - @prisma/client                                       — PrismaClient type and Prisma.Decimal
 *   - ./risk-config-normalizer                              — segment/product candidate expansion
 *   - ./risk-config-pick-active                             — precedence walk over candidates
 *   - ./risk-margin-side                                    — MarginRiskSide type
 *   - ./risk-config-pubsub                                  — Redis fanout for cross-container busts
 *   - @/lib/observability/logger                            — Pino child logger
 *
 * Side-effects:
 *   - On first cache-miss, opens a Redis subscription via subscribeRiskConfigChanged so that
 *     remote container writes invalidate this container's cache. The subscription is opened
 *     once per process lifetime (idempotent guard via globalThis flag).
 *
 * Key invariants:
 *   - Cache entries are keyed by (segmentCandidates, productTypeCandidates) joined with `|` —
 *     candidate arrays already encode the resolution semantics (alias expansion, option-side
 *     ordering) so identical inputs always hash to the same key.
 *   - Default TTL is 30s. Admin writes bust the entire cache (not just the affected key) —
 *     RiskConfig is small and hot-reloads cheaply; partial invalidation is more bug surface
 *     than perf win.
 *   - Cache stores the FULL row (all selectable RiskConfig columns) so all three call sites
 *     can pick whatever projection they need without re-querying.
 *   - Returns null when no row matches (preserves the previous behaviour of every site).
 *   - Read errors are logged and return null — never throw on the hot order path. The caller
 *     applies its segment-default fallback as before.
 *
 * Read order:
 *   1. CachedRiskConfigRow                — wire shape
 *   2. loadActiveRiskConfigForInstrument  — main entrypoint
 *   3. bustRiskConfigCache                — invalidation side (admin writes call this)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import type { Prisma, PrismaClient } from "@prisma/client"
import {
  resolveRiskConfigProductTypeCandidatesForInstrument,
  resolveRiskConfigSegmentCandidates,
} from "@/lib/services/risk/risk-config-normalizer"
import type { MarginRiskSide } from "@/lib/services/risk/risk-margin-side"
import { pickActiveRiskConfigRow } from "@/lib/services/risk/risk-config-pick-active"
import {
  publishRiskConfigChanged,
  subscribeRiskConfigChanged,
} from "@/lib/services/risk/risk-config-pubsub"
import { baseLogger } from "@/lib/observability/logger"

const log = baseLogger.child({ module: "risk-config-cache" })

const DEFAULT_CACHE_TTL_MS = 30_000

/**
 * Full-row shape returned by the loader. We select all RiskConfig columns so any caller can
 * project what it needs without forcing a re-query. Decimals stay as Prisma.Decimal so callers
 * keep their existing parseFiniteRiskNumber-based conversions.
 */
export type CachedRiskConfigRow = {
  id: string
  segment: string
  productType: string
  leverage: Prisma.Decimal
  marginRate: Prisma.Decimal | null
  minMarginPerLot: Prisma.Decimal | null
  brokerageFlat: Prisma.Decimal | null
  brokerageRate: Prisma.Decimal | null
  brokerageCap: Prisma.Decimal | null
  maxOrderValue: Prisma.Decimal | null
  maxPositions: number | null
  active: boolean
  createdAt: Date
  updatedAt: Date
}

type CacheEntry = {
  fetchedAtMs: number
  // Null is a legit cached value ("no row matches") — also worth caching to avoid pummeling
  // DB on segments that have no config.
  value: CachedRiskConfigRow | null
}

type CacheState = {
  entries: Map<string, CacheEntry>
  hits: number
  misses: number
  busts: number
  pubsubSubscribed: boolean
}

function getGlobalCache(): CacheState {
  const g = globalThis as unknown as { __riskConfigLoaderCache?: CacheState }
  if (!g.__riskConfigLoaderCache) {
    g.__riskConfigLoaderCache = {
      entries: new Map(),
      hits: 0,
      misses: 0,
      busts: 0,
      pubsubSubscribed: false,
    }
  }
  return g.__riskConfigLoaderCache
}

function buildCacheKey(segmentCandidates: string[], productTypeCandidates: string[]): string {
  // Both arrays are already deterministic (alphabetical canonical names + ordered alias chain)
  // so we don't sort here — order matters because it encodes precedence.
  return `${segmentCandidates.join(",")}|${productTypeCandidates.join(",")}`
}

/**
 * Idempotent subscriber for cross-container busts. Called on the first cache-miss after each
 * cold start. When Redis isn't enabled, the subscribe call is a no-op (returns a no-op
 * unsubscribe), which is exactly what we want in single-container/dev environments.
 */
export async function ensureRiskConfigPubSubSubscribed(): Promise<void> {
  const cache = getGlobalCache()
  if (cache.pubsubSubscribed) return
  cache.pubsubSubscribed = true
  try {
    await subscribeRiskConfigChanged((payload) => {
      log.info({ payload }, "risk-config bust received from peer; clearing local cache")
      bustRiskConfigCache({ skipPublish: true })
    })
  } catch (err) {
    // Subscription failure shouldn't break the hot path. Reset the flag so a future call can
    // retry (e.g. after Redis reconnects).
    cache.pubsubSubscribed = false
    log.warn({ err: String(err) }, "failed to subscribe to risk-config pub/sub; will retry on next miss")
  }
}

export interface LoadActiveRiskConfigInput {
  prisma: PrismaClient
  segment: string
  productType: string
  optionType?: string | null
  marginRiskSide?: MarginRiskSide | null
  /** Override the default 30s TTL. Pass `0` to bypass cache entirely (admin-preview flows). */
  maxAgeMs?: number
}

export async function loadActiveRiskConfigForInstrument(
  input: LoadActiveRiskConfigInput,
): Promise<CachedRiskConfigRow | null> {
  const cache = getGlobalCache()
  const maxAgeMs = Math.max(0, input.maxAgeMs ?? DEFAULT_CACHE_TTL_MS)

  const segmentCandidates = resolveRiskConfigSegmentCandidates(input.segment)
  const productTypeCandidates = resolveRiskConfigProductTypeCandidatesForInstrument(
    input.segment,
    input.productType,
    input.optionType ?? undefined,
    input.marginRiskSide ?? undefined,
  )
  const key = buildCacheKey(segmentCandidates, productTypeCandidates)

  if (maxAgeMs > 0) {
    const existing = cache.entries.get(key)
    if (existing && Date.now() - existing.fetchedAtMs <= maxAgeMs) {
      cache.hits += 1
      return existing.value
    }
  }
  cache.misses += 1

  // Fire-and-forget pub/sub init on first miss after cold-start.
  if (!cache.pubsubSubscribed) {
    void ensureRiskConfigPubSubSubscribed()
  }

  try {
    const configs = await input.prisma.riskConfig.findMany({
      where: {
        segment: { in: segmentCandidates },
        productType: { in: productTypeCandidates },
        active: true,
      },
    })
    const picked = pickActiveRiskConfigRow(segmentCandidates, productTypeCandidates, configs)
    const value = picked
      ? {
          id: picked.id,
          segment: picked.segment,
          productType: picked.productType,
          leverage: picked.leverage,
          marginRate: picked.marginRate,
          minMarginPerLot: picked.minMarginPerLot,
          brokerageFlat: picked.brokerageFlat,
          brokerageRate: picked.brokerageRate,
          brokerageCap: picked.brokerageCap,
          maxOrderValue: picked.maxOrderValue,
          maxPositions: picked.maxPositions,
          active: picked.active,
          createdAt: picked.createdAt,
          updatedAt: picked.updatedAt,
        }
      : null
    cache.entries.set(key, { fetchedAtMs: Date.now(), value })
    return value
  } catch (err) {
    log.warn(
      { err: String(err), segment: input.segment, productType: input.productType },
      "risk-config DB read failed; returning null (callers fall back to defaults)",
    )
    return null
  }
}

export interface BustRiskConfigCacheInput {
  /** Internal flag — when handling a pub/sub message we MUST NOT re-publish (would loop). */
  skipPublish?: boolean
  /** Optional config id for observability; not used for partial invalidation. */
  configId?: string | null
  /** Optional human summary for telemetry. */
  summary?: string
}

/**
 * Clears all entries and (unless suppressed) publishes a Redis bust so peer containers also
 * clear. Admin write paths should call this AFTER their DB transaction commits.
 */
export async function bustRiskConfigCache(input: BustRiskConfigCacheInput = {}): Promise<void> {
  const cache = getGlobalCache()
  cache.entries.clear()
  cache.busts += 1
  if (input.skipPublish) return
  try {
    await publishRiskConfigChanged({
      configId: input.configId ?? null,
      summary: input.summary,
    })
  } catch (err) {
    // Publish failure isn't fatal — the local cache is already busted, and peer caches will
    // still expire via TTL within 30s.
    log.warn({ err: String(err) }, "risk-config pub/sub publish failed; peers will TTL-expire")
  }
}

export function getRiskConfigCacheStats(): {
  size: number
  hits: number
  misses: number
  busts: number
  pubsubSubscribed: boolean
} {
  const cache = getGlobalCache()
  return {
    size: cache.entries.size,
    hits: cache.hits,
    misses: cache.misses,
    busts: cache.busts,
    pubsubSubscribed: cache.pubsubSubscribed,
  }
}

/**
 * Test-only escape hatch — clears state INCLUDING counters and the pubsub flag so jest's
 * resetModules-less reuse pattern doesn't leak between specs.
 */
export function __resetRiskConfigCacheForTests(): void {
  const g = globalThis as unknown as { __riskConfigLoaderCache?: CacheState }
  delete g.__riskConfigLoaderCache
}
