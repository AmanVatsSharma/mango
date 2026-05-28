# Module: realtime

**Short:** Cross-process realtime delivery for trading events (SSE to browser, Redis bus between processes).

**Purpose:** Ensure `/dashboard` receives order/position/account updates smoothly even when workers run in separate EC2 processes.

### Upstream market-data contract (assumptions)

- The Socket.IO **market-data** service may emit `market_data` on **LTP changes**, **subscription replay**, and/or **vendor-specific heartbeats**. This codebase **does not** prove tick granularity; treat freshness as **`receivedAt` / `receivedAtMs`** on each payload, not as “only on trade.”
- **Server recovery:** When a fresh quote is missing after `waitForFreshQuote`, workers and order paths should pass **`resubscribeRetryTimeoutMs`** so `ServerMarketDataService` runs **`forceResubscribeSubscriptionKeys`** (`unsubscribe` + `subscribe`) before falling back to REST or DB LTP — mirroring browser idle/no-quote resubscribe behavior.
- **Marks:** Prefer **last received tick** (`getQuote` with `maxAgeMs: 0` in-process, or Redis `market:quote` with explicit age for display) over unqualified **`Stock.ltp`** when showing MTM; **auto-close triggers** require a **fresh** tick within **policy `positionPnlQuoteMaxAgeMs`** (see `PositionPnLWorker`).

## Architecture

- **Browser transport:** SSE (`GET /api/realtime/stream`)
- **In-process fanout:** `lib/services/realtime/RealtimeEventEmitter.ts`
- **Cross-process bus:** Redis Pub/Sub (`realtime:user:<userId>`)

### Event sources

- Prisma middleware on DB writes emits lifecycle events:
  - `order_*`, `position_*`, `balance_updated`, watchlist events
- Position PnL worker emits **high-frequency PnL** event:
  - `positions_pnl_updated` (batched per user)

### Cache

- Redis stores the latest computed PnL per position for fast API overlay:\n  - `positions:pnl:<positionId>` → JSON `{ unrealizedPnL, dayPnL, currentPrice, updatedAtMs }`
- Token-level LTP (cross-process, worker → API):\n  - `market:quote:<instrumentToken>` → JSON `{ instrumentToken, last_trade_price, prev_close_price?, receivedAtMs, upstreamTimestamp? }` (TTL `REDIS_MARKET_QUOTE_TTL_SECONDS`)\n  - `GET /api/trading/positions/list` uses this when per-position PnL Redis is missing/stale but the token quote is fresh (`REDIS_MARKET_QUOTE_MAX_AGE_MS`).
- `GET /api/trading/positions/list` overlays Redis PnL when fresh; otherwise token quote or `Stock.ltp`.

## Key files

- `app/api/realtime/stream/route.ts` — SSE endpoint
- `lib/services/realtime/RealtimeEventEmitter.ts` — manages SSE controllers + Redis bridge\n- `lib/services/realtime/redis-realtime-bus.ts` — Redis envelope + per-user channels
- `lib/redis/redis-client.ts` — server-only Redis wrapper (pub/sub + cache)\n- `lib/services/position/PositionPnLWorker.ts` — writes Redis PnL + emits batched event

## Env vars

- `REDIS_URL` (e.g. `redis://127.0.0.1:6379`)\n- `REDIS_POSITIONS_PNL_TTL_SECONDS` (default `120`)\n- `REDIS_POSITIONS_PNL_MAX_AGE_MS` (default `15000`)

## Tests

- `tests/realtime/realtime-emitter-redis-bridge.test.ts`

## Change-log

- 2026-04-06: Documented upstream tick/freshness assumptions, server **resubscribe retry** after silent feed, and **last-tick vs actionable** marks for PnL/triggers.
- 2026-04-03: **Admin presence fan-out** — Redis channel `admin:presence:delta` (JSON `{ userId, online, ts }`) published when a user’s **first** trading SSE connects or **last** disconnects (`RealtimeEventEmitter` + `publishTradingDashboardPresenceDelta`). Admin UI consumes **`GET /api/admin/presence/stream`** (SSE snapshot + deltas). Does not fire on heartbeat TTL refresh only.
- 2026-03-30: Documented `market:quote:<token>` Redis cache written by `PositionPnLWorker` for API LTP parity; positions list `meta.pricingDebug` surfaces max-age tunables.
- 2026-02-23: Trading realtime provider now derives position subscription tokens token-first from position payload (`stock.token`/`token`) with instrumentId fallback, so live position quotes no longer rely on watchlist overlap.
- 2026-02-23: WebSocket quote enhancement now maps `prev_close_price` from OHLC close (cached fallback) instead of previous tick price, fixing prev-close-dependent MTM/change calculations across dashboard consumers.
- 2026-02-16: `lib/hooks/use-realtime-orders.ts` now deduplicates `normalizeRealtimeOrderPrice`/`normalizeRealtimeOrderQuantity` imports from `realtime-order-number-utils`, removing duplicate symbol declarations that were blocking production builds.
- 2026-02-16: `server-market-data.service` and `WebSocketMarketDataProvider` now use shared strict market-data numeric helpers (`market-data-number-utils`) for quote token parsing, quote-age env normalization, and position-token subscription shaping, replacing permissive numeric coercion paths that could admit malformed tokens or `NaN` max-age config values.
- 2026-02-16: `lib/prisma-middleware.ts` now uses shared strict realtime numeric normalization helpers for order/position event payload prices (`price`, `averagePrice`, `realizedPnL`), replacing raw `Number(...)` coercion so malformed Decimal values cannot emit `NaN` into SSE/Redis realtime event streams.
- 2026-02-16: `app/(main)/test-websocket/page.tsx` now normalizes quote-map token keys and manual subscribe token inputs with shared strict positive-integer parsing (`parsePositiveIntegerMarketNumber`), replacing permissive `parseInt` coercion so malformed token values cannot create invalid websocket subscription state.
- 2026-02-16: `MarketDataConfig` control inputs now use shared strict numeric normalization helpers for jitter/deviation/interpolation fields, replacing permissive `parseInt/parseFloat` coercions so malformed config text values cannot produce `NaN` in live market-data config state.
- 2026-02-16: `AdvancedChart` line-series last-time tracking now uses shared strict finite parsing helper instead of direct `Number(...)` coercion, preventing malformed time payloads from polluting monotonic timestamp tracking state.
- 2026-02-16: `use-prisma-watchlist` watchlist-item numeric transforms now use strict finite parsing for price fields (`ltp`, `close`, `strikePrice`, `alertPrice`) so non-finite payload artifacts normalize to deterministic fallback values instead of propagating invalid numeric state into realtime watchlist consumers.
- 2026-02-16: Legacy `use-trading-data` watchlist item transform now normalizes tokens via strict positive-integer parsing, preventing malformed token payloads from being emitted to realtime subscription consumers.
- 2026-02-16: `use-enhanced-watchlist` GraphQL transform now applies strict finite-number parsing and strict positive-integer token normalization for item numeric fields, reducing malformed value drift into watchlist dashboard consumers.
- 2026-02-16: `use-prisma-watchlist` now applies strict positive-integer token normalization for transformed watchlist items and token-formatted add-item requests, rejecting malformed token payloads before they propagate to watchlist realtime consumers.
- 2026-02-16: `use-realtime-account` SSE cache patch now uses strict account-number helpers for `balance`/`availableMargin`/`usedMargin`, preventing malformed non-finite event payloads from corrupting in-memory account state.
- 2026-02-16: `market-heatmap`, `price-chart`, and `trading-realtime-provider` now reuse strict helper modules (`market-widget-number-utils.ts`, `trading-realtime-number-utils.ts`) for live quote price extraction, fallback P&L aggregation, and position token/instrument normalization.
- 2026-02-16: `TradingDashboard` index cards and client-side live P&L fallback calculations now route through shared strict helpers (`trading-dashboard-number-utils.ts`) for token resolution, quote extraction, and finite numeric math across dashboard summary surfaces.
- 2026-02-16: `WatchlistItemCard` now uses shared strict price-metric helper (`watchlist-card-number-utils.ts`) for LTP/previous-close/change/chart-seed calculations, preventing non-finite quote payloads from leaking into card renders and chart seed generation.
- 2026-02-16: `ticker-bar` and `screener-lite` widgets now use shared strict market-widget numeric helpers (`market-widget-number-utils.ts`) for quote/token/search-result normalization, preventing non-finite values from leaking into dashboard ticker and screener price/change renders.
- 2026-02-16: `TradingHome` portfolio summary and heatmap watchlist shaping now use strict numeric helpers (`components/trading/trading-home-number-utils.ts`) so malformed PnL/account/token payloads cannot inject non-finite values into dashboard summary cards or heatmap token lists.
- 2026-02-16: `WatchlistManager` add-item and card quote-rendering paths now use strict token normalization and token-first quote lookup helpers (`parsePositiveIntegerMarketNumber`, `parseTokenFromInstrumentId`, `resolveDisplayPriceFromQuote`, `resolveQuoteFromMap`), replacing permissive `parseInt` and ad-hoc quote-key logic.
- 2026-02-16: Watchlist/by-id update schemas now coerce and enforce finite non-negative integer `sortOrder` values (including numeric-string payloads), preventing fractional/non-finite ordering values from entering watchlist persistence and downstream realtime ordering payloads.
- 2026-02-16: Watchlist collection/by-id/item routes now trim route IDs, reject non-object mutation payloads, and return `ZodError.issues` details for invalid payloads, improving input determinism across watchlist mutation surfaces that feed realtime watchlist events.
- 2026-02-16: Expanded shared `lib/market-data/utils/quote-lookup.ts` with strict numeric parsing and display-price fallback utilities, then aligned risk/watchlist/position UI consumers to reuse the same token-first quote resolution path for consistent realtime price behavior.
- 2026-02-16: Added shared `lib/market-data/quote-utils.ts` helpers and updated watchlist/order-form UI consumers to resolve live quotes via token-first lookup with strict numeric normalization, reducing quote-key mismatch drift between token-keyed websocket maps and instrumentId-keyed UI payloads.
- 2026-02-16: Watchlist add-item API now rejects non-object payload shapes and applies finite numeric coercion for optional quote fields (`ltp`, `close`, `strikePrice`, `lotSize`, `change`, `changePercent`, `alertPrice`), preventing non-finite/transport-malformed numeric values from entering watchlist transactions and downstream realtime payloads.
- 2026-02-16: Watchlist add-item API now trims/validates watchlist IDs before transaction calls, preventing whitespace/malformed route params from entering watchlist mutation flow and producing ambiguous realtime error behavior.
- 2026-02-16: `withAddWatchlistItemTransaction` now uppercases/normalizes exchange+segment payloads before stock/watchlist writes, ensuring caller casing differences cannot fragment watchlist metadata or downstream realtime event identity.
- 2026-02-16: Watchlist add-item instrument exchange extraction now uppercases/normalizes `instrumentId` prefixes before exchange mapping, so lowercase identifiers (e.g., `nse_eq-26000`) are resolved consistently and do not drift exchange/segment metadata in emitted watchlist events.
- 2026-02-16: `withAddWatchlistItemTransaction` now enforces strict positive-integer token normalization before entering DB transactions, rejecting malformed internal token payloads and keeping persisted watchlist token/instrument mappings deterministic for downstream realtime events.
- 2026-02-16: Watchlist add-item API now enforces strict positive-integer tokens (with numeric-string coercion), rejecting decimal/malformed token payloads before transaction writes so watchlist/realtime event streams stay token-consistent.
- 2026-02-16: Watchlist transaction expiry parsing now uses shared strict date normalization for compact `YYYYMMDD` values, preventing invalid calendar-overflow expiries from being persisted and propagated through watchlist/realtime payloads.
- 2026-02-16: Watchlist add-item API now resolves `instrumentId` tokens via strict shared parsing (no partial `parseInt` coercion), preventing malformed token suffixes from creating incorrect watchlist stock records that later emit mismatched realtime/watchlist events.
- 2026-02-12: Added Redis-backed realtime bus + PnL cache to avoid polling/refetch jitter.
- 2026-02-13: Removed `server-only` marker imports so `tsx` workers don’t crash when importing realtime/redis modules.

