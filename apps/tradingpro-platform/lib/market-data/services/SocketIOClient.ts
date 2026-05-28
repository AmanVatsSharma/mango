/**
 * File:        lib/market-data/services/SocketIOClient.ts
 * Module:      Market Data · Transport
 * Purpose:     Thin Socket.IO client wrapper: connect / subscribe / unsubscribe / forceReconnect.
 *              Delegates reconnection entirely to Socket.IO's built-in Manager so the code owns
 *              no backoff timers. forceReconnect() creates a fresh io() instance for tab-back /
 *              network-change scenarios without disrupting the service-layer subscription state.
 *
 * Exports:
 *   - SocketIOClient                  — main connection class
 *   - SocketIOClientConfig            — constructor options
 *   - SocketIOEvent                   — event name union type
 *   - EventCallback                   — listener function type
 *
 * Depends on:
 *   - socket.io-client                — io(), Socket
 *   - ../providers/types              — MarketDataQuote, SubscriptionKey, WSMarketDataError
 *
 * Side-effects:
 *   - Opens a WebSocket (or polling) connection to the market-data server
 *   - Emits heartbeat pings every heartbeatInterval ms while connected
 *
 * Key invariants:
 *   - reconnection: true — Manager owns all retry logic; no manual setTimeout timers
 *   - reconnectAttempts <= 0 in config → Infinity retries (delay still capped by maxReconnectDelayMs)
 *   - forceReconnect() disposes the current socket, emits 'disconnected', then calls connect()
 *   - disposeCurrentSocket() calls socket.io.removeAllListeners() to clean up Manager listeners
 *   - Canonical symbols ("NSE:RELIANCE") go to symbols[], exchange-qualified/numeric to instruments[]
 *
 * Read order:
 *   1. SocketIOClientConfig           — configuration shape
 *   2. connect()                      — socket creation + event wiring
 *   3. subscribe() / unsubscribe()    — payload routing (canonical vs numeric)
 *   4. forceReconnect()               — transport refresh path
 *
 * Author:      Trading Platform Team
 * Last-updated: 2026-05-04
 */

import { io, Socket } from 'socket.io-client';
import type { MarketDataQuote, SubscriptionKey, WSMarketDataError } from '../providers/types';

const DEBUG_SOCKET_IO =
  process.env.NEXT_PUBLIC_DEBUG_REALTIME === 'true' ||
  process.env.NEXT_PUBLIC_DEBUG_MARKETDATA === 'true' ||
  process.env.NODE_ENV === 'development';

function socketDebug(...args: unknown[]): void {
  if (!DEBUG_SOCKET_IO) return;
  console.log(...args);
}

export type SocketIOEvent =
  | 'connected'
  | 'disconnected'
  | 'market_data'
  | 'subscription_confirmed'
  | 'error'
  | 'reconnecting'
  | 'reconnected'
  // Trading-ang: circuit-breaker signal events. Distinct from `error` because errors are
  // per-attempt; these mark a *sustained* failure mode the UI should surface to the user.
  | 'degraded'
  | 'recovered';

/**
 * Trading-ang circuit-breaker payload. Emitted when a sliding window of failures
 * (`failureThreshold` failures within `failureWindowMs`) crosses the trip line. The
 * provider can subscribe and render a banner with a manual-retry button.
 *
 * Note: this is a SIGNAL, not a THROTTLE. The Socket.IO Manager keeps retrying with its
 * own exponential backoff (capped at `maxReconnectDelayMs`). The circuit-breaker just
 * tells consumers when to stop trusting the feed.
 */
export interface CircuitBreakerEventPayload {
  failureCount: number;
  windowMs: number;
  /** Last error message that tripped the breaker (if any). */
  lastErrorMessage?: string;
}

export interface SocketIOClientConfig {
  url: string;
  apiKey: string;
  /** Max automatic reconnect tries; **0 or negative = unlimited** (delay still capped). */
  reconnectAttempts?: number;
  /** Base delay (ms) for exponential backoff: delay ≈ reconnectDelay * 2^(n-1). */
  reconnectDelay?: number;
  /** Upper cap (ms) for backoff after jitter. */
  maxReconnectDelayMs?: number;
  heartbeatInterval?: number;
  /**
   * Trading-ang circuit-breaker config. Tracks `connect_error` + `reconnect_failed` events
   * in a sliding window; when `failureThreshold` events occur within `failureWindowMs`,
   * emits a `'degraded'` event so the UI can degrade gracefully. Defaults: 5 failures
   * within 60s.
   */
  circuitBreaker?: {
    failureThreshold?: number;
    failureWindowMs?: number;
  };
}

export type EventCallback = (data?: unknown) => void;

export class SocketIOClient {
  private socket: Socket | null = null;
  // Trading-ang: circuitBreaker is stored on dedicated fields below, so exclude it from the
  // `Required<>` projection. Otherwise TS demands every constructor pass a circuitBreaker
  // object even though defaults are perfectly fine.
  private config: Required<Omit<SocketIOClientConfig, 'reconnectAttempts' | 'circuitBreaker'>> & {
    reconnectAttempts: number;
  };
  private listeners: Map<SocketIOEvent, Set<EventCallback>> = new Map();
  /** Diagnostic counter incremented by Manager's reconnect_attempt event. */
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts: number;
  private shouldReconnect = true;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;
  /**
   * Trading-ang: sliding window of failure timestamps (epoch ms). Each `connect_error`
   * or `reconnect_failed` pushes; entries older than `circuitBreakerWindowMs` are pruned
   * lazily on each push. When length crosses threshold → emit `'degraded'` once.
   */
  private failureWindow: number[] = [];
  private readonly circuitBreakerThreshold: number;
  private readonly circuitBreakerWindowMs: number;
  private circuitBreakerTripped = false;
  /** Last error message that tripped the breaker — surfaced to consumers via the event. */
  private lastFailureMessage: string | undefined;

  constructor(config: SocketIOClientConfig) {
    const attempts = config.reconnectAttempts ?? 5;
    this.maxReconnectAttempts = attempts <= 0 ? Number.POSITIVE_INFINITY : attempts;
    this.config = {
      url: config.url,
      apiKey: config.apiKey,
      reconnectAttempts: attempts,
      reconnectDelay: config.reconnectDelay ?? 5000,
      maxReconnectDelayMs: config.maxReconnectDelayMs ?? 60_000,
      heartbeatInterval: config.heartbeatInterval ?? 30000,
    };

    // Trading-ang: defaults are 5 failures within 60s. Tuned to fire on a sustained outage
    // (gateway down, network partition) and stay quiet for transient blips.
    this.circuitBreakerThreshold = config.circuitBreaker?.failureThreshold ?? 5;
    this.circuitBreakerWindowMs = config.circuitBreaker?.failureWindowMs ?? 60_000;

    socketDebug('🏗️ [SOCKET-IO-CLIENT] Client instance created', {
      url: this.config.url,
      reconnectAttempts: this.maxReconnectAttempts === Number.POSITIVE_INFINITY ? 'infinite' : this.maxReconnectAttempts,
      circuitBreakerThreshold: this.circuitBreakerThreshold,
      circuitBreakerWindowMs: this.circuitBreakerWindowMs,
    });
  }

  /**
   * Trading-ang: record a failure in the sliding window. If the window now contains
   * `failureThreshold` failures within `failureWindowMs`, emit `'degraded'` exactly once
   * (until the next successful connect resets the trip flag).
   */
  private recordFailureForCircuitBreaker(message?: string): void {
    const now = Date.now();
    this.failureWindow.push(now);
    // Prune entries outside the window so memory stays bounded.
    const cutoff = now - this.circuitBreakerWindowMs;
    while (this.failureWindow.length > 0 && this.failureWindow[0] < cutoff) {
      this.failureWindow.shift();
    }
    if (typeof message === 'string' && message.trim().length > 0) {
      this.lastFailureMessage = message;
    }
    if (
      !this.circuitBreakerTripped &&
      this.failureWindow.length >= this.circuitBreakerThreshold
    ) {
      this.circuitBreakerTripped = true;
      console.warn(
        `⚠️ [SOCKET-IO-CLIENT] Circuit breaker TRIPPED — ${this.failureWindow.length} failures in ${this.circuitBreakerWindowMs}ms; emitting 'degraded'`,
      );
      const payload: CircuitBreakerEventPayload = {
        failureCount: this.failureWindow.length,
        windowMs: this.circuitBreakerWindowMs,
        lastErrorMessage: this.lastFailureMessage,
      };
      this.emit('degraded', payload);
    }
  }

  /**
   * Trading-ang: reset the breaker after a successful connect. Emits `'recovered'` only
   * if we were previously in the tripped state, so consumers know to clear their banner.
   */
  private resetCircuitBreaker(): void {
    this.failureWindow = [];
    this.lastFailureMessage = undefined;
    if (this.circuitBreakerTripped) {
      this.circuitBreakerTripped = false;
      socketDebug('✅ [SOCKET-IO-CLIENT] Circuit breaker RESET — feed recovered');
      this.emit('recovered');
    }
  }

  /**
   * Trading-ang: expose the current degraded state for late-mounting UI consumers (so a
   * banner can show on first paint without waiting for the next event).
   */
  isFeedDegraded(): boolean {
    return this.circuitBreakerTripped;
  }

  on(event: SocketIOEvent, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    socketDebug(`👂 [SOCKET-IO-CLIENT] Registered listener for: ${event}`);
  }

  off(event: SocketIOEvent, callback: EventCallback): void {
    this.listeners.get(event)?.delete(callback);
    socketDebug(`👋 [SOCKET-IO-CLIENT] Removed listener for: ${event}`);
  }

  private emit(event: SocketIOEvent, data?: unknown): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`❌ [SOCKET-IO-CLIENT] Listener error for ${event}:`, error);
      }
    });
  }

  /**
   * Drop the current socket instance without toggling shouldReconnect (used before a new io()).
   * Cleans up both socket-level and Manager-level listeners to prevent leaks.
   */
  private disposeCurrentSocket(): void {
    if (!this.socket) {
      return;
    }
    try {
      this.socket.removeAllListeners();
    } catch {
      /* ignore */
    }
    try {
      // Manager-level listeners (reconnect_attempt etc.) must also be removed.
      this.socket.io.removeAllListeners();
    } catch {
      /* ignore */
    }
    try {
      this.socket.disconnect();
    } catch {
      /* ignore */
    }
    this.socket = null;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.isConnecting) {
      console.warn('⚠️ [SOCKET-IO-CLIENT] Already connecting');
      return;
    }

    if (this.socket?.connected) {
      console.warn('⚠️ [SOCKET-IO-CLIENT] Already connected');
      return;
    }

    this.disposeCurrentSocket();

    this.isConnecting = true;
    this.shouldReconnect = true;

    socketDebug('🔌 [SOCKET-IO-CLIENT] Connecting...', {
      url: this.config.url,
      timestamp: new Date().toISOString(),
    });

    try {
      let rawUrl = this.config.url.trim();

      socketDebug('🔧 [SOCKET-IO-CLIENT] Processing URL:', {
        original: this.config.url,
        trimmed: rawUrl,
      });

      // Normalize protocol for URL parsing
      let normalizedUrl = rawUrl;
      if (normalizedUrl.startsWith('ws://')) {
        normalizedUrl = normalizedUrl.replace('ws://', 'http://');
      } else if (normalizedUrl.startsWith('wss://')) {
        normalizedUrl = normalizedUrl.replace('wss://', 'https://');
      }

      // Ensure it has a protocol for URL constructor
      if (!normalizedUrl.includes('://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }

      let urlObj: URL;
      try {
        urlObj = new URL(normalizedUrl);
      } catch (e) {
        console.error('❌ [SOCKET-IO-CLIENT] Invalid URL format:', normalizedUrl);
        throw new Error(`Invalid URL format: ${normalizedUrl}`);
      }

      // Extract base URL (protocol + host + port)
      const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
      
      // Extract path (namespace) from URL. Default to '/market-data' if none.
      let namespace = urlObj.pathname;
      if (!namespace || namespace === '/') {
        namespace = '/market-data';
      }

      // Socket.IO 'path' option defaults to '/socket.io'.
      // Our backend serves the gateway on the '/market-data' namespace.
      const socketPath = '/socket.io';

      socketDebug('🔧 [SOCKET-IO-CLIENT] Parsed connection details:', {
        baseUrl,
        namespace,
        socketPath,
      });

      const reconnectionAttempts =
        this.maxReconnectAttempts === Number.POSITIVE_INFINITY
          ? Infinity
          : this.maxReconnectAttempts;

      // Initialize Socket.IO. We pass baseUrl + namespace as the first arg.
      this.socket = io(baseUrl + namespace, {
        path: socketPath,
        query: {
          api_key: this.config.apiKey,
        },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts,
        reconnectionDelay: this.config.reconnectDelay,
        reconnectionDelayMax: this.config.maxReconnectDelayMs,
        randomizationFactor: 0.2,
        timeout: 10000,
      });

      // Ensure we log if we are connecting to a specific namespace
      if (namespace !== '/') {
        socketDebug(`📡 [SOCKET-IO-CLIENT] Target namespace: ${namespace}`);
      }

      socketDebug('✅ [SOCKET-IO-CLIENT] Socket.IO instance created');

      // Wire Manager-level reconnect events — these fire regardless of which socket
      // instance the Manager is working with, so we handle them here once per io().
      this.socket.io.on('reconnect_attempt', (attempt: number) => {
        this.reconnectAttempts = attempt;
        socketDebug(`🔄 [SOCKET-IO-CLIENT] Reconnect attempt ${attempt}`, {
          maxAttempts: this.maxReconnectAttempts === Number.POSITIVE_INFINITY ? 'infinite' : this.maxReconnectAttempts,
        });
        this.emit('reconnecting', { attempt, maxAttempts: this.maxReconnectAttempts });
      });

      this.socket.io.on('reconnect', (attempt: number) => {
        socketDebug(`✅ [SOCKET-IO-CLIENT] Reconnected after ${attempt} attempt(s)`);
        this.reconnectAttempts = 0;
        this.emit('reconnected');
      });

      this.socket.io.on('reconnect_error', (error: Error) => {
        socketDebug('🔄 [SOCKET-IO-CLIENT] Reconnect error', error.message);
      });

      this.socket.io.on('reconnect_failed', () => {
        console.error('❌ [SOCKET-IO-CLIENT] All reconnect attempts exhausted', {
          attempts: this.reconnectAttempts,
        });
        // Trading-ang: feed reconnect chain exhausted is a definite circuit-breaker hit
        // independent of the sliding window count. Force-record it so consumers see
        // 'degraded' even with reconnectAttempts=Infinity (where we'd never normally trip
        // unless the window fills naturally).
        this.recordFailureForCircuitBreaker('reconnect_failed');
      });

      this.socket.on('connect', () => {
        socketDebug('✅ [SOCKET-IO-CLIENT] Connected successfully', {
          socketId: this.socket?.id,
          timestamp: new Date().toISOString(),
        });

        this.isConnecting = false;
        this.reconnectAttempts = 0;
        // Trading-ang: a successful connect closes the circuit. Emits 'recovered' if we
        // were tripped, so the UI banner clears on its own without consumer bookkeeping.
        this.resetCircuitBreaker();
        this.startHeartbeat();
        this.emit('connected');
      });

      this.socket.on('connected', (data) => {
        socketDebug('✅ [SOCKET-IO-CLIENT] Connected event received', data);
        this.emit('connected', data);
      });

      this.socket.on('subscription_confirmed', (data) => {
        socketDebug('✅ [SOCKET-IO-CLIENT] Subscription confirmed', data);
        this.emit('subscription_confirmed', data);
      });

      this.socket.on('market_data', (data: MarketDataQuote) => {
        socketDebug('📊 [SOCKET-IO-CLIENT] Market data received', {
          instrumentToken: data.instrumentToken,
          timestamp: data.timestamp,
        });
        this.emit('market_data', data);
      });

      this.socket.on('error', (error: WSMarketDataError) => {
        console.error('❌ [SOCKET-IO-CLIENT] WebSocket error', error);
        this.emit('error', error);
      });

      this.socket.on('disconnect', (reason) => {
        socketDebug('🔌 [SOCKET-IO-CLIENT] Disconnected', {
          reason,
          timestamp: new Date().toISOString(),
        });

        this.isConnecting = false;
        this.stopHeartbeat();
        this.emit('disconnected', { reason });
        // Native reconnection: Manager handles retry automatically for transient disconnects
        // ('transport close', 'ping timeout', etc.). 'io client disconnect' skips auto-retry.
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ [SOCKET-IO-CLIENT] Connection error', error);
        this.isConnecting = false;
        // Trading-ang: per-attempt failures feed the sliding window. The breaker trips
        // when N of these happen within the window — distinct from `reconnect_failed`
        // which only fires for finite reconnectAttempts.
        this.recordFailureForCircuitBreaker(error.message);
        this.emit('error', { message: error.message, code: 'CONNECTION_ERROR' });
        // Manager retries automatically; no manual scheduleReconnect() needed.
      });
    } catch (error) {
      console.error('❌ [SOCKET-IO-CLIENT] Failed to create connection', error);
      this.isConnecting = false;
      this.emit('error', { message: (error as Error).message, code: 'INIT_ERROR' });
    }
  }

  disconnect(): void {
    socketDebug('🔌 [SOCKET-IO-CLIENT] Disconnecting...');

    this.shouldReconnect = false;
    this.isConnecting = false;
    this.stopHeartbeat();
    this.disposeCurrentSocket();

    this.emit('disconnected');
    socketDebug('✅ [SOCKET-IO-CLIENT] Disconnected');
  }

  /**
   * Tear down the transport and reconnect with a fresh io() instance.
   * Keeps service-layer subscription maps intact; emits 'disconnected' so the hook
   * can detect the gap, then 'connected' once the new socket handshakes successfully.
   * Used for tab-back / network-change scenarios.
   */
  forceReconnect(): void {
    socketDebug('🔄 [SOCKET-IO-CLIENT] forceReconnect');
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.stopHeartbeat();
    this.disposeCurrentSocket();
    this.isConnecting = false;
    this.emit('disconnected', { reason: 'force_reconnect' });
    this.connect();
  }

  subscribe(instruments: SubscriptionKey[], mode: 'ltp' | 'ohlcv' | 'full'): void {
    if (!this.socket?.connected) {
      console.warn('⚠️ [SOCKET-IO-CLIENT] Cannot subscribe - not connected');
      return;
    }

    // Canonical symbols (e.g. "NSE:RELIANCE") go in `symbols[]`; numeric/exchange-qualified
    // keys (e.g. "NSE_EQ-738561", 738561) go in `instruments[]`. Server resolves both.
    const symbols = instruments.filter((k) => String(k).includes(':'));
    const exchangeQualified = instruments.filter((k) => !String(k).includes(':'));

    socketDebug('📡 [SOCKET-IO-CLIENT] Subscribing', {
      symbols: symbols.length,
      instruments: exchangeQualified.length,
      mode,
    });

    const payload: Record<string, unknown> = { mode };
    if (symbols.length > 0) payload.symbols = symbols;
    if (exchangeQualified.length > 0) payload.instruments = exchangeQualified;
    this.socket.emit('subscribe', payload);
  }

  unsubscribe(instruments: SubscriptionKey[]): void {
    if (!this.socket?.connected) {
      console.warn('⚠️ [SOCKET-IO-CLIENT] Cannot unsubscribe - not connected');
      return;
    }

    const symbols = instruments.filter((k) => String(k).includes(':'));
    const exchangeQualified = instruments.filter((k) => !String(k).includes(':'));

    socketDebug('🚫 [SOCKET-IO-CLIENT] Unsubscribing', {
      symbols: symbols.length,
      instruments: exchangeQualified.length,
    });

    const payload: Record<string, unknown> = {};
    if (symbols.length > 0) payload.symbols = symbols;
    if (exchangeQualified.length > 0) payload.instruments = exchangeQualified;
    this.socket.emit('unsubscribe', payload);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        socketDebug('💓 [SOCKET-IO-CLIENT] Heartbeat');
        this.socket.emit('ping');
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  get isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  get socketId(): string | undefined {
    return this.socket?.id;
  }
}
