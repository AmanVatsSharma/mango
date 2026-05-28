/**
 * File:        lib/hooks/use-instrument-search.ts
 * Module:      Hooks · Instrument Search
 * Purpose:     Debounced instrument search hook unified around the new /api/milli-search/suggest
 *              endpoint with SSE live-price updates keyed by UIR id. Now backed by SWR for
 *              cross-mount dedup + 5s stale window — same pattern as the marketdata admin
 *              SearchPage so repeat queries (rapid backspace, filter toggles) feel instant.
 *
 * Exports:
 *   - useInstrumentSearch(options) → UseInstrumentSearchReturn  — primary hook
 *   - useMultiTabSearch(query, limit) → { results, loading, error }  — multi-tab variant
 *   - SearchFilter                — 'all' | 'eq' | 'fno' | 'commodities' — universal filter
 *   - SearchTab                   — 'equity' | 'futures' | 'options' | 'commodities' — legacy tab enum (admin dialog)
 *   - UseInstrumentSearchOptions  — hook option shape
 *   - UseInstrumentSearchReturn   — hook return shape
 *
 * Depends on:
 *   - swr — client-side request dedup with `dedupingInterval: 5_000`
 *   - @/lib/services/search/milli-client   — suggest/buildStreamURL
 *   - @/lib/services/market-data/search-client — legacy multi-tab hook only
 *
 * Side-effects:
 *   - Opens an EventSource (SSE) connection to /api/milli-search/stream for live LTP
 *   - SWR cache write keyed on ['suggest', q, mode]
 *
 * Key invariants:
 *   - `filter` takes precedence over `activeTab` when both are supplied
 *   - filter='all' → no mode param sent (universal results, all asset classes)
 *   - filter='commodities' or activeTab='commodities' → SSE skipped (MCX not on SSE stream)
 *   - SSE stream payload shape: { quotes: { "<uirId>": { last_price: N } }, ts: "..." }
 *   - LTP updates key on item.id (UIR id), not on item.token (broker token)
 *   - SSE onerror reconnects with exponential backoff (1s → 2s → 4s … max 30s)
 *   - Filter-change re-search is driven exclusively by the component; hook does NOT re-trigger internally
 *   - SWR `keepPreviousData` keeps the visible list stable across debounces — no skeleton flash
 *   - `loading` reflects only the initial-load state (`isLoading`); during revalidation we keep
 *     showing prior results, mirroring the marketdata dashboard's UX
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 *   - Race-cancel useMultiTabSearch: clearTimeout alone leaves an in-flight
 *     run promise resolving against stale state, so a fast typist could see
 *     the previous query's results flash for one frame after typing the next
 *     character. Cancellation flag captured in the cleanup closure.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import useSWR from 'swr';
import {
  milliClient,
  type MilliInstrument,
  type MilliMode,
  type MilliSuggestParams,
} from '@/lib/services/search/milli-client';
import type { Instrument } from '@/lib/services/market-data/search-client'
import { searchEquities, searchFutures, searchOptions, searchCommodities } from '@/lib/services/market-data/search-client'

/**
 * Universal search filter.
 *  - 'all'        → no constraint (everything across all segments)
 *  - 'eq'         → mode=eq        (NSE / BSE equity)
 *  - 'fno'        → mode=fno       (NSE F&O futures + options)
 *  - 'commodities'→ mode=commodities (MCX commodity futures)
 *  - 'curr'       → mode=curr      (CDS currency / forex pairs)
 *  - 'crypto'     → assetClass=crypto (Binance + global spot crypto)
 *
 * Modes 'eq' / 'fno' / 'commodities' / 'curr' map to vortexExchange filters upstream
 * (search.controller.ts:204-209). 'crypto' is filtered via the assetClass param.
 */
export type SearchFilter = 'all' | MilliMode | 'crypto';

/** Legacy 4-tab enum kept for the admin InstrumentPickerDialog. */
export type SearchTab = 'equity' | 'futures' | 'options' | 'commodities';

const TAB_MODE: Record<SearchTab, MilliMode> = {
  equity: 'eq',
  futures: 'fno',
  options: 'fno',
  commodities: 'commodities',
}

export interface UseInstrumentSearchOptions {
  /** Universal filter — 'all' means no mode constraint. Takes precedence over activeTab. */
  filter?: SearchFilter;
  /** Legacy tab selector — used by admin dialog. Ignored when `filter` is set. */
  activeTab?: SearchTab;
  debounceMs?: number;
}

export interface UseInstrumentSearchReturn {
  results: MilliInstrument[];
  loading: boolean;
  error: string | null;
  search: (query: string) => void;
  clear: () => void;
  hasResults: boolean;
  resultCount: number;
}

/**
 * SWR cache key. The third slot is the upstream `mode` (eq/fno/curr/commodities) and the
 * fourth is the upstream `assetClass` (e.g. 'crypto') — only one is set at a time, the
 * other stays undefined so SWR gives each filter its own cache entry without overlap.
 */
type SuggestKey = readonly ['suggest', string, MilliMode | undefined, string | undefined];

/** Mirror the marketdata dashboard's `staleTime: 5_000` (SearchPage.tsx:203). */
const SWR_DEDUPE_MS = 5_000;

/** SWR fetcher for the typeahead suggest call. */
const suggestFetcher = async ([, q, mode, assetClass]: SuggestKey): Promise<MilliInstrument[]> => {
  const params: MilliSuggestParams = { q, ltp_only: true };
  if (mode) params.mode = mode;
  if (assetClass) params.assetClass = assetClass;
  return milliClient.suggest(params);
}

export function useInstrumentSearch(
  options: UseInstrumentSearchOptions = {}
): UseInstrumentSearchReturn {
  const { filter, activeTab = 'equity', debounceMs = 300 } = options;

  // Key fed to SWR — null ⇒ no fetch. Updated only after the debounce settles.
  const [swrKey, setSwrKey] = useState<SuggestKey | null>(null);
  const [sseQuery, setSseQuery] = useState('');

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentQueryRef = useRef('');
  const activeTabRef = useRef<SearchTab>(activeTab);
  const filterRef = useRef<SearchFilter | undefined>(filter);
  const eventSourceRef = useRef<EventSource | null>(null);

  /**
   * Resolve effective upstream filter params from (filter, tab). The three valid output
   * shapes are:
   *   { mode: 'eq'|'fno'|'curr'|'commodities' }   — Indian-market vortexExchange filter
   *   { assetClass: 'crypto' }                    — global crypto filter
   *   { mode: undefined, assetClass: undefined }  — universal "all"
   * filter wins over activeTab when both are supplied.
   */
  const resolveFilterParams = useCallback(
    (f: SearchFilter | undefined, tab: SearchTab): { mode?: MilliMode; assetClass?: string } => {
      if (f !== undefined) {
        if (f === 'all') return {};
        if (f === 'crypto') return { assetClass: 'crypto' };
        return { mode: f as MilliMode };
      }
      return { mode: TAB_MODE[tab] };
    },
    [],
  );

  /** Is the effective filter one where SSE LTP is not supported (MCX/crypto)? */
  const isSSESkipped = useCallback((f: SearchFilter | undefined, tab: SearchTab): boolean => {
    if (f !== undefined) return f === 'commodities' || f === 'crypto';
    return tab === 'commodities';
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  // SWR — handles the network call, cancellation/dedup, and caching across remounts.
  // Disable all auto-revalidation so typing is the only trigger; the SSE stream handles
  // live-price updates, so we never need to re-fetch a still-warm query.
  const { data, error: swrError, isLoading } = useSWR<MilliInstrument[]>(
    swrKey,
    suggestFetcher,
    {
      dedupingInterval: SWR_DEDUPE_MS,
      revalidateOnFocus: false,
      revalidateIfStale: false,
      revalidateOnReconnect: false,
      keepPreviousData: true,
      shouldRetryOnError: false,
    },
  );

  // Live overlay: the base list comes from SWR `data`; SSE ticks patch `last_price` in place.
  // Two-state design avoids mutating SWR's cached payload directly, which would surprise
  // any other subscriber to the same key.
  const [liveResults, setLiveResults] = useState<MilliInstrument[]>([]);

  useEffect(() => {
    if (swrKey === null) {
      setLiveResults([]);
      return;
    }
    if (data) setLiveResults(data);
  }, [data, swrKey]);

  const search = useCallback((query: string) => {
    currentQueryRef.current = query;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!query.trim()) {
      setSwrKey(null);
      setSseQuery('');
      return;
    }

    debounceTimer.current = setTimeout(() => {
      const trimmed = query.trim();
      const { mode, assetClass } = resolveFilterParams(filterRef.current, activeTabRef.current);
      setSwrKey(['suggest', trimmed, mode, assetClass] as const);
      setSseQuery(trimmed);
    }, debounceMs);
  }, [debounceMs, resolveFilterParams]);

  const clear = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    setSwrKey(null);
    setSseQuery('');
    currentQueryRef.current = '';
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    };
  }, []);

  // SSE live-price overlay (unchanged contract): opens after a search settles, reconnects
  // with exponential backoff (1s → 2s → 4s → 8s → 16s → 30s capped, reset on a successful frame).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isSSESkipped(filter, activeTab) || !sseQuery) {
      if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
      return;
    }

    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const url = milliClient.buildStreamURL({ q: sseQuery, ltp_only: true });
      const instance = new EventSource(url);
      eventSourceRef.current = instance;

      instance.onmessage = (event) => {
        retryCount = 0; // successful frame — reset backoff
        try {
          const payload = JSON.parse(event.data);
          const quotes: Record<string, { last_price: number }> = payload?.quotes || {};
          if (!quotes || typeof quotes !== 'object') return;
          setLiveResults((prev) => {
            if (prev.length === 0) return prev;
            return prev.map((item) => {
              const idKey = String(item.id ?? item.uirId ?? item.wsSubscribeUirId ?? '');
              const ltp = idKey ? quotes[idKey]?.last_price : undefined;
              return ltp !== undefined && ltp > 0 ? { ...item, last_price: ltp } : item;
            });
          });
        } catch { /* ignore malformed frames */ }
      };

      instance.onerror = () => {
        instance.close();
        if (eventSourceRef.current === instance) eventSourceRef.current = null;
        if (cancelled) return;
        const delayMs = Math.min(1000 * Math.pow(2, retryCount), 30_000);
        retryCount++;
        retryTimer = setTimeout(connect, delayMs);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    };
  }, [sseQuery, filter, activeTab, isSSESkipped]);

  const errMsg = swrError ? (swrError instanceof Error ? swrError.message : 'Search failed') : null;

  return {
    results: liveResults,
    loading: isLoading,
    error: errMsg,
    search,
    clear,
    hasResults: liveResults.length > 0,
    resultCount: liveResults.length,
  };
}

/**
 * Multi-tab search — returns results for all four tabs simultaneously.
 * Still uses the legacy market-data search client for backwards compatibility.
 */
export function useMultiTabSearch(query: string, limit: number = 20) {
  const [results, setResults] = useState<{
    equity: Instrument[];
    futures: Instrument[];
    options: Instrument[];
    commodities: Instrument[];
  }>({ equity: [], futures: [], options: [], commodities: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults({ equity: [], futures: [], options: [], commodities: [] });
      return;
    }

    // Race-cancel flag captured in the closure — clearTimeout alone only stops
    // a not-yet-started run, but if the timer already fired and the four
    // fetches are in flight, the cleanup needs to ignore their results when a
    // newer query has superseded them. Otherwise fast typists see the previous
    // query's results flash in for a frame after typing the next character.
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const [equity, futures, options, commodities] = await Promise.all([
          searchEquities(query, limit).catch(() => []),
          searchFutures(query, limit).catch(() => []),
          searchOptions(query, undefined, limit).catch(() => []),
          searchCommodities(query, limit).catch(() => []),
        ]);
        if (cancelled) return;
        setResults({ equity, futures, options, commodities });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(run, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, limit]);

  return { results, loading, error };
}
