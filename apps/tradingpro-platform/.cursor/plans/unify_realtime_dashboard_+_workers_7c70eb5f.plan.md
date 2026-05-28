---
name: Unify realtime dashboard + workers
overview: Unify live market quotes and trading lifecycle updates so /dashboard + watchlist stay smooth, and PositionPnLWorker + OrderExecutionWorker use the same robust marketdata feed as the dashboard (single-node deployment).
todos:
  - id: inventory-quote-shape
    content: Inspect WS quote payload (EnhancedQuote) to confirm availability of ltp/prevClose and define a stable server quote DTO.
    status: completed
  - id: server-quote-cache
    content: Implement server-side Socket.IO quote cache service with health/lag and subscription management.
    status: completed
  - id: wire-position-worker
    content: Update PositionPnLWorker to use the server quote cache (with fallback) and keep heartbeat behavior.
    status: completed
  - id: wire-order-worker
    content: Update OrderExecutionWorker execution price fallback to use server quote cache when needed.
    status: completed
  - id: watchlist-token-unification
    content: Unify watchlist token source so provider + watchlist manager don’t diverge; ensure subscriptions cover active watchlist(s).
    status: completed
  - id: logging-correlation
    content: Replace console logs with Pino-based logger and include requestId/correlation in SSE + worker logs; remove duplicated welcome messages.
    status: completed
  - id: tests-and-docs
    content: Add/update tests for quote cache + worker integrations; update relevant MODULE_DOC.md changelog entries and docs sync targets.
    status: completed
isProject: false
---

## What’s happening today (facts)

- **Trading state (orders/positions/account) is “live” via SSE + coalesced SWR refresh** on the client.
  - Trading provider listens to SSE and debounces refresh so UI doesn’t show partial state.

```123:198:/home/amansharma/Desktop/DevOPS/tradingpro-platform/components/trading/realtime/trading-realtime-provider.tsx
  const scheduleCoalescedRefresh = useCallback(
    (flags: { orders?: boolean; positions?: boolean; account?: boolean }, reason: string) => {
      // ...
      state.timer = setTimeout(async () => {
        // refresh orders/positions/account together
      }, 175)
    },
    [ordersHook, positionsHook, accountHook, log, userId],
  )

  useSharedSSE(userId, onSseEvent)
```

- **SSE server is backed by an in-memory singleton emitter** (OK for your chosen **single-node** deploy model).

```45:56:/home/amansharma/Desktop/DevOPS/tradingpro-platform/app/api/realtime/stream/route.ts
    const eventEmitter = getRealtimeEventEmitter()

    const stream = new ReadableStream({
      async start(controller) {
        eventEmitter.subscribe(userId, controller)
```

- **Live quotes for dashboard/watchlist come from a Socket.IO WebSocket feed** (`NEXT_PUBLIC_LIVE_MARKET_WS_URL`).

```158:173:/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/market-data/providers/WebSocketMarketDataProvider.tsx
  const wsData = useWebSocketMarketData({
    url: wsUrl,
    apiKey,
    autoConnect: isEnabled,
    // ...
  })

  const { watchlist } = useUserWatchlist(userId)
```

- **PositionPnLWorker currently fetches quotes from Vortex HTTP** (`requestQuotesBatched`) and only falls back to DB `Stock.ltp` if that fails.

```184:223:/home/amansharma/Desktop/DevOPS/tradingpro-platform/lib/services/position/PositionPnLWorker.ts
      const instruments = Array.from(new Set(positions.map((p) => p.Stock?.instrumentId).filter(Boolean)))

      let quotes: Record<string, any> = {}
      try {
        if (instruments.length > 0) {
          quotes = await requestQuotesBatched(instruments, "ltp", { clientId: "position-pnl-worker" })
        }
      } catch (e) {
        quotes = {}
      }

      const norm = normalizeQuotePrices({ quote, stockLtp: p.Stock?.ltp ?? null, averagePrice: avg })
```

- **Watchlist has duplication risk**: provider uses GraphQL `useUserWatchlist` for subscription tokens while watchlist UI uses REST/SWR for CRUD; this can cause token-subscription mismatches (multiple watchlists, active tab changes).

## Target end-state

- **Single canonical quote source: the same WebSocket marketdata feed used by `/dashboard**` (your selection).
- **Workers (PositionPnLWorker + OrderExecutionWorker)** read quotes from a shared **server-side quote cache** populated by a server Socket.IO client.
- Dashboard/watchlist continue to use client WS, but with **one canonical watchlist token source** to prevent resubscribe churn and missing tokens.
- Logging + correlation improved (replace `console.*` with Pino logger wrapper; propagate requestId in SSE/worker logs).

## Design (minimal changes, high leverage)

### A) Add a server-side MarketData quote cache (Socket.IO client)

- Create a Node-safe service (e.g. `lib/market-data/server/server-market-data.service.ts`) that:
  - Connects to `LIVE_MARKET_WS_URL` + key (server env vars, not `NEXT_PUBLIC_*`).
  - Maintains an in-memory `Map<instrumentId|token, Quote>` cache with timestamps.
  - Exposes `getQuote(token)` and `getQuotes(tokens[])` plus `ensureSubscribed(tokens[])`.
  - Exposes a **health** signal (connected, lastMessageAt, lagMs).

### B) Make PositionPnLWorker use the server WS cache

- Replace `requestQuotesBatched(...)` with `serverMarketData.getQuotes(...)`.
- Preserve fallbacks:
  - If WS quote missing/stale, fall back to `Stock.ltp` (existing behavior).
- Verify quote fields needed for `normalizeQuotePrices` (especially `prevClose`).
  - If WS payload lacks `prevClose`, add a DB fallback (e.g. `Stock.prevClose`) or compute dayPnL conditionally.

### C) Improve OrderExecutionWorker execution price fallbacks

- When order lacks a valid price/avgPrice, prefer **fresh WS LTP** via server quote cache rather than DB `Stock.ltp`.
- Keep advisory lock + transactional integrity unchanged.

### D) Consolidate watchlist token source for subscriptions

- Pick **one** watchlist source for tokens:
  - Option 1 (recommended): change `WebSocketMarketDataProvider` to consume tokens from the same REST/SWR hooks used by `WatchlistManager`.
  - Option 2: switch watchlist UI to use GraphQL everywhere.
- Ensure subscription updates are driven only by the effective active watchlist + positions tokens (avoid double subscribe from both provider and watchlist manager).

### E) Realtime/SSE robustness (single-node tuned)

- Remove duplicate “connected” welcome writes (currently both route + emitter send a welcome).
- Replace `console.log/error` in SSE route + emitter + shared-sse hook with structured logger (Pino wrapper), including `requestId`.

## Verification checklist

- Run unit tests for workers (existing order worker tests + add/adjust tests for quote-source changes).
- Manual check:
  - `/dashboard` updates after order execution + position updates; no partial-state flicker.
  - Watchlist tab switching subscribes/unsubscribes correctly; quotes appear for all items.
  - Position PnL updates persist and dashboard reflects them (server PnL mode on).

## Notes / constraints

- Because your deploy model is **single-node**, an in-memory emitter/cache is acceptable. If you later move to multi-replica/serverless, we should swap the emitter and quote cache to Redis/NATS with minimal API changes.

