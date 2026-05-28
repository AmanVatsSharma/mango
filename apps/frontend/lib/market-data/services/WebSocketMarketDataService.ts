/**
 * @file WebSocketMarketDataService.ts
 * @description Business logic layer for WebSocket market data management
 * 
 * PURPOSE:
 * - Orchestrate WebSocket connection lifecycle
 * - Transform raw WebSocket data to application format
 * - Implement caching layer for last known prices
 * - Handle instrument token resolution
 * - Provide fallback mechanisms
 * - Implement jitter and interpolation for smooth UX
 * - Rate limiting and subscription batching
 * - Error recovery strategies
 * 
 * FEATURES:
 * - Manages SocketIOClient instance
 * - Real-time price updates with caching
 * - Subscription management (subscribe/unsubscribe)
 * - Price enhancement (jitter + interpolation)
 * - Fallback to cached prices during disconnection
 * - Automatic resubscription on reconnect
 * - Error recovery with exponential backoff
 * 
 * DEPENDENCIES:
 * - SocketIOClient: WebSocket connection management
 * - Price utilities for formatting and transformations
 * 
 * EXPORTS:
 * - WebSocketMarketDataService: Service class
 * 
 * USAGE:
 * const service = new WebSocketMarketDataService(config);
 * service.on('priceUpdate', (data) => console.log(data));
 * await service.initialize();
 * service.subscribeToInstruments([26000, 11536], 'ltp');
 * 
 * ERROR HANDLING:
 * - Connection failures: Retry with exponential backoff
 * - Invalid data: Log warning and skip
 * - Subscription errors: Emit error event and continue
 * - Disconnections: Use cached prices and emit disconnect event
 * 
 * @author Trading Platform Team
 * @date 2025-10-28
 * @updated 2026-04-06 — Clarify `priceUpdate` emits per upstream message (not LTP-deduped).
 * @updated 2026-03-25 — reconnectTransport(); pass maxReconnectDelayMs to SocketIOClient.
 * @updated 2026-05-07 — Hydrate priceCache from + write-through to module-singleton globalTickCache so ticks survive provider remount.
 */

import { SocketIOClient } from './SocketIOClient';
import type {
  MarketDataQuote,
  EnhancedQuote,
  WSMarketDataError,
  SubscriptionMode,
  SubscriptionKey,
} from '../providers/types';
import { detectTrend, calculateChange, calculateChangePercent } from '../utils/priceFormatters';
import {
  getGlobalTickCache,
  mergeIntoGlobalTickCache,
  subscribeToGlobalTickCacheClear,
  upsertGlobalTickCacheEntry,
} from './global-tick-cache';

const DEBUG_WS_MARKET_DATA =
  process.env.NEXT_PUBLIC_DEBUG_REALTIME === 'true' ||
  process.env.NEXT_PUBLIC_DEBUG_MARKETDATA === 'true' ||
  process.env.NODE_ENV === 'development';

function marketDataDebug(...args: any[]): void {
  if (!DEBUG_WS_MARKET_DATA) return;
  console.log(...args);
}

/**
 * Service event names
 */
export type ServiceEvent = 
  | 'connected' 
  | 'disconnected' 
  | 'priceUpdate' 
  | 'subscriptionConfirmed'
  | 'error';

/**
 * Event callback type
 */
export type ServiceEventCallback = (data?: any) => void;

/**
 * Configuration for WebSocket Market Data Service
 */
export interface ServiceConfig {
  url: string;
  apiKey: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelayMs?: number;
  heartbeatInterval?: number;
  enableJitter?: boolean;
  enableInterpolation?: boolean;
}

/**
 * WebSocket Market Data Service
 * 
 * Provides high-level interface for real-time market data:
 * - Connection management
 * - Subscription management
 * - Price data caching
 * - Enhancement (jitter, interpolation)
 * - Error recovery
 */
export class WebSocketMarketDataService {
  private client: SocketIOClient | null = null;
  private config: Required<ServiceConfig>;
  private listeners: Map<ServiceEvent, Set<ServiceEventCallback>> = new Map();

  // Price cache — seeded from a module-level singleton on construct, spilled back on teardown.
  // Survives provider remount, route change, and error-boundary recovery so the React tree
  // never loses the last-known tick mid-session.
  private priceCache: Map<number, EnhancedQuote> = new Map();
  private previousPrices: Map<number, number> = new Map();
  private unsubscribeFromGlobalClear: (() => void) | null = null;

  // Maps uirId → providerToken (subscription-key token) so live ticks can be looked
  // up by both the emitted vortex instrumentToken AND the static subscription token
  // (e.g. kite index token 26000 → uirId 650640 → vortex tick instrumentToken 256265).
  private uirIdToProviderToken: Map<number, number> = new Map();

  // Subscription state
  private subscriptions: Map<string, { key: SubscriptionKey; mode: SubscriptionMode }> = new Map();
  
  constructor(config: ServiceConfig) {
    this.config = {
      reconnectAttempts: 5,
      reconnectDelay: 5000,
      maxReconnectDelayMs: 60_000,
      heartbeatInterval: 30000,
      enableJitter: true,
      enableInterpolation: true,
      ...config,
    } as Required<ServiceConfig>;

    // Seed the local cache from the global tick cache so first-paint quotes survive
    // a provider remount or route navigation.
    const seed = getGlobalTickCache();
    if (seed.size > 0) {
      this.priceCache = new Map(seed);
      seed.forEach((quote, token) => {
        if (typeof quote.last_trade_price === 'number') {
          this.previousPrices.set(token, quote.last_trade_price);
        }
      });
      marketDataDebug('🌱 [WS-MARKET-DATA-SERVICE] Seeded priceCache from global', {
        size: this.priceCache.size,
      });
    }

    // If the global cache is cleared (e.g. on signOut), drop our copy too.
    this.unsubscribeFromGlobalClear = subscribeToGlobalTickCacheClear(() => {
      this.priceCache.clear();
      this.previousPrices.clear();
    });

    marketDataDebug('🏗️ [WS-MARKET-DATA-SERVICE] Service instance created', {
      url: this.config.url,
      enableJitter: this.config.enableJitter,
      enableInterpolation: this.config.enableInterpolation,
    });
  }

  private normalizeSubscriptionKey(key: SubscriptionKey): string {
    if (typeof key === 'number') {
      return key.toString();
    }
    return key.trim().toUpperCase();
  }

  /**
   * Register event listener
   */
  on(event: ServiceEvent, callback: ServiceEventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    marketDataDebug(`👂 [WS-MARKET-DATA-SERVICE] Registered listener for: ${event}`);
  }

  /**
   * Remove event listener
   */
  off(event: ServiceEvent, callback: ServiceEventCallback): void {
    this.listeners.get(event)?.delete(callback);
    marketDataDebug(`👋 [WS-MARKET-DATA-SERVICE] Removed listener for: ${event}`);
  }

  /**
   * Emit event to all registered listeners
   */
  private emit(event: ServiceEvent, data?: any): void {
    this.listeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`❌ [WS-MARKET-DATA-SERVICE] Listener error for ${event}:`, error);
      }
    });
  }

  /**
   * Initialize service and establish WebSocket connection
   */
  async initialize(): Promise<void> {
    marketDataDebug('🚀 [WS-MARKET-DATA-SERVICE] Initializing service...');
    
    try {
      // Create Socket.IO client
      this.client = new SocketIOClient({
        url: this.config.url,
        apiKey: this.config.apiKey,
        reconnectAttempts: this.config.reconnectAttempts,
        reconnectDelay: this.config.reconnectDelay,
        maxReconnectDelayMs: this.config.maxReconnectDelayMs,
        heartbeatInterval: this.config.heartbeatInterval,
      });

      // Setup event handlers
      this.setupClientHandlers();
      
      // Connect to WebSocket
      this.client.connect();
      
      marketDataDebug('✅ [WS-MARKET-DATA-SERVICE] Service initialized');
    } catch (error) {
      console.error('❌ [WS-MARKET-DATA-SERVICE] Failed to initialize service', error);
      throw error;
    }
  }

  /**
   * Setup Socket.IO client event handlers
   */
  private setupClientHandlers(): void {
    if (!this.client) return;

    // Connected event
    this.client.on('connected', () => {
      marketDataDebug('✅ [WS-MARKET-DATA-SERVICE] Client connected');
      this.emit('connected');
      
      // Resubscribe to all previous subscriptions
      this.resubscribeAll();
    });

    // Disconnected event
    this.client.on('disconnected', () => {
      marketDataDebug('❌ [WS-MARKET-DATA-SERVICE] Client disconnected');
      this.emit('disconnected');
    });

    // Subscription confirmed — gateway returns resolved[] (providerToken↔uirId mapping)
    // and snapshot (first-paint prices keyed by uirId string).
    this.client.on('subscription_confirmed', (data) => {
      marketDataDebug('✅ [WS-MARKET-DATA-SERVICE] Subscription confirmed', data);
      this.processSubscriptionConfirmed(data);
      this.emit('subscriptionConfirmed', data);
    });

    // Market data received
    this.client.on('market_data', (quote: MarketDataQuote) => {
      try {
        marketDataDebug('📊 [WS-MARKET-DATA-SERVICE] Market data received', {
          instrumentToken: quote.instrumentToken,
          price: quote.data.last_price,
        });
        
        this.processMarketData(quote);
      } catch (error) {
        console.error('❌ [WS-MARKET-DATA-SERVICE] Error processing market data', error);
      }
    });

    // Error event
    this.client.on('error', (error: WSMarketDataError) => {
      console.error('❌ [WS-MARKET-DATA-SERVICE] Client error', error);
      this.emit('error', error);
    });
  }

  /**
   * Process subscription_confirmed: build uirId→providerToken map and seed snapshot prices.
   * resolved[] format: [{ symbol, uirId, providerToken }]
   * snapshot format:   { "<uirId>": { last_price: N } }
   */
  private processSubscriptionConfirmed(data: any): void {
    const resolved: Array<{ symbol?: string; uirId?: number; providerToken?: number }> =
      Array.isArray(data?.resolved) ? data.resolved : []
    const snapshot: Record<string, { last_price?: number }> =
      data?.snapshot && typeof data.snapshot === 'object' ? data.snapshot : {}

    for (const entry of resolved) {
      const uirId = typeof entry.uirId === 'number' ? entry.uirId : undefined
      const providerToken = typeof entry.providerToken === 'number' ? entry.providerToken : undefined
      if (uirId === undefined || providerToken === undefined) continue

      this.uirIdToProviderToken.set(uirId, providerToken)

      const snapPrice = snapshot[String(uirId)]?.last_price
      if (typeof snapPrice === 'number' && Number.isFinite(snapPrice) && snapPrice > 0) {
        // Synthetic quote from snapshot so the priceCache is immediately warm.
        // instrumentToken = providerToken so static-token lookups (e.g. 26000) hit from the start.
        this.processMarketData({
          instrumentToken: providerToken,
          uirId,
          data: { last_price: snapPrice },
          timestamp: new Date().toISOString(),
        } as MarketDataQuote)
      }
    }
  }

  /**
   * Process incoming market data
   */
  private processMarketData(quote: MarketDataQuote): void {
    const { instrumentToken, uirId, data, timestamp } = quote;
    
    // Get previous price for calculations
    const previousPrice = this.previousPrices.get(instrumentToken);
    const currentPrice = data.last_price;
    
    // Calculate change and trend
    const change = previousPrice ? calculateChange(currentPrice, previousPrice) : 0;
    const changePercent = previousPrice ? calculateChangePercent(currentPrice, previousPrice) : 0;
    const trend = previousPrice ? detectTrend(currentPrice, previousPrice) : 'neutral';

    // Use OHLC close as the previous close for PnL math (not the previous tick).
    const cachedQuote = this.priceCache.get(instrumentToken);
    const cachedPrevClose = cachedQuote?.prev_close_price;
    const ohlcClose = data.ohlc?.close;
    const prevClosePrice =
      typeof ohlcClose === 'number' && Number.isFinite(ohlcClose) && ohlcClose > 0
        ? ohlcClose
        : cachedPrevClose;
    
    const providerToken = uirId !== undefined ? this.uirIdToProviderToken.get(uirId) : undefined

    // Create enhanced quote
    const enhancedQuote: EnhancedQuote = {
      instrumentToken,
      uirId,
      providerToken: providerToken !== instrumentToken && providerToken !== uirId ? providerToken : undefined,
      last_trade_price: currentPrice,
      prev_close_price: prevClosePrice,
      display_price: currentPrice,
      actual_price: currentPrice,
      trend,
      jitter_offset: 0,
      deviation_offset: 0,
      timestamp: Date.now(),
      lastUpdateTime: new Date(timestamp).getTime(),
      open: data.ohlc?.open,
      high: data.ohlc?.high,
      low: data.ohlc?.low,
      close:
        typeof ohlcClose === 'number' && Number.isFinite(ohlcClose)
          ? ohlcClose
          : cachedQuote?.close,
      volume: data.volume,
    };

    // Raw LTP only: jitter / interpolation are applied in WebSocketMarketDataProvider from DB-backed config.

    // Triple-key the cache so every lookup path hits:
    //   1. vortex instrumentToken emitted on ticks (e.g. 256265 for NIFTY)
    //   2. UIR id — stable provider-agnostic key (e.g. 650640)
    //   3. providerToken from subscription — static kite/subscription token (e.g. 26000)
    // Write-through to the module-level global tick cache so a provider remount /
    // route change preserves the last known tick across React lifecycle.
    this.priceCache.set(instrumentToken, enhancedQuote);
    upsertGlobalTickCacheEntry(instrumentToken, enhancedQuote);
    if (uirId !== undefined && uirId !== instrumentToken) {
      this.priceCache.set(uirId, enhancedQuote);
      upsertGlobalTickCacheEntry(uirId, enhancedQuote);
    }
    if (providerToken !== undefined) {
      this.priceCache.set(providerToken, enhancedQuote);
      upsertGlobalTickCacheEntry(providerToken, enhancedQuote);
    }
    this.previousPrices.set(instrumentToken, currentPrice);
    
    // Emit one `priceUpdate` per inbound quote message (upstream may filter LTP changes).
    this.emit('priceUpdate', {
      instrumentToken,
      quote: enhancedQuote,
      quotes: [enhancedQuote],
      changedQuotes: [enhancedQuote],
      cacheSize: this.priceCache.size,
    });
  }

  /**
   * Subscribe to instruments
   */
  subscribeToInstruments(instruments: SubscriptionKey[], mode: SubscriptionMode): void {
    if (!this.client?.isConnected) {
      console.warn('⚠️ [WS-MARKET-DATA-SERVICE] Cannot subscribe - not connected');
      return;
    }

    marketDataDebug('📡 [WS-MARKET-DATA-SERVICE] Subscribing to instruments', {
      instruments,
      mode,
      count: instruments.length,
    });

    // Update subscription state
    instruments.forEach((instrument) => {
      const normalizedKey = this.normalizeSubscriptionKey(instrument);
      this.subscriptions.set(normalizedKey, { key: instrument, mode });
    });

    // Emit subscription request
    this.client.subscribe(instruments, mode);
  }

  /**
   * Unsubscribe from instruments
   */
  unsubscribeFromInstruments(instruments: SubscriptionKey[]): void {
    if (!this.client?.isConnected) {
      console.warn('⚠️ [WS-MARKET-DATA-SERVICE] Cannot unsubscribe - not connected');
      return;
    }

    marketDataDebug('🚫 [WS-MARKET-DATA-SERVICE] Unsubscribing from instruments', {
      instruments,
      count: instruments.length,
    });

    // Remove from subscription state
    instruments.forEach((instrument) => {
      const normalizedKey = this.normalizeSubscriptionKey(instrument);
      this.subscriptions.delete(normalizedKey);
    });

    // Emit unsubscribe request
    this.client.unsubscribe(instruments);
  }

  /**
   * Resubscribe to all previous subscriptions
   */
  private resubscribeAll(): void {
    if (!this.client?.isConnected) {
      return;
    }

    marketDataDebug('🔄 [WS-MARKET-DATA-SERVICE] Resubscribing to all instruments', {
      count: this.subscriptions.size,
    });

    // Group instruments by mode
    const instrumentsByMode = new Map<SubscriptionMode, SubscriptionKey[]>();
    
    this.subscriptions.forEach((entry) => {
      const mode = entry.mode;
      if (!instrumentsByMode.has(mode)) {
        instrumentsByMode.set(mode, []);
      }
      instrumentsByMode.get(mode)!.push(entry.key);
    });

    // Subscribe for each mode
    instrumentsByMode.forEach((instruments, mode) => {
      this.client!.subscribe(instruments, mode);
    });
  }

  /**
   * Get price for instrument
   */
  getPrice(instrumentToken: number): EnhancedQuote | null {
    return this.priceCache.get(instrumentToken) || null;
  }

  /**
   * Get all cached prices
   */
  getAllPrices(): Map<number, EnhancedQuote> {
    return new Map(this.priceCache);
  }

  /**
   * Get connection status
   */
  get isConnected(): boolean {
    return this.client?.isConnected ?? false;
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    marketDataDebug('🔌 [WS-MARKET-DATA-SERVICE] Disconnecting service');

    // Spill the local priceCache into the module-level global cache before tearing down so
    // the next service instance (e.g. after a provider remount) hydrates from these ticks.
    if (this.priceCache.size > 0) {
      mergeIntoGlobalTickCache(this.priceCache);
    }

    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }

    // Clear subscription state
    this.subscriptions.clear();
  }

  /**
   * Refresh transport only: new socket, same in-memory subscriptions (resubscribeAll on connect).
   */
  reconnectTransport(): void {
    if (!this.client) {
      marketDataDebug('⚠️ [WS-MARKET-DATA-SERVICE] reconnectTransport skipped — no client');
      return;
    }
    marketDataDebug('🔄 [WS-MARKET-DATA-SERVICE] reconnectTransport');
    this.client.forceReconnect();
  }

  /**
   * Cleanup service
   */
  destroy(): void {
    marketDataDebug('🗑️ [WS-MARKET-DATA-SERVICE] Destroying service');

    this.disconnect();
    this.listeners.clear();
    if (this.unsubscribeFromGlobalClear) {
      this.unsubscribeFromGlobalClear();
      this.unsubscribeFromGlobalClear = null;
    }
    this.priceCache.clear();
    this.previousPrices.clear();
  }
}

