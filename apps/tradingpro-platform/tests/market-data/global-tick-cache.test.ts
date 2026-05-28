/**
 * File:        tests/market-data/global-tick-cache.test.ts
 * Module:      Market Data · Tick Persistence (tests)
 * Purpose:     Lock the contract of the module-singleton tick cache: newer-wins merge,
 *              clear-listener fan-out, hydrate semantics. These properties are what makes
 *              the cache safe to share across service instances — silent regressions here
 *              would re-introduce the "prices flash blank on remount" bug.
 *
 * Exports:     none (Jest test suite)
 *
 * Depends on:
 *   - lib/market-data/services/global-tick-cache — the SUT
 *   - lib/market-data/providers/types — EnhancedQuote shape
 *
 * Side-effects:
 *   - The module-level cache is global; each test calls clearGlobalTickCache() in afterEach
 *     to prevent cross-test bleed.
 *
 * Key invariants tested:
 *   - upsert with same/older recency does NOT overwrite a fresher entry
 *   - upsert with newer recency wins
 *   - clear fires every listener, and a throwing listener does not block the rest
 *
 * Author:      Trading Platform Team
 * Last-updated: 2026-05-07
 */

import {
  clearGlobalTickCache,
  getGlobalTickCache,
  hydrateGlobalTickCache,
  mergeIntoGlobalTickCache,
  subscribeToGlobalTickCacheClear,
  upsertGlobalTickCacheEntry,
} from '@/lib/market-data/services/global-tick-cache';
import type { EnhancedQuote } from '@/lib/market-data/providers/types';

function quote(token: number, price: number, lastUpdateTime: number): EnhancedQuote {
  return {
    instrumentToken: token,
    last_trade_price: price,
    display_price: price,
    actual_price: price,
    trend: 'neutral',
    jitter_offset: 0,
    deviation_offset: 0,
    timestamp: lastUpdateTime,
    lastUpdateTime,
  };
}

describe('global-tick-cache', () => {
  afterEach(() => {
    clearGlobalTickCache();
  });

  it('returns an immutable snapshot — mutating the result does not affect the cache', () => {
    upsertGlobalTickCacheEntry(100, quote(100, 1.0, 1000));
    const snapshot = getGlobalTickCache();
    snapshot.delete(100);
    expect(getGlobalTickCache().has(100)).toBe(true);
  });

  it('newer-wins on upsert: fresher lastUpdateTime overwrites', () => {
    upsertGlobalTickCacheEntry(100, quote(100, 1.0, 1000));
    upsertGlobalTickCacheEntry(100, quote(100, 2.0, 2000));
    expect(getGlobalTickCache().get(100)?.last_trade_price).toBe(2.0);
  });

  it('older-loses on upsert: stale ticks from a torn-down service do not overwrite live ones', () => {
    upsertGlobalTickCacheEntry(100, quote(100, 2.0, 2000));
    upsertGlobalTickCacheEntry(100, quote(100, 1.0, 1000));
    expect(getGlobalTickCache().get(100)?.last_trade_price).toBe(2.0);
  });

  it('equal-recency upsert keeps the latest write (>= comparison)', () => {
    upsertGlobalTickCacheEntry(100, quote(100, 1.0, 1000));
    upsertGlobalTickCacheEntry(100, quote(100, 9.99, 1000));
    expect(getGlobalTickCache().get(100)?.last_trade_price).toBe(9.99);
  });

  it('mergeIntoGlobalTickCache applies newer-wins per-token across the entire batch', () => {
    upsertGlobalTickCacheEntry(100, quote(100, 1.0, 2000));
    upsertGlobalTickCacheEntry(200, quote(200, 1.0, 1000));
    const localStaleAndFresh = new Map<number, EnhancedQuote>();
    localStaleAndFresh.set(100, quote(100, 99.0, 500));   // stale → must lose
    localStaleAndFresh.set(200, quote(200, 99.0, 5000));  // fresh → must win
    mergeIntoGlobalTickCache(localStaleAndFresh);
    expect(getGlobalTickCache().get(100)?.last_trade_price).toBe(1.0);
    expect(getGlobalTickCache().get(200)?.last_trade_price).toBe(99.0);
  });

  it('hydrate seeds the cache from a service-local map', () => {
    const seed = new Map<number, EnhancedQuote>();
    seed.set(100, quote(100, 1.0, 1000));
    seed.set(200, quote(200, 2.0, 2000));
    hydrateGlobalTickCache(seed);
    expect(getGlobalTickCache().size).toBe(2);
  });

  it('clear fires every subscribed listener', () => {
    const a = jest.fn();
    const b = jest.fn();
    subscribeToGlobalTickCacheClear(a);
    subscribeToGlobalTickCacheClear(b);
    upsertGlobalTickCacheEntry(100, quote(100, 1.0, 1000));
    clearGlobalTickCache();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(getGlobalTickCache().size).toBe(0);
  });

  it('a throwing listener does not block other listeners', () => {
    const a = jest.fn(() => { throw new Error('boom'); });
    const b = jest.fn();
    subscribeToGlobalTickCacheClear(a);
    subscribeToGlobalTickCacheClear(b);
    expect(() => clearGlobalTickCache()).not.toThrow();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops a listener from firing on subsequent clears', () => {
    const a = jest.fn();
    const unsub = subscribeToGlobalTickCacheClear(a);
    unsub();
    clearGlobalTickCache();
    expect(a).not.toHaveBeenCalled();
  });
});
