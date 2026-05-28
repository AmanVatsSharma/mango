/**
 * @file types.ts
 * @description Type definitions for WebSocket-based market data provider
 * 
 * PURPOSE:
 * - Define TypeScript interfaces for real-time market data
 * - Provide type safety across the market data system
 * - Document data structures for quotes, subscriptions, and configs
 * 
 * FEATURES:
 * - Complete type definitions for quotes, subscriptions, and connections
 * - Error type definitions for robust error handling
 * - Configuration types for WebSocket connection
 * 
 * DEPENDENCIES:
 * - None (standalone type definitions)
 * 
 * EXPORTS:
 * - SubscriptionMode: Type for subscription modes (ltp, ohlcv, full)
 * - MarketDataQuote: Structure for real-time market quote
 * - EnhancedQuote: Quote with display enhancements (jitter, interpolation)
 * - WebSocketConfig: Configuration for WebSocket connection
 * - MarketDataProviderProps: Props for the provider component
 * - ConnectionState: Connection status types
 * - WSMarketDataError: Error type for market data operations
 * 
 * USAGE:
 * import type { MarketDataQuote, SubscriptionMode } from '@/lib/market-data/providers/types'
 * 
 * @author Trading Platform Team
 * @date 2025-10-28
 */

/**
 * Subscription mode for market data
 */
export type SubscriptionMode = 'ltp' | 'ohlcv' | 'full';

/**
 * Subscription key accepted by the upstream server.
 * - `number`: numeric token (server attempts auto-resolve exchange)
 * - `string`: exchange-qualified key (e.g. "NSE_FO-2953217", "NSE_EQ-26000")
 */
export type SubscriptionKey = number | string;

/**
 * Connection state for WebSocket
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Enhanced quote with display enhancements (jitter, interpolation)
 * Used for smooth UI transitions
 */
export interface EnhancedQuote {
  // Real-time data from WebSocket
  instrumentToken: number;
  /** Provider-agnostic UIR id from the gateway — also used as a quote map key so UIR-saved items can find their quote. */
  uirId?: number;
  /** Subscription-key token (e.g. kite index token 26000) when it differs from instrumentToken — used for triple-keying the React quotes map. */
  providerToken?: number;
  last_trade_price: number;
  prev_close_price?: number;
  
  // Display enhancements
  display_price: number;      // The price shown to user (with jitter/deviation)
  actual_price: number;        // The real LTP from WebSocket
  
  // Trend information
  trend: 'up' | 'down' | 'neutral';
  
  // Enhancement offsets
  jitter_offset: number;
  deviation_offset: number;
  
  // Timing information
  timestamp: number;
  lastUpdateTime: number;
  
  // OHLCV data (if mode is ohlcv or full)
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  
  // Market depth (if mode is full)
  market_depth?: {
    bid: Array<{ price: number; quantity: number; orders: number }>;
    ask: Array<{ price: number; quantity: number; orders: number }>;
  };
}

/**
 * Real-time market data quote received from WebSocket
 */
export interface MarketDataQuote {
  instrumentToken: number;
  /** Provider-agnostic UIR id emitted by the gateway alongside the broker instrumentToken. */
  uirId?: number;
  data: {
    last_price: number;
    ohlc?: {
      open: number;
      high: number;
      low: number;
      close: number;
    };
    volume?: number;
    timestamp?: string;
  };
  timestamp: string;
}

/**
 * Configuration for WebSocket market data connection
 */
export interface WebSocketConfig {
  url: string;
  apiKey: string;
  reconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  enableJitter: boolean;
  enableInterpolation: boolean;
}

/**
 * Props for WebSocket Market Data Provider component
 */
export interface MarketDataProviderProps {
  userId: string;
  children: React.ReactNode;
  config?: Partial<MarketDataConfig>;
  enableWebSocket?: boolean;
}

/**
 * Configuration for market data enhancements
 */
export type InterpolationEasingMode = "linear" | "easeOut";

export interface MarketDataConfig {
  jitter: {
    enabled: boolean;
    interval: number;
    intensity: number;
    convergence: number;
    /** Max |jitter| as percent of LTP (e.g. 0.2 = 0.2%). */
    maxAbsPctOfLtp: number;
  };
  deviation: {
    enabled: boolean;
    percentage: number;
    absolute: number;
  };
  interpolation: {
    enabled: boolean;
    steps: number;
    duration: number;
    easing: InterpolationEasingMode;
  };
}

/**
 * Subscription request structure
 */
export interface SubscriptionRequest {
  instruments: SubscriptionKey[];  // Array of instrument subscription keys
  mode: SubscriptionMode;
}

/**
 * Subscription state
 */
export interface SubscriptionState {
  instrumentToken: number;
  mode: SubscriptionMode;
  subscribedAt: number;
  lastUpdateTime: number;
}

/**
 * WebSocket error structure
 */
export interface WSMarketDataError {
  code: string;
  message: string;
  timestamp: string;
  token?: number;
  instrumentToken?: number;
  details?: any;
}

/**
 * Price update event structure
 */
export interface PriceUpdateEvent {
  instrumentToken: number;
  price: number;
  change: number;
  changePercent: number;
  timestamp: number;
}

export interface MarketQuoteWarmupInput {
  token?: unknown;
  uirId?: unknown;
  instrumentId?: unknown;
  exchange?: unknown;
  segment?: unknown;
  waitFreshMs?: number;
  liveMaxAgeMs?: number;
  displayMaxAgeMs?: number;
}

export interface MarketQuoteWarmupResult {
  quote: EnhancedQuote | null;
  source: "WS" | "API" | "NONE";
}

/**
 * Quote freshness for PnL / display (from admin market_display_config_v1).
 */
export interface MarketDisplayQuoteFreshness {
  liveMaxAgeMs: number;
  displayMaxAgeMs: number;
  pnlServerMaxAgeMs: number;
  redisMarketQuoteMaxAgeMs?: number;
  positionPnlQuoteMaxAgeMs?: number;
  marketQuoteRedisWriteMinIntervalMs?: number;
}

/**
 * UI policy flags for disconnected/stale/freeze behavior.
 */
export interface MarketDisplayUiPolicy {
  disconnectedPriceMode: "last" | "dash";
  staleBadgeAfterMs: number | null;
  positionFreezeEnabled: boolean;
  /** When true, jitter respects per-segment hours (e.g. MCX 09:00–23:55 vs NSE 09:15–15:30 IST). */
  respectSegmentTradingHoursForJitter: boolean;
  /** Positions row shows smoothed display price vs exchange LTP. */
  positionsRowPriceBasis: "smoothed_display" | "exchange_ltp";
  /** Server square-off: allow Redis worker snapshot when live quote fails. */
  positionCloseExitPricePolicy: "server_live_only" | "server_live_then_redis_snapshot";
  /** Hide price when stale vs keep last tick on screen. */
  staleQuotePriceMode: "strict" | "last_tick";
  /** Show LIVE/STALE/FROZEN badges on position rows. */
  quoteBadgesEnabled: boolean;
}

/**
 * Context type for market data
 */
export interface MarketDataContextType {
  quotes: Record<string, EnhancedQuote>;
  isLoading: boolean;
  isConnected: ConnectionState;
  error: WSMarketDataError | null;
  subscriptionErrorsByToken: Record<string, WSMarketDataError>;
  config: MarketDataConfig;
  updateConfig: (config: Partial<MarketDataConfig>) => void;
  subscribe: (instruments: SubscriptionKey[], mode: SubscriptionMode) => void;
  unsubscribe: (instruments: SubscriptionKey[], mode: SubscriptionMode) => void;
  reconnect: () => void;
  warmupQuote: (input: MarketQuoteWarmupInput) => Promise<MarketQuoteWarmupResult>;
  /** Ages passed into position PnL helpers (live vs snapshot thresholds). */
  marketDisplayQuoteFreshness: MarketDisplayQuoteFreshness;
  /** Stale badge, freeze-last-live, disconnected UX hints. */
  marketDisplayUi: MarketDisplayUiPolicy;
}

