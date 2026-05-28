# Realtime Architecture — Prana Stream

> **Scope:** Socket.IO gateway, market data adapter chain, tick throttling, Redis scaling adapter, and SSE streams.
> Last updated: 2026-05-23

---

## Architecture Diagram

```
                          Market Data Providers
                    ┌──────────────┴──────────────┐
                    │                             │
            main-market-data.adapter.ts   vortex-market-data.adapter.ts
            (MARKET_DATA_URL)             (MARKET_DATA_FALLBACK_URL)
                    │                             │
                    └──────────────┬──────────────┘
                                   │
                         composite-market-data.adapter.ts
                         (selects first healthy, fails over)
                                   │
                                   ▼
                      RealtimeAggregatorService
                    (merges market ticks + OMS/Positions/Accounts diffs)
                                   │
                                   ▼
                       TickThrottlerService
                    (per-user buffer, emits latest per symbol per window)
                                   │
                                   ▼
                        PranaStreamGateway
                    (Socket.IO /ws/prana, JWT auth, Redis adapter)
                                   │
                                   ▼
                               Socket.io
                                   │
                                   ▼
                          Connected Clients
                    (frontend trading dashboard, broker-admin monitoring)
```

---

## Market Data Providers

Four adapters exist in `modules/realtime/prana-stream/adapters/`:

### 1. MainMarketDataAdapter
- **Env:** `MARKET_DATA_URL` (e.g. `http://market-data-api:3000`)
- **Role:** Primary live data source
- **Behavior:** Polls or fetches on demand; returns structured quote objects

### 2. VortexMarketDataAdapter
- **Env:** `MARKET_DATA_FALLBACK_URL` (e.g. `http://market-data-fallback:3001`)
- **Role:** Fallback when main provider is unhealthy
- **Behavior:** Same interface as main adapter; called if main throws or times out

### 3. MockMarketDataAdapter
- **Role:** Test and development only
- **Behavior:** Returns deterministic fixture data; no external dependencies

### 4. CompositeMarketDataAdapter
- **Behavior:** Tries providers in priority order (main → vortex → mock)
  - Calls `main.fetchQuote(symbol)` first
  - On error or timeout (configurable, default 3s), calls `vortex.fetchQuote(symbol)`
  - If vortex also fails, falls back to `mock.fetchQuote(symbol)` so the system never hard-fails
- **Health check:** Emits `provider.health` events; CompositeMarketDataAdapter tracks which provider is currently active

---

## PranaStreamGateway

**File:** `modules/realtime/prana-stream/gateways/prana-stream.gateway.ts`

- **Protocol:** Socket.IO
- **Namespace:** `/ws/prana`
- **Auth:** JWT passed as auth token in the Socket.IO handshake `auth` object
  - Connection is rejected (HTTP 401 equivalent) if JWT is missing, expired, or invalid
  - On success: `req.user` is populated from the JWT; user is joined to room `user:<userId>`
- **Redis adapter:** Enabled when `REDIS_URL` is set (see Redis Adapter section)
- **Horizontal scaling:** `RealtimeScaleCoordinatorService` coordinates which instance handles which user when multiple backend instances are running behind a load balancer

**Registered events (client → server):**

| Event | Payload | Description |
|---|---|---|
| `subscribe` | `SubscriptionRequest` | Request snapshots + live diffs |
| `unsubscribe` | `UnsubscribeRequest` | Stop receiving updates |
| `updateSymbols` | `string[]` | Change watchlist symbols mid-session |

**Emitted events (server → client):**

| Event | Payload | Description |
|---|---|---|
| `snapshot` | `SnapshotResponse` | Initial state: open orders, positions, account balances, watchlist quotes |
| `watchlist.tick` | `TickEvent` | Price update for a watchlist symbol |
| `order.updated` | `OrderEvent` | Order created / modified / filled / cancelled |
| `position.updated` | `PositionEvent` | Position opened / modified / closed |
| `account.updated` | `AccountEvent` | Balance or margin change |
| `error` | `RealtimeError` | Connection or subscription error |

---

## Redis Adapter

When `REDIS_URL` is set, the Socket.IO Redis adapter is initialized in `main.ts`:

```ts
// main.ts
const { createAdapter } = await import('@socket.io/redis-adapter');
const pubClient  = createClient({ url: REDIS_URL });
const subClient  = pubClient.duplicate();
await pubClient.connect();
await subClient.connect();
server.adapter(createAdapter(pubClient, subClient));
```

**What it enables:**
- All Socket.IO servers in a cluster share subscription state via Redis pub/sub
- A client connected to server A receives events emitted by server B
- Rooms (`user:<userId>`) are distributed across the cluster automatically

**Without Redis** (`REDIS_URL` not set):
- Single-instance mode only — each Socket.IO server is independent
- Users connected to different instances will not receive events emitted to a different instance
- `RealtimeScaleCoordinatorService` falls back to in-memory instance registration

---

## Event Envelope Format

All server-emitted events use the same typed envelope:

```ts
type RealtimeEvent<T> = {
  type:  'watchlist.tick' | 'order.updated' | 'position.updated' | 'account.updated';
  userId: string;
  requestId?: string;   // client-supplied correlation ID (echoed back)
  seq:    number;       // monotonically increasing sequence number per user session
  ts:     string;       // ISO 8601 timestamp
  data:   T;
  v:      1;            // schema version for forward compatibility
};
```

**Example — watchlist tick:**
```json
{
  "type": "watchlist.tick",
  "userId": "user-uuid-123",
  "requestId": "req-abc",
  "seq": 42,
  "ts": "2026-05-23T10:00:01.234Z",
  "data": {
    "symbol": "RELIANCE",
    "bid": 2800.50,
    "ask": 2801.00,
    "last": 2800.75,
    "volume": 1234567,
    "change": 12.30,
    "changePct": 0.44
  },
  "v": 1
}
```

---

## Subscription Protocol

### Full lifecycle

```
Client                           Server
  │                                │
  │── connect(auth: JWT) ─────────►│  validate JWT
  │                                │  join room user:<userId>
  │◄── (connected event) ──────────│
  │                                │
  │── subscribe({                  │  fetch snapshots from DB:
  │     watchlistSymbols: [...],   │    - open orders
  │     orders: true,              │    - current positions
  │     positions: true,           │    - account balances
  │     accounts: true             │    - watchlist quotes
  │   }) ─────────────────────────►│
  │                                │
  │◄── snapshot({ ... }) ──────────│  full baseline state
  │                                │
  │                           Market data continues polling
  │                           TickThrottlerService buffers
  │                                │
  │◄── watchlist.tick ─────────────│  (throttled — one per symbol per window)
  │◄── order.updated ──────────────│  on every order state change
  │◄── position.updated ───────────│  on every position change
  │◄── account.updated ────────────│  on balance/margin update
  │                                │
  │── updateSymbols([...]) ───────►│  change watchlist (replaces old)
  │◄── watchlist.tick (new symbols)│
  │                                │
  │── unsubscribe ────────────────►│  stop all updates
  │                                │
  │── disconnect ──────────────────│  leave room, clean up
```

### Snapshot contents

```ts
type SnapshotResponse = {
  orders:    Order[];
  positions: Position[];
  accounts:  AccountBalance[];
  watchlist: { [symbol: string]: Quote };
  subscribedAt: string;   // ISO timestamp
};
```

---

## Tick Throttling

**Env:** `PRANA_TICK_THROTTLE_MS` (default: `1000`)

**Problem:** Market data providers may emit ticks faster than clients can render (e.g. 100 ticks/sec for a symbol).

**Solution — TickThrottlerService:**
1. Each user has an in-memory buffer keyed by `symbol`
2. Each incoming tick overwrites the buffer entry for that symbol
3. Every `PRANA_TICK_THROTTLE_MS`, a single timer fires per user and emits only the **latest** buffered tick per symbol
4. Stale symbols (no new tick in 2 throttle windows) are evicted from the buffer

**Behavior summary:**
- If 500 ticks arrive for RELIANCE in 1 second → client receives exactly 1 `watchlist.tick` event
- Each user's throttle window is independent (no global synchronization)
- Order/position/account events are **never throttled** — emitted immediately

---

## SSE Streams

SSE provides a simpler one-way alternative to Socket.IO for clients that only need read-only push (no bidirectional communication needed).

### `GET /market/quotes/stream`

- **Auth:** Bearer JWT in `Authorization` header
- **Query:** `?symbols=RELIANCE,TCS&tenantId=acme`
- **Content-Type:** `text/event-stream`
- **Events:** `quote` — one event per symbol per batch interval

```
event: quote
data: {"symbol":"RELIANCE","bid":2800.50,"ask":2801.00,"ts":"2026-05-23T10:00:00Z"}

event: quote
data: {"symbol":"TCS","bid":3200.00,"ask":3201.50,"ts":"2026-05-23T10:00:00Z"}
```

Quotes are batched server-side (not throttled at the TickThrottler level — SSE consumers get raw rate from the provider).

### `GET /orders/stream`

- **Auth:** Bearer JWT
- **Tenant-scoped** (from `X-Tenant-Id` or subdomain)
- **Events:** `order.created`, `order.updated`, `order.filled`, `order.cancelled`
- Each event carries the full order object

---

## Who Connects to Realtime

| Client | Connection type | Subscriptions |
|---|---|---|
| **Frontend trading dashboard** | Socket.IO `/ws/prana` | watchlist, orders, positions, account |
| **Broker admin panel** | Socket.IO `/ws/prana` + SSE | orders, account (live monitoring) |
| **Mobile app (optional)** | SSE `/market/quotes/stream` | watchlist only |

---

## Horizontal Scale Coordinator

`RealtimeScaleCoordinatorService` (`services/realtime-scale-coordinator.service.ts`) manages multi-instance deployments when Redis is present:

- On connect: `registerInstance(instanceId, userIds: string[])`
- On disconnect: `unregisterInstance(instanceId)`
- Before emitting to a user: `shouldHandleUser(instanceId, userId)` — checks Redis for which instance owns the user's room
- Graceful rebalancing: if an instance dies, its users are reassigned on next connect

In single-instance mode, all users are always handled locally.

---

## Env Vars

| Variable | Default | Description |
|---|---|---|
| `PRANA_TICK_THROTTLE_MS` | `1000` | Minimum interval between tick emissions per user |
| `REDIS_URL` | — | Redis URL; enables Socket.IO Redis adapter + scale coordinator |
| `MARKET_DATA_URL` | — | Primary market data API base URL |
| `MARKET_DATA_FALLBACK_URL` | — | Fallback market data API base URL |
| `MARKET_DATA_TIMEOUT_MS` | `3000` | Timeout for a single market data fetch attempt |

---

## Module File Map

```
modules/realtime/prana-stream/
├── adapters/
│   ├── composite-market-data.adapter.ts   ← selects healthy provider
│   ├── main-market-data.adapter.ts        ← primary provider
│   ├── vortex-market-data.adapter.ts      ← fallback provider
│   └── mock-market-data.adapter.ts        ← tests / dev
├── services/
│   ├── realtime-aggregator.service.ts      ← merges all data streams
│   ├── realtime-scale-coordinator.service.ts ← cluster coordination
│   └── tick-throttler.service.ts          ← per-user tick buffering
├── gateways/
│   └── prana-stream.gateway.ts             ← Socket.IO entry point
├── prana-stream.module.ts
└── index.ts
```