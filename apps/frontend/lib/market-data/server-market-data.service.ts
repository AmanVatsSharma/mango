/**
 * @file server-market-data.service.ts
 * @module lib/market-data
 * @description Server-side Socket.IO market-data client + in-memory quote cache for workers (positions/order).
 * @author StockTrade
 * @created 2026-02-12
 * @updated 2026-03-30
 *
 * Notes: `waitForFreshQuote` can run unsubscribe+subscribe + second wait when quotes stay stale (position close).
 */

/**
 * NOTE: Avoid `import "server-only"` here.
 * The `server-only` package relies on Next.js bundler conditions and throws when executed via `tsx` in workers.
 */
import { io, type Socket } from "socket.io-client"
import type { MarketDataQuote, SubscriptionKey, SubscriptionMode, WSMarketDataError } from "@/lib/market-data/providers/types"
import { baseLogger } from "@/lib/observability/logger"
import {
  normalizeMarketDataFiniteNumber,
  normalizeMarketDataPositiveToken,
  normalizeMarketDataQuoteMaxAgeMs,
} from "@/lib/market-data/market-data-number-utils"
import type { ServerCachedQuote } from "@/lib/market-data/server-cached-quote"
import {
  scheduleMarketQuoteRedisWrite,
  setMarketQuoteRedisMirrorMinIntervalMs,
} from "@/lib/server/market-quote-tick-writer"
import { resolveMarketDisplayQuoteFreshness } from "@/lib/server/market-display-pnl-meta"

export type { ServerCachedQuote } from "@/lib/market-data/server-cached-quote"

export type ServerMarketDataHealth = {
  isConnected: boolean
  socketId: string | null
  lastConnectedAt: number | null
  lastDisconnectedAt: number | null
  lastMessageAt: number | null
  lastErrorAt: number | null
  lastConnectErrorAt: number | null
  lastConnectErrorMessage: string | null
  lastConnectErrorAgeMs: number | null
  lastSocketErrorAt: number | null
  lastSocketErrorCode: string | null
  lastSocketErrorMessage: string | null
  lastSocketErrorAgeMs: number | null
  subscriptionErrorCount: number
  subscriptionErrorSample: Array<{ token: number; code: string; message: string; at: number }>
  subscriptions: number
  cachedQuotes: number
  wantedSubscriptions: number
  subscribedSubscriptions: number
  lastMessageAgeMs: number | null
  lastErrorAgeMs: number | null
  quoteMaxAgeMs: number
  wsUrl: string
  usingDemoApiKey: boolean
}

type ServerMarketDataConfig = {
  url: string
  apiKey: string
  mode: SubscriptionMode
  quoteMaxAgeMs: number
}

export type WaitForFreshQuoteInput = {
  timeoutMs?: number
  maxAgeMs?: number
  pollMs?: number
  /**
   * Optional exchange-aware subscription key to warm the quote cache (e.g. "NSE_FO-2953217").
   * Quotes are still consumed by numeric `instrumentToken`.
   */
  subscriptionKey?: SubscriptionKey
  /**
   * When the first `timeoutMs` window ends with no fresh quote: emit `unsubscribe` + `subscribe` for this key,
   * then wait up to this many ms more. Pass `0` to disable (default for generic callers).
   */
  resubscribeRetryTimeoutMs?: number
}

const DEFAULT_WAIT_TIMEOUT_MS = 1_250
const DEFAULT_WAIT_POLL_MS = 100
/** Second-phase wait for square-off callers that set `resubscribeRetryTimeoutMs`. */
export const SERVER_MARKET_DATA_RESUBSCRIBE_RETRY_MS = 1_500

/**
 * Split a heterogeneous list of subscription keys into the upstream WS payload shape:
 *   - canonical symbols (strings containing `:`, e.g. "NSE:RELIANCE", "BSE_FO:SENSEX25...")
 *     go into `symbols[]`
 *   - everything else (numeric tokens, exchange-qualified strings like "NSE_EQ-738561",
 *     numeric uirIds when sent as numbers) goes into `instruments[]`
 *
 * Mirrors the frontend `SocketIOClient.subscribe` so the server-side subscriber reaches
 * the upstream gateway via the same routing the gateway expects. Returning a sparse object
 * (only the populated arrays) keeps payloads tight and matches the frontend contract.
 *
 * Exported for unit testing — callers should prefer the class methods.
 */
export function buildUpstreamSubscribePayload(
  keys: SubscriptionKey[],
): { symbols?: string[]; instruments?: SubscriptionKey[] } {
  const symbols: string[] = []
  const instruments: SubscriptionKey[] = []
  for (const key of keys) {
    if (typeof key === "string" && key.includes(":")) {
      symbols.push(key)
    } else {
      instruments.push(key)
    }
  }
  const out: { symbols?: string[]; instruments?: SubscriptionKey[] } = {}
  if (symbols.length > 0) out.symbols = symbols
  if (instruments.length > 0) out.instruments = instruments
  return out
}

export function resolveWsUrl(raw: string): { baseUrl: string; namespace: string; socketPath: string } {
  let rawUrl = raw.trim()
  let normalizedUrl = rawUrl
  if (normalizedUrl.startsWith("ws://")) normalizedUrl = normalizedUrl.replace("ws://", "http://")
  if (normalizedUrl.startsWith("wss://")) normalizedUrl = normalizedUrl.replace("wss://", "https://")
  if (!normalizedUrl.includes("://")) normalizedUrl = "https://" + normalizedUrl

  let urlObj: URL
  try {
    urlObj = new URL(normalizedUrl)
  } catch {
    throw new Error(`Invalid LIVE_MARKET_WS_URL: ${raw}`)
  }

  const baseUrl = `${urlObj.protocol}//${urlObj.host}`
  let namespace = urlObj.pathname
  if (!namespace || namespace === "/") {
    namespace = "/market-data"
  }
  const socketPath = "/socket.io"

  return { baseUrl, namespace, socketPath }
}

function defaultServerMarketDataConfig(): ServerMarketDataConfig {
  // ... rest of the function ...
  // Trading-q05: pre-fix this silently fell back to the shared dev host
  // ("https://marketdata.vedpragya.com") when LIVE_MARKET_WS_URL was unset.
  // Mirror of the client-side hardening — in production, refuse the silent
  // fallback. In dev/test, log and continue.
  // (Default is the BARE host — no `/market-data` namespace appended. If
  // your gateway expects a namespace, set LIVE_MARKET_WS_URL explicitly,
  // e.g. "https://your.host/market-data". See resolveWsUrl for why
  // auto-appending was a bug.)
  const FALLBACK_URL = "https://marketdata.vedpragya.com"
  const isProductionBuild = process.env.NODE_ENV === "production"
  const envUrl = process.env.LIVE_MARKET_WS_URL || process.env.NEXT_PUBLIC_LIVE_MARKET_WS_URL
  const url = (() => {
    if (envUrl) return envUrl
    if (isProductionBuild) {
      const msg =
        "[server-market-data] LIVE_MARKET_WS_URL is required in production but is unset. " +
        "Refusing to fall back to a hardcoded host."
      // Throw at config resolution time — caller (ServerMarketDataService
      // ctor) will surface in startup logs and the worker will not boot
      // pointing at the wrong gateway.
      throw new Error(msg)
    }
    baseLogger
      .child({ module: "server-market-data" })
      .warn(`LIVE_MARKET_WS_URL unset — using dev fallback ${FALLBACK_URL}`)
    return FALLBACK_URL
  })()

  // Trading-20s: same prod-throw / dev-warn policy as the URL fallback.
  // The hardcoded "marketpulse-key-1" silently authed against the gateway
  // when a prod deploy missed the env var — either failed with
  // WS_AUTH_INVALID or hit a misconfigured demo namespace.
  const FALLBACK_API_KEY = "marketpulse-key-1"
  const apiKeyEnv = process.env.LIVE_MARKET_WS_API_KEY || process.env.NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY
  const apiKey = (() => {
    if (apiKeyEnv) return apiKeyEnv
    if (isProductionBuild) {
      throw new Error(
        "[server-market-data] LIVE_MARKET_WS_API_KEY is required in production but is unset. " +
          "Refusing to connect with the hardcoded demo key.",
      )
    }
    baseLogger
      .child({ module: "server-market-data" })
      .warn(`LIVE_MARKET_WS_API_KEY unset — using dev fallback '${FALLBACK_API_KEY}'`)
    return FALLBACK_API_KEY
  })()

  return {
    url,
    apiKey,
    mode: "ltp",
    quoteMaxAgeMs: normalizeMarketDataQuoteMaxAgeMs(process.env.MARKETDATA_QUOTE_MAX_AGE_MS, 7_500),
  }
}

export class ServerMarketDataService {
  private readonly log = baseLogger.child({ module: "server-market-data" })
  private readonly cfg: ServerMarketDataConfig

  private socket: Socket | null = null
  private initPromise: Promise<void> | null = null

  private readonly wantedKeys = new Map<string, SubscriptionKey>()
  private readonly subscribedKeys = new Set<string>()
  private readonly subscriptionErrorsByToken = new Map<number, { code: string; message: string; at: number }>()
  private readonly quotes = new Map<number, ServerCachedQuote>()

  private lastConnectedAt: number | null = null
  private lastDisconnectedAt: number | null = null
  private lastMessageAt: number | null = null
  private lastErrorAt: number | null = null
  private lastConnectErrorAt: number | null = null
  private lastConnectErrorMessage: string | null = null
  private lastSocketErrorAt: number | null = null
  private lastSocketErrorCode: string | null = null
  private lastSocketErrorMessage: string | null = null

  constructor(config?: Partial<ServerMarketDataConfig>) {
    this.cfg = { ...defaultServerMarketDataConfig(), ...config }
  }

  private normalizeSubscriptionKey(key: SubscriptionKey): string {
    if (typeof key === "number") {
      return key.toString()
    }
    return key.trim().toUpperCase()
  }

  async ensureInitialized(): Promise<void> {
    if (this.initPromise) return this.initPromise

    this.initPromise = (async () => {
      // Apply admin-configured Redis write throttle (falls back to default 100ms on error)
      try {
        const quoteFresh = await resolveMarketDisplayQuoteFreshness()
        setMarketQuoteRedisMirrorMinIntervalMs(quoteFresh.marketQuoteRedisWriteMinIntervalMs)
      } catch {
        // Non-fatal — default interval stays in effect
      }

      const { baseUrl, namespace, socketPath } = resolveWsUrl(this.cfg.url)
      const usingDemoApiKey = this.usingDemoApiKey()
      if (usingDemoApiKey && process.env.NODE_ENV !== "test") {
        const logMethod = process.env.NODE_ENV === "production" ? this.log.error.bind(this.log) : this.log.warn.bind(this.log)
        logMethod(
          {
            wsUrl: baseUrl + namespace,
            nodeEnv: process.env.NODE_ENV || "unknown",
          },
          "using demo/default market-data API key; fresh quotes may be unavailable in this environment",
        )
      }
      this.log.info(
        {
          wsUrl: baseUrl + namespace,
          socketPath,
          hasApiKey: Boolean(this.cfg.apiKey),
          usingDemoApiKey,
          mode: this.cfg.mode,
          quoteMaxAgeMs: this.cfg.quoteMaxAgeMs,
        },
        "initializing",
      )

      const socket = io(baseUrl + namespace, {
        path: socketPath,
        query: { api_key: this.cfg.apiKey },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 15_000,
        timeout: 10_000,
      })

      socket.on("connect", () => {
        this.lastConnectedAt = Date.now()
        this.log.info({ socketId: socket.id }, "connected")
        this.resubscribeAllBestEffort()
      })

      socket.on("disconnect", (reason) => {
        this.lastDisconnectedAt = Date.now()
        this.log.warn({ reason }, "disconnected")
        // When reconnecting, we’ll resubscribe from wantedTokens.
        this.subscribedKeys.clear()
      })

      socket.on("connect_error", (err) => {
        this.lastErrorAt = Date.now()
        this.lastConnectErrorAt = this.lastErrorAt
        this.lastConnectErrorMessage = (err as any)?.message || String(err)
        this.log.error({ message: this.lastConnectErrorMessage }, "connect_error")
      })

      socket.on("error", (err: WSMarketDataError) => {
        this.lastErrorAt = Date.now()
        const code = typeof (err as any)?.code === "string" ? (err as any).code : "UNKNOWN_ERROR"
        const message = typeof (err as any)?.message === "string" ? (err as any).message : ""
        const token =
          normalizeMarketDataPositiveToken((err as any)?.token) ??
          normalizeMarketDataPositiveToken((err as any)?.instrumentToken) ??
          normalizeMarketDataPositiveToken((err as any)?.instrument_token)

        if (token !== null) {
          this.subscriptionErrorsByToken.set(token, {
            code,
            message: message || "Subscription error for instrument token",
            at: Date.now(),
          })
          this.log.warn({ code, token, message }, "subscription_error")
          return
        }

        this.lastSocketErrorAt = this.lastErrorAt
        this.lastSocketErrorCode = code
        this.lastSocketErrorMessage = message || null
        this.log.error({ err }, "socket_error")
      })

      socket.on("market_data", (payload: MarketDataQuote) => {
        try {
          this.lastMessageAt = Date.now()
          this.handleMarketData(payload)
        } catch (e) {
          this.lastErrorAt = Date.now()
          this.log.error({ message: (e as any)?.message || String(e) }, "market_data_handler_failed")
        }
      })

      this.socket = socket
    })()

    return this.initPromise
  }

  getHealth(): ServerMarketDataHealth {
    const now = Date.now()
    const urlInfo = resolveWsUrl(this.cfg.url)
    return {
      isConnected: Boolean(this.socket?.connected),
      socketId: this.socket?.id || null,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
      lastMessageAt: this.lastMessageAt,
      lastErrorAt: this.lastErrorAt,
      lastConnectErrorAt: this.lastConnectErrorAt,
      lastConnectErrorMessage: this.lastConnectErrorMessage,
      lastConnectErrorAgeMs: this.lastConnectErrorAt ? Math.max(0, now - this.lastConnectErrorAt) : null,
      lastSocketErrorAt: this.lastSocketErrorAt,
      lastSocketErrorCode: this.lastSocketErrorCode,
      lastSocketErrorMessage: this.lastSocketErrorMessage,
      lastSocketErrorAgeMs: this.lastSocketErrorAt ? Math.max(0, now - this.lastSocketErrorAt) : null,
      subscriptionErrorCount: this.subscriptionErrorsByToken.size,
      subscriptionErrorSample: Array.from(this.subscriptionErrorsByToken.entries())
        .slice(-15)
        .map(([token, entry]) => ({ token, ...entry })),
      subscriptions: this.subscribedKeys.size,
      cachedQuotes: this.quotes.size,
      wantedSubscriptions: this.wantedKeys.size,
      subscribedSubscriptions: this.subscribedKeys.size,
      lastMessageAgeMs: this.lastMessageAt ? Math.max(0, now - this.lastMessageAt) : null,
      lastErrorAgeMs: this.lastErrorAt ? Math.max(0, now - this.lastErrorAt) : null,
      quoteMaxAgeMs: this.cfg.quoteMaxAgeMs,
      wsUrl: urlInfo.baseUrl + urlInfo.namespace,
      usingDemoApiKey: this.usingDemoApiKey(),
    }
  }

  ensureSubscribed(keys: SubscriptionKey[]): void {
    for (const key of keys) {
      if (typeof key === "number") {
        const normalizedToken = normalizeMarketDataPositiveToken(key)
        if (normalizedToken !== null) {
          this.wantedKeys.set(normalizedToken.toString(), normalizedToken)
        }
        continue
      }
      if (typeof key === "string") {
        const normalizedKey = this.normalizeSubscriptionKey(key)
        if (normalizedKey) {
          this.wantedKeys.set(normalizedKey, normalizedKey)
        }
      }
    }
    this.subscribeWantedBestEffort()
  }

  getQuote(instrumentToken: number, input?: { maxAgeMs?: number }): ServerCachedQuote | null {
    const token = normalizeMarketDataPositiveToken(instrumentToken)
    if (token === null) return null

    const q = this.quotes.get(token) || null
    if (!q) return null

    const maxAgeMs = Math.max(0, input?.maxAgeMs ?? this.cfg.quoteMaxAgeMs)
    const age = Date.now() - q.receivedAt
    if (maxAgeMs > 0 && age > maxAgeMs) return null

    return q
  }

  /**
   * Drops local subscribe state and emits `unsubscribe` + `subscribe` so the upstream may replay ticks.
   */
  forceResubscribeSubscriptionKeys(keys: SubscriptionKey[]): void {
    if (keys.length === 0) return
    this.ensureSubscribed(keys)
    const socket = this.socket
    if (!socket?.connected) {
      this.subscribeWantedBestEffort()
      return
    }

    const collected: SubscriptionKey[] = []
    for (const key of keys) {
      if (typeof key === "number") {
        const t = normalizeMarketDataPositiveToken(key)
        if (t !== null) {
          this.subscribedKeys.delete(t.toString())
          collected.push(t)
        }
        continue
      }
      if (typeof key === "string") {
        const nk = this.normalizeSubscriptionKey(key)
        if (nk) {
          this.subscribedKeys.delete(nk)
          // Use the same uppercased form `subscribeWantedBestEffort` emitted on subscribe
          // so the upstream gateway can match this unsubscribe against the live subscription.
          // (The normalizer uppercases canonical symbols too — matches the existing wantedKeys map.)
          collected.push(nk)
        }
      }
    }
    if (collected.length === 0) return

    const payload = buildUpstreamSubscribePayload(collected)
    this.log.info(
      {
        symbolsCount: payload.symbols?.length ?? 0,
        instrumentsCount: payload.instruments?.length ?? 0,
        reason: "resubscribe_after_stale_quote",
      },
      "market_data_resubscribe",
    )
    socket.emit("unsubscribe", payload)
    this.subscribeWantedBestEffort()
  }

  private async waitForFreshQuotePollingPhase(
    token: number,
    maxAgeMs: number,
    pollMs: number,
    timeoutMs: number,
  ): Promise<ServerCachedQuote | null> {
    const immediateQuote = this.getQuote(token, { maxAgeMs })
    if (immediateQuote) {
      return immediateQuote
    }
    if (timeoutMs === 0) {
      return null
    }
    const deadlineAt = Date.now() + timeoutMs
    while (Date.now() <= deadlineAt) {
      await new Promise((resolve) => setTimeout(resolve, pollMs))
      const candidateQuote = this.getQuote(token, { maxAgeMs })
      if (candidateQuote) {
        return candidateQuote
      }
    }
    return null
  }

  async waitForFreshQuote(instrumentToken: number, input: WaitForFreshQuoteInput = {}): Promise<ServerCachedQuote | null> {
    const token = normalizeMarketDataPositiveToken(instrumentToken)
    if (token === null) return null

    const timeoutMs = Math.max(0, normalizeMarketDataQuoteMaxAgeMs(input.timeoutMs, DEFAULT_WAIT_TIMEOUT_MS))
    const pollMs = Math.max(25, normalizeMarketDataQuoteMaxAgeMs(input.pollMs, DEFAULT_WAIT_POLL_MS))
    const maxAgeMs = Math.max(0, normalizeMarketDataQuoteMaxAgeMs(input.maxAgeMs, this.cfg.quoteMaxAgeMs))
    const resubscribeRetryTimeoutMs = Math.max(
      0,
      normalizeMarketDataQuoteMaxAgeMs(input.resubscribeRetryTimeoutMs, 0),
    )

    await this.ensureInitialized().catch((error) => {
      this.lastErrorAt = Date.now()
      this.log.warn({ token, message: (error as any)?.message || String(error) }, "waitForFreshQuote init failed")
    })
    const keyToSubscribe: SubscriptionKey = input.subscriptionKey ?? token
    this.ensureSubscribed([keyToSubscribe])

    let quote = await this.waitForFreshQuotePollingPhase(token, maxAgeMs, pollMs, timeoutMs)
    if (quote) {
      return quote
    }
    if (resubscribeRetryTimeoutMs > 0) {
      this.forceResubscribeSubscriptionKeys([keyToSubscribe])
      quote = await this.waitForFreshQuotePollingPhase(token, maxAgeMs, pollMs, resubscribeRetryTimeoutMs)
      if (quote) {
        return quote
      }
    }
    return null
  }

  private handleMarketData(payload: MarketDataQuote): void {
    const token = normalizeMarketDataPositiveToken(payload.instrumentToken)
    if (token === null) return

    const ltp = normalizeMarketDataFiniteNumber((payload as any)?.data?.last_price)
    if (ltp == null || ltp <= 0) return

    // For day PnL we want previous close; most feeds provide it as OHLC close.
    const prevClose = normalizeMarketDataFiniteNumber((payload as any)?.data?.ohlc?.close)

    const quote: ServerCachedQuote = {
      instrumentToken: token,
      last_trade_price: ltp,
      prev_close_price: prevClose != null && prevClose > 0 ? prevClose : undefined,
      close: prevClose != null && prevClose > 0 ? prevClose : undefined,
      receivedAt: Date.now(),
      upstreamTimestamp: payload.timestamp,
    }

    this.quotes.set(token, quote)
    // If quotes are flowing, clear any token-scoped subscription error for this instrument.
    this.subscriptionErrorsByToken.delete(token)
    scheduleMarketQuoteRedisWrite(token, quote)
  }

  private subscribeWantedBestEffort(): void {
    const socket = this.socket
    if (!socket?.connected) return

    const toSubscribe: Array<{ normalizedKey: string; key: SubscriptionKey }> = []
    this.wantedKeys.forEach((key, normalizedKey) => {
      if (!this.subscribedKeys.has(normalizedKey)) {
        toSubscribe.push({ normalizedKey, key })
      }
    })

    if (toSubscribe.length === 0) return

    // Keep subscriptions bounded per request to avoid huge payloads. The upstream gateway
    // expects canonical symbols in `symbols[]` and numeric / exchange-qualified keys in
    // `instruments[]` — same convention as the frontend SocketIOClient. Emitting both as
    // `instruments[]` was a regression that left the backend silently un-subscribed for
    // every watchlist row whose subscription key was a canonical symbol (e.g. "NSE:RELIANCE",
    // "BSE_FO:SENSEX25MAY80000CE"), which then surfaced at order placement as the misleading
    // "Exchange rejected: stale quote (>Ns). Please retry." error.
    const CHUNK = 400
    for (let i = 0; i < toSubscribe.length; i += CHUNK) {
      const chunk = toSubscribe.slice(i, i + CHUNK)
      const payload = buildUpstreamSubscribePayload(chunk.map((entry) => entry.key))
      socket.emit("subscribe", { ...payload, mode: this.cfg.mode })
      chunk.forEach((entry) => this.subscribedKeys.add(entry.normalizedKey))
    }
  }

  private resubscribeAllBestEffort(): void {
    // On reconnect we rebuild subscribedTokens from wantedTokens.
    this.subscribedKeys.clear()
    this.subscribeWantedBestEffort()
  }

  private usingDemoApiKey(): boolean {
    const normalizedKey = (this.cfg.apiKey || "").trim().toLowerCase()
    return normalizedKey.length === 0 || normalizedKey === "marketpulse-key-1" || normalizedKey.startsWith("demo")
  }
}

let singleton: ServerMarketDataService | null = null

export function getServerMarketDataService(): ServerMarketDataService {
  if (!singleton) singleton = new ServerMarketDataService()
  return singleton
}

