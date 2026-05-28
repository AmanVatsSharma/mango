/**
 * @file useWebSocketMarketData.ts
 * @description React hook for WebSocket-based real-time market data
 * 
 * PURPOSE:
 * - Provide React hook interface for WebSocket market data
 * - Manage WebSocket connection lifecycle
 * - Handle subscription state
 * - Provide price data to components
 * - Implement loading and error states
 * - Auto-subscribe based on watchlist/positions
 * - Handle reconnection logic
 * 
 * FEATURES:
 * - Real-time price updates via WebSocket
 * - Connection status indicators
 * - Automatic subscription management
 * - Error recovery
 * - Cached price fallback during disconnection
 * - Loading states
 * 
 * DEPENDENCIES:
 * - WebSocketMarketDataService: Business logic layer
 * - React hooks for state management
 * 
 * EXPORTS:
 * - useWebSocketMarketData: Main hook
 * 
 * USAGE:
 * const { quotes, isLoading, isConnected, subscribe, unsubscribe } = useWebSocketMarketData({
 *   url: 'ws://...',
 *   apiKey: '...',
 *   autoConnect: true,
 * });
 * 
 * ERROR HANDLING:
 * - Connection failures: Show error state, retry with reconnection
 * - Disconnections: Use cached prices, show disconnected status
 * - Invalid data: Log error, skip invalid updates
 * 
 * @author Trading Platform Team
 * @date 2025-10-28
 * @updated 2026-03-25 — reconnect uses reconnectTransport; maxReconnectDelayMs; reconnectTransport export.
 * @updated 2026-05-07 — Lazy-init quotes state from globalTickCache so provider remount paints last-known prices instantly.
 * @updated 2026-05-08 — Optional onTransportEvent callback: fires {connected, disconnected, error, subscriptionConfirmed, initError} for diagnostic UIs (/test-websocket). priceUpdate intentionally excluded — consume `quotes` instead. Callback read via ref so re-passing closures does NOT re-init the service.
 */

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { WebSocketMarketDataService } from '../services/WebSocketMarketDataService';
import { getGlobalTickCache } from '../services/global-tick-cache';
import type {
  EnhancedQuote,
  ConnectionState,
  WSMarketDataError,
  SubscriptionMode,
  SubscriptionKey,
} from '../providers/types';
import { parsePositiveIntegerMarketNumber } from "@/lib/market-data/utils/quote-lookup"

/**
 * Build a quotes-by-token-string record from a Map<token, EnhancedQuote>. Used to seed
 * React state on service init so the first paint after a remount carries last-known prices.
 */
function seedQuotesFromGlobalCache(): Record<string, EnhancedQuote> {
  const cache = getGlobalTickCache();
  if (cache.size === 0) return {};
  const seeded: Record<string, EnhancedQuote> = {};
  cache.forEach((quote, token) => {
    seeded[token.toString()] = quote;
  });
  return seeded;
}

const DEBUG_WS_HOOK =
  process.env.NEXT_PUBLIC_DEBUG_REALTIME === 'true' ||
  process.env.NEXT_PUBLIC_DEBUG_MARKETDATA === 'true' ||
  process.env.NODE_ENV === 'development';

function marketHookDebug(...args: any[]): void {
  if (!DEBUG_WS_HOOK) return;
  console.log(...args);
}

/**
 * Diagnostic transport event surfaced from the underlying WebSocketMarketDataService.
 * Forwarded to consumers via `UseWebSocketMarketDataConfig.onTransportEvent` so a
 * diagnostic page (e.g. /test-websocket) can render every socket-level event without
 * reaching into the service. `priceUpdate` is intentionally NOT forwarded — every tick
 * already mutates `quotes` and forwarding it would drown the log at high rates.
 */
export type WSTransportEvent =
  | { type: 'connected'; timestamp: number; data?: unknown }
  | { type: 'disconnected'; timestamp: number; data?: unknown }
  | { type: 'subscriptionConfirmed'; timestamp: number; data?: unknown }
  | { type: 'error'; timestamp: number; data?: unknown }
  | { type: 'initError'; timestamp: number; data?: unknown };

/**
 * Configuration for useWebSocketMarketData hook
 */
export interface UseWebSocketMarketDataConfig {
  url: string;
  apiKey: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelayMs?: number;
  heartbeatInterval?: number;
  enableJitter?: boolean;
  enableInterpolation?: boolean;
  /**
   * Diagnostic-only callback fired for every observable socket-level event. Read via a
   * ref inside the hook so passing a fresh closure every render does NOT re-init the
   * service. priceUpdate is excluded; subscribe to `quotes` for tick-level data.
   */
  onTransportEvent?: (event: WSTransportEvent) => void;
}

/**
 * Return type for useWebSocketMarketData hook
 */
export interface UseWebSocketMarketDataReturn {
  // Price data
  quotes: Record<string, EnhancedQuote>;
  
  // Connection state
  isConnected: ConnectionState;
  isLoading: boolean;
  error: WSMarketDataError | null;

  // Subscription errors (token-scoped; does not imply socket disconnect)
  subscriptionErrorsByToken: Record<string, WSMarketDataError>;
  
  // Subscription management
  subscribe: (instruments: SubscriptionKey[], mode: SubscriptionMode) => void;
  unsubscribe: (instruments: SubscriptionKey[], mode: SubscriptionMode) => void;
  
  // Connection management
  connect: () => Promise<void>;
  disconnect: () => void;
  reconnect: () => void;
  /** Same socket credentials; tears down transport and resubscribes service-side state. */
  reconnectTransport: () => void;
  
  // Utilities
  getPrice: (instrumentToken: number) => EnhancedQuote | null;
  getSubscriptionCount: () => number;
}

/**
 * React hook for WebSocket market data
 * 
 * Manages:
 * - WebSocket connection lifecycle
 * - Price data state
 * - Subscription management
 * - Error handling
 * - Connection status
 * 
 * @param config - Configuration for WebSocket connection
 * @returns Market data state and control functions
 */
export function useWebSocketMarketData(
  config: UseWebSocketMarketDataConfig
): UseWebSocketMarketDataReturn {
  // Seed from global tick cache so a provider remount paints last-known prices instantly
  // instead of an empty map that resolves only when the next tick arrives.
  const [quotes, setQuotes] = useState<Record<string, EnhancedQuote>>(seedQuotesFromGlobalCache);
  const [isConnected, setIsConnected] = useState<ConnectionState>('disconnected');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<WSMarketDataError | null>(null);
  const [subscriptionErrorsByToken, setSubscriptionErrorsByToken] = useState<Record<string, WSMarketDataError>>({});
  
  const serviceRef = useRef<WebSocketMarketDataService | null>(null);
  const isInitializedRef = useRef(false);
  const connectionStateRef = useRef<ConnectionState>('disconnected')
  // Latest transport-event callback in a ref so we can call it from inside service
  // listeners without including the callback in `initializeService`'s deps. This means
  // a consumer (e.g. the test-websocket page) can pass a fresh callback every render
  // without thrashing the service.
  const onTransportEventRef = useRef<((e: WSTransportEvent) => void) | undefined>(config.onTransportEvent)
  useEffect(() => {
    onTransportEventRef.current = config.onTransportEvent
  }, [config.onTransportEvent])
  const fireTransportEvent = useCallback((event: WSTransportEvent) => {
    const cb = onTransportEventRef.current
    if (!cb) return
    try {
      cb(event)
    } catch (err) {
      console.error('[HOOK-WS-MARKET-DATA] onTransportEvent listener threw', err)
    }
  }, [])

  /**
   * Initialize service
   */
  const initializeService = useCallback(async () => {
    // Clear existing service if URL/config changed
    if (serviceRef.current) {
      marketHookDebug('🔄 [HOOK-WS-MARKET-DATA] Clearing existing service before reinitializing...');
      serviceRef.current.disconnect();
      serviceRef.current = null;
      isInitializedRef.current = false;
    }

    marketHookDebug('🚀 [HOOK-WS-MARKET-DATA] Initializing service...', {
      url: config.url,
      apiKey: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : 'missing',
    });
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Create service instance with current config
      const service = new WebSocketMarketDataService({
        url: config.url,
        apiKey: config.apiKey,
        reconnectAttempts: config.reconnectAttempts,
        reconnectDelay: config.reconnectDelay,
        maxReconnectDelayMs: config.maxReconnectDelayMs,
        heartbeatInterval: config.heartbeatInterval,
        enableJitter: config.enableJitter,
        enableInterpolation: config.enableInterpolation,
      });

      // Setup event handlers
      service.on('connected', () => {
        marketHookDebug('✅ [HOOK-WS-MARKET-DATA] Connected');
        connectionStateRef.current = 'connected'
        setIsConnected('connected');
        setIsLoading(false);
        setError(null);
        setSubscriptionErrorsByToken({});
        fireTransportEvent({ type: 'connected', timestamp: Date.now() });
      });

      service.on('disconnected', () => {
        marketHookDebug('❌ [HOOK-WS-MARKET-DATA] Disconnected');
        connectionStateRef.current = 'disconnected'
        setIsConnected('disconnected');
        setIsLoading(false);
        // Retain last known quotes while disconnected. Market ticks can be sparse;
        // UI should keep showing last received price instead of forcing "--".
        setSubscriptionErrorsByToken({});
        fireTransportEvent({ type: 'disconnected', timestamp: Date.now() });
      });

      service.on('error', (err: WSMarketDataError) => {
        console.error('❌ [HOOK-WS-MARKET-DATA] Error', err);
        const normalizedError: WSMarketDataError = {
          code: typeof (err as any)?.code === 'string' ? (err as any).code : 'UNKNOWN_ERROR',
          message: typeof (err as any)?.message === 'string' ? (err as any).message : 'Unknown market-data error',
          timestamp: typeof (err as any)?.timestamp === 'string' ? (err as any).timestamp : new Date().toISOString(),
          token: parsePositiveIntegerMarketNumber((err as any)?.token) ?? undefined,
          instrumentToken: parsePositiveIntegerMarketNumber((err as any)?.instrumentToken) ?? undefined,
          details: (err as any)?.details,
        };

        const token =
          normalizedError.token ??
          normalizedError.instrumentToken ??
          parsePositiveIntegerMarketNumber((err as any)?.instrument_token) ??
          undefined;

        // Token-scoped subscription errors must NOT flip global connectivity.
        if (typeof token === 'number' && token > 0) {
          setSubscriptionErrorsByToken((prev) => ({
            ...prev,
            [token.toString()]: { ...normalizedError, token },
          }));
          return;
        }

        // Connection-level errors: mark offline but retain last quotes.
        const connectionFatal =
          normalizedError.code === 'CONNECTION_ERROR' ||
          normalizedError.code === 'INIT_ERROR' ||
          normalizedError.code === 'AUTH_ERROR' ||
          normalizedError.code === 'UNAUTHORIZED' ||
          normalizedError.code === 'FORBIDDEN' ||
          normalizedError.code === 'INVALID_API_KEY';

        setError(normalizedError);
        setIsLoading(false);

        if (connectionFatal) {
          connectionStateRef.current = 'error'
          setIsConnected('error');
        }
        fireTransportEvent({ type: 'error', timestamp: Date.now(), data: normalizedError });
      });

      service.on('subscriptionConfirmed', (data) => {
        marketHookDebug('✅ [HOOK-WS-MARKET-DATA] Subscription confirmed', {
          instruments: data?.instruments || 'unknown',
          mode: data?.mode || 'unknown',
        });
        fireTransportEvent({ type: 'subscriptionConfirmed', timestamp: Date.now(), data });
      });

      service.on('priceUpdate', (data: { quote?: EnhancedQuote; quotes?: EnhancedQuote[]; changedQuotes?: EnhancedQuote[] }) => {
        if (connectionStateRef.current !== 'connected') {
          return
        }
        const incomingQuotes = Array.isArray(data?.changedQuotes)
          ? data.changedQuotes
          : Array.isArray(data?.quotes)
            ? data.quotes
            : data?.quote
              ? [data.quote]
              : []
        if (incomingQuotes.length === 0) return

        marketHookDebug('📊 [HOOK-WS-MARKET-DATA] Price update', {
          count: incomingQuotes.length,
          tokens: incomingQuotes.map(q => q.instrumentToken),
        });

        const updatedTokenKeys = incomingQuotes.map((quote) => quote.instrumentToken.toString())
        setSubscriptionErrorsByToken((prev) => {
          const prevKeys = Object.keys(prev || {})
          if (prevKeys.length === 0) return prev
          let changed = false
          const next = { ...prev }
          for (const tokenKey of updatedTokenKeys) {
            if (Object.prototype.hasOwnProperty.call(next, tokenKey)) {
              delete next[tokenKey]
              changed = true
            }
          }
          return changed ? next : prev
        })
        
        // Merge only changed quote keys to reduce render churn on high tick rates.
        setQuotes((prevQuotes) => {
          let changed = false
          const nextQuotes: Record<string, EnhancedQuote> = { ...prevQuotes }

          incomingQuotes.forEach((quote) => {
            const quoteKey = quote.instrumentToken.toString()
            const existing = prevQuotes[quoteKey]
            const isFresh =
              !existing ||
              existing.lastUpdateTime !== quote.lastUpdateTime ||
              existing.last_trade_price !== quote.last_trade_price ||
              existing.display_price !== quote.display_price
            if (isFresh) {
              nextQuotes[quoteKey] = quote
              // Key by UIR id (provider-agnostic, stable across broker changes).
              if (quote.uirId !== undefined && quote.uirId !== quote.instrumentToken) {
                nextQuotes[quote.uirId.toString()] = quote
              }
              // Key by providerToken (subscription-key token, e.g. kite index 26000)
              // so static lookups by well-known token continue to work.
              if (quote.providerToken !== undefined) {
                nextQuotes[quote.providerToken.toString()] = quote
              }
              changed = true
            }
          })

          return changed ? nextQuotes : prevQuotes
        })
      });

      // Initialize and connect
      await service.initialize();
      
      serviceRef.current = service;
      isInitializedRef.current = true;
      
      marketHookDebug('✅ [HOOK-WS-MARKET-DATA] Service initialized');
    } catch (err) {
      console.error('❌ [HOOK-WS-MARKET-DATA] Failed to initialize', err);
      const initError = {
        code: 'INIT_ERROR',
        message: (err as Error).message,
        timestamp: new Date().toISOString(),
      };
      setError(initError);
      setIsConnected('error');
      setIsLoading(false);
      fireTransportEvent({ type: 'initError', timestamp: Date.now(), data: initError });
    }
  }, [config, fireTransportEvent]);

  /**
   * Connect to WebSocket
   */
  const connect = useCallback(async () => {
    marketHookDebug('🔌 [HOOK-WS-MARKET-DATA] Connecting...', {
      url: config.url,
      apiKey: config.apiKey ? `${config.apiKey.substring(0, 8)}...` : 'missing',
      hasService: !!serviceRef.current,
      isInitialized: isInitializedRef.current,
    });

    setError(null);
    setIsConnected('connecting');
    setIsLoading(true);
    
    // Always reinitialize service to ensure we use latest URL/config
    // This is important if URL changed after hook initialization
    if (!serviceRef.current || !isInitializedRef.current) {
      marketHookDebug('🔌 [HOOK-WS-MARKET-DATA] Initializing service (new or stale)...');
      await initializeService();
      return;
    } else {
      marketHookDebug('🔌 [HOOK-WS-MARKET-DATA] Service already initialized, using existing connection');
      // Service exists - if it's connected, we're good; if not, it should reconnect automatically
      // But if we need to force connect, we could call service.connect() here if that method exists
      if (serviceRef.current.isConnected) {
        setIsConnected('connected');
        setIsLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializeService]); // Only depend on initializeService, config is accessed via closure

  /**
   * Disconnect from WebSocket
   */
  const disconnect = useCallback(() => {
    marketHookDebug('🔌 [HOOK-WS-MARKET-DATA] Disconnecting...');
    
    if (serviceRef.current) {
      serviceRef.current.disconnect();
      serviceRef.current = null;
      isInitializedRef.current = false;
    }
    
    setIsConnected('disconnected');
    setIsLoading(false);
  }, []);

  /**
   * Reconnect — prefer transport refresh so subscription state survives (provider diff still resyncs).
   */
  const reconnectTransport = useCallback(() => {
    marketHookDebug('🔄 [HOOK-WS-MARKET-DATA] reconnectTransport');
    if (serviceRef.current) {
      serviceRef.current.reconnectTransport();
      return;
    }
    void connect();
  }, [connect]);

  const reconnect = useCallback(async () => {
    marketHookDebug('🔄 [HOOK-WS-MARKET-DATA] Reconnecting...');
    if (serviceRef.current) {
      reconnectTransport();
      return;
    }
    await connect();
  }, [connect, reconnectTransport]);

  /**
   * Subscribe to instruments
   */
  const subscribe = useCallback((instruments: SubscriptionKey[], mode: SubscriptionMode) => {
    if (!serviceRef.current) {
      console.warn('⚠️ [HOOK-WS-MARKET-DATA] Cannot subscribe - service not initialized');
      return;
    }
    
    if (!serviceRef.current.isConnected) {
      console.warn('⚠️ [HOOK-WS-MARKET-DATA] Cannot subscribe - not connected');
      return;
    }

    marketHookDebug('📡 [HOOK-WS-MARKET-DATA] Subscribing', {
      instruments,
      mode,
      count: instruments.length,
    });
    
    serviceRef.current.subscribeToInstruments(instruments, mode);
  }, []);

  /**
   * Unsubscribe from instruments
   */
  const unsubscribe = useCallback((instruments: SubscriptionKey[], mode: SubscriptionMode) => {
    if (!serviceRef.current) {
      console.warn('⚠️ [HOOK-WS-MARKET-DATA] Cannot unsubscribe - service not initialized');
      return;
    }
    
    marketHookDebug('🚫 [HOOK-WS-MARKET-DATA] Unsubscribing', {
      instruments,
      mode,
      count: instruments.length,
    });
    
    serviceRef.current.unsubscribeFromInstruments(instruments);
  }, []);

  /**
   * Get price for instrument
   */
  const getPrice = useCallback((instrumentToken: number): EnhancedQuote | null => {
    return quotes[instrumentToken.toString()] || null;
  }, [quotes]);

  /**
   * Get subscription count
   */
  const getSubscriptionCount = useCallback((): number => {
    return Object.keys(quotes).length;
  }, [quotes]);

  /**
   * Auto-connect on mount
   * Only cleanup on unmount, not on config changes
   */
  useEffect(() => {
    if (config.autoConnect) {
      connect();
    }

    // Only cleanup on unmount - don't disconnect when config/connect/disconnect change
    return () => {
      if (serviceRef.current) {
        marketHookDebug('🧹 [HOOK-WS-MARKET-DATA] Cleaning up on unmount...');
        serviceRef.current.disconnect();
        serviceRef.current = null;
        isInitializedRef.current = false;
      }
    };
    // Only depend on autoConnect flag - don't re-run when connect/disconnect functions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.autoConnect]);

  return {
    quotes,
    isConnected,
    isLoading,
    error,
    subscriptionErrorsByToken,
    subscribe,
    unsubscribe,
    connect,
    disconnect,
    reconnect,
    reconnectTransport,
    getPrice,
    getSubscriptionCount,
  };
}

