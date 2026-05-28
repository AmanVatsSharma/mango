/**
 * @file src/modules/realtime/prana-stream/MODULE_DOC.md
 * @module realtime/prana-stream
 * @description Module docs for Prana Stream realtime updates (watchlists, orders, positions, accounts)
 * @author BharatERP
 * @created 2025-09-24
 */

# Prana Stream (Realtime)

Short: Socket.IO gateway delivering unified realtime push events (watchlist ticks, order/position/account updates) per authenticated user.

Purpose: provide a single Socket.IO websocket delivering unified realtime updates per user for:
- watchlist ticks (throttled)
- orders updates
- positions updates
- accounts updates

Files:
```
prana-stream/
  adapters/
    composite-market-data.adapter.ts   — selects first healthy provider, falls back on error
    main-market-data.adapter.ts        — primary live data provider
    vortex-market-data.adapter.ts      — fallback provider
    mock-market-data.adapter.ts        — test/dev provider
  services/
    realtime-aggregator.service.ts     — merges market data + OMS/Positions/Accounts into unified stream
    realtime-scale-coordinator.service.ts — horizontal scale coordination (Redis-backed)
    tick-throttler.service.ts          — per-user tick buffering and diffing
  gateways/
    prana-stream.gateway.ts            — Socket.IO gateway entry point
  prana-stream.module.ts
  index.ts
```

Flow diagram:
Client connects with JWT auth and subscribes to resources (watchlist symbols, orders, positions, accounts).
The gateway joins the user to a Redis-backed room (`user:<userId>`) for horizontal scale support.
CompositeMarketDataAdapter selects the primary provider (or vortex fallback, then mock) and polls/fetches live data.
RealtimeAggregatorService merges market data ticks with order/position/account diffs.
TickThrottlerService buffers per-user ticks; only the latest price per symbol is emitted once per second window.
Events are emitted over Socket.IO as typed envelopes with a sequence number and ISO timestamp.

Dependencies:
- Internal: shared logger, request context, AuthModule (JWT validation)
- External: Redis (Socket.IO adapter for scaling), Market Data API (primary + fallback)

APIs: (Socket.IO — not REST)
- `connect(auth: JWT)` — authenticate and join user room
- `subscribe({ watchlist, orders, positions, accounts })` — request snapshots + live diffs
- `unsubscribe` — stop receiving updates
- Server emits: `snapshot`, `watchlist.ticks`, `order.updated`, `position.updated`, `account.updated`

Env vars:
- `PRANA_TICK_THROTTLE_MS=1000` — tick emission interval per user (default 1000ms)
- `REDIS_URL=redis://localhost:6379` — Redis for Socket.IO adapter and scale coordination
- `MARKET_DATA_URL=http://market-data-api:3000` — primary live data API
- `MARKET_DATA_FALLBACK_URL=http://market-data-fallback:3001` — optional fallback API

Tests: unit tests for adapters (mock/fallback switching), tick throttler diffing, and aggregator merge logic.

Change-log:
- 2025-09-24: Initial scaffold approved by SonuRam ji
- 2026-02-17: Added DB-backed snapshot baseline for orders/positions/accounts and wired main/vortex adapters to live batch quote APIs with polling fallback.
- 2026-02-19: Added RealtimeScaleCoordinatorService stub for horizontal scale coordination (registerInstance, unregisterInstance, shouldHandleUser).
- 2026-05-23: Expanded module doc — added Short, Files, Dependencies, Tests sections, clarified adapter selection logic and tick throttling semantics.
