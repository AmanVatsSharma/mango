<!--
MODULE_DOC.md
Module: lib/services/realtime
Purpose: Cross-process realtime delivery (SSE to browser, Redis Pub/Sub between processes).
Last-updated: 2026-02-13
-->

## Overview

This module owns the **server-side realtime fanout** for trading lifecycle events:

- Browser transport: **SSE** via `GET /api/realtime/stream`
- In-process delivery: `RealtimeEventEmitter` manages connected SSE controllers per user
- Cross-process delivery: optional **Redis Pub/Sub** bridge so workers (separate Node processes) can reach app SSE connections

## Why Redis

On EC2 we commonly run:

- Next.js app (one Node process)
- Order/positions workers (separate Node processes)

An in-memory emitter can’t cross process boundaries. Redis solves that by acting as a shared event bus.

## Implementation

Files:

- `RealtimeEventEmitter.ts`\n  - `emit(userId, event, data)` delivers locally and publishes to Redis (when enabled)\n  - `subscribe(userId, controller)` registers controller and ensures Redis subscription exists\n  - Redis-delivered messages are delivered locally only (no re-publish; prevents loops)\n
- `redis-realtime-bus.ts`\n  - Publishes/consumes per-user channels: `realtime:user:<userId>`\n  - Envelope includes `sourceInstanceId` to ignore self\n
## Events

- Lifecycle events emitted on DB writes (from Prisma middleware):\n  `order_*`, `position_*`, `balance_updated`, watchlist events\n- High-frequency server PnL event emitted by `PositionPnLWorker`:\n  - `positions_pnl_updated` (batched)\n
## Env vars

- `REDIS_URL` (e.g. `redis://127.0.0.1:6379`) enables the bridge.\n
## Changelog

- **2026-02-16**: `server-market-data.service` and `WebSocketMarketDataProvider` now use shared strict market-data numeric helpers (`market-data-number-utils`) for quote token parsing, quote-age env normalization, and position-token subscription shaping, replacing permissive numeric coercion paths that could admit malformed tokens or `NaN` max-age config values.
- **2026-02-16**: `lib/prisma-middleware.ts` now uses shared strict realtime numeric normalization helpers for order/position event payload prices (`price`, `averagePrice`, `realizedPnL`), replacing raw `Number(...)` coercion so malformed Decimal values cannot emit `NaN` into SSE/Redis realtime event streams.
- **2026-02-16**: `app/(main)/test-websocket/page.tsx` now normalizes quote-map token keys and manual subscribe token inputs with shared strict positive-integer parsing (`parsePositiveIntegerMarketNumber`), replacing permissive `parseInt` coercion so malformed token values cannot create invalid websocket subscription state.
- **2026-02-16**: `MarketDataConfig` control inputs now use shared strict numeric normalization helpers for jitter/deviation/interpolation fields, replacing permissive `parseInt/parseFloat` coercions so malformed config text values cannot produce `NaN` in live market-data config state.
- **2026-02-16**: `AdvancedChart` line-series last-time tracking now uses shared strict finite parsing helper instead of direct `Number(...)` coercion, preventing malformed time payloads from polluting monotonic timestamp tracking state.
- **2026-02-16**: `use-prisma-watchlist` watchlist-item numeric transforms now use strict finite parsing for price fields (`ltp`, `close`, `strikePrice`, `alertPrice`) so non-finite payload artifacts normalize to deterministic fallback values instead of propagating invalid numeric state into realtime watchlist consumers.
- **2026-02-16**: Legacy `use-trading-data` watchlist item transform now normalizes tokens via strict positive-integer parsing, preventing malformed token payloads from being emitted to realtime subscription consumers.
- **2026-02-16**: `use-enhanced-watchlist` GraphQL transform now applies strict finite-number parsing and strict positive-integer token normalization for item numeric fields, reducing malformed value drift into watchlist dashboard consumers.
- **2026-02-16**: `use-prisma-watchlist` now applies strict positive-integer token normalization for transformed watchlist items and token-formatted add-item requests, rejecting malformed token payloads before they propagate to watchlist realtime consumers.
- **2026-02-16**: `use-realtime-account` SSE cache patch now uses strict account-number helpers for `balance`/`availableMargin`/`usedMargin`, preventing malformed non-finite event payloads from corrupting in-memory account state.
- **2026-02-16**: `market-heatmap`, `price-chart`, and `trading-realtime-provider` now reuse strict helper modules (`market-widget-number-utils.ts`, `trading-realtime-number-utils.ts`) for live quote price extraction, fallback P&L aggregation, and position token/instrument normalization.
- **2026-02-16**: `TradingDashboard` index cards and client-side live P&L fallback calculations now route through shared strict helpers (`trading-dashboard-number-utils.ts`) for token resolution, quote extraction, and finite numeric math across dashboard summary surfaces.
- **2026-02-16**: `WatchlistItemCard` now uses shared strict price-metric helper (`watchlist-card-number-utils.ts`) for LTP/previous-close/change/chart-seed calculations, preventing non-finite quote payloads from leaking into card renders and chart seed generation.
- **2026-02-16**: `ticker-bar` and `screener-lite` widgets now use shared strict market-widget numeric helpers (`market-widget-number-utils.ts`) for quote/token/search-result normalization, preventing non-finite values from leaking into dashboard ticker and screener price/change renders.
- **2026-02-16**: `TradingHome` portfolio summary and heatmap watchlist shaping now use strict numeric helpers (`components/trading/trading-home-number-utils.ts`) so malformed PnL/account/token payloads cannot inject non-finite values into dashboard summary cards or heatmap token lists.
- **2026-02-16**: `WatchlistManager` add-item and card quote-rendering paths now use strict token normalization and token-first quote lookup helpers (`parsePositiveIntegerMarketNumber`, `parseTokenFromInstrumentId`, `resolveDisplayPriceFromQuote`, `resolveQuoteFromMap`), replacing permissive `parseInt` and ad-hoc quote-key logic.
- **2026-02-16**: Watchlist/by-id update schemas now coerce and enforce finite non-negative integer `sortOrder` values (including numeric-string payloads), preventing fractional/non-finite ordering values from entering watchlist persistence and downstream realtime ordering payloads.
- **2026-02-16**: Watchlist collection/by-id/item routes now trim route IDs, reject non-object mutation payloads, and return `ZodError.issues` details for invalid payloads, improving input determinism across watchlist mutation surfaces that feed realtime watchlist events.
- **2026-02-16**: Expanded shared `lib/market-data/utils/quote-lookup.ts` with strict numeric parsing and display-price fallback utilities, then aligned risk/watchlist/position UI consumers to reuse the same token-first quote resolution path for consistent realtime price behavior.
- **2026-02-16**: Added shared `lib/market-data/quote-utils.ts` helpers and updated watchlist/order-form UI consumers to resolve live quotes via token-first lookup with strict numeric normalization, reducing quote-key mismatch drift between token-keyed websocket maps and instrumentId-keyed UI payloads.
- **2026-02-16**: Watchlist add-item API now rejects non-object payload shapes and applies finite numeric coercion for optional quote fields (`ltp`, `close`, `strikePrice`, `lotSize`, `change`, `changePercent`, `alertPrice`), preventing non-finite/transport-malformed numeric values from entering watchlist transactions and downstream realtime payloads.
- **2026-02-16**: Watchlist add-item API now trims/validates watchlist IDs before transaction calls, preventing whitespace/malformed route params from entering watchlist mutation flow and producing ambiguous realtime error behavior.
- **2026-02-16**: `withAddWatchlistItemTransaction` now uppercases/normalizes exchange+segment payloads before stock/watchlist writes, ensuring caller casing differences cannot fragment watchlist metadata or downstream realtime event identity.
- **2026-02-16**: Watchlist add-item instrument exchange extraction now uppercases/normalizes `instrumentId` prefixes before exchange mapping, so lowercase identifiers (e.g., `nse_eq-26000`) are resolved consistently and do not drift exchange/segment metadata in emitted watchlist events.
- **2026-02-16**: `withAddWatchlistItemTransaction` now enforces strict positive-integer token normalization before entering DB transactions, rejecting malformed internal token payloads and keeping persisted watchlist token/instrument mappings deterministic for downstream realtime events.
- **2026-02-16**: Watchlist add-item API now enforces strict positive-integer tokens (with numeric-string coercion), rejecting decimal/malformed token payloads before transaction writes so watchlist/realtime event streams stay token-consistent.
- **2026-02-16**: Watchlist transaction expiry parsing now uses shared strict date normalization for compact `YYYYMMDD` values, preventing invalid calendar-overflow expiries from being persisted and propagated through watchlist/realtime payloads.
- **2026-02-16**: Watchlist add-item API now resolves `instrumentId` tokens via strict shared parsing (no partial `parseInt` coercion), preventing malformed token suffixes from creating incorrect watchlist stock records that later emit mismatched realtime/watchlist events.
- **2026-02-13**: Added Redis Pub/Sub bridge for cross-process realtime delivery.
- **2026-02-13**: Removed `server-only` marker imports so `tsx` workers don’t crash under plain Node module resolution.

