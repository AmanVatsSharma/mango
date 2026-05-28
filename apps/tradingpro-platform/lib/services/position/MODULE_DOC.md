<!--
MODULE_DOC.md
Module: lib/services/position
Purpose: Position management + server-side PnL computation worker.
Last-updated: 2026-04-08
-->

## Overview

This module owns:

- Position lifecycle operations (close, update SL/Target) via `PositionManagementService`.
- Optional **server-side PnL computation** via `PositionPnLWorker` (EC2/Docker or cron).

## Server-side Position PnL (unrealized/day)

### Why

Client-side PnL uses live quotes and is great on `/dashboard`, but in enterprise deployments you may want:

- Consistent PnL values persisted in DB (reporting, admin views).
- A mode that still works when client quotes are degraded.

### Data model

Prisma `Position` fields:

- `unrealizedPnL` (Decimal(18,2))
- `dayPnL` (Decimal(18,2))

### Worker implementation

Files:

- `lib/services/position/PositionPnLWorker.ts`
- `lib/services/position/PositionManagementService.ts`
- `lib/services/position/quote-normalizer.ts`
- `lib/services/position/position-number-utils.ts`
- `scripts/position-pnl-worker.ts`
- `app/api/cron/position-pnl-worker/route.ts`

Computation:

- `unrealizedPnL = (currentPrice - averagePrice) * quantity`
- `dayPnL = (currentPrice - prevClose) * quantity`

Price inputs:

- Quotes are sourced from the **same live marketdata WebSocket feed** used by `/dashboard` via the server-side cache:
  - `lib/market-data/server-market-data.service.ts`
- Quote normalization is centralized in `lib/services/position/quote-normalizer.ts`.

Env (server worker):

- `LIVE_MARKET_WS_URL` (fallback: `NEXT_PUBLIC_LIVE_MARKET_WS_URL`)
- `LIVE_MARKET_WS_API_KEY` (fallback: `NEXT_PUBLIC_LIVE_MARKET_WS_API_KEY`)
- `MARKETDATA_QUOTE_MAX_AGE_MS` (default: `7500`)
- `REDIS_URL` (optional; enables cross-process SSE + PnL cache for smooth dashboard updates)
- `REDIS_POSITIONS_PNL_TTL_SECONDS` (default: `120`)
- `REDIS_MARKET_QUOTE_TTL_SECONDS` (default: `60`) — TTL for `market:quote:<token>` shared LTP rows
- **Freshness policy (Settings / `market_display_config_v1` → `quoteFreshness`):** `pnlServerMaxAgeMs`, `redisMarketQuoteMaxAgeMs`, `positionPnlQuoteMaxAgeMs`, `marketQuoteRedisWriteMinIntervalMs` — do not use `REDIS_POSITIONS_PNL_MAX_AGE_MS` / `REDIS_MARKET_QUOTE_MAX_AGE_MS` for business-rule gating

### Update threshold

To prevent DB/SSE spam, the worker skips updates when both deltas are below a threshold (default ₹1).

Env:

- `POSITION_PNL_UPDATE_THRESHOLD` (default: `1`)
- `POSITION_PNL_WORKER_LOCK_TTL_MS` (default: `120000`) — global worker lock lease TTL.
- `POSITION_INTRADAY_EOD_PRE_CLOSE_BUFFER_MINUTES` (default: `15`, clamp: `1..120`)
- `INTRADAY_EOD_PRE_CLOSE_BUFFER_MINUTES` (legacy alias fallback)

## Server-side SL/Target + Risk auto square-off

When running the long-lived EC2/Docker worker, the platform can also enforce:

- **Per-position StopLoss/Target** using `Position.stopLoss` and `Position.target`
- **Account-level risk thresholds** based on **loss utilization** of total funds

Implementation:

- `PositionPnLWorker` evaluates each tick using the same quote source as `/dashboard` (server WS quote cache). **MTM normalization** prefers **fresh `getQuote`** then **last in-process tick** (`getQuote(..., { maxAgeMs: 0 })`) before **`Stock.ltp`**.
- **SL/TP, risk auto-close, and intraday EOD auto-close** only when `freshQuote.receivedAt` is within **`quoteFreshness.positionPnlQuoteMaxAgeMs`** (actionable mark). If SL/TP levels would trip on a display-only / stale tick, **`slTpSkippedUnreliablePrice`** increments and no close runs.
- When a rule is breached, the worker triggers an immediate server-side close via `PositionManagementService.closePosition(positionId, tradingAccountId, exitPriceOverride)`
  - `exitPriceOverride` is always provided from the current tick’s `currentPrice` to avoid worker-side HTTP quote calls
- When risk thresholds are breached, the worker writes a `RiskAlert` row (throttled) for operator visibility

### Risk thresholds

Loss utilization is computed as:

- `lossUtilization = (-min(0, totalUnrealizedPnL)) / (balance + availableMargin)`

Env:

- `RISK_WARNING_THRESHOLD` (default: `0.80`)
- `RISK_AUTO_CLOSE_THRESHOLD` (default: `0.90`)

### Intraday EOD square-off (pre-close buffer)

The same `PositionPnLWorker` tick now also enforces **intraday-only** carry prevention:

- Product-type classification is derived from position orders (entry-side executed order preferred, then latest executed) and normalized with MIS/INTRADAY aliases.
- Segment-aware close references:
  - NSE/NFO family close: `15:30 IST`
  - MCX family close: `23:55 IST`
- A pre-close buffer (default `15m`) defines the enforcement window:
  - `windowStart = closeTime - bufferMinutes`
  - stage runs when `windowStart <= now <= closeTime`
- Worker heartbeat includes EOD counters for ops visibility:
  - `intradayEodCandidates`
  - `intradayEodClosed`
  - `intradayEodSkipped`
  - `intradayEodMarkersWritten`

### Idempotency

`PositionManagementService.closePosition(...)` uses a **Postgres advisory transaction lock** to prevent double-closing (UI + worker + cron), and returns a safe “skipped” result when already closing/closed.

Intraday EOD stage adds an additional per-day/per-segment marker in `SystemSettings`:

- key format: `positions_intraday_eod_squareoff_<segment>_<yyyy-mm-dd>`
- marker rows prevent repeated full EOD runs for the same segment/day unless force-triggered.

## Runbook

### EC2/Docker (recommended)

Run alongside the web app:

```bash
POSITION_PNL_WORKER_INTERVAL_MS=3000 \
POSITION_PNL_WORKER_BATCH_LIMIT=500 \
POSITION_PNL_UPDATE_THRESHOLD=1 \
pnpm tsx scripts/position-pnl-worker.ts
```

### Serverless cron (Vercel / EventBridge)

Schedule a call to:

- `GET /api/cron/position-pnl-worker?limit=500&updateThreshold=1`

EOD backstop trigger (auth-protected, dry-run compatible):

- `GET /api/cron/position-pnl-worker?eod=1`
- `GET /api/cron/position-pnl-worker?eod=1&dryRun=1` (validation / no close writes)
- Optional:
  - `intradayEodPreCloseBufferMinutes=<1..120>`
  - `intradayEodMaxAutoClosesPerTick=<0..5000>`
  - `intradayEodForceRun=1` (bypass marker/window guards)

Auth:

- `Authorization: Bearer $CRON_SECRET`

## Heartbeat and admin visibility

The worker writes a heartbeat entry to `SystemSettings`:

- key: `positions_pnl_worker_heartbeat`
- value: JSON `{ lastRunAtIso, host, pid, scanned, updated, ... }`

Admin Console uses it to show **Worker Active** vs **Not Active**.

## Changelog

- **2026-04-08**: **Option margin release** — `calculateMargin` for `marginToRelease` uses `marginRiskSideForPositionCloseOpening(signedQty)` (opening long/short profile) while keeping exit `orderSide` for charge rules.
- **2026-03-30**: Token resolution for subscriptions now prefers **`Position.token` / position `instrumentId`** over `Stock` (`lib/server/position-instrument-resolution.ts`); worker writes **`market:quote:<token>`** in Redis when live quotes exist; `/api/trading/positions/list` falls back to that cache when per-position PnL Redis is stale, and returns `instrumentToken` + `priceSource` + `meta.pricingDebug` for support.
- **2026-02-24**: `PositionPnLWorker` now prioritizes persisted `Stock.token`, pre-subscribes + bounded-warms resolved token sets before each MTM pass, and improves live-quote hit reliability while preserving `Stock.ltp` fallback when live data is unavailable.
- **2026-02-24**: Position storage now keeps per-execution lot rows with explicit instrument/product identity (`stockId`, `instrumentId`, segment/option metadata, `productType`, `isIntraday`) and applies FIFO opposite-side offset semantics per contract + product mode, eliminating equity/F&O/commodity and MIS/DELIVERY cross-netting.
- **2026-02-25**: Added Kite-style net positions aggregation helper (`lib/services/position/net-positions.ts`) and `/api/trading/positions/net` endpoint (net view over internal FIFO lots), plus FIFO net square-off endpoint `POST /api/trading/positions/net/close`.
- **2026-02-23**: `PositionPnLWorker` now emits heartbeat telemetry for token/quote coverage (`positionsWithResolvedToken`, `positionsWithoutResolvedToken`, `positionTokensResolved`, `positionsWithLiveQuote`, `positionsWithoutLiveQuote`, `quoteHitRate`) to make server-side MTM smoothness validation observable in admin diagnostics.
- **2026-02-23**: Dashboard/admin position consumers now run hybrid-live MTM display semantics (live quote first, Redis/DB fallback) and admin positions API overlays fresh Redis snapshots for open positions to reduce MTM staleness between DB updates.
- **2026-02-21**: Dashboard/positions PnL rendering now follows hybrid-smart semantics (live quote preferred for smooth UI, server snapshot fallback/sync) through a shared resolver path; `/api/trading/positions/list` now includes per-position `pnlUpdatedAtMs` and meta `pnlMaxAgeMs` to support deterministic freshness decisions.
- **2026-02-21**: `PositionManagementService.calculateUnrealizedPnL` now computes `dayPnL` from prev-close-aware quote normalization (`dayPnL = (currentPrice - prevClose) * quantity`) instead of mirroring unrealized PnL.
- **2026-02-21**: Added segment-aware intraday EOD square-off in `PositionPnLWorker` with configurable pre-close buffer (`POSITION_INTRADAY_EOD_PRE_CLOSE_BUFFER_MINUTES`), per-day/per-segment SystemSettings idempotency markers, and heartbeat counters (`intradayEodCandidates/Closed/Skipped/MarkersWritten`).
- **2026-02-21**: Added reusable product-type resolution utility (`position-product-type-utils`) that classifies intraday MIS/INTRADAY from position orders (entry-side executed preferred, latest executed fallback) and wired close-path margin product-type resolution to it.
- **2026-02-21**: `/api/cron/position-pnl-worker` now supports explicit intraday EOD backstop trigger params (`eod|intradayEodSquareOff`, `intradayEodForceRun`, buffer/max-close overrides) while preserving auth + `dryRun`.
- **2026-02-21**: `/api/trading/positions` PATCH now accepts omitted `tradingAccountId` by deriving ownership account from `getOwnedPositionContext`, while still rejecting explicit mismatches and invalid non-string account payloads.
- **2026-02-21**: `PositionManagementService.updatePosition` now enforces directional SL/TP constraints against a live/fallback reference price (`LONG: SL < ref < TP`, `SHORT: TP < ref < SL`) before persisting updates.
- **2026-02-21**: `/api/trading/positions/list` now emits richer F&O metadata at top-level (`segment`, `instrumentId`, `strikePrice`, `optionType`, `expiry`, `token`) while preserving nested `stock` compatibility for existing consumers.
- **2026-02-21**: Prisma realtime middleware now suppresses noisy `position_updated` emits for PnL-only writes (`unrealizedPnL/dayPnL`), reducing server-mode UI choppiness while keeping lifecycle emits for meaningful state changes.
- **2026-02-17**: `PositionManagementService.closePosition` now supports partial exits with robust quantity/lot validation, proportional margin release + realized-P&L settlement, and structured response metadata (`closedQuantity`, `remainingQuantity`, lot breakdown, `isPartial`) for UI/API consumers.
- **2026-02-17**: `/api/trading/positions` close flow now evaluates the dynamic trading policy engine (`POSITION_CLOSE` context) with policy priority + condition matching, returning standardized policy metadata/retry hints when blocked.
- **2026-02-17**: `/api/trading/positions` close flow now enforces admin trading policy `negative_pnl_close_delay` (SystemSettings-backed) for user-initiated close requests, returning a clear `423` policy response when hold window remains.
- **2026-02-17**: `position-tracking` total/filter P&L now uses the same live quote-derived open-position P&L basis as position cards (with safe fallbacks), reducing card-vs-summary drift under fast quote updates.
- **2026-02-17**: `use-realtime-positions` optimistic close now preserves signed quantity for booked-P&L math, fixing short-position sign inversion during optimistic close transitions.
- **2026-02-17**: `/api/trading/positions/list` now emits `realizedPnL/bookedPnL` only for closed positions (open positions use `0`) so booked totals remain semantically consistent.
- **2026-02-16**: Repository-level position numeric normalization now uses shared strict finite helper (`repository-number-utils`) in `PositionRepository` for average-price merge math and unrealized/realized P&L statistics aggregation, preventing malformed Decimal fields from propagating `NaN` into position analytics and close/reopen averaging paths.
- **2026-02-16**: `lib/services/position/position-number-utils.ts` now delegates to shared market-data strict finite parser so position service numeric normalization stays aligned with cross-module quote/token numeric parsing behavior.
- **2026-02-16**: `/api/admin/positions` now uses shared strict numeric/date normalization helpers for GET pagination/date filters, PATCH update/options payload fields, and POST create-position quantity/price/lot-size shaping, rejecting malformed admin payload/query values before Prisma/order-service execution.
- **2026-02-16**: `admin-console/position-edit-dialog` now uses shared strict numeric helpers for required/optional numeric field validation and fund-impact calculations, preventing malformed text-entry values from producing invalid admin position update payloads.
- **2026-02-16**: `admin-console/positions-management` now uses shared strict numeric helpers for pagination query parsing, row numeric mapping, and create-position payload shaping (quantity/price/lot-size), preventing malformed numeric inputs from producing invalid admin position action payloads.
- **2026-02-16**: Console account summary unrealized P&L aggregation now uses shared strict numeric normalization helper, preventing malformed/non-finite position payload values from polluting account summary P&L cards.
- **2026-02-16**: `position-tracking` now uses shared strict token parsing (`parsePositiveIntegerMarketNumber` + shared `parseTokenFromInstrumentId`) and shared dialog input normalization helper for stop-loss/target fields, replacing permissive local number coercion in legacy quote-key and dialog input paths.
- **2026-02-16**: `use-realtime-positions` SSE patch paths now use shared strict realtime-position numeric helpers, preventing malformed event payloads (`quantity`, `averagePrice`, `realizedPnL`, `currentPrice`) from producing `NaN` cache patches and avoiding false closed-state classification when quantity is missing.
- **2026-02-16**: Legacy `position-tracking-old` card render now normalizes computed P&L display values before formatting, removing redundant `Number(...)` coercion wrappers and ensuring deterministic sign/absolute formatting even if upstream values are malformed.
- **2026-02-16**: Position dialog numeric input handlers (legacy + premium UIs) now use shared strict parsing helper (`position-dialog-number-utils.ts`) so malformed/non-finite text-entry values normalize deterministically instead of propagating `NaN` into stop-loss/target dialog state.
- **2026-02-16**: Legacy `position-tracking-old` UI now also uses shared token-first market quote helpers for close-position fallback pricing and card-level LTP/P&L rendering, reducing inconsistent quote-key behavior between legacy and premium position surfaces.
- **2026-02-16**: `position-tracking-premium` UI now resolves quotes through shared token-first market quote helpers (`lib/market-data/quote-utils.ts`) for summary/filter/card calculations and close-position fallback pricing, reducing instrumentId-key mismatch drift against token-keyed websocket feeds.
- **2026-02-16**: Added route-level regression coverage asserting `/api/trading/positions` POST/PATCH enforce user-scope authorization before numeric payload validation, preserving consistent `403` behavior for cross-user mutation attempts.
- **2026-02-16**: `/api/trading/positions` POST now rejects non-object request payloads before ownership/close flow logic, preventing malformed transport payload shapes from entering position-close mutation paths.
- **2026-02-16**: `/api/trading/positions` PATCH now rejects no-op `updates` payloads when neither `stopLoss` nor `target` is provided, preventing ambiguous empty update calls from reaching position service mutation flow.
- **2026-02-16**: `/api/trading/positions` now strictly normalizes optional numeric payload fields (`exitPrice`, `updates.stopLoss`, `updates.target`) with finite-positive validation (including numeric-string support), rejecting malformed/non-object update payloads before service invocation.
- **2026-02-16**: Underlying `instrumentMapper.parseInstrumentId` token parsing is now strict positive-integer only (no partial `parseInt` coercion), so position-PnL worker quote subscription paths reject malformed instrument suffixes instead of resolving incorrect tokens.
- **2026-02-16**: `PositionPnLWorker` now reuses shared `lib/server/instrument-token-utils` best-effort token resolution, removing duplicated token parsing logic and keeping quote-subscription token extraction behavior aligned with order worker paths.
- **2026-02-16**: Added `app/api/trading/positions/position-action-number-utils` and refactored `app/api/trading/positions/actions.ts` to normalize quote-derived exit prices plus realized-PnL math via strict finite parsing guards, preventing malformed LTP payloads from propagating `NaN`/`Infinity` into close-position settlement updates.
- **2026-02-16**: `/api/cron/position-pnl-worker` now reuses shared `lib/server/cron-number-utils` for query-number parsing (`limit`, `updateThreshold`), removing duplicated parser logic while preserving fallback/clamp semantics.
- **2026-02-16**: Shared `lib/utils/decimal.toNumber` now uses strict finite parsing with non-coercible-value guards (`Symbol`, sentinel strings, throwing decimal-like wrappers) so position/fund helper paths cannot crash during numeric normalization.
- **2026-02-16**: `PositionManagementService.calculateUnrealizedPnL` now normalizes non-coercible `quantity` values to safe finite defaults so malformed persisted quantity fields do not short-circuit per-position PnL updates.
- **2026-02-16**: Shared `trading-number` parser now treats `null`/`undefined` as missing values (not `0`), so `/api/trading/positions/list` correctly preserves nullable `stopLoss`/`target` fields while still keeping explicit `0` values.
- **2026-02-16**: Added shared `position-number-utils` strict finite parser and refactored `PositionPnLWorker`, `PositionManagementService`, and `quote-normalizer` to reuse it, removing duplicated numeric coercion paths across position services.
- **2026-02-16**: `PositionManagementService` now uses strict finite parsing for close-flow and unrealized-PnL numeric inputs (`averagePrice`, `quantity`, quote LTP, lot size) so non-coercible payloads cannot throw during position-close/risk recalculation paths.
- **2026-02-16**: `quote-normalizer` now uses strict finite parsing for quote numeric fields and safely ignores malformed/non-coercible values, preventing Symbol/sentinel payloads from crashing server-side PnL normalization.
- **2026-02-16**: `PositionPnLWorker` now normalizes persisted numeric fields (`quantity`, `averagePrice`, prior `unrealizedPnL/dayPnL`) via strict finite parsing so malformed/non-coercible DB payloads cannot crash per-position processing loops.
- **2026-02-16**: Trading read routes now share `lib/server/trading-number.ts` for strict finite numeric parsing and clamped integer normalization, removing duplicated route-local parser logic across account/orders/positions read endpoints.
- **2026-02-16**: `/api/trading/account` now normalizes account balance/margin numerics with strict finite parsing, preserving zero values and safely falling back for malformed decimal payloads.
- **2026-02-16**: `/api/trading/positions/list` now strictly normalizes Redis and DB numeric payload fields (`maxAge`, `updatedAtMs`, `unrealizedPnL`, `dayPnL`, `currentPrice`, and Decimal-backed position amounts) so malformed cache snapshots degrade safely without NaN payload leakage.
- **2026-02-16**: `/api/trading/positions/list` now preserves zero-valued `stopLoss`, `target`, and Redis `currentPrice` values using nullish normalization instead of truthy checks, ensuring deterministic risk/dashboard payload fidelity.
- **2026-02-04**: Added `PositionPnLWorker` + cron endpoint + EC2 script + heartbeat setting + admin toggle support.
- **2026-02-12**: Server-side PnL worker now uses the platform marketdata WebSocket feed (server quote cache) instead of Vortex HTTP quote batching.
- **2026-02-12**: Added Redis-backed PnL cache + batched SSE event `positions_pnl_updated` to keep `/dashboard` smooth without frequent refetches.
- **2026-02-13**: Extended PnL worker heartbeat with Redis cache write + emit counters for better Admin Console observability.
- **2026-02-13**: PnL worker now enforces StopLoss/Target + account risk thresholds (optional) and triggers server-side auto square-off.
- **2026-02-13**: Position closing is now idempotent via Postgres advisory xact lock (prevents double close side-effects).
- **2026-02-15**: Position close flow now settles margin + realized PnL using tx-scoped fund methods in the same transaction (prevents partial commit states).
- **2026-02-15**: Added in-process overlap guard to `PositionPnLWorker` to skip concurrent runs (`reason=already_running`).
- **2026-02-15**: Added global DB-backed lock for `PositionPnLWorker` to avoid cross-process overlap (`reason=locked`).
- **2026-02-16**: Position PnL cron route now normalizes malformed query/URL inputs, clamps limit/updateThreshold safely, and accepts `dryRun` truthy variants (`true|1|yes|on`).
- **2026-02-16**: Position PnL cron route now safely handles unreadable `authorization` header accessors, preserving secure `401` behavior when cron secrets are configured.
- **2026-02-16**: Position PnL cron route now trims configured cron secrets before comparison, preventing whitespace-padded env values from causing false `401` responses.
- **2026-02-16**: Position PnL cron route now accepts case-insensitive Bearer auth schemes and trims token payloads before secret comparison for proxy/header-format compatibility.
- **2026-02-16**: Position PnL cron route bearer token parsing now scans comma-separated authorization segments and matches the first valid bearer fragment (including when non-bearer segments appear first).
- **2026-02-16**: Position PnL cron route now also unwraps quoted bearer token payloads (`Bearer "secret"` / `Bearer 'secret'`) before secret comparison for proxy compatibility.
- **2026-02-16**: Position PnL cron route authorization parsing now also supports plain-object header wrappers (`Authorization`/`authorization`) when `headers.get(...)` is unavailable in adapter request shapes.
- **2026-02-16**: Position PnL cron route plain-object authorization parsing now matches header keys case-insensitively (for example `aUtHoRiZaTiOn`) for broader adapter compatibility.
- **2026-02-16**: Position PnL cron route authorization header normalization now supports array-valued header carriers (for example `authorization: ["Bearer ..."]`) commonly emitted by proxy adapters.
- **2026-02-16**: Position PnL cron route authorization parsing now also supports nested plain-object header wrappers (`headers.headers.authorization`) used by some request adapter layers.
- **2026-02-16**: Position PnL cron route authorization parsing now also supports iterable header-entry wrappers (for example `[["authorization","Bearer ..."]]`) when adapters expose tuple-based header maps.
- **2026-02-16**: Position PnL cron route authorization parsing now also supports `headers.entries()` tuple wrappers when adapters expose entry accessors without direct iterability.
- **2026-02-16**: Position PnL cron route authorization parsing now also supports flat raw-header arrays (`["authorization","Bearer ...", ...]`) emitted by some Node/proxy adapters.
- **2026-02-16**: Position PnL cron route authorization parsing now also supports `headers.forEach(...)` wrappers when adapters expose callback-based header iterators.
- **2026-02-16**: Position PnL cron route callback-based header parsing now tolerates either `forEach(value, key)` or swapped `forEach(key, value)` callback argument ordering.
- **2026-02-16**: Position PnL cron route now accepts either `POSITION_PNL_WORKER_SECRET` or `CRON_SECRET` when both are configured, improving secret-rotation compatibility for scheduled runs.
- **2026-02-16**: Position PnL cron route secret parsing now supports delimiter-based lists (comma/semicolon/newline), JSON-array lists, and JSON-object wrappers (`{"secrets":[...]}`) for safe scheduler secret rotation across env serialization styles.
- **2026-02-16**: Position PnL cron route secret parsing now ignores placeholder tokens (`undefined`, `null`, `none`, `n/a`, `false`, `0`, `off`, `disabled`) and empty JSON wrappers (`{}`, `{"secrets":[]}`) so misconfigured env defaults do not unintentionally block scheduled runs.
- **2026-02-16**: Position PnL cron route secret parsing now unwraps quoted secret tokens (`"secret"` / `'secret'`) before auth comparison, improving compatibility with quoted env serialization styles.
- **2026-02-16**: Position PnL cron route query parsing now accepts URL-object request wrappers (not only string URLs), improving cron compatibility with framework/request decorators.
- **2026-02-16**: Position PnL cron route query parsing now also accepts URL-object wrappers that expose `pathname/search` (including callable fields), preserving param extraction when `href` is unavailable.
- **2026-02-16**: Position PnL cron route query parsing now also accepts URL-object `searchParams` carriers (including callable wrappers), even when `pathname` is absent.
- **2026-02-16**: Position PnL cron route query parsing now falls back to `req.nextUrl` wrappers when direct `req.url` access fails, preserving limit/updateThreshold/dryRun extraction under adapter-specific request objects.
- **2026-02-16**: Position PnL cron route query parsing now also accepts function-valued URL wrappers, preserving limit/updateThreshold parsing through lazy request adapters.
- **2026-02-16**: Position PnL cron route query normalization now treats blank/sentinel numeric query values as unset defaults (for example `limit=`/`updateThreshold=` now fall back to `500`/`1`).
- **2026-02-16**: Position PnL dry-run parsing now also accepts compact/status aliases (`y`, `t`, `enabled`) in both cron query parsing and direct worker input normalization.
- **2026-02-16**: Position PnL cron route 500 payloads now normalize worker error messages (trim + whitespace collapse + 256-char bound) before response serialization.
- **2026-02-16**: `PositionPnLWorker.processPositionPnL` now normalizes malformed runtime payloads (`limit`, `updateThreshold`, `dryRun`, non-object input) so direct/non-route invocations use deterministic safe defaults.
- **2026-02-16**: `PositionPnLWorker` numeric parsing now treats blank-string/boolean numeric inputs as unset across runtime payloads and env-based TTL settings (lock TTL + Redis cache TTL), preserving deterministic defaults.
- **2026-02-16**: `PositionPnLWorker` numeric parsing now also guards non-coercible numeric carriers (for example `Symbol`) so malformed direct inputs safely fall back to defaults without throwing.
- **2026-02-16**: `scripts/position-pnl-worker.ts` now uses strict env-number parsing (`POSITION_PNL_WORKER_INTERVAL_MS`, `POSITION_PNL_WORKER_BATCH_LIMIT`, `POSITION_PNL_UPDATE_THRESHOLD`) so blank/sentinel env values fall back safely and cannot create runaway worker loops.
- **2026-02-15**: Trading position route error catches now use shared resolver (`resolveTradingErrorResponse`) for consistent response mapping.
- **2026-02-15**: Shared trading error resolver now sanitizes malformed status/message payloads before returning position API errors.
- **2026-02-15**: Shared trading error resolver now maps Prisma error signatures (`P2025`, `P2002`, validation) to stable HTTP status codes.
- **2026-02-15**: Shared trading error resolver now honors valid upstream `status`/`statusCode` values on thrown errors for accurate position API responses.
- **2026-02-15**: Shared trading error resolver now accepts numeric-string upstream statuses (e.g., `"503"`) while rejecting malformed values.
- **2026-02-15**: Shared trading error resolver now falls back through `issues/message/error/cause.message` to preserve useful upstream error details.
- **2026-02-15**: Shared trading error resolver now sanitizes/truncates response error messages (whitespace normalization + max length) for safe client payloads.
- **2026-02-15**: `/api/trading/positions/list` now reuses shared auth/error resolver guards for consistent unauthorized/forbidden/error status mapping.
- **2026-02-15**: Position list route now uses shared `assertRequestedUserScope` logic for consistent userId scope validation.
- **2026-02-15**: Shared requested-user scope guard now trims whitespace-padded query user IDs before validating position list access.
- **2026-02-15**: Shared requested-user scope guard now enforces string-only user scope values (`400` for invalid types).
- **2026-02-15**: Shared requested-user scope guard now rejects excessively long user IDs (`>128`) with `400 Invalid user scope`.
- **2026-02-15**: Shared route error resolver now maps JSON parsing syntax errors to `400` for invalid JSON request bodies.
- **2026-02-15**: Added route-level regression coverage for invalid JSON request bodies across `/api/trading/positions` and `/api/trading/funds` mutation paths.
- **2026-02-15**: `/api/trading/positions` now trims whitespace-padded `positionId` and `tradingAccountId` inputs before ownership/account-mismatch validation.
- **2026-02-15**: Shared ownership guards now normalize whitespace-padded `positionId`/`tradingAccountId` values and short-circuit blank/oversized IDs to `404` before DB lookup.
- **2026-02-15**: Shared route error resolver now maps malformed JSON `TypeError` parse failures to `400` (in addition to `SyntaxError`) for consistent invalid-body responses.
- **2026-02-15**: Expanded ownership-guard regression coverage for blank/oversized `positionId` and `tradingAccountId` inputs to verify early `404` short-circuit behavior.
- **2026-02-15**: Shared route error resolver now preserves top-level thrown string errors (with sanitization) instead of collapsing them to generic fallback messages.
- **2026-02-15**: Shared route error resolver now also extracts string-valued `cause` payloads (not only `cause.message`) for clearer propagated error messaging.
- **2026-02-15**: Added positions-list read-route regression coverage for oversized requested `userId` scope values (`400 Invalid user scope`).
- **2026-02-15**: `/api/trading/positions` POST/PATCH now applies shared requested-user scope validation for optional `userId` payloads (`403` mismatch / `400` invalid scope).
- **2026-02-15**: Expanded positions mutation-route scope tests to cover oversized `userId` payload rejection (`400 Invalid user scope`).
- **2026-02-15**: Expanded funds mutation-route scope coverage for oversized `userId` payload rejection (`400 Invalid user scope`).
- **2026-02-15**: Trading position/funds mutation routes now emit standardized API telemetry (`trading_positions_post/patch`, `trading_funds_post`) with route-level assertion coverage.
- **2026-02-15**: `/api/trading/funds` now explicitly pins `runtime = 'nodejs'` for consistent server execution behavior with other hardened trading routes.
- **2026-02-15**: Expanded positions PATCH mutation tests to cover oversized optional `userId` scope payload rejection (`400`) with no owned-position lookup side effects.
- **2026-02-15**: Shared route error resolver now falls back to `statusText` when Response-like errors are thrown without a standard message field.
- **2026-02-15**: API telemetry helper now records response `statusCode` on successful Response-like handlers for richer position/funds route observability.
- **2026-02-15**: API telemetry error branch now captures normalized HTTP `statusCode` from thrown errors (`statusCode`/`status`, numeric or numeric-string) for clearer position/funds failure observability.
- **2026-02-15**: API telemetry now guards against malformed/non-absolute request URLs by falling back to `nextUrl.pathname` or `/unknown`, preventing telemetry helper crashes.
- **2026-02-15**: API telemetry now tolerates malformed request-like objects missing `headers`, defaulting correlation extraction to empty headers instead of throwing.
- **2026-02-15**: Shared route error resolver now extracts HTTP-client (`response.data`) error messages and `response.status` values for cleaner upstream dependency error mapping.
- **2026-02-15**: API telemetry success logs now normalize numeric-string `status` values and default missing request methods to `UNKNOWN` for malformed request-like inputs.
- **2026-02-15**: API telemetry error logs now normalize HTTP-client nested response statuses (`error.response.status/statusCode`) for better upstream failure observability.
- **2026-02-15**: API telemetry error logs now extract richer `err` messages from HTTP-client response payloads and top-level thrown strings for clearer diagnostics.
- **2026-02-15**: Shared route error resolver now maps malformed request URL parse failures (`ERR_INVALID_URL` / `Invalid URL`) to `400` for consistent client feedback.
- **2026-02-15**: Position/account read routes now use shared request search-param parsing helper, allowing relative/malformed request URL shapes to degrade safely instead of throwing.
- **2026-02-15**: Shared request search-param helper now also falls back to `nextUrl.searchParams` when `req.url` is missing/malformed, improving read-route resilience under framework/test request variants.
- **2026-02-15**: Shared route error resolver now maps timeout/connection-abort signatures (`ETIMEDOUT`, `ECONNABORTED`, timeout messages) to `504` for clearer transient upstream failure signaling.
- **2026-02-15**: API telemetry path resolver now parses relative request URLs using a safe fallback base before degrading to `nextUrl.pathname`/`/unknown`, improving observability path fidelity in non-standard request shapes.
- **2026-02-15**: Shared request search-param helper now also accepts `nextUrl.search` string fallback when `nextUrl.searchParams` is unavailable, preserving robust query parsing across request variants.
- **2026-02-15**: Expanded positions/account read-route regression tests to cover malformed URL + `nextUrl.searchParams/search` fallback query parsing paths.
- **2026-02-15**: Shared request search-param helper now also falls back to `nextUrl.search` when `nextUrl.searchParams` serialization is empty/broken, preventing silent query-loss in edge request wrappers.
- **2026-02-15**: Shared query/telemetry URL parsing now trims whitespace-padded request URLs before fallback parsing to avoid false malformed-url degradation.
- **2026-02-15**: Shared route error resolver now maps transient network-connectivity signatures (`ECONNREFUSED`, `ENOTFOUND`, `fetch failed`) to `503 Service Unavailable`.
- **2026-02-15**: API telemetry now normalizes request methods to uppercase (`post` -> `POST`) to keep method dimensions consistent across mixed runtime request wrappers.
- **2026-02-15**: Shared resolver + API telemetry now extract HTTP-client error messages from validation arrays (`response.data.errors[]` / `response.data.issues[]`) for clearer position/fund API diagnostics.
- **2026-02-15**: API telemetry now trims `nextUrl.pathname` fallbacks and safely tolerates throwing `headers.get(...)` implementations so observability never crashes request handling.
- **2026-02-15**: API telemetry now degrades to a no-op logger when logger factory/sinks fail, ensuring observability issues never block position/fund API business execution.
- **2026-02-15**: Shared query parsing now ignores malformed `nextUrl.searchParams` plain-object serializations (`[object Object]`) and accepts serialized values with leading `?` for consistent read-route scope extraction.
- **2026-02-15**: Shared resolver + API telemetry now extract nested object payload messages from `response.data.error`-style upstream failures for clearer position/fund API diagnostics.
- **2026-02-15**: API telemetry now gracefully supports partial logger shapes (missing `info` or `error`) by downgrading unavailable sinks to no-op handlers instead of dropping all telemetry events.
- **2026-02-15**: Shared query parsing + telemetry pathname resolution now accept URL-object request wrappers (`req.url` as URL-like object) in addition to string URLs for cross-runtime compatibility.
- **2026-02-15**: Shared query + telemetry URL resolution now safely tolerates URL-like wrappers with throwing `href`/`toString` accessors by degrading to alternate representations/fallback path sources.
- **2026-02-15**: Shared resolver + telemetry now also unwrap upstream `response.data.data`/`reason` message wrappers and normalize lowercase timeout/network error codes for stable status+message mapping.
- **2026-02-15**: Shared resolver + telemetry now read nested `cause` metadata (`cause.code`, `cause.statusCode`, `cause.message`) for timeout/network status classification and richer error observability.
- **2026-02-15**: Shared URL parsing now also supports URL-like wrappers exposing `pathname/search` (without `href`) to preserve query/path extraction fidelity in non-standard request shims.
- **2026-02-15**: Shared resolver now honors generic HTTP status hints from nested `cause.statusCode/status`, and telemetry path fallback now tolerates throwing `nextUrl.pathname` getters by degrading to `/unknown`.
- **2026-02-15**: Shared query/telemetry request parsing now also tolerates throwing request property getters (`url`, `headers`, `method`) by safely degrading to fallback sources/defaults.
- **2026-02-15**: Shared resolver/telemetry now read nested `cause.response.status` + `cause.response.data` wrappers, improving wrapped-upstream status fidelity and error messaging.
- **2026-02-15**: Shared query parser now safely tolerates throwing `nextUrl`/`nextUrl.search`/`nextUrl.searchParams` getters and degrades to remaining fallback sources without crashing read routes.
- **2026-02-16**: API telemetry now normalizes whitespace-heavy error strings and truncates oversized error messages before logging to keep observability payloads bounded and readable.
- **2026-02-16**: Shared query/telemetry fallbacks now accept URLSearchParams-like `nextUrl.search` values and object-backed `nextUrl.pathname` values (`toString`) for broader framework-wrapper compatibility.
- **2026-02-16**: Shared query/telemetry fallbacks now also read `nextUrl.href` when direct `search`/`pathname` fields are unavailable, preserving route/query extraction under wrapper variations.
- **2026-02-16**: Telemetry/query fallback now tolerates nested object `nextUrl.href` wrappers (with internal `href`/`toString`) to stay resilient under proxy/request decorators.
- **2026-02-16**: Query/parser fallbacks now accept string/object/iterable `nextUrl.searchParams` payloads and whole-`nextUrl` URL serialization fallback for maximal wrapper compatibility.
- **2026-02-16**: Request URL normalization now supports nested `href` wrappers and URLSearchParams-backed `search` values in URL-like request objects, improving parser/telemetry consistency.
- **2026-02-16**: Request parser/telemetry fallbacks now resolve function-backed URL wrapper fields (`url`, `href`, `pathname`, `search`, `searchParams`) to tolerate lazy getter adapters.
- **2026-02-16**: URL normalization now also supports `Symbol.toPrimitive`-backed request wrapper fields for `url`/`nextUrl` values, preserving route/query extraction through proxy abstractions.
- **2026-02-16**: Search/path fallback normalization now recognizes full-URL query carriers in `nextUrl.search`/`searchParams` and sanitizes `nextUrl.pathname` inputs to true pathnames only.
- **2026-02-16**: URL-like pathname normalization now strips embedded query/hash fragments before composing parser URLs or telemetry route metadata.
- **2026-02-16**: Telemetry header/method extraction now supports callable and nested-wrapper request shapes, trims whitespace header values, and normalizes non-string method wrappers safely.
- **2026-02-16**: Telemetry now normalizes `x-forwarded-for` chains to first client IP and falls back to `x-real-ip` when forwarding headers are unavailable.
- **2026-02-16**: Status-code normalization now accepts callable/primitive-wrapper status values in telemetry + shared error resolver paths (`status`, `statusCode`, nested cause/response fields).
- **2026-02-16**: Telemetry IP extraction now parses RFC `Forwarded` header fallbacks (including quoted/ported values) while preserving `x-forwarded-for` precedence.
- **2026-02-16**: Telemetry IP fallback chain now extends to `cf-connecting-ip` and `x-client-ip`, while filtering `unknown` placeholders from forwarded chains.
- **2026-02-16**: Resolver/telemetry error-message classification now accepts callable/primitive-wrapped message and code fields for wrapper-heavy client error objects.
- **2026-02-16**: Telemetry header extraction now supports plain-object header maps (direct/callable/nested) in addition to Header-like `get(...)` wrappers.
- **2026-02-16**: Telemetry IP normalization now strips host ports, handles bracketed IPv6 tokens, and skips obfuscated (`_...`) proxy identifiers before selecting client IP.
- **2026-02-16**: Shared/telemetry error messaging now resolves callable wrapper fields in zod issues and HTTP-client response payload messages without regressing native Error message precedence.
- **2026-02-16**: Error status/message resolution now reads callable response/cause wrapper objects (`response`, `cause.response`) for consistent telemetry+resolver classification.
- **2026-02-16**: Trading resolver message fallback now also reads callable `cause` wrappers for `message`/`statusText`, preserving informative payloads from nested client adapters.
- **2026-02-16**: Telemetry IP token parsing now rejects function/serialization artifacts in forwarded chains before selecting client address.
- **2026-02-16**: Telemetry IP parsing now also ignores `unknown:port` proxy placeholders so fallback selection continues to the first valid client IP token.
- **2026-02-16**: Telemetry Forwarded-header parser now accepts `for = ...` spacing variants (whitespace around `=`) when extracting client IP fallback tokens.
- **2026-02-16**: Telemetry IP candidate validation now ignores common null-like proxy placeholders (`null`, `undefined`, `none`, `n/a`) before selecting fallback client addresses.
- **2026-02-16**: Telemetry forwarded-token validator now ignores scheme-like entries (for example `https://proxy`) so client-IP fallback continues to concrete address tokens.
- **2026-02-16**: Telemetry forwarded-token validator now also ignores slash-delimited entries (for example CIDR/path-like values) to avoid selecting non-client-address placeholders.
- **2026-02-16**: Telemetry host:port normalization now only strips ports when the suffix is numeric, ignoring malformed non-numeric proxy tokens in forwarded chains.
- **2026-02-16**: Telemetry forwarded-token validator now ignores hostname-like proxy placeholders without port notation, preferring concrete address entries later in the chain.
- **2026-02-16**: Telemetry forwarded-token validator now enforces concrete IP-address shape checks (IPv4/IPv6) so numeric/hostname placeholders are skipped in favor of valid client IPs.
- **2026-02-16**: Telemetry host:port parsing now validates forwarded port ranges (`1-65535`) before stripping, skipping malformed out-of-range proxy tokens.
- **2026-02-16**: Telemetry IP parser now filters unspecified-address placeholders (`0.0.0.0`, `::`) from forwarded chains so fallback continues to routable client IP entries.
- **2026-02-16**: Telemetry IP fallback chain now includes `true-client-ip` before `x-client-ip` to support additional ingress providers while preserving existing precedence behavior.
- **2026-02-16**: Telemetry IP fallback chain now includes `x-true-client-ip` immediately after `true-client-ip` and before cluster/client-ip headers for additional edge-provider compatibility.
- **2026-02-16**: Telemetry IP fallback chain now also includes `x-envoy-external-address` (before `true-client-ip`) for Envoy ingress compatibility.
- **2026-02-16**: Telemetry IP fallback chain now includes `fastly-client-ip` after `cf-connecting-ip` to support CDN ingress variants while preserving downstream precedence.
- **2026-02-16**: Telemetry IP fallback chain now includes `fly-client-ip` after `fastly-client-ip` for Fly.io-style edge environments while preserving downstream precedence.
- **2026-02-16**: Telemetry IP fallback chain now also checks `x-original-forwarded-for` immediately after `x-forwarded-for` for edge setups that preserve the original client chain separately.
- **2026-02-16**: Telemetry IP fallback chain now includes `x-cluster-client-ip` before `x-client-ip` for load-balancer environments that propagate cluster-level client headers.
- **2026-02-16**: Telemetry IP fallback chain now includes `x-appengine-user-ip` before `x-client-ip` to support Google App Engine ingress headers.
- **2026-02-16**: Telemetry IP fallback chain now includes `cloudfront-viewer-address` (host:port normalized) after `cf-connecting-ip` for CloudFront ingress compatibility.
- **2026-02-16**: Telemetry IP fallback chain now includes `x-azure-clientip` after `cloudfront-viewer-address` for Azure ingress compatibility.
- **2026-02-16**: Telemetry IP fallback chain now includes `x-vercel-forwarded-for` after `x-original-forwarded-for` and before RFC `Forwarded` parsing for Vercel edge compatibility.
- **2026-02-16**: Telemetry IP fallback chain now includes `x-nf-client-connection-ip` after `x-vercel-forwarded-for` and before RFC `Forwarded` parsing for Netlify edge compatibility.
- **2026-02-16**: Telemetry IP fallback chain now includes `x-forwarded` (`for=` parsing) after Netlify/Vercel forwarded headers and before standard `Forwarded` to support legacy ingress emitters.
- **2026-02-16**: Telemetry `x-forwarded` fallback now supports both `for=` pairs and raw comma-delimited IP chains so legacy proxies without RFC formatting still resolve client addresses.
- **2026-02-16**: Telemetry IP fallback chain now includes `x-forwarded-client-ip` immediately after `x-forwarded-for` to support edge providers that emit a dedicated forwarded-client header.
- **2026-02-16**: Telemetry IP fallback chain now includes `cf-connecting-ipv6` after `cf-connecting-ip` and before `cloudfront-viewer-address` to preserve Cloudflare IPv6 source fidelity.
- **2026-02-16**: Telemetry IP fallback chain now includes canonical `client-ip` before `x-client-ip` so deployments that emit non-prefixed client headers still resolve caller identity.
- **2026-02-16**: Telemetry IP fallback chain now includes terminal `x-remote-ip` and `remote-addr` fallbacks after `x-client-ip` for legacy reverse-proxy environments.
- **2026-02-16**: Telemetry IP fallback chain now includes compact `x-clientip` before `client-ip`/`x-client-ip` for ingress stacks that emit non-hyphenated client headers.
- **2026-02-16**: Telemetry request-id resolution now falls back through `x-requestid`, `request-id`, `x-correlation-id`, `x-correlationid`, `correlation-id`, `x-arr-log-id`, `x-ms-request-id`, `x-cloud-trace-context`, `x-amzn-trace-id`, `x-b3-traceid`, `x-trace-id`, and `traceparent` when `x-request-id` is unavailable.
- **2026-02-16**: Telemetry request-id resolution now also checks `cf-ray` after `x-cloud-trace-context` and before `x-amzn-trace-id` to preserve Cloudflare edge trace correlation.
- **2026-02-16**: Telemetry request-id resolution now also checks `x-amz-cf-id` after `cf-ray` and before `x-amzn-trace-id` for CloudFront edge trace correlation.
- **2026-02-16**: Telemetry request-id resolution now also checks `x-amzn-requestid` after `x-amz-cf-id` and before `x-amzn-trace-id` for AWS API Gateway-style request correlation.
- **2026-02-16**: Telemetry request-id resolution now also checks `x-datadog-trace-id` after `x-b3-traceid` and before generic trace headers for Datadog trace propagation parity.
- **2026-02-16**: Telemetry request-id resolution now also checks compact canonical `requestid` after `request-id` to support proxies that omit dash separators in request-id headers.
- **2026-02-16**: Telemetry request-id resolution now also checks `x-ot-span-context` after `x-trace-id` and before `traceparent` for OpenTelemetry bridge compatibility.
- **2026-02-16**: Telemetry header reads now try lower/canonical/uppercase name variants when `headers.get(...)` is case-sensitive, preserving request-id and client-IP extraction across wrapper implementations.
- **2026-02-16**: Telemetry request-id selection now normalizes comma-delimited header values and skips placeholder fragments (`unknown`, `null`, `undefined`, `-`) before choosing an ID token.
- **2026-02-16**: Telemetry request-id selection now uses quote-aware comma splitting and also skips compact placeholder literals (`na`, `nil`) plus quoted comma fragments before selecting an ID token.
- **2026-02-16**: Telemetry request-id selection now also filters serialization/function artifacts (e.g., `[object Object]`, `function ...`) before choosing a usable request correlation token.
- **2026-02-16**: Telemetry forwarded-token normalization now recursively unwraps nested quote wrappers (e.g., `"'ip'"`) before IP extraction.
- **2026-02-16**: Telemetry request-method normalization now enforces valid HTTP token syntax and degrades malformed serialized method values to `UNKNOWN`.
- **2026-02-16**: Telemetry forwarded-token normalization now accepts both double-quoted and single-quoted proxy tokens before IP extraction.
- **2026-02-16**: Telemetry forwarded-header parsing now splits comma/semicolon segments with quote awareness, preventing quoted payload fragments from corrupting client-IP selection.
- **2026-03-25**: SL/TP auto square-off skips ticks where `currentPrice` is only an entry-average fallback; `isQuoteSourceSuitableForStopTriggers`; heartbeat `slTpSkippedUnreliablePrice`.

