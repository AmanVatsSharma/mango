/**
 * @file WebSocketMarketDataProvider.tsx
 * @description Real-time market data provider using Socket.IO WebSocket connection
 * 
 * PURPOSE:
 * - Provides live market prices via WebSocket (no polling)
 * - Subscribes to user's watchlist, positions, and index instruments
 * - Implements smooth price transitions with jitter and interpolation
 * - Handles connection lifecycle, reconnection, and error recovery
 * 
 * FEATURES:
 * - Real-time LTP updates via Socket.IO
 * - Auto-subscription management based on user data
 * - Smooth price animations (jitter + interpolation)
 * - Connection health monitoring
 * - Comprehensive error handling
 * - Detailed console logging
 * 
 * USAGE:
 * Wrap your dashboard with this provider:
 * <WebSocketMarketDataProvider userId={userId}>
 *   <TradingDashboard />
 * </WebSocketMarketDataProvider>
 * 
 * Then use the hook in child components:
 * const { quotes, isLoading, isConnected } = useMarketData()
 * 
 * ENVIRONMENT VARIABLES:
 * - LIVE_MARKET_WS_URL: WebSocket server URL
 * - LIVE_MARKET_WS_API_KEY: API authentication key
 * - NEXT_PUBLIC_ENABLE_WS_MARKET_DATA: Feature flag
 * 
 * ERROR HANDLING:
 * - Connection failures: Retry with exponential backoff
 * - Disconnections: Use cached prices, show disconnect status
 * - Invalid data: Log warning, skip invalid updates
 * - Subscription errors: Emit error event, continue with other subscriptions
 * 
 * @author Trading Platform Team
 * @date 2025-10-28
 * @updated 2026-03-24 — No-quote/subscription-error resubscribe with backoff & hard unsubscribe; quote-accurate idle tracking; warmup multi-phase subscribe.
 * @updated 2026-05-07 — Tick-flow watchdog (45s feed-silence → forceReconnect); tiered no-quote backoff with infinite retries; never wipe quotes on disconnect (per-quote staleness handles UX).
 * @updated 2026-05-07 — Stop tearing down the rAF enhancement loop on every upstream tick by removing wsData.quotes from its deps (the loop already reads from rawQuotesRef).
 * @updated 2026-05-08 — Diagnostic-only props: urlOverride, apiKeyOverride, onTransportEvent (used by /test-websocket). Overrides bypass the production-throw guard since the operator is explicitly opting in to a custom gateway. Forwards every observable socket event (connected/disconnected/error/subscriptionConfirmed/initError) — priceUpdate is excluded; subscribe to `quotes` for tick-level data.
 */

"use client";

import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from "react";
import { useEnhancedWatchlists } from "@/lib/hooks/use-prisma-watchlist";
import { useTradingRealtime } from "@/components/trading/realtime/trading-realtime-provider";
import { useWebSocketMarketData } from "../hooks/useWebSocketMarketData";
import { INDEX_INSTRUMENTS } from "../utils/instrumentMapper";
import type {
  MarketDataContextType,
  MarketDataConfig,
  EnhancedQuote,
  MarketDisplayQuoteFreshness,
  MarketDisplayUiPolicy,
  SubscriptionKey,
  SubscriptionMode,
  MarketQuoteWarmupInput,
  MarketQuoteWarmupResult,
} from "./types";
import {
  DEFAULT_MARKET_DISPLAY_CONFIG_V1,
  type MarketDisplayConfigV1,
  buildTokenToSegmentMap,
} from "@/lib/market-display/market-display-config.schema";
import {
  buildTokenStrSetFromSubscriptionKeys,
  enhanceQuotesTick,
  type InterpolationState,
} from "@/lib/market-display/apply-quote-enhancements";
import {
  buildSegmentJitterSessionOpenMap,
  buildUniformSegmentJitterSessionOpenMap,
} from "@/lib/market-display/segment-jitter-session";
import { createClientLogger } from "@/lib/logging/client-logger";
import { normalizeMarketDataPositiveToken } from "@/lib/market-data/market-data-number-utils";
import {
  normalizeSubscriptionKey,
  parseTokenFromInstrumentId,
  resolveDisplayQuoteSnapshot,
  resolveQuoteFromMap,
  resolveSubscriptionIdentity,
} from "@/lib/market-data/utils/quote-lookup";
import { getMarketSession } from "@/lib/hooks/market-timing"

// Default configuration matching old provider
const DEFAULT_CONFIG: MarketDataConfig = {
  jitter: {
    enabled: false,
    interval: 250,
    intensity: 0.15,
    convergence: 0.1,
    maxAbsPctOfLtp: 0.2,
  },
  deviation: {
    enabled: false,
    percentage: 0,
    absolute: 0,
  },
  interpolation: {
    enabled: false,
    steps: 50,
    duration: 2800,
    easing: "linear",
  },
};
const SUBSCRIPTION_CHUNK_SIZE = 400
/** Debounce rapid subscribe/unsubscribe cycles to stay within WS_SUBSCRIBE_RPS / WS_UNSUBSCRIBE_RPS limits. */
const SUBSCRIPTION_DEBOUNCE_MS = 500
const IDLE_RESUBSCRIBE_AFTER_MS = 60_000
const IDLE_RESUBSCRIBE_POLL_MS = 15_000
/** Grace after subscribe before forced resubscribe when no LTP / token error (market open). */
const NO_QUOTE_RESUBSCRIBE_GRACE_MS = 4_000
/** Base cooldown between attempts; capped by NO_QUOTE_RESUBSCRIBE_MAX_COOLDOWN_MS via tiered backoff. */
const NO_QUOTE_RESUBSCRIBE_COOLDOWN_MS = 5_000
/** Upper cap for tiered backoff (after attempt 8, cooldown saturates here). */
const NO_QUOTE_RESUBSCRIBE_MAX_COOLDOWN_MS = 60_000
const NO_QUOTE_HARD_RETRY_UNSUBSCRIBE_DELAY_MS = 80
/** After tab was hidden this long, refresh transport when visible (sleep / background). */
const TAB_BACK_RECONNECT_AFTER_MS = 30_000
/**
 * Tick-flow watchdog: if socket is "connected" but NO market_data event arrives across the
 * whole feed for this long while the market is open, force a transport reconnect. Catches
 * the failure mode where the gateway stays alive (heartbeats OK) but stops fanning out.
 */
const TICK_FLOW_WATCHDOG_SILENCE_MS = 45_000
const TICK_FLOW_WATCHDOG_POLL_MS = 5_000
const QUOTE_WARMUP_WAIT_DEFAULT_MS = 1_200
const QUOTE_WARMUP_POLL_MS = 120
const QUOTE_WARMUP_SUBSCRIBE_STAGGER_MS = 180
const QUOTE_WARMUP_SUBSCRIBE_STAGGER_MS_2 = 350

/**
 * Maps a subscription key to token / instrument hints for `resolveQuoteFromMap`.
 */
function subscriptionKeyToQuoteLookup(
  key: SubscriptionKey,
  canonicalToToken?: ReadonlyMap<string, number>,
): {
  token?: number
  instrumentId?: string | null
} {
  if (typeof key === "number") {
    return { token: key }
  }
  const trimmed = key.trim()
  const upper = trimmed.toUpperCase()
  // Canonical symbols ("NSE:RELIANCE") cannot yield a numeric token via string parsing.
  // Use the canonical→token map populated from subscription_confirmed / watchlist items.
  if (upper.includes(':') && canonicalToToken) {
    const resolved = canonicalToToken.get(upper)
    if (resolved != null) {
      return { token: resolved, instrumentId: upper }
    }
  }
  return {
    instrumentId: upper || null,
    token: parseTokenFromInstrumentId(upper) ?? undefined,
  }
}

function quoteHasUsableLtp(quote: EnhancedQuote | undefined): boolean {
  if (!quote) {
    return false
  }
  const ltp = quote.last_trade_price ?? quote.display_price ?? quote.actual_price
  return typeof ltp === "number" && Number.isFinite(ltp) && ltp > 0
}

const DEFAULT_MARKET_DISPLAY_FRESHNESS: MarketDisplayQuoteFreshness = {
  liveMaxAgeMs: DEFAULT_MARKET_DISPLAY_CONFIG_V1.quoteFreshness.liveMaxAgeMs,
  displayMaxAgeMs: DEFAULT_MARKET_DISPLAY_CONFIG_V1.quoteFreshness.displayMaxAgeMs,
    pnlServerMaxAgeMs: DEFAULT_MARKET_DISPLAY_CONFIG_V1.quoteFreshness.pnlServerMaxAgeMs,
    redisMarketQuoteMaxAgeMs: DEFAULT_MARKET_DISPLAY_CONFIG_V1.quoteFreshness.redisMarketQuoteMaxAgeMs,
    positionPnlQuoteMaxAgeMs: DEFAULT_MARKET_DISPLAY_CONFIG_V1.quoteFreshness.positionPnlQuoteMaxAgeMs,
    marketQuoteRedisWriteMinIntervalMs:
      DEFAULT_MARKET_DISPLAY_CONFIG_V1.quoteFreshness.marketQuoteRedisWriteMinIntervalMs,
}

const DEFAULT_MARKET_DISPLAY_UI: MarketDisplayUiPolicy = {
  disconnectedPriceMode: DEFAULT_MARKET_DISPLAY_CONFIG_V1.ui.disconnectedPriceMode,
  staleBadgeAfterMs: DEFAULT_MARKET_DISPLAY_CONFIG_V1.ui.staleBadgeAfterMs,
  positionFreezeEnabled: DEFAULT_MARKET_DISPLAY_CONFIG_V1.ui.positionFreezeEnabled,
  respectSegmentTradingHoursForJitter:
    DEFAULT_MARKET_DISPLAY_CONFIG_V1.ui.respectSegmentTradingHoursForJitter,
  positionsRowPriceBasis: DEFAULT_MARKET_DISPLAY_CONFIG_V1.ui.positionsRowPriceBasis,
  positionCloseExitPricePolicy:
    DEFAULT_MARKET_DISPLAY_CONFIG_V1.ui.positionCloseExitPricePolicy,
  staleQuotePriceMode: DEFAULT_MARKET_DISPLAY_CONFIG_V1.ui.staleQuotePriceMode,
  quoteBadgesEnabled: DEFAULT_MARKET_DISPLAY_CONFIG_V1.ui.quoteBadgesEnabled,
}

const ENHANCEMENT_CHUNK_KEYS = 250
const QUOTES_DIRTY_EPSILON = 1e-5
const HIDDEN_TAB_MIN_FRAME_MS = 1_000

function enhancementsKillSwitchOff(): boolean {
  return process.env.NEXT_PUBLIC_MARKET_DISPLAY_ENHANCEMENTS === "false"
}

function quotesMapMeaningfullyChanged(
  prev: Record<string, EnhancedQuote>,
  next: Record<string, EnhancedQuote>,
): boolean {
  const prevKeys = Object.keys(prev)
  const nextKeys = Object.keys(next)
  if (prevKeys.length !== nextKeys.length) return true
  for (const k of nextKeys) {
    const a = prev[k]
    const b = next[k]
    if (!a || !b) return true
    if (a.trend !== b.trend) return true
    if (Math.abs((a.display_price ?? 0) - (b.display_price ?? 0)) > QUOTES_DIRTY_EPSILON) {
      return true
    }
    if (Math.abs((a.jitter_offset ?? 0) - (b.jitter_offset ?? 0)) > QUOTES_DIRTY_EPSILON) {
      return true
    }
    if (Math.abs((a.actual_price ?? 0) - (b.actual_price ?? 0)) > QUOTES_DIRTY_EPSILON) {
      return true
    }
  }
  return false
}

// --- Split contexts ---
// Stable context: config, callbacks, UI policy — changes only on config reload or user action
type MarketDataStableContextType = Pick<MarketDataContextType,
  'config' | 'updateConfig' | 'subscribe' | 'unsubscribe' | 'reconnect' |
  'warmupQuote' | 'marketDisplayQuoteFreshness' | 'marketDisplayUi'>

// Live context: quotes + connection state — changes on every WebSocket tick
type MarketDataLiveContextType = Pick<MarketDataContextType,
  'quotes' | 'isLoading' | 'isConnected' | 'error' | 'subscriptionErrorsByToken'>

const DEFAULT_STABLE: MarketDataStableContextType = {
  config: DEFAULT_CONFIG,
  updateConfig: () => {},
  subscribe: () => {},
  unsubscribe: () => {},
  reconnect: () => {},
  warmupQuote: async () => ({ quote: null, source: "NONE" }),
  marketDisplayQuoteFreshness: DEFAULT_MARKET_DISPLAY_FRESHNESS,
  marketDisplayUi: DEFAULT_MARKET_DISPLAY_UI,
}
const DEFAULT_LIVE: MarketDataLiveContextType = {
  quotes: {},
  isLoading: true,
  isConnected: 'disconnected',
  error: null,
  subscriptionErrorsByToken: {},
}

const MarketDataStableContext = createContext<MarketDataStableContextType>(DEFAULT_STABLE)
const MarketDataLiveContext = createContext<MarketDataLiveContextType>(DEFAULT_LIVE)

/** Use for components that only need subscribe/config/policy — NEVER re-renders on quote ticks. */
export function useMarketDataStable(): MarketDataStableContextType {
  return useContext(MarketDataStableContext)
}

/** Use for components that need live quotes/connection state — re-renders on every meaningful tick. */
export function useMarketDataLive(): MarketDataLiveContextType {
  return useContext(MarketDataLiveContext)
}

/** Backward-compat shim — merges stable + live. Use when you need both. */
export function useMarketData(): MarketDataContextType {
  const stable = useMarketDataStable()
  const live = useMarketDataLive()
  return { ...stable, ...live }
}

// Legacy single context — kept for any missed call sites; value is the merged object
const MarketDataContext = createContext<MarketDataContextType>({
  ...DEFAULT_STABLE,
  ...DEFAULT_LIVE,
});

interface MarketDataProviderProps {
  userId: string;
  children: ReactNode;
  config?: Partial<MarketDataConfig>;
  enableWebSocket?: boolean;
  /**
   * Optional: pass explicit position instrument IDs/tokens to avoid any provider-side fetching.
   * If omitted, provider will attempt to read from TradingRealtimeProvider context.
   */
  positionInstrumentIds?: string[];
  positionTokens?: number[];
  /**
   * Diagnostic-only WebSocket URL override. When set, takes precedence over
   * NEXT_PUBLIC_LIVE_MARKET_WS_URL and bypasses the production-throw guard
   * (the operator is explicitly opting in to a custom gateway).
   * Used by /test-websocket; do NOT pass from /dashboard.
   */
  urlOverride?: string;
  /**
   * Diagnostic-only API key override. When set, takes precedence over
   * NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY and bypasses the production-throw guard.
   * Used by /test-websocket; do NOT pass from /dashboard.
   */
  apiKeyOverride?: string;
  /**
   * Diagnostic-only callback fired for every observable socket-level event
   * (connected/disconnected/error/subscriptionConfirmed/initError). Implementation
   * uses a ref internally so re-passing a fresh closure each render does NOT
   * thrash the underlying service.
   */
  onTransportEvent?: import('../hooks/useWebSocketMarketData').UseWebSocketMarketDataConfig['onTransportEvent'];
}

/**
 * WebSocket Market Data Provider
 * 
 * Provides real-time market data via Socket.IO WebSocket connection.
 * Automatically subscribes to user's watchlist, positions, and index instruments.
 */
export function WebSocketMarketDataProvider({
  userId,
  children,
  config: userConfig = {},
  enableWebSocket = true,
  positionInstrumentIds,
  positionTokens,
  urlOverride,
  apiKeyOverride,
  onTransportEvent,
}: MarketDataProviderProps) {
  const [config, setConfig] = useState<MarketDataConfig>({ ...DEFAULT_CONFIG, ...userConfig });
  const [displayDocument, setDisplayDocument] = useState<MarketDisplayConfigV1>(DEFAULT_MARKET_DISPLAY_CONFIG_V1);
  const [enhancedQuotes, setEnhancedQuotes] = useState<Record<string, EnhancedQuote>>({});
  const displayDocumentRef = useRef<MarketDisplayConfigV1>(DEFAULT_MARKET_DISPLAY_CONFIG_V1);
  const rawQuotesRef = useRef<Record<string, EnhancedQuote>>({});
  const jitterOffsetsRef = useRef<Record<string, number>>({});
  const jitterLastAtRef = useRef<Record<string, number>>({});
  const interpolationRef = useRef<Record<string, InterpolationState>>({});
  const previousActualRef = useRef<Record<string, number>>({});
  const lastDisplayRef = useRef<Record<string, number>>({});
  const lastPublishedEnhancedRef = useRef<Record<string, EnhancedQuote>>({});
  const chunkCursorRef = useRef(0);
  const marketDisplayEtagRef = useRef<string | null>(null);
  const lastServerGlobalJsonRef = useRef<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  // Track previous subscriptions for dynamic updates
  const previousSubscriptionsRef = useRef<Map<string, SubscriptionKey>>(new Map());
  /** False while socket session not in sync (disconnected); triggers full provider resubscribe on next connect. */
  const wsSessionWasConnectedRef = useRef(false);
  /** Debounce timer — prevents subscription storms when subscriptionKeys change rapidly (e.g. chart timeframes switching). */
  const subscriptionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const DEBUG = process.env.NEXT_PUBLIC_DEBUG_MARKETDATA === "true" || process.env.NODE_ENV === "development"
  const log = useMemo(() => createClientLogger("WS-PROVIDER"), [])

  // Optional integration with TradingRealtimeProvider (preferred on /dashboard).
  // This avoids duplicated positions fetching inside this provider.
  let tradingRealtime: any | null = null
  try {
    tradingRealtime = useTradingRealtime()
  } catch {
    tradingRealtime = null
  }

  useEffect(() => {
    displayDocumentRef.current = displayDocument;
  }, [displayDocument]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;
    const delays = [0, 400, 1_200];

    const loadOnce = async (): Promise<void> => {
      const headers: Record<string, string> = { Accept: "application/json" };
      const inm = marketDisplayEtagRef.current;
      if (inm) headers["If-None-Match"] = inm;

      const res = await fetch("/api/settings/market-display", {
        cache: "no-store",
        credentials: "include",
        signal: ac.signal,
        headers,
      });

      if (cancelled || ac.signal.aborted) return;

      if (res.status === 304) {
        return;
      }

      const etag = res.headers.get("ETag");
      if (etag) {
        marketDisplayEtagRef.current = etag;
      }

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success || !body?.data) {
        if (!res.ok && res.status >= 500) {
          log.warn("market-display settings fetch failed", { status: res.status });
        }
        return;
      }

      const data = body.data as MarketDisplayConfigV1;
      setDisplayDocument(data);
    };

    const loadWithRetries = async () => {
      for (let i = 0; i < delays.length; i += 1) {
        if (cancelled || ac.signal.aborted) return;
        if (delays[i] > 0) {
          await new Promise((r) => setTimeout(r, delays[i]));
        }
        try {
          await loadOnce();
          return;
        } catch (e: unknown) {
          if ((e as Error)?.name === "AbortError") return;
          if (i === delays.length - 1) {
            log.warn("market-display settings exhausted retries", {
              message: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }
    };

    void loadWithRetries();
    const t = window.setInterval(() => {
      void loadWithRetries();
    }, 90_000);

    return () => {
      cancelled = true;
      ac.abort();
      window.clearInterval(t);
    };
  }, [log]);

  useEffect(() => {
    const json = JSON.stringify(displayDocument.global);
    if (lastServerGlobalJsonRef.current === json) {
      return;
    }
    lastServerGlobalJsonRef.current = json;
    setConfig(displayDocument.global);
  }, [displayDocument]);

  if (DEBUG) {
    log.debug('Initializing WebSocket Market Data Provider', {
      userId,
      enableWebSocket,
      hasTradingRealtime: !!tradingRealtime,
      timestamp: new Date().toISOString(),
    });
  }

  // Trading-q05: pre-fix this had two bugs:
  //   1. The protocol ternary was dead code — both branches returned the
  //      same string, so the window.location.protocol check did nothing.
  //   2. The fallback used '/market-data' as a path, which Socket.IO
  //      interprets as a namespace — connections silently subscribed to
  //      the wrong namespace and missed all ticks. The server-side fallback
  //      (server-market-data.service.ts:143) already used the no-path form,
  //      so client and server diverged on URL shape.
  // Now: in production, NEXT_PUBLIC_LIVE_MARKET_WS_URL is REQUIRED — we
  // throw a clear error if missing rather than silently fall back to a
  // shared host. In dev/test the fallback is allowed but logs a loud warning
  // each render so engineers see they're hitting the shared dev host.
  const wsUrlEnv = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_URL
  const isProductionBuild = process.env.NODE_ENV === "production"
  const FALLBACK_WS_URL = "https://marketdata.vedpragya.com"
  const trimmedUrlOverride =
    typeof urlOverride === "string" && urlOverride.trim().length > 0 ? urlOverride.trim() : null
  const trimmedApiKeyOverride =
    typeof apiKeyOverride === "string" && apiKeyOverride.trim().length > 0
      ? apiKeyOverride.trim()
      : null
  const wsUrl = (() => {
    // Diagnostic override (e.g. /test-websocket) takes precedence over env and
    // bypasses the production throw — the operator is explicitly opting in.
    if (trimmedUrlOverride) return trimmedUrlOverride
    if (wsUrlEnv) return wsUrlEnv
    if (isProductionBuild) {
      const msg =
        "[WS-MD-PROVIDER] NEXT_PUBLIC_LIVE_MARKET_WS_URL is required in production " +
        "but is unset. Refusing to fall back to a hardcoded host. Set the env var " +
        "in Vercel/CI and redeploy."
      log.error(msg)
      throw new Error(msg)
    }
    log.warn(
      `[WS-MD-PROVIDER] NEXT_PUBLIC_LIVE_MARKET_WS_URL unset — using dev fallback ${FALLBACK_WS_URL}. ` +
        "Set this env var in your .env.local for proper isolation.",
    )
    return FALLBACK_WS_URL
  })()
  // Trading-20s: same prod-throw / dev-warn policy as the URL fallback. The
  // hardcoded "demo-key-1" was a footgun — a prod deploy missing the env var
  // would silently auth against the gateway with the demo string and either
  // fail with WS_AUTH_INVALID or hit a misconfigured demo namespace.
  const apiKeyEnv = process.env.NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY
  const FALLBACK_API_KEY = "demo-key-1"
  const apiKey = (() => {
    if (trimmedApiKeyOverride) return trimmedApiKeyOverride
    if (apiKeyEnv) return apiKeyEnv
    if (isProductionBuild) {
      const msg =
        "[WS-MD-PROVIDER] NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY is required in production " +
        "but is unset. Refusing to connect with the hardcoded demo key. Set the env var " +
        "in Vercel/CI and redeploy."
      log.error(msg)
      throw new Error(msg)
    }
    log.warn(
      `[WS-MD-PROVIDER] NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY unset — using dev fallback '${FALLBACK_API_KEY}'. ` +
        "Set this env var in your .env.local for proper authentication.",
    )
    return FALLBACK_API_KEY
  })()
  const isEnabled = process.env.NEXT_PUBLIC_ENABLE_WS_MARKET_DATA === 'true' || enableWebSocket;

  if (DEBUG) {
    log.debug('Configuration', {
      wsUrl,
      isEnabled,
      hasApiKey: !!apiKey,
    });
  }

  // Stable wrapper around onTransportEvent — the test page can pass a fresh closure
  // every render without forcing initializeService() to re-run (which would tear down
  // and recreate the underlying socket on every keystroke).
  const onTransportEventRef = useRef(onTransportEvent);
  useEffect(() => {
    onTransportEventRef.current = onTransportEvent;
  }, [onTransportEvent]);
  const stableOnTransportEvent = useMemo(() => {
    if (!onTransportEvent) return undefined;
    return (event: import('../hooks/useWebSocketMarketData').WSTransportEvent) => {
      onTransportEventRef.current?.(event);
    };
    // We only care whether a callback EXISTS, not its identity — so depend on the
    // boolean presence to avoid re-creating the wrapper on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(onTransportEvent)]);

  const wsMarketDataHookConfig = useMemo(
    () => ({
      url: wsUrl,
      apiKey,
      autoConnect: isEnabled,
      reconnectAttempts: 0,
      reconnectDelay: 5000,
      maxReconnectDelayMs: 60_000,
      heartbeatInterval: 30000,
      enableJitter: false,
      enableInterpolation: false,
      onTransportEvent: stableOnTransportEvent,
    }),
    [wsUrl, apiKey, isEnabled, stableOnTransportEvent],
  );

  const wsData = useWebSocketMarketData(wsMarketDataHookConfig);

  const lastQuoteUpdateByKeyRef = useRef<Map<string, number>>(new Map())
  /** Maps normalized canonical symbol → numeric token for watchdog quote/tick lookup. */
  const canonicalToTokenRef = useRef<Map<string, number>>(new Map())
  /** Tracks keys we expect a first tick for; drives no-quote resubscribe. */
  const pendingQuoteSinceByKeyRef = useRef<Map<string, number>>(new Map())
  const lastForceResubscribeAtByKeyRef = useRef<Map<string, number>>(new Map())
  const forceResubscribeAttemptsByKeyRef = useRef<Map<string, number>>(new Map())
  /** Latest connection state for timeouts/async warmup (avoid stale closures). */
  const wsConnectedRef = useRef(wsData.isConnected)
  const wsQuotesRef = useRef(wsData.quotes)
  const subscriptionErrorsRef = useRef(wsData.subscriptionErrorsByToken)
  /** Updated on `visibilitychange` → hidden; used to avoid spurious reconnect on first paint. */
  const lastTabHiddenAtRef = useRef<number>(0)
  const quotesRef = useRef<Record<string, EnhancedQuote>>({})

  useEffect(() => {
    wsConnectedRef.current = wsData.isConnected
  }, [wsData.isConnected])

  useEffect(() => {
    wsQuotesRef.current = wsData.quotes
  }, [wsData.quotes])

  useEffect(() => {
    subscriptionErrorsRef.current = wsData.subscriptionErrorsByToken
  }, [wsData.subscriptionErrorsByToken])

  useEffect(() => {
    if (wsData.isConnected !== "connected") {
      pendingQuoteSinceByKeyRef.current.clear()
      lastForceResubscribeAtByKeyRef.current.clear()
      forceResubscribeAttemptsByKeyRef.current.clear()
    }
  }, [wsData.isConnected])

  useEffect(() => {
    if (wsData.isConnected !== "connected") {
      wsSessionWasConnectedRef.current = false;
    }
  }, [wsData.isConnected]);

  useEffect(() => {
    if (!isEnabled || typeof window === "undefined") {
      return;
    }

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        lastTabHiddenAtRef.current = Date.now();
        return;
      }
      if (lastTabHiddenAtRef.current === 0) {
        return;
      }
      const hiddenMs = Date.now() - lastTabHiddenAtRef.current;
      if (hiddenMs < TAB_BACK_RECONNECT_AFTER_MS) {
        return;
      }
      if (wsData.isConnected === "connected") {
        if (DEBUG) {
          log.debug("Tab visible after background; reconnectTransport", { hiddenMs });
        }
        wsData.reconnectTransport();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isEnabled, wsData.isConnected, wsData.reconnectTransport, DEBUG, log]);

  useEffect(() => {
    if (!isEnabled || typeof window === "undefined") {
      return;
    }
    const onOnline = () => {
      if (DEBUG) {
        log.debug("navigator online; reconnectTransport");
      }
      wsData.reconnectTransport();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [isEnabled, wsData.reconnectTransport, DEBUG, log]);

  useEffect(() => {
    if (!isEnabled || typeof window === "undefined") {
      return;
    }
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) {
        return;
      }
      if (DEBUG) {
        log.debug("pageshow persisted (bfcache); reconnectTransport");
      }
      wsData.reconnectTransport();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [isEnabled, wsData.reconnectTransport, DEBUG, log]);

  // Per-token last tick time from quote payloads (avoid resetting idle timers on unrelated keys).
  // Also tracks the latest tick time across the WHOLE feed for the tick-flow watchdog below.
  const lastAnyTickAtRef = useRef<number>(0)
  useEffect(() => {
    const quotes = wsData.quotes || {}
    const map = lastQuoteUpdateByKeyRef.current
    let maxTickAt = lastAnyTickAtRef.current
    for (const quote of Object.values(quotes)) {
      if (!quote?.instrumentToken) {
        continue
      }
      const tokenKey = String(quote.instrumentToken)
      const t = quote.lastUpdateTime ?? quote.timestamp
      if (typeof t !== "number" || !Number.isFinite(t)) {
        continue
      }
      const prev = map.get(tokenKey)
      if (prev === undefined || t > prev) {
        map.set(tokenKey, t)
      }
      if (t > maxTickAt) {
        maxTickAt = t
      }
    }
    if (maxTickAt > lastAnyTickAtRef.current) {
      lastAnyTickAtRef.current = maxTickAt
    }
  }, [wsData.quotes])

  // Tick-flow watchdog: socket can stay "connected" while the upstream gateway has stopped
  // emitting market_data events. Per-token recovery only fires after 60s idle per symbol,
  // and only catches symbols with subscriptions. The watchdog catches the global failure
  // mode by forcing a transport reconnect when the WHOLE feed has been silent for 45s while
  // the market is open. Reset implicitly via lastAnyTickAtRef on every inbound tick.
  useEffect(() => {
    if (!isEnabled || typeof window === "undefined") {
      return
    }
    if (wsData.isConnected !== "connected") {
      return
    }

    // Anchor the watchdog from "now" on (re)connect — without this, a long disconnect makes
    // the silence age-since-last-tick artificially huge and would trigger reconnect immediately.
    if (lastAnyTickAtRef.current === 0) {
      lastAnyTickAtRef.current = Date.now()
    }
    const reconnectAnchor = Date.now()

    const timer = window.setInterval(() => {
      if (getMarketSession() !== "open") {
        return
      }
      const now = Date.now()
      const lastTick = lastAnyTickAtRef.current
      // Use the larger of (last tick, connect anchor) so the watchdog only triggers based on
      // silence since this connection was established. Prevents loop if reconnect doesn't help.
      const referencePoint = Math.max(lastTick, reconnectAnchor)
      const silenceMs = now - referencePoint
      if (silenceMs >= TICK_FLOW_WATCHDOG_SILENCE_MS) {
        if (DEBUG) {
          log.warn("Tick-flow watchdog: silence exceeded, forcing transport reconnect", {
            silenceMs,
            threshold: TICK_FLOW_WATCHDOG_SILENCE_MS,
          })
        }
        // Reset so we don't re-fire immediately if the new connection takes a beat to handshake.
        lastAnyTickAtRef.current = now
        wsData.reconnectTransport()
      }
    }, TICK_FLOW_WATCHDOG_POLL_MS)

    return () => window.clearInterval(timer)
  }, [isEnabled, wsData.isConnected, wsData.reconnectTransport, DEBUG, log])

  useEffect(() => {
    quotesRef.current = enhancedQuotes
  }, [enhancedQuotes])

  // Watchlist source of truth (same REST/SWR data used by WatchlistManager).
  const { watchlists } = useEnhancedWatchlists(userId)

  const watchlistSubscriptionInfo = useMemo(() => {
    const normalizedKeys = new Set<string>()
    const subscriptionKeys: SubscriptionKey[] = []
    const tokens = new Set<number>()
    // Maps normalized canonical symbol → numeric token for no-quote watchdog lookup.
    const canonicalToToken = new Map<string, number>()
    const unresolvedItems: Array<{
      watchlistId: string | null
      watchlistItemId: string | null
      symbol: string | null
      exchange: string | null
      instrumentId: string | null
    }> = []
    for (const wl of watchlists || []) {
      for (const it of wl.items || []) {
        const identity = resolveSubscriptionIdentity({
          token: (it as any)?.token,
          instrumentId: (it as any)?.instrumentId,
          exchange: (it as any)?.exchange,
          segment: (it as any)?.segment,
          canonicalSymbol: (it as any)?.canonicalSymbol,
          uirId: (it as any)?.uirId,
        })
        if (identity.token !== null) {
          tokens.add(identity.token)
        }
        // Track UIR id as an additional quote-map key so the enhancement/watchdog
        // logic can find quotes keyed by uirId (emitted on every tick alongside broker token).
        const rawUirId = (it as any)?.uirId
        if (typeof rawUirId === 'number' && rawUirId > 0) {
          tokens.add(rawUirId)
        }
        if (identity.subscriptionKey !== null) {
          const normalizedKey = normalizeSubscriptionKey(identity.subscriptionKey)
          if (!normalizedKeys.has(normalizedKey)) {
            normalizedKeys.add(normalizedKey)
            subscriptionKeys.push(typeof identity.subscriptionKey === "string" ? normalizedKey : identity.subscriptionKey)
          }
          // Build canonical→token map so the watchdog can resolve quotes by numeric token.
          if (identity.isCanonical && identity.token !== null) {
            canonicalToToken.set(normalizedKey, identity.token)
          }
          continue
        }
        unresolvedItems.push({
          watchlistId: typeof (wl as any)?.id === "string" ? (wl as any).id : null,
          watchlistItemId:
            typeof (it as any)?.watchlistItemId === "string"
              ? (it as any).watchlistItemId
              : typeof (it as any)?.id === "string"
                ? (it as any).id
                : null,
          symbol: typeof (it as any)?.symbol === "string" ? (it as any).symbol : null,
          exchange: typeof (it as any)?.exchange === "string" ? (it as any).exchange : null,
          instrumentId: typeof (it as any)?.instrumentId === "string" ? (it as any).instrumentId : null,
        })
        if (DEBUG) {
          log.debug("watchlist item missing token and parseable instrumentId; skipping subscription", {
            watchlistId: (wl as any)?.id,
            watchlistItemId: (it as any)?.watchlistItemId || (it as any)?.id,
            symbol: (it as any)?.symbol,
            exchange: (it as any)?.exchange,
            instrumentId: (it as any)?.instrumentId,
          })
        }
      }
    }
    return {
      watchlistSubscriptionKeys: subscriptionKeys,
      watchlistTokens: Array.from(tokens),
      unresolvedItems,
      canonicalToToken,
    }
  }, [watchlists, DEBUG, log])
  const watchlistSubscriptionKeys = watchlistSubscriptionInfo.watchlistSubscriptionKeys

  // Keep canonical→token ref in sync with the latest watchlist data.
  useEffect(() => {
    canonicalToTokenRef.current = watchlistSubscriptionInfo.canonicalToToken
  }, [watchlistSubscriptionInfo.canonicalToToken])

  useEffect(() => {
    if (watchlistSubscriptionInfo.unresolvedItems.length === 0) return
    console.warn("⚠️ [WS-PROVIDER] Some watchlist instruments cannot be live-subscribed", {
      unresolvedCount: watchlistSubscriptionInfo.unresolvedItems.length,
      sample: watchlistSubscriptionInfo.unresolvedItems.slice(0, 10),
    })
  }, [watchlistSubscriptionInfo.unresolvedItems])

  const effectivePositionSubscriptionKeys: SubscriptionKey[] = useMemo(() => {
    const normalizedKeys = new Set<string>()
    const keys: SubscriptionKey[] = []
    const addKey = (key: SubscriptionKey | null) => {
      if (key === null) return
      const normalizedKey = normalizeSubscriptionKey(key)
      if (normalizedKeys.has(normalizedKey)) return
      normalizedKeys.add(normalizedKey)
      keys.push(typeof key === "string" ? normalizedKey : key)
    }

    const instrumentIdsCandidate: string[] = Array.isArray(positionInstrumentIds) ? positionInstrumentIds : []
    const realtimeInstrumentIds: string[] = Array.isArray(tradingRealtime?.positionInstrumentIds)
      ? (tradingRealtime.positionInstrumentIds as string[])
      : []

    const idsToUse = instrumentIdsCandidate.length > 0 ? instrumentIdsCandidate : realtimeInstrumentIds
    if (idsToUse.length > 0) {
      for (const instrumentId of idsToUse) {
        const identity = resolveSubscriptionIdentity({ instrumentId })
        addKey(identity.subscriptionKey)
      }
      return keys
    }

    const tokenCandidates: unknown[] =
      Array.isArray(positionTokens) && positionTokens.length > 0
        ? (positionTokens as unknown[])
        : Array.isArray(tradingRealtime?.positionTokens)
          ? (tradingRealtime.positionTokens as unknown[])
          : []

    for (const candidate of tokenCandidates) {
      const normalizedToken = normalizeMarketDataPositiveToken(candidate)
      if (normalizedToken !== null) {
        addKey(normalizedToken)
      }
    }

    return keys
  }, [positionTokens, positionInstrumentIds, tradingRealtime])

  // Collect instrument subscription keys for subscription
  const subscriptionKeys = useMemo(() => {
    const normalizedKeys = new Set<string>()
    const keys: SubscriptionKey[] = []
    const addKey = (key: SubscriptionKey | null) => {
      if (key === null) return
      const normalizedKey = normalizeSubscriptionKey(key)
      if (normalizedKeys.has(normalizedKey)) return
      normalizedKeys.add(normalizedKey)
      keys.push(typeof key === "string" ? normalizedKey : key)
    }

    // Add index instruments (exchange-qualified to avoid auto-resolve issues)
    Object.values(INDEX_INSTRUMENTS).forEach((token) => {
      const normalizedToken = normalizeMarketDataPositiveToken(token)
      if (normalizedToken !== null) {
        addKey(`NSE_EQ-${normalizedToken}`)
      }
    })

    // Add watchlist instruments (REST/SWR watchlists)
    watchlistSubscriptionKeys.forEach((key) => addKey(key))

    // Add position instruments
    if (effectivePositionSubscriptionKeys.length > 0) {
      effectivePositionSubscriptionKeys.forEach((key) => addKey(key))
    } else if (DEBUG) {
      log.debug('No position tokens available; subscribing to index + watchlist only')
    }

    if (DEBUG) {
      log.debug('Collected instrument subscription keys', {
        count: keys.length,
        instruments: keys,
        sources: {
          indexInstruments: Object.values(INDEX_INSTRUMENTS).filter(Boolean).length,
          watchlistItems: watchlistSubscriptionKeys.length,
          positionKeys: effectivePositionSubscriptionKeys.length,
        }
      });
    }

    return keys
  }, [watchlistSubscriptionKeys, effectivePositionSubscriptionKeys, DEBUG, log]);

  const tokenToSegment = useMemo(
    () => buildTokenToSegmentMap(subscriptionKeys),
    [subscriptionKeys],
  );

  const indexTokenStrs = useMemo(() => {
    const s = new Set<string>();
    Object.values(INDEX_INSTRUMENTS).forEach((token) => {
      const normalizedToken = normalizeMarketDataPositiveToken(token);
      if (normalizedToken !== null) {
        s.add(String(normalizedToken));
      }
    });
    return s;
  }, []);

  const positionTokenStrs = useMemo(
    () => buildTokenStrSetFromSubscriptionKeys(effectivePositionSubscriptionKeys),
    [effectivePositionSubscriptionKeys],
  );

  // Use actual numeric tokens directly — buildTokenStrSetFromSubscriptionKeys can't parse canonical
  // symbol keys like "NSE:RELIANCE" (no dash-number pattern), so watchlist tokens would appear empty.
  const watchlistTokenStrs = useMemo(
    () => new Set(watchlistSubscriptionInfo.watchlistTokens.map(t => t.toString())),
    [watchlistSubscriptionInfo.watchlistTokens],
  );

  const effectiveEnhanceConfig = useMemo((): MarketDataConfig => {
    if (reduceMotion) {
      return {
        ...config,
        jitter: { ...config.jitter, enabled: false },
        interpolation: { ...config.interpolation, enabled: false },
      };
    }
    return config;
  }, [config, reduceMotion]);

  useEffect(() => {
    rawQuotesRef.current = wsData.quotes || {};
  }, [wsData.quotes]);

  useEffect(() => {
    if (enhancementsKillSwitchOff()) {
      const raw = wsData.quotes || {};
      const passthrough: Record<string, EnhancedQuote> = {};
      for (const [k, q] of Object.entries(raw)) {
        const a = q.actual_price;
        passthrough[k] = {
          ...q,
          display_price: a,
          last_trade_price: a,
          actual_price: a,
          jitter_offset: 0,
          deviation_offset: 0,
        };
      }
      setEnhancedQuotes(passthrough);
      lastPublishedEnhancedRef.current = passthrough;
      return () => {};
    }

    let raf = 0;
    let lastFrameAt = 0;
    let stopped = false;

    const runFrame = (now: number) => {
      if (stopped) return;
      const hidden = typeof document !== "undefined" && document.hidden;
      const minDelta = hidden ? HIDDEN_TAB_MIN_FRAME_MS : 0;
      if (minDelta > 0 && now - lastFrameAt < minDelta) {
        raf = requestAnimationFrame(runFrame);
        return;
      }
      lastFrameAt = now;
      const nowMs = Date.now();

      const raw = rawQuotesRef.current;
      const rawKeys = Object.keys(raw);
      const doc = displayDocumentRef.current;
      const at = new Date(nowMs);
      const segmentJitterSessionOpen =
        doc.ui.respectSegmentTradingHoursForJitter !== false
          ? buildSegmentJitterSessionOpenMap(at)
          : buildUniformSegmentJitterSessionOpenMap(at);

      const prune = <T extends Record<string, unknown>>(rec: T): T => {
        const next = { ...rec };
        for (const k of Object.keys(next)) {
          if (!rawKeys.includes(k)) {
            delete next[k];
          }
        }
        return next;
      };

      jitterOffsetsRef.current = prune(jitterOffsetsRef.current);
      jitterLastAtRef.current = prune(jitterLastAtRef.current);
      interpolationRef.current = prune(interpolationRef.current);
      previousActualRef.current = prune(previousActualRef.current);
      lastDisplayRef.current = prune(lastDisplayRef.current);

      let processOnly: Set<string> | null = null;
      let baseline: Record<string, EnhancedQuote> | null = null;
      if (rawKeys.length > ENHANCEMENT_CHUNK_KEYS) {
        const sorted = rawKeys.slice().sort();
        const start = chunkCursorRef.current % sorted.length;
        processOnly = new Set<string>();
        for (let i = 0; i < ENHANCEMENT_CHUNK_KEYS; i += 1) {
          processOnly.add(sorted[(start + i) % sorted.length]);
        }
        chunkCursorRef.current = start + ENHANCEMENT_CHUNK_KEYS;
        baseline = lastPublishedEnhancedRef.current;
      }

      const out = enhanceQuotesTick({
        nowMs,
        rawByToken: raw,
        displayConfig: doc,
        globalUiConfig: effectiveEnhanceConfig,
        tokenToSegment,
        indexTokenStrs,
        positionTokenStrs,
        watchlistTokenStrs,
        segmentJitterSessionOpen,
        jitterOffsets: jitterOffsetsRef.current,
        jitterLastAtByToken: jitterLastAtRef.current,
        interpolationByToken: interpolationRef.current,
        previousActualByToken: previousActualRef.current,
        lastDisplayByToken: lastDisplayRef.current,
        processOnlyKeys: processOnly,
        baselineEnhanced: baseline,
      });

      jitterOffsetsRef.current = out.jitterOffsets;
      jitterLastAtRef.current = out.jitterLastAtByToken;
      interpolationRef.current = out.interpolationByToken;
      previousActualRef.current = out.previousActualByToken;
      lastDisplayRef.current = out.lastDisplayByToken;

      const prevSnap = lastPublishedEnhancedRef.current;
      lastPublishedEnhancedRef.current = out.next;
      if (quotesMapMeaningfullyChanged(prevSnap, out.next)) {
        setEnhancedQuotes(out.next);
      }

      if (!stopped) {
        raf = requestAnimationFrame(runFrame);
      }
    };

    raf = requestAnimationFrame(runFrame);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
    // wsData.quotes intentionally NOT in deps — the rAF loop reads from
    // rawQuotesRef.current (kept in sync by the effect right above this one).
    // Including it here would tear down + recreate the rAF loop on every upstream
    // tick, defeating the point of using a ref and creating GC/frame-time jitter
    // proportional to tick rate.
  }, [
    effectiveEnhanceConfig,
    tokenToSegment,
    indexTokenStrs,
    positionTokenStrs,
    watchlistTokenStrs,
  ]);

  // Dynamic subscription management: update subscriptions when instruments change.
  // Debounced by SUBSCRIPTION_DEBOUNCE_MS so rapid subscriptionKeys changes (e.g. chart
  // timeframe switches causing WatchlistOrderDrawer open/close) don't exceed WS_SUBSCRIBE_RPS.
  useEffect(() => {
    if (subscriptionDebounceRef.current) {
      clearTimeout(subscriptionDebounceRef.current)
    }

    const apply = () => {
      if (wsData.isConnected !== 'connected') {
        if (DEBUG) {
          log.debug('Waiting for connection before subscribing', {
            connectionState: wsData.isConnected,
          });
        }
        return;
      }

      if (!wsSessionWasConnectedRef.current) {
        previousSubscriptionsRef.current = new Map();
      }
      wsSessionWasConnectedRef.current = true;

      if (subscriptionKeys.length === 0) {
        console.warn('⚠️ [WS-PROVIDER] No instruments to subscribe to');
        return;
      }

      const currentSubscriptions = new Map<string, SubscriptionKey>()
      for (const key of subscriptionKeys) {
        const normalizedKey = normalizeSubscriptionKey(key)
        if (!currentSubscriptions.has(normalizedKey)) {
          currentSubscriptions.set(normalizedKey, typeof key === "string" ? normalizedKey : key)
        }
      }
      const previousSubscriptions = previousSubscriptionsRef.current

      const addedKeys: SubscriptionKey[] = []
      currentSubscriptions.forEach((key, normalizedKey) => {
        if (!previousSubscriptions.has(normalizedKey)) {
          addedKeys.push(key)
        }
      })

      const removedKeys: SubscriptionKey[] = []
      previousSubscriptions.forEach((key, normalizedKey) => {
        if (!currentSubscriptions.has(normalizedKey)) {
          removedKeys.push(key)
        }
      })

      // Log subscription changes
      if (DEBUG) {
        log.debug('Subscription update check', {
          previousCount: previousSubscriptions.size,
          currentCount: currentSubscriptions.size,
          added: addedKeys.length > 0 ? addedKeys : 'none',
          removed: removedKeys.length > 0 ? removedKeys : 'none',
          allInstruments: Array.from(currentSubscriptions.values()),
        });
      }

      // Unsubscribe from removed instruments
      if (removedKeys.length > 0) {
        for (const rk of removedKeys) {
          const nk = normalizeSubscriptionKey(rk)
          pendingQuoteSinceByKeyRef.current.delete(nk)
          lastForceResubscribeAtByKeyRef.current.delete(nk)
          forceResubscribeAttemptsByKeyRef.current.delete(nk)
        }
        if (DEBUG) {
          log.debug('Unsubscribing from removed instruments', {
            instruments: removedKeys,
            count: removedKeys.length,
          });
        }
        wsData.unsubscribe(removedKeys, 'ohlcv');
      }

      // Subscribe to newly added instruments
      if (addedKeys.length > 0) {
        const pendingStartedAt = Date.now()
        for (const ak of addedKeys) {
          const nk = normalizeSubscriptionKey(ak)
          pendingQuoteSinceByKeyRef.current.set(nk, pendingStartedAt)
          lastForceResubscribeAtByKeyRef.current.delete(nk)
          forceResubscribeAttemptsByKeyRef.current.delete(nk)
        }
        if (DEBUG) {
          log.debug('Subscribing to instruments', {
            instruments: addedKeys,
            count: addedKeys.length,
            mode: 'ohlcv',
          });
        }

        for (let index = 0; index < addedKeys.length; index += SUBSCRIPTION_CHUNK_SIZE) {
          const chunk = addedKeys.slice(index, index + SUBSCRIPTION_CHUNK_SIZE)
          wsData.subscribe(chunk, 'ohlcv');
        }
      }

      // Update previous subscriptions reference
      previousSubscriptionsRef.current = currentSubscriptions
    }

    subscriptionDebounceRef.current = setTimeout(apply, SUBSCRIPTION_DEBOUNCE_MS)

    return () => {
      if (subscriptionDebounceRef.current) {
        clearTimeout(subscriptionDebounceRef.current)
        subscriptionDebounceRef.current = null
      }
    }
  }, [wsData.isConnected, subscriptionKeys, wsData.subscribe, wsData.unsubscribe, DEBUG, log]);

  // Idle retry + no-quote / subscription-error recovery.
  // toNoQuoteRecovery (instruments that never received a usable quote) runs regardless of
  // market session — instruments should self-heal on startup, pre-open, and after clock-skew.
  // toIdleRetry (quiet instruments that had a quote) is market-gated to avoid noisy
  // resubscribes when prices legitimately don't update outside trading hours.
  useEffect(() => {
    if (wsData.isConnected !== "connected") return
    if (subscriptionKeys.length === 0) return

    const timer = window.setInterval(() => {
      const session = getMarketSession()

      const now = Date.now()
      const lastByKey = lastQuoteUpdateByKeyRef.current
      const quotes = wsQuotesRef.current || {}
      const subErrors = subscriptionErrorsRef.current || {}
      const toIdleRetry: SubscriptionKey[] = []
      const toNoQuoteRecovery: Array<{ key: SubscriptionKey; hard: boolean }> = []

      for (const key of subscriptionKeys) {
        const normalizedKey = normalizeSubscriptionKey(key)
        const lookup = subscriptionKeyToQuoteLookup(key, canonicalToTokenRef.current)
        const quote = resolveQuoteFromMap(quotes, {
          token: lookup.token,
          instrumentId: lookup.instrumentId,
        }) as EnhancedQuote | undefined

        const tokenStr = lookup.token != null ? lookup.token.toString() : null
        const hasSubError =
          tokenStr !== null && Object.prototype.hasOwnProperty.call(subErrors, tokenStr)

        if (quoteHasUsableLtp(quote)) {
          pendingQuoteSinceByKeyRef.current.delete(normalizedKey)
          forceResubscribeAttemptsByKeyRef.current.delete(normalizedKey)
          lastForceResubscribeAtByKeyRef.current.delete(normalizedKey)
        }

        const lastFromQuote =
          typeof quote?.lastUpdateTime === "number"
            ? quote.lastUpdateTime
            : typeof quote?.timestamp === "number"
              ? quote.timestamp
              : null
        const lastAt =
          lastFromQuote ??
          lastByKey.get(normalizedKey) ??
          (lookup.token != null ? lastByKey.get(String(lookup.token)) : null) ??
          null

        const pendingSince = pendingQuoteSinceByKeyRef.current.get(normalizedKey)
        const missingOrError = !quoteHasUsableLtp(quote) || hasSubError

        if (missingOrError && pendingSince != null) {
          const age = now - pendingSince
          if (age >= NO_QUOTE_RESUBSCRIBE_GRACE_MS) {
            // Resubscribe forever with tiered cooldown — symbols are never abandoned. Cooldown
            // grows linearly with attempt count and saturates at NO_QUOTE_RESUBSCRIBE_MAX_COOLDOWN_MS
            // so a permanently-broken symbol doesn't burn bandwidth at the 5s rate forever.
            const attempts = forceResubscribeAttemptsByKeyRef.current.get(normalizedKey) ?? 0
            const lastForce = lastForceResubscribeAtByKeyRef.current.get(normalizedKey) ?? 0
            const tieredCooldown = Math.min(
              NO_QUOTE_RESUBSCRIBE_COOLDOWN_MS * Math.max(1, attempts),
              NO_QUOTE_RESUBSCRIBE_MAX_COOLDOWN_MS,
            )
            if (now - lastForce >= tieredCooldown) {
              const hard = attempts % 2 === 1
              toNoQuoteRecovery.push({ key, hard })
              lastForceResubscribeAtByKeyRef.current.set(normalizedKey, now)
              forceResubscribeAttemptsByKeyRef.current.set(normalizedKey, attempts + 1)
            }
          }
        }

        if (!missingOrError && lastAt !== null && now - lastAt >= IDLE_RESUBSCRIBE_AFTER_MS && session === "open") {
          toIdleRetry.push(key)
        }
      }

      if (toNoQuoteRecovery.length > 0) {
        if (DEBUG) {
          log.debug("No-quote or subscription-error resubscribe", {
            count: toNoQuoteRecovery.length,
            instruments: toNoQuoteRecovery.map((e) => e.key),
          })
        }
        for (const { key, hard } of toNoQuoteRecovery) {
          if (hard) {
            wsData.unsubscribe([key], "ohlcv")
            window.setTimeout(() => {
              if (wsConnectedRef.current === "connected") {
                wsData.subscribe([key], "ohlcv")
              }
            }, NO_QUOTE_HARD_RETRY_UNSUBSCRIBE_DELAY_MS)
          } else {
            wsData.subscribe([key], "ohlcv")
          }
        }
      }

      if (toIdleRetry.length === 0) {
        return
      }

      if (DEBUG) {
        log.debug("Idle resubscribe triggered", {
          count: toIdleRetry.length,
          instruments: toIdleRetry,
          idleAfterMs: IDLE_RESUBSCRIBE_AFTER_MS,
        })
      }

      for (let index = 0; index < toIdleRetry.length; index += SUBSCRIPTION_CHUNK_SIZE) {
        const chunk = toIdleRetry.slice(index, index + SUBSCRIPTION_CHUNK_SIZE)
        wsData.subscribe(chunk, "ohlcv")
      }
    }, IDLE_RESUBSCRIBE_POLL_MS)

    return () => window.clearInterval(timer)
  }, [wsData.isConnected, subscriptionKeys, wsData.subscribe, wsData.unsubscribe, DEBUG, log])

  const updateConfig = useCallback((newConfig: Partial<MarketDataConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ...newConfig,
      jitter: { ...prev.jitter, ...newConfig.jitter },
      deviation: { ...prev.deviation, ...newConfig.deviation },
      interpolation: { ...prev.interpolation, ...newConfig.interpolation },
    }));
  }, []);

  // Reconnect handler (transport-only; provider clears subscription diff baseline after disconnect → full resync)
  const reconnect = useCallback(() => {
    log.info('Reconnecting...');
    wsData.reconnect();
  }, [wsData, log]);

  const warmupQuote = useCallback(async (
    input: MarketQuoteWarmupInput,
  ): Promise<MarketQuoteWarmupResult> => {
    const normalizedInstrumentId =
      typeof input.instrumentId === "string" && input.instrumentId.trim().length > 0
        ? input.instrumentId.trim().toUpperCase()
        : null
    const identity = resolveSubscriptionIdentity({
      token: input.token,
      uirId: input.uirId,
      instrumentId: normalizedInstrumentId,
      exchange: input.exchange,
      segment: input.segment,
    })

    const waitFreshMsCandidate = Number(input.waitFreshMs ?? QUOTE_WARMUP_WAIT_DEFAULT_MS)
    const waitFreshMs = Number.isFinite(waitFreshMsCandidate)
      ? Math.max(0, Math.min(3_000, Math.trunc(waitFreshMsCandidate)))
      : QUOTE_WARMUP_WAIT_DEFAULT_MS
    const qf = displayDocumentRef.current.quoteFreshness
    const liveMaxAgeMsCandidate = Number(input.liveMaxAgeMs ?? qf.liveMaxAgeMs)
    const liveMaxAgeMs = Number.isFinite(liveMaxAgeMsCandidate)
      ? Math.max(250, Math.trunc(liveMaxAgeMsCandidate))
      : qf.liveMaxAgeMs
    const displayMaxAgeMsCandidate = Number(input.displayMaxAgeMs ?? qf.displayMaxAgeMs)
    const displayMaxAgeMs = Number.isFinite(displayMaxAgeMsCandidate)
      ? Math.max(1_000, Math.trunc(displayMaxAgeMsCandidate))
      : qf.displayMaxAgeMs

    const resolveCurrentQuote = (): EnhancedQuote | null => {
      const quote = resolveQuoteFromMap(quotesRef.current, {
        token: identity.token ?? input.token,
        instrumentId: normalizedInstrumentId,
      })
      return (quote as EnhancedQuote | undefined) ?? null
    }

    const resolveCurrentSnapshot = (quote: EnhancedQuote | null) =>
      resolveDisplayQuoteSnapshot({
        quote,
        liveMaxAgeMs,
        displayMaxAgeMs,
      })

    const subKey = identity.subscriptionKey
    const bumpWarmupSubscription = (hard: boolean): void => {
      if (subKey === null || wsConnectedRef.current !== "connected") {
        return
      }
      if (hard) {
        wsData.unsubscribe([subKey], "ohlcv")
        window.setTimeout(() => {
          if (wsConnectedRef.current === "connected") {
            wsData.subscribe([subKey], "ohlcv")
          }
        }, NO_QUOTE_HARD_RETRY_UNSUBSCRIBE_DELAY_MS)
      } else {
        wsData.subscribe([subKey], "ohlcv")
      }
    }

    bumpWarmupSubscription(false)
    let currentQuote = resolveCurrentQuote()
    let currentSnapshot = resolveCurrentSnapshot(currentQuote)
    if (currentQuote && currentSnapshot.isFresh) {
      return { quote: currentQuote, source: "WS" }
    }

    await new Promise((r) => window.setTimeout(r, QUOTE_WARMUP_SUBSCRIBE_STAGGER_MS))
    bumpWarmupSubscription(false)
    currentQuote = resolveCurrentQuote()
    currentSnapshot = resolveCurrentSnapshot(currentQuote)
    if (currentQuote && currentSnapshot.isFresh) {
      return { quote: currentQuote, source: "WS" }
    }

    await new Promise((r) => window.setTimeout(r, QUOTE_WARMUP_SUBSCRIBE_STAGGER_MS_2))
    bumpWarmupSubscription(true)
    await new Promise((r) =>
      window.setTimeout(r, NO_QUOTE_HARD_RETRY_UNSUBSCRIBE_DELAY_MS + 120),
    )
    currentQuote = resolveCurrentQuote()
    currentSnapshot = resolveCurrentSnapshot(currentQuote)
    if (currentQuote && currentSnapshot.isFresh) {
      return { quote: currentQuote, source: "WS" }
    }

    if (waitFreshMs > 0) {
      const deadline = Date.now() + waitFreshMs
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, QUOTE_WARMUP_POLL_MS))
        currentQuote = resolveCurrentQuote()
        currentSnapshot = resolveCurrentSnapshot(currentQuote)
        if (currentQuote && currentSnapshot.isFresh) {
          return { quote: currentQuote, source: "WS" }
        }
      }
    }

    const fallbackQueryCandidates: string[] = []
    if (typeof identity.subscriptionKey === "string") {
      fallbackQueryCandidates.push(identity.subscriptionKey)
    }
    if (normalizedInstrumentId && !fallbackQueryCandidates.includes(normalizedInstrumentId)) {
      fallbackQueryCandidates.push(normalizedInstrumentId)
    }
    if (identity.token !== null) {
      const tokenKey = identity.token.toString()
      if (!fallbackQueryCandidates.includes(tokenKey)) {
        fallbackQueryCandidates.push(tokenKey)
      }
    }

    const parsePositive = (value: unknown): number | null => {
      const parsedValue = Number(value)
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        return null
      }
      return parsedValue
    }

    for (const queryKey of fallbackQueryCandidates) {
      try {
        const response = await fetch(`/api/quotes?q=${encodeURIComponent(queryKey)}&mode=ltp`, {
          cache: "no-store",
        })
        if (!response.ok) {
          continue
        }
        const body = await response.json()
        const payload = body?.success ? body?.data : body
        if (!payload || typeof payload !== "object") {
          continue
        }

        const payloadRecord = payload as Record<string, any>
        const fallbackKeys = [
          queryKey,
          queryKey.toUpperCase(),
          normalizedInstrumentId ?? "",
          normalizedInstrumentId?.toUpperCase() ?? "",
          identity.token !== null ? identity.token.toString() : "",
        ].filter(Boolean)

        let apiQuote: Record<string, any> | null = null
        for (const key of fallbackKeys) {
          if (payloadRecord[key] && typeof payloadRecord[key] === "object") {
            apiQuote = payloadRecord[key]
            break
          }
        }

        if (!apiQuote) {
          const values = Object.values(payloadRecord)
          if (values.length === 1 && values[0] && typeof values[0] === "object") {
            apiQuote = values[0] as Record<string, any>
          }
        }

        if (!apiQuote) {
          continue
        }

        const ltp =
          parsePositive(apiQuote?.last_trade_price) ??
          parsePositive(apiQuote?.ltp) ??
          parsePositive(apiQuote?.last_price)
        if (ltp === null) {
          continue
        }

        const prevClose =
          parsePositive(apiQuote?.prev_close_price) ??
          parsePositive(apiQuote?.close) ??
          parsePositive(apiQuote?.ohlc?.close)

        const resolvedToken =
          identity.token ??
          normalizeMarketDataPositiveToken(apiQuote?.instrumentToken) ??
          normalizeMarketDataPositiveToken(apiQuote?.token) ??
          parseTokenFromInstrumentId(normalizedInstrumentId)
        if (resolvedToken === null) {
          continue
        }

        const nowMs = Date.now()
        const previousQuote = quotesRef.current[resolvedToken.toString()]
        const trend: EnhancedQuote["trend"] =
          previousQuote && ltp > previousQuote.last_trade_price
            ? "up"
            : previousQuote && ltp < previousQuote.last_trade_price
              ? "down"
              : "neutral"

        const normalizedQuote: EnhancedQuote = {
          instrumentToken: resolvedToken,
          last_trade_price: ltp,
          prev_close_price: prevClose ?? undefined,
          display_price: ltp,
          actual_price: ltp,
          trend,
          jitter_offset: 0,
          deviation_offset: 0,
          timestamp: nowMs,
          lastUpdateTime: nowMs,
        }

        quotesRef.current = {
          ...quotesRef.current,
          [resolvedToken.toString()]: normalizedQuote,
        }
        lastQuoteUpdateByKeyRef.current.set(resolvedToken.toString(), nowMs)
        return { quote: normalizedQuote, source: "API" }
      } catch (error) {
        if (DEBUG) {
          log.debug("quote warmup fallback fetch failed", {
            instrument: queryKey,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }

    currentQuote = resolveCurrentQuote()
    currentSnapshot = resolveCurrentSnapshot(currentQuote)
    if (currentQuote && currentSnapshot.isDisplayable) {
      return { quote: currentQuote, source: "WS" }
    }

    return { quote: null, source: "NONE" }
  }, [wsData.isConnected, wsData.subscribe, wsData.unsubscribe, DEBUG, log])

  // Subscribe handler
  const subscribe = useCallback((instruments: SubscriptionKey[], mode: SubscriptionMode) => {
    log.info('Manual subscription', {
      instruments,
      mode,
      count: instruments.length,
    });
    wsData.subscribe(instruments, mode);
  }, [wsData, log]);

  // Unsubscribe handler
  const unsubscribe = useCallback((instruments: SubscriptionKey[], mode: SubscriptionMode) => {
    log.info('Manual unsubscription', {
      instruments,
      mode,
      count: instruments.length,
    });
    wsData.unsubscribe(instruments, mode);
  }, [wsData, log]);

  // Never wipe the quotes map on disconnect. Every consumer already has access to per-quote
  // freshness (lastUpdateTime, isStale) via the marketDisplayUi policy and quote freshness
  // metadata, so individual components can decide whether to render a dash, a stale badge, or
  // the last-known price. Wholesale-wiping coordinated a UI collapse across every subscribed
  // symbol the instant the socket coughed — the bug behind the "prices flash blank" reports.
  const quotes = enhancedQuotes;

  const marketDisplayQuoteFreshness = useMemo(
    (): MarketDisplayQuoteFreshness => ({
      liveMaxAgeMs: displayDocument.quoteFreshness.liveMaxAgeMs,
      displayMaxAgeMs: displayDocument.quoteFreshness.displayMaxAgeMs,
      pnlServerMaxAgeMs: displayDocument.quoteFreshness.pnlServerMaxAgeMs,
      redisMarketQuoteMaxAgeMs: displayDocument.quoteFreshness.redisMarketQuoteMaxAgeMs,
      positionPnlQuoteMaxAgeMs: displayDocument.quoteFreshness.positionPnlQuoteMaxAgeMs,
      marketQuoteRedisWriteMinIntervalMs: displayDocument.quoteFreshness.marketQuoteRedisWriteMinIntervalMs,
    }),
    [displayDocument.quoteFreshness],
  );

  const marketDisplayUi = useMemo(
    (): MarketDisplayUiPolicy => ({
      disconnectedPriceMode: displayDocument.ui.disconnectedPriceMode,
      staleBadgeAfterMs: displayDocument.ui.staleBadgeAfterMs,
      positionFreezeEnabled: displayDocument.ui.positionFreezeEnabled,
      respectSegmentTradingHoursForJitter: displayDocument.ui.respectSegmentTradingHoursForJitter,
      positionsRowPriceBasis: displayDocument.ui.positionsRowPriceBasis,
      positionCloseExitPricePolicy: displayDocument.ui.positionCloseExitPricePolicy,
      staleQuotePriceMode: displayDocument.ui.staleQuotePriceMode,
      quoteBadgesEnabled: displayDocument.ui.quoteBadgesEnabled,
    }),
    [displayDocument.ui],
  );

  const stableValue = useMemo(
    (): MarketDataStableContextType => ({
      config,
      updateConfig,
      subscribe,
      unsubscribe,
      reconnect,
      warmupQuote,
      marketDisplayQuoteFreshness,
      marketDisplayUi,
    }),
    [config, updateConfig, subscribe, unsubscribe, reconnect, warmupQuote, marketDisplayQuoteFreshness, marketDisplayUi],
  );

  const liveValue = useMemo(
    (): MarketDataLiveContextType => ({
      quotes,
      isLoading: wsData.isLoading,
      isConnected: wsData.isConnected,
      error: wsData.error,
      subscriptionErrorsByToken: wsData.subscriptionErrorsByToken,
    }),
    [quotes, wsData.isLoading, wsData.isConnected, wsData.error, wsData.subscriptionErrorsByToken],
  );

  // Log connection status and subscription updates
  useEffect(() => {
    if (!DEBUG) return
    log.debug('Connection status update', {
      isConnected: wsData.isConnected,
      isLoading: wsData.isLoading,
      activeSubscriptions: wsData.getSubscriptionCount(),
      quotesReceived: Object.keys(quotes).length,
      trackedSubscriptions: previousSubscriptionsRef.current.size,
    });
  }, [wsData.isConnected, wsData.isLoading, quotes, DEBUG, log]);

  // Log watchlist/position changes that trigger subscription updates
  useEffect(() => {
    if (!DEBUG) return
    log.debug('User data update', {
      watchlistItems: watchlistSubscriptionKeys.length,
      positionKeys: effectivePositionSubscriptionKeys.length,
      totalInstruments: subscriptionKeys.length,
      instruments: subscriptionKeys,
    });
  }, [watchlistSubscriptionKeys, effectivePositionSubscriptionKeys, subscriptionKeys, DEBUG, log]);

  return (
    <MarketDataStableContext.Provider value={stableValue}>
      <MarketDataLiveContext.Provider value={liveValue}>
        {children}
      </MarketDataLiveContext.Provider>
    </MarketDataStableContext.Provider>
  );
}

