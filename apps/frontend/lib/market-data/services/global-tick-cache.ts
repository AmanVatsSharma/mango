/**
 * File:        lib/market-data/services/global-tick-cache.ts
 * Module:      Market Data · Tick Persistence
 * Purpose:     Module-level singleton tick cache that survives WebSocketMarketDataService
 *              instance lifecycle (provider remount, route change, error-boundary recovery).
 *              When a service is created or destroyed, it hydrates from / spills into this
 *              cache so the React tree always has access to the last known tick per token,
 *              even across socket re-init.
 *
 * Exports:
 *   - getGlobalTickCache()                         — read snapshot (immutable copy)
 *   - hydrateGlobalTickCache(seed)                 — bulk-load from a service-local Map
 *   - upsertGlobalTickCacheEntry(token, quote)     — single-tick write
 *   - mergeIntoGlobalTickCache(localCache)         — bulk merge (service teardown spill)
 *   - clearGlobalTickCache()                       — wipe (called on signOut)
 *   - subscribeToGlobalTickCacheClear(cb)          — listener for clears (so services drop their copy too)
 *
 * Depends on:
 *   - ../providers/types — EnhancedQuote shape
 *
 * Side-effects:
 *   - Holds a long-lived Map at module scope. Cleared explicitly on signOut.
 *
 * Key invariants:
 *   - Newer-wins on merge: the higher `lastUpdateTime` (or `timestamp` fallback) wins. Stale
 *     ticks from a torn-down service NEVER overwrite live ticks from the current one.
 *   - The cache is keyed by every alias the service writes (instrumentToken, uirId, providerToken).
 *     Hydration writes back ALL entries, so multi-key lookups continue to work.
 *
 * Read order:
 *   1. getGlobalTickCache / hydrateGlobalTickCache — entry points
 *   2. mergeIntoGlobalTickCache — newer-wins logic
 *
 * Author:      Trading Platform Team
 * Last-updated: 2026-05-07
 */

import type { EnhancedQuote } from '../providers/types';

const globalCache: Map<number, EnhancedQuote> = new Map();
const clearListeners: Set<() => void> = new Set();

function tickRecency(quote: EnhancedQuote): number {
  if (typeof quote.lastUpdateTime === 'number' && Number.isFinite(quote.lastUpdateTime)) {
    return quote.lastUpdateTime;
  }
  if (typeof quote.timestamp === 'number' && Number.isFinite(quote.timestamp)) {
    return quote.timestamp;
  }
  return 0;
}

export function getGlobalTickCache(): Map<number, EnhancedQuote> {
  return new Map(globalCache);
}

export function hydrateGlobalTickCache(seed: Map<number, EnhancedQuote>): void {
  seed.forEach((quote, token) => {
    upsertGlobalTickCacheEntry(token, quote);
  });
}

export function upsertGlobalTickCacheEntry(token: number, quote: EnhancedQuote): void {
  const existing = globalCache.get(token);
  if (!existing) {
    globalCache.set(token, quote);
    return;
  }
  if (tickRecency(quote) >= tickRecency(existing)) {
    globalCache.set(token, quote);
  }
}

export function mergeIntoGlobalTickCache(localCache: Map<number, EnhancedQuote>): void {
  localCache.forEach((quote, token) => {
    upsertGlobalTickCacheEntry(token, quote);
  });
}

export function clearGlobalTickCache(): void {
  globalCache.clear();
  clearListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* one bad listener should not break the others */
    }
  });
}

export function subscribeToGlobalTickCacheClear(cb: () => void): () => void {
  clearListeners.add(cb);
  return () => {
    clearListeners.delete(cb);
  };
}
