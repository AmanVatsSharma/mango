<!--
MODULE_DOC.md
Module: lib/services/order
Purpose: Document the order placement + async execution lifecycle.
Last-updated: 2026-04-08
-->

## Overview

This module owns **order placement** and **order execution**.

Key goals:
- **Fast API response** for `/api/trading/orders` (return immediately after order is accepted).
- **Atomic** accounting updates (fund reservation + order creation) without nested DB transactions.
- **Async execution** via a worker so the UI can stay responsive and backend latency stays low.

## Current lifecycle

### API contract

Endpoint: `POST /api/trading/orders` (see `app/api/trading/orders/route.ts`)

Response behavior:
- Returns **202** when `executionScheduled: true` (order accepted and queued).
- Returns **200** when `executionScheduled: false` (for example exchange-style MARKET rejection on stale/missing live quote).
- Trading mutation handlers now enforce session ownership checks before mutating any order/account data.

### Placement flow

Implementation: `lib/services/order/OrderExecutionService.ts` → `placeOrder()`

- Validate input + trading account
- Compute margin + charges
- Validate available margin
- Single DB transaction:
  - Ensure/Recover `Stock` record
  - Create `Order` row (`status=PENDING`) with `blockedMargin` + `placementCharges` mirroring intended admission amounts
  - Block margin + create fund transaction only when `blockedMargin > 0`
  - Debit placement charges only when `placementCharges > 0` (`FundManagementService.debitTx` requires a positive amount; floored charges can be `0`)
- Return `{ orderId, executionScheduled: true }`

### Execution flow (async)

Implementation: `lib/services/order/OrderExecutionWorker.ts`

- **Sync position close** (`POST /api/trading/positions` without `async`): resolves exit price in the route via `resolveSquareOffExitPrice` and returns audit fields on the JSON body.
- **Async / queued close** (`async: true` or `?async=1`): API enqueues a `CLOSE` `Order`; the worker applies the same square-off resolver after its MARKET quote so booked price aligns with global policy (notifications still fire on `EXECUTED`).

- Worker finds oldest `Order.status=PENDING`
- For each order:
  - Compute execution price:
    - **MARKET** and **LIMIT**: worker uses `waitForFreshQuote` with the same timeout/max-age as market orders; if missing, defer within retry window or cancel with exchange-style reason
    - **LIMIT** marketability (last-trade vs limit): BUY fills only when `last <= limit`; SELL when `last >= limit`; otherwise `deferred`. Fill price: `min(limit, last)` for BUY, `max(limit, last)` for SELL
  - Single DB transaction:
    - Upsert `Position` (BUY adds quantity; SELL subtracts), offset closes release closed-leg margin as before
    - Release order **admission** margin (`blockedMargin`), clear `placementCharges` on row (charges stay debited)
    - If net open `|quantity| > 0`, block margin for the position at fill average
    - Update `Order.positionId`
    - Mark `Order` as `EXECUTED` with `filledQuantity` + `averagePrice`
    - Link `Transaction.positionId` for all transactions where `orderId` matches
    - Exchange-style cancellations in the worker call the same admission release + placement-charge refund as user cancel
- Emits realtime events automatically via Prisma middleware (`lib/prisma-middleware.ts`) on `Order/Position/TradingAccount` updates

## Deployment patterns

### Recommended (low latency)

**Docker on EC2 / ECS**:
- Run Next.js app
- Run the worker as a separate process/container:

```bash
ORDER_WORKER_INTERVAL_MS=750 ORDER_WORKER_BATCH_LIMIT=50 pnpm tsx scripts/order-worker.ts
```

### Vercel (serverless) support

Vercel does not run long-lived background workers by default. To ensure orders do not remain `PENDING`:

- **Inline best-effort execution**: `POST /api/trading/orders` enqueues background execution using Vercel `waitUntil()` (non-blocking).
- **Cron backstop (recommended)**: configure a Vercel Cron Job to call the batch worker endpoint to catch any missed orders.

Cron endpoint:
- `GET /api/cron/order-worker?limit=25`
- Auth: `Authorization: Bearer $CRON_SECRET`

### Amplify-friendly fallback

Amplify/serverless cannot reliably continue background work after returning a response.

Use **a scheduled Lambda** (EventBridge) to trigger the worker:
- Call: `GET /api/cron/order-worker?limit=25`
- Secure with: `Authorization: Bearer $CRON_SECRET`

Route: `app/api/cron/order-worker/route.ts`

## Observability

Timing logs exist at:
- API route: `app/api/trading/orders/route.ts` (parse body, market session check, schema parse, placeOrder total)
- Service: `OrderExecutionService.placeOrder()` logs a step timing summary

## Changelog

- **2026-04-08**: **Option margin risk side** — `OrderExecutionService` / `OrderExecutionWorker` pass `instrument.marginRiskSide` into `MarginCalculator`: offset closes use opening-side profile (`marginRiskSideForOffsetRelease`); post-fill position block uses signed net qty (`marginRiskSideForSignedPositionQty`). Worker execution-failure compensation reloads `Stock` with `optionType` (and exchange/strike/expiry) so option risk resolution matches the main path.
- **2026-04-06**: **Negative cash balance**: `MarginCalculator.validateMargin` rejects order placement when `TradingAccount.balance < 0` (`NegativeBalanceTradingError`, HTTP **403** via `statusCode`). Does not change margin sufficiency rules for non-negative balances.
- **2026-04-06**: **Zero-floored placement charges**: `placeOrder` skips `blockMarginTx` / `debitTx` when `requiredMargin` or `totalCharges` is `0` (margin calculator uses `Math.floor` so charges can round to zero; `debitTx` rejects non-positive amounts). Client `placeOrder` (`lib/hooks/use-trading-data.ts`) now parses error bodies safely (`error` or `message`, non-JSON fallbacks) and preserves `Error` instances instead of replacing messages with a generic string. Unit coverage in `tests/order/order-execution.service.test.ts` (“zero floored charges”).
- **2026-03-31**: **Queued close parity**: `CLOSE` execution in `OrderExecutionWorker` now runs `resolveSquareOffExitPrice` + `getMarketDisplayPositionPricingPolicies` after the worker MARKET mark (retail square-off policy, deviation/divergence, Redis path when configured). Transient `MARKET_DATA_DEGRADED` / `EXIT_PRICE_UNAVAILABLE` / 5xx defer within the same order-age window as stale quotes; other policy rejects cancel with structured `failureCode`. `applyQueuedCloseOrderFillTx` calls `TransactionRepository.updateMany` by `orderId` to attach `positionId` on ledger rows (matches OPEN fill). See `lib/server/queued-position-close-order.ts` header for **sync vs async** UX.
- **2026-03-30**: **Option A queued closes**: `Order` gains `orderPurpose` (`OPEN`/`CLOSE`) + optional `closeMetadata`; `OrderExecutionWorker` fills `CLOSE` PENDING rows via `PositionManagementService.applyQueuedCloseOrderFillTx` (advisory locks, same MARKET quote path). `POST /api/trading/positions` accepts `async: true` or `?async=1` to enqueue (`202` + `orderId`). `PositionPnLWorker` optionally drains `CLOSE` orders (`POSITION_PNL_CLOSE_QUEUE_DRAIN_LIMIT`, default 5) as a backstop. Migration: `20260330140000_order_purpose_close_queue`.
- **2026-03-09**: Statement transaction descriptions in `OrderExecutionService` and `OrderExecutionWorker` are now detailed: margin block, brokerage/charges, margin release (offset/cancel/fail), and realized P&L entries include symbol, quantity, amount, and order ref for clear user statements.
- **2026-02-27**: `/api/trading/orders` identity guard now tolerates futures-style `strikePrice: 0` payload sentinels when `optionType` is absent, while still enforcing positive strike validation for option identities (`CE`/`PE`).
- **2026-02-27**: MARKET stale-quote safety tightened: client fallback execution is now allowed only with fresh quote metadata (`ltpAgeMs`/`ltpTimestamp` within 60s), and `/api/trading/orders` now normalizes/derives quote age metadata before policy/service handoff so stale or metadata-missing client quotes are not treated as authoritative.
- **2026-02-26**: Relaxed default MARKET server quote freshness window to `<=60s` (configurable via `MARKET_SERVER_QUOTE_MAX_AGE_MS`) to match sparse-tick feeds while keeping server-authoritative quote validation and persisted rejection metadata.
- **2026-02-24**: Hardened MARKET reliability with server-authoritative fallback + bounded retry: placement no longer hard-cancels when fresh quote is transiently unavailable (uses client/stock fallback price and keeps `PENDING`), worker now defers stale-quote MARKET execution within configurable retry window before final cancel, and worker heartbeat now includes feed diagnostics (`feedConnected`, message-age, cache/subscription counts, demo-key flag, deferred count).
- **2026-02-24**: Added bounded server quote warmup (`waitForFreshQuote`) in placement + worker execution MARKET paths to avoid cold-cache false stale rejections, prioritized `Stock.token` token resolution in worker subscribe/execution flows, and enriched exchange-reject telemetry with server-feed health context.
- **2026-02-24**: Implemented strict live-price integrity for MARKET orders: placement and worker execution both require a server quote within the configured freshness window (originally `<=5s`, now default `<=60s`), otherwise order is persisted as `CANCELLED` with stable rejection metadata (`failureCode`, `failureReason`), surfaced via list/status APIs and UI.
- **2026-02-24**: Order execution now writes position lots with explicit instrument identity + canonical product type (`MIS`/`DELIVERY`) and routes opposite-side fills through FIFO lot offset logic before opening any remainder lot, preventing cross-mixing between contracts and intraday/delivery modes.
- **2026-02-25**: Standardized product types to `MIS`/`CNC`/`NRML` (legacy alias compatible) and enhanced offset settlement: when an executed BUY/SELL consumes opposite lots, the system now persists realized P&L onto closed records, releases margin, and credits/debits funds atomically inside execution transactions.
- **2026-02-17**: `/api/trading/orders` policy snapshot now includes side + LTP offset metrics (`order.side`, `order.orderType`, `order.ltp`, `order.priceOffsetFromLtp`, `order.priceOffsetFromLtpPercent`) so dynamic admin policies can enforce segment-specific buy-above/sell-below LTP order-price constraints.
- **2026-02-16**: `lib/services/order/order-number-utils.ts` now delegates to shared market-data strict finite parser to keep order numeric normalization behavior aligned with cross-module token/quote numeric parsing safeguards.
- **2026-02-16**: `/api/admin/orders` now uses shared strict numeric/date normalization helpers for GET pagination/date filters and PATCH update payload fields, rejecting malformed admin query/body values before Prisma filter/update execution.
- **2026-02-16**: `admin-console/settings` brokerage form inputs now use shared strict nullable non-negative normalization helper instead of direct `parseFloat`, preventing malformed numeric text values from entering platform brokerage config payloads.
- **2026-02-16**: `admin-console/orders-management` now uses shared strict numeric helpers for pagination query parsing, row numeric mapping, and edit payload validation, preventing malformed numeric inputs from producing invalid admin order update payloads.
- **2026-02-16**: `stock-search` option strike normalization now uses shared strict non-negative numeric parser instead of permissive `parseFloat`, preventing malformed strike payload strings from surfacing invalid strike values in add-stock order/watchlist handoff payloads.
- **2026-02-16**: `order-management` modify dialog now uses shared strict numeric input helpers and strict payload normalization (positive finite price/integer quantity), rejecting malformed modify payloads before client mutation calls.
- **2026-02-16**: `use-instrument-search` proxy mapping paths (equity/futures/options/commodities) now use shared strict numeric normalization helpers for token/price/strike/lot/tick fields, preventing non-finite or malformed numeric payloads from entering order-search suggestion lists.
- **2026-02-16**: Legacy `use-trading-data` execution reconciliation path now uses strict finite parsing for executed order price and existing position quantity, preventing malformed payload values from propagating `NaN` into position average-price updates.
- **2026-02-16**: `use-realtime-orders` SSE patch paths now use shared strict realtime-order numeric helpers, preventing malformed `quantity`/`price` payloads from injecting `NaN` values into order-cache stubs and execution patches.
- **2026-02-16**: `use-order-form` quote resolution now delegates to shared market quote helpers (`lib/market-data/quote-utils.ts`) for token-first websocket key lookup with instrumentId fallback, reducing duplicated quote-key logic across dashboard trading surfaces.
- **2026-02-16**: `use-order-form` now uses strict client-side numeric normalization helpers for stock/risk payload parsing (token/ltp/close/lot-size/leverage/brokerage) and prioritizes token-keyed market-data quote lookup before instrumentId fallback, aligning order-dialog computations with backend strict parsing behavior.
- **2026-02-16**: Added route-level regression coverage asserting `/api/trading/orders` enforces user-scope authorization before numeric payload validation in POST/PATCH mutation paths, preserving consistent `403` behavior on cross-user requests.
- **2026-02-16**: `/api/trading/orders` POST now normalizes enum-like payload strings (`orderType`, `orderSide`, `productType`, `segment`, `exchange`, `optionType`) to trimmed uppercase forms before schema validation, improving compatibility with case-variant client payloads.
- **2026-02-16**: `/api/trading/orders` now enforces object-payload guards across POST/PATCH/DELETE. Mutation routes also enforce explicit non-blank `orderId` checks where applicable, and PATCH rejects no-op updates when neither `price` nor `quantity` is provided—preventing malformed request bodies from reaching order mutation service calls.
- **2026-02-16**: Shared order payload schemas (`lib/server/validation.ts`) now enforce finite numeric guards for place/modify fields (`quantity`, `price`, `token`, `ltp`, `close`, `strikePrice`, `lotSize`) to reject non-finite numeric carriers before order route execution paths.
- **2026-02-16**: `/api/trading/orders` now normalizes key numeric payload fields with strict finite parsing (including numeric-string support): POST (`quantity`, `price`, `token`, `lotSize`) and PATCH (`price`, `quantity`). Invalid numeric payloads are rejected before order-service mutation calls (for example non-finite prices, non-integer/non-positive quantities, malformed token/lot-size values).
- **2026-02-16**: `OrderExecutionService` now parses compact expiry values (`YYYYMMDD`) via shared strict date normalization, rejecting calendar-overflow dates (e.g., `20260231`) instead of silently rolling them forward when creating synthetic stock metadata.
- **2026-02-16**: Underlying `instrumentMapper.parseInstrumentId` token parsing is now strict positive-integer only (no partial `parseInt` coercion), so order-worker instrument subscription and execution quote lookup reject malformed token suffixes instead of resolving incorrect tokens.
- **2026-02-16**: `OrderExecutionWorker` token lookup now reuses shared `lib/server/instrument-token-utils` parsing so execution/compensation quote subscription paths resolve instrument tokens with the same strict best-effort rules used by other workers.
- **2026-02-16**: `PriceResolutionService` now strictly normalizes positive prices across LIMIT input, dialog fallback, cached DB LTP, estimated previous-close values, and reasonableness validation inputs so malformed/non-finite candidates cannot bypass tier fallback logic or enter validation arithmetic paths.
- **2026-02-16**: `PriceResolutionService` live-tier quote parsing now uses strict finite normalization before accepting LTP values, so malformed non-finite payloads (for example `"Infinity"`) are rejected and correctly fall through to cache/estimate/dialog fallback tiers instead of becoming execution prices.
- **2026-02-16**: `OrderExecutionWorker` compensation path now normalizes persisted `Stock.lot_size` with shared strict parsing and a minimum integer floor of `1`, preventing malformed lot-size payloads from propagating invalid margin-calculation inputs during cancellation recovery.
- **2026-02-16**: `/api/cron/order-worker` now reuses shared `lib/server/cron-number-utils` for query-number parsing (`limit`, `maxAgeMs`), removing duplicated parser logic while preserving existing fallback/clamp behavior.
- **2026-02-16**: Added shared `order-number-utils` strict finite parser and refactored `OrderExecutionService` + `OrderExecutionWorker` to reuse it, removing duplicated numeric coercion paths across order services/workers.
- **2026-02-16**: `OrderExecutionService` now applies strict finite parsing for lot-size validation, position average-price logging, instrument token parsing, and cancellation margin-price fallback selection to avoid malformed numeric coercion in core order flows.
- **2026-02-16**: `OrderExecutionWorker` batch input normalization now treats `null`/`undefined` values as unset defaults for `limit`/`maxAgeMs`, preventing unintended `0` coercion from reducing batch behavior.
- **2026-02-16**: Shared `trading-number` parser now treats `null`/`undefined` as missing values (not `0`), so `/api/trading/orders/list` and `/api/trading/orders/status` correctly preserve nullable price fields.
- **2026-02-16**: Trading read routes now share `lib/server/trading-number.ts` for strict finite numeric parsing (`price`, `averagePrice`, and clamped integer normalization), removing duplicated parser logic and keeping route behavior consistent.
- **2026-02-16**: `/api/trading/orders/list` and `/api/trading/orders/status` now normalize optional numeric fields with strict finite parsing so malformed decimal carriers degrade safely instead of leaking NaN or throwing during response serialization.
- **2026-02-16**: `/api/trading/orders/list` and `/api/trading/orders/status` now preserve zero-valued `price`/`averagePrice` fields (no truthy-drop), ensuring accurate payload fidelity for pending/market orders with zero-initialized pricing.
- **2026-02-03**: Switched to ACCEPTED/QUEUED response, removed nested Prisma transactions, added `OrderExecutionWorker` + cron trigger.
- **2026-02-04**: Added Vercel-safe background execution (`waitUntil`) + advisory lock to prevent double-processing; documented cron backstop.
- **2026-02-12**: Execution price fallback prefers the same live marketdata feed as `/dashboard` (server-side WS quote cache) before DB `Stock.ltp`.
- **2026-02-13**: Order worker heartbeat now includes `redisEnabled` to verify Redis realtime readiness in Admin Console (cross-process worker → SSE delivery).
- **2026-02-16**: `/api/cron/order-worker` now normalizes malformed query/URL inputs and clamps `limit/maxAgeMs` before dispatching worker runs.
- **2026-02-16**: `/api/cron/order-worker` now safely handles unreadable `authorization` header accessors, preserving secure `401` behavior when cron secrets are configured.
- **2026-02-16**: `/api/cron/order-worker` now trims configured cron secrets before comparison, preventing whitespace-padded env values from causing false `401` responses.
- **2026-02-16**: `/api/cron/order-worker` now accepts case-insensitive Bearer auth schemes and trims token payloads before secret comparison for proxy/header-format compatibility.
- **2026-02-16**: `/api/cron/order-worker` bearer token parsing now scans comma-separated authorization segments and matches the first valid bearer fragment (including when non-bearer segments appear first).
- **2026-02-16**: `/api/cron/order-worker` now also unwraps quoted bearer token payloads (`Bearer "secret"` / `Bearer 'secret'`) before secret comparison for proxy compatibility.
- **2026-02-16**: `/api/cron/order-worker` authorization parsing now also reads plain-object header wrappers (`Authorization`/`authorization`) when `headers.get(...)` is unavailable in adapter request shapes.
- **2026-02-16**: `/api/cron/order-worker` plain-object authorization parsing now matches header keys case-insensitively (for example `aUtHoRiZaTiOn`) for broader adapter compatibility.
- **2026-02-16**: `/api/cron/order-worker` authorization header normalization now supports array-valued header carriers (for example `authorization: ["Bearer ..."]`) commonly emitted by proxy adapters.
- **2026-02-16**: `/api/cron/order-worker` authorization parsing now also supports nested plain-object header wrappers (`headers.headers.authorization`) used by some request adapter layers.
- **2026-02-16**: `/api/cron/order-worker` authorization parsing now also supports iterable header-entry wrappers (for example `[["authorization","Bearer ..."]]`) when adapters expose tuple-based header maps.
- **2026-02-16**: `/api/cron/order-worker` authorization parsing now also supports `headers.entries()` tuple wrappers when adapters expose entry accessors without direct iterability.
- **2026-02-16**: `/api/cron/order-worker` authorization parsing now also supports flat raw-header arrays (`["authorization","Bearer ...", ...]`) emitted by some Node/proxy adapters.
- **2026-02-16**: `/api/cron/order-worker` authorization parsing now also supports `headers.forEach(...)` wrappers when adapters expose callback-based header iterators.
- **2026-02-16**: `/api/cron/order-worker` callback-based header parsing now tolerates either `forEach(value, key)` or swapped `forEach(key, value)` callback argument ordering.
- **2026-02-16**: `/api/cron/order-worker` now accepts either `ORDER_WORKER_SECRET` or `CRON_SECRET` when both are configured, improving secret-rotation compatibility for scheduled triggers.
- **2026-02-16**: `/api/cron/order-worker` cron secret parsing now supports delimiter-based lists (comma/semicolon/newline), JSON-array lists, and JSON-object wrappers (`{"secrets":[...]}`) for safe secret rotation across env serialization styles.
- **2026-02-16**: `/api/cron/order-worker` cron secret parsing now ignores placeholder tokens (`undefined`, `null`, `none`, `n/a`, `false`, `0`, `off`, `disabled`) and empty JSON wrappers (`{}`, `{"secrets":[]}`) so misconfigured env defaults do not unintentionally block cron access.
- **2026-02-16**: `/api/cron/order-worker` cron secret parsing now unwraps quoted secret tokens (`"secret"` / `'secret'`) before auth comparison, improving compatibility with quoted env serialization styles.
- **2026-02-16**: `/api/cron/order-worker` now explicitly pins `runtime = "nodejs"` to ensure worker-trigger execution remains Node-compatible in serverless deployments.
- **2026-02-16**: `/api/cron/order-worker` query parsing now accepts URL-object request wrappers (not only string URLs), improving cron compatibility with framework/request decorators.
- **2026-02-16**: `/api/cron/order-worker` query parsing now also accepts URL-object wrappers that expose `pathname/search` (including callable fields), preserving param extraction when `href` is unavailable.
- **2026-02-16**: `/api/cron/order-worker` query parsing now also accepts URL-object `searchParams` carriers (including callable wrappers), even when `pathname` is absent.
- **2026-02-16**: `/api/cron/order-worker` query parsing now falls back to `req.nextUrl` wrappers when direct `req.url` access fails, preserving limit/maxAge extraction under adapter-specific request objects.
- **2026-02-16**: `/api/cron/order-worker` query parsing now also accepts function-valued URL wrappers, preserving limit/maxAge extraction through lazy request adapters.
- **2026-02-16**: `/api/cron/order-worker` query normalization now treats blank/sentinel numeric query values as unset defaults (for example `limit=` now falls back to `25` instead of coercing to `1`).
- **2026-02-16**: `/api/cron/order-worker` 500 error payloads now normalize worker error messages (trim + whitespace collapse + 256-char bound) before returning response metadata.
- **2026-02-16**: `OrderExecutionWorker.processPendingOrders` now normalizes malformed runtime payloads (`limit`, `maxAgeMs`, non-object input) to safe defaults/clamped values before querying pending orders.
- **2026-02-16**: `OrderExecutionWorker` numeric normalization now treats blank-string/boolean numeric payloads as unset (defaulting limit/maxAge safely) instead of coercing them via permissive `Number(...)` fallthrough.
- **2026-02-16**: `OrderExecutionWorker` numeric normalization now also guards non-coercible numeric carriers (for example `Symbol`) and falls back to safe defaults without throwing.
- **2026-02-16**: `scripts/order-worker.ts` now uses strict env-number parsing (`ORDER_WORKER_INTERVAL_MS`, `ORDER_WORKER_BATCH_LIMIT`, `ORDER_WORKER_MAX_AGE_MS`) so blank/sentinel env values fall back safely and cannot create busy-loop worker intervals.
- **2026-02-16**: `OrderExecutionWorker.processOrderById` now trims/validates runtime `orderId` inputs (rejects blank/oversized values) before advisory-lock and DB query execution.
- **2026-02-15**: Added strict session ownership checks for `/api/trading/orders` POST/PATCH/DELETE, with normalized access error status responses.
- **2026-02-15**: Route catch blocks now use shared trading error resolver (`resolveTradingErrorResponse`) for consistent status/message mapping.
- **2026-02-15**: Shared route error resolver now normalizes invalid status/message payloads to prevent malformed HTTP responses.
- **2026-02-15**: Shared route error resolver now maps Prisma error signatures (`P2025`, `P2002`, validation) to stable HTTP status codes.
- **2026-02-15**: Shared route error resolver now honors valid upstream `status`/`statusCode` on thrown errors for more accurate order API responses.
- **2026-02-15**: Shared route error resolver now accepts numeric-string upstream statuses (e.g., `"429"`) while rejecting malformed status values.
- **2026-02-15**: Shared route error resolver now falls back through `issues/message/error/cause.message` to preserve useful upstream error details.
- **2026-02-15**: Shared route error resolver now sanitizes/truncates response error messages (whitespace normalization + max length) for safe client payloads.
- **2026-02-15**: `/api/trading/orders/status` now reuses shared auth/ownership/error resolver guards and defensively handles post-check missing orders.
- **2026-02-15**: `/api/trading/orders/list` now reuses shared auth/error resolver guards so unauthorized/forbidden/list errors map consistently.
- **2026-02-15**: `/api/trading/orders/status` now emits standardized API telemetry (`trading_order_status`) while preserving shared guard/error handling.
- **2026-02-15**: Trading order routes now share `assertRequestedUserScope` guard logic for consistent userId query/body scope enforcement.
- **2026-02-15**: Shared requested-user scope guard now trims whitespace-padded user IDs before validation across order read/write routes.
- **2026-02-15**: Shared requested-user scope guard now rejects non-string user scope payloads with `400 Invalid user scope`.
- **2026-02-15**: `/api/trading/orders/status` now trims `orderId` query input and rejects blank values with `400 Order ID required`.
- **2026-02-15**: `/api/trading/orders/status` now maps extended status messages (`REJECTED`, `EXPIRED`) and includes unknown statuses in fallback text.
- **2026-02-15**: Shared requested-user scope guard now rejects excessively long user IDs (`>128`) with `400 Invalid user scope`.
- **2026-02-15**: Shared route error resolver now maps JSON parsing syntax errors to `400` for invalid JSON request bodies.
- **2026-02-15**: Added route-level regression coverage for invalid JSON request bodies across `/api/trading/orders` POST/PATCH/DELETE paths.
- **2026-02-15**: `/api/trading/orders` now trims whitespace-padded `tradingAccountId`/`orderId` inputs before schema + ownership validation in POST/PATCH/DELETE.
- **2026-02-15**: `/api/trading/orders/status` now maps `PARTIALLY_FILLED` to an explicit message and includes regression coverage for `EXPIRED` + unknown status fallback behavior.
- **2026-02-15**: Shared ownership guards now normalize whitespace-padded `orderId` values and reject blank/oversized IDs before DB lookup (`404` not found semantics preserved).
- **2026-02-15**: Shared route error resolver now maps malformed JSON `TypeError` parse failures to `400` (in addition to `SyntaxError`) for consistent invalid-body responses.
- **2026-02-15**: Expanded ownership-guard regression coverage for blank/oversized `orderId` inputs to ensure early `404` short-circuiting without DB lookup.
- **2026-02-15**: Shared route error resolver now preserves top-level thrown string errors (with sanitization) instead of collapsing them to generic fallback messages.
- **2026-02-15**: Shared route error resolver now also extracts string-valued `cause` payloads (not only `cause.message`) for clearer propagated error messaging.
- **2026-02-15**: Added orders-list read-route regression coverage for oversized requested `userId` scope values (`400 Invalid user scope`).
- **2026-02-15**: Expanded order mutation-route scope coverage for oversized `userId` payload rejection (`400 Invalid user scope`).
- **2026-02-15**: Expanded order-status route regression coverage for oversized `orderId` inputs rejected by shared ownership guard (`404` without downstream order query).
- **2026-02-15**: Trading order mutation routes (`POST/PATCH/DELETE /api/trading/orders`) now emit standardized API telemetry (`trading_orders_post/patch/delete`) with route-level assertion coverage.
- **2026-02-15**: `/api/trading/orders` PATCH/DELETE now apply shared requested-user scope validation when optional `userId` is supplied (`403` mismatch / `400` invalid scope).
- **2026-02-15**: Expanded PATCH/DELETE order mutation tests to cover oversized optional `userId` scope payload rejection (`400`) with no ownership lookup side effects.
- **2026-02-15**: Shared route error resolver now falls back to `statusText` when Response-like errors are thrown without a standard message field.
- **2026-02-15**: API telemetry helper now records response `statusCode` on successful Response-like handlers for richer order-route observability.
- **2026-02-15**: API telemetry error branch now captures normalized HTTP `statusCode` from thrown errors (`statusCode`/`status`, numeric or numeric-string) for clearer failure observability.
- **2026-02-15**: API telemetry now guards against malformed/non-absolute request URLs by falling back to `nextUrl.pathname` or `/unknown`, preventing telemetry helper crashes.
- **2026-02-15**: API telemetry now tolerates malformed request-like objects missing `headers`, defaulting correlation extraction to empty headers instead of throwing.
- **2026-02-15**: Shared route error resolver now extracts HTTP-client (`response.data`) error messages and `response.status` values for cleaner upstream dependency error mapping.
- **2026-02-15**: API telemetry success logs now normalize numeric-string `status` values and default missing request methods to `UNKNOWN` for malformed request-like inputs.
- **2026-02-15**: API telemetry error logs now normalize HTTP-client nested response statuses (`error.response.status/statusCode`) for better upstream failure observability.
- **2026-02-15**: API telemetry error logs now extract richer `err` messages from HTTP-client response payloads and top-level thrown strings for clearer diagnostics.
- **2026-02-15**: Shared route error resolver now maps malformed request URL parse failures (`ERR_INVALID_URL` / `Invalid URL`) to `400` for consistent client feedback.
- **2026-02-15**: Order read routes now use shared request search-param parsing helper, allowing relative/malformed request URL shapes to degrade safely instead of throwing.
- **2026-02-15**: Shared request search-param helper now also falls back to `nextUrl.searchParams` when `req.url` is missing/malformed, improving read-route resilience under framework/test request variants.
- **2026-02-15**: Shared route error resolver now maps timeout/connection-abort signatures (`ETIMEDOUT`, `ECONNABORTED`, timeout messages) to `504` for clearer transient upstream failure signaling.
- **2026-02-15**: API telemetry path resolver now parses relative request URLs using a safe fallback base before degrading to `nextUrl.pathname`/`/unknown`, improving observability path fidelity in non-standard request shapes.
- **2026-02-15**: Shared request search-param helper now also accepts `nextUrl.search` string fallback when `nextUrl.searchParams` is unavailable, preserving robust query parsing across request variants.
- **2026-02-15**: Expanded order read-route regression tests to cover malformed URL + `nextUrl.searchParams/search` fallback query parsing paths.
- **2026-02-15**: Shared request search-param helper now also falls back to `nextUrl.search` when `nextUrl.searchParams` serialization is empty/broken, preventing silent query-loss in edge request wrappers.
- **2026-02-15**: Shared query/telemetry URL parsing now trims whitespace-padded request URLs before fallback parsing to avoid false malformed-url degradation.
- **2026-02-15**: Shared route error resolver now maps transient network-connectivity signatures (`ECONNREFUSED`, `ENOTFOUND`, `fetch failed`) to `503 Service Unavailable`.
- **2026-02-15**: API telemetry now normalizes request methods to uppercase (`post` -> `POST`) to keep method dimensions consistent across mixed runtime request wrappers.
- **2026-02-15**: Shared resolver + API telemetry now extract HTTP-client error messages from validation arrays (`response.data.errors[]` / `response.data.issues[]`) for clearer order API diagnostics.
- **2026-02-15**: API telemetry now trims `nextUrl.pathname` fallbacks and safely tolerates throwing `headers.get(...)` implementations so observability never crashes request handling.
- **2026-02-15**: API telemetry now degrades to a no-op logger when logger factory/sinks fail, ensuring observability issues never block order API business execution.
- **2026-02-15**: Shared query parsing now ignores malformed `nextUrl.searchParams` plain-object serializations (`[object Object]`) and accepts serialized values with leading `?` for consistent read-route scope extraction.
- **2026-02-15**: Shared resolver + API telemetry now extract nested object payload messages from `response.data.error`-style upstream failures for clearer order API diagnostics.
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
- **2026-03-25**: Order admission ledger alignment — `Order.blockedMargin` / `Order.placementCharges` persisted at placement; centralized `order-admission-margin` helpers; cancel refunds placement charges; worker exchange-cancel paths and admin cancel release admission; post-fill releases admission then blocks position margin at fill; `modifyOrder` rebalances margin/charge deltas.
- **2026-03-25**: LIMIT execution — fresh-quote parity with MARKET; marketability on last trade vs limit; fill at improved price (`min`/`max`); defer when not marketable.

