# Changelog - Trading Pro Platform

This document tracks major milestones, features, and improvements in the Trading Pro Platform.

## 2026-04-30

### Backend — Push notification device registry (Trading-f8u)

- **`prisma/schema.prisma`:** New `PushDevice` model with `@@unique([userId, expoPushToken])` dedupe, indexes on `(userId)` and `(expoPushToken)`, and back-edge `User.pushDevices`. Applied via `db push`.
- **`lib/services/notifications/expo-push.ts`:** `dispatchExpoPush(userId, payload)` — looks up all `PushDevice` rows for the user, batches messages in groups of 100 (Expo limit), posts to `https://exp.host/--/api/v2/push/send`. Auto-prunes `DeviceNotRegistered` tokens on first bad ticket. All errors logged and swallowed — never blocks callers.
- **`lib/services/notifications/NotificationService.ts`:** `createNotification` now fires `dispatchExpoPush` (fire-and-forget, dynamic import) for `SPECIFIC` single-user notifications so every in-app notification surfaces as a push automatically.
- **`app/api/notifications/devices/route.ts`:** `POST /api/notifications/devices` (register/upsert token + lastSeenAt), `DELETE /api/notifications/devices` (deregister on logout). Validates `expoPushToken`, `platform` (ios|android), optional `deviceId`. Requires authenticated session.

### Mobile — Positions tab (Trading-2ee)

- **`mobile-app/src/lib/api/trading.ts`:** Extended with `Position` type, `fetchPositions()` (`GET /api/trading/positions/list`), `closePosition(params)` (`POST /api/trading/positions` with `Idempotency-Key` header).
- **`mobile-app/src/hooks/usePositions.ts`:** TanStack Query with MMKV offline cache (15s stale + 15s refetch interval), optimistic close mutation with rollback.
- **`mobile-app/src/components/trading/PositionRow.tsx`:** Memoized row, uses `useQuote(token)` for live price, recalculates unrealized P&L client-side from live tick — no extra API call.
- **`mobile-app/src/components/trading/PositionsScreen.tsx`:** Segmented Open/Holdings tabs, FlashList, P&L summary bar, long-press square-off with `Alert.alert` confirmation.
- **`mobile-app/app/(tabs)/positions.tsx`:** Replaced stub.

### Mobile — Watchlist tab (Trading-u30)

- **`mobile-app/src/lib/api/watchlists.ts`:** Typed wrappers for `GET /api/watchlists`, `POST /api/watchlists`, `POST /api/watchlists/[id]/items`, `DELETE /api/watchlists/items/[itemId]`, `PATCH /api/watchlists/[id]/items/[itemId]`, `GET /api/milli-search`. Error class `WatchlistApiError` mirrors the pattern from `TradingApiError`.
- **`mobile-app/src/hooks/useWatchlists.ts`:** TanStack Query hooks with MMKV offline cache (`placeholderData` pattern — instant paint from disk, server hydrates immediately). Optimistic add/remove mutations with rollback. Fire-and-forget reorder mutation (`Promise.allSettled`).
- **`mobile-app/src/components/trading/StockSearchSheet.tsx`:** Reanimated 3 slide-up modal (no gorhom/bottom-sheet dependency). Debounced `/api/milli-search` query, tappable results, `Animated.SharedValue` drives the sheet Y-position on UI thread.
- **`mobile-app/src/components/trading/WatchlistScreen.tsx`:** Multi-watchlist segmented tabs, FlashList of `DraggableRow` (QuoteRow + drag handle + delete), long-press-to-drag with Reanimated 3 ghost overlay, `GestureDetector` pan for drag movement, optimistic reorder on finger release.
- **`mobile-app/app/(tabs)/watchlist.tsx`:** Replaced stub with `WatchlistScreen` + `ConnectionBadge` header.

### Backend — Order idempotency (Trading-d3o)

- **`lib/redis/redis-client.ts`:** Added `redisSetNx(key, value, ttlSeconds)` — atomic SET NX EX using ioredis. Fails open (returns `true`) on Redis error so idempotency degrades gracefully without blocking orders.
- **`lib/redis/order-idempotency.ts`:** Full idempotency module: `extractIdempotencyKey` (UUID v4 validation), `acquireIdempotencySlot` (SET NX), `readIdempotencyCached`, `storeIdempotencyResponse`. User-scoped key format `idem:order:{userId}:{clientKey}`. PROCESSING sentinel prevents duplicate execution on concurrent retries.
- **`app/api/trading/orders/route.ts`:** Idempotency gate injected after auth check. In-flight requests return 409 with `Retry-After: 1`. Completed requests replay cached response with `X-Idempotent-Replayed: true`. TTL 60s.

### Phase 13b — Internal Surveillance

- **Schema:** New `HouseSurveillanceAlert` model with `@@unique([ruleKey, dedupeKey])` DB-level dedupe and `SurveillanceRule` config model. New `SurveillanceSeverity` and `SurveillanceAlertStatus` enums. FK back-edges added to `User`, `Withdrawal`, `Transaction`, `BonusGrant`, `Affiliate`.
- **Five rules:** `HEAVY_HITTER` (event-driven, post-fill notional ramp detection), `SUSPICIOUS_WINNER` (event-driven, winner-control escalation → withdrawal pattern), `COORDINATED_TRADING` (batch, same-instrument cluster), `MULTI_ACCOUNT` (batch, shared IP/device/network fingerprint), `BONUS_ABUSE` (batch, wash-trade turnover heuristic). `LATENCY_ARB` deferred to Phase 13b.5 (`Trading-gqj`).
- **Single-writer rule (advisor-locked):** Rules emit `HouseSurveillanceAlert` rows only — never mutate `ClientWinnerControl`, `BonusGrant`, or any other module's live state. Status is also never reset on re-fire; dismissed alerts stay dismissed.
- **Event hooks:** `lib/surveillance/event-dispatcher.ts` — fire-and-forget hooks wired into `OrderExecutionWorker` (HEAVY_HITTER) and `lib/withdrawal/hold-rules.ts` (SUSPICIOUS_WINNER). Both wrapped in independent try/catch so surveillance failures never block the primary flow.
- **Batch runner:** `lib/surveillance/batch-runner.ts` — iterates `BATCH_RULE_REGISTRY`; each rule independently try/caught; followed by per-rule `autoDismissLowConfidence` sweep.
- **FRAUD_FLAGGED upgrade:** `lib/withdrawal/rules/fraud-flagged.ts` now reads `HouseSurveillanceAlert` (OPEN/ASSIGNED/INVESTIGATING, HIGH/CRITICAL severity) as primary signal; KYC suspicious-status remains legacy fallback.
- **RBAC:** `admin.surveillance.read` (ADMIN+), `admin.surveillance.manage` (ADMIN+), `admin.surveillance.rules` (SUPER_ADMIN only, gated via `RESTRICTED_PERMISSIONS`).
- **APIs:** `GET/POST /api/admin/surveillance/alerts`, `GET/POST /api/admin/surveillance/alerts/[id]`, `GET/PATCH /api/admin/surveillance/rules`, `POST /api/admin/surveillance/batch`.
- **Admin UI (admin-v2):** `SurveillanceWorkbench` with KPI hero (open, high/critical, unassigned, resolved-today), Queue tab (filter chips + search + paginated table), Rules tab (severity/confidence/active toggles, params JSON accordion, manual batch trigger), `RowDrawer` (assign/dismiss/resolve forms, Client 360 link). "Surveillance" added to `PRIMARY_NAV` in `V2Shell`.
- **Seed:** `scripts/seed-phase-13b.ts` — seeds the 5 `SurveillanceRule` rows; safe to re-run (sacred fields never overwritten).
- **Tests (49 total):** `tests/surveillance/writer.test.ts` (idempotency, re-fire updates-not-creates, dismissed-stays-dismissed), `tests/surveillance/rules.test.ts` (happy-path + no-fire gate + dedupeKey determinism per rule), `tests/surveillance/queue-service.test.ts` (KPI tile semantics, row DTO shape, status transitions).

## 2026-04-15
- **Admin `/admin-console/advanced` overhaul → Trades Command Center:** Replaced the flat `TradeManagement` ledger with a master-detail workspace (`components/admin-console/trades-blotter.tsx`). Top row: `ActiveUsersPanel` (searchable, bounded-scroll, 15s auto-refresh) + `StatsAndRisk` (6 StatCards 3×2 + `RiskFlagsStrip`, 10s/15s refresh). Bottom: fixed tabs `[All trades][By client][By symbol]` plus dynamic per-user/per-symbol tabs (LRU cap 10). Main `TradesTable` is scope-parameterized (`all` / `user` / `symbol`), 12-column high-density layout, inline expandable rows with 3-panel detail (Orders timeline · P&L + statement with running `balanceAfter` · Meta), filter chips, URL-synced filters, sticky bulk-ops bar with spring animation.
- **Transaction Ledger preserved at new route:** Old `TradeManagement` screen moved to `/admin-console/ledger`; sidebar gains a new "Transaction Ledger" entry (`ReceiptText` icon). Existing `advanced/page.tsx` now renders `<TradesBlotter/>`.
- **New admin trades endpoints:** `GET /api/admin/trades` (scope-aware list with stats + ledger enrichment), `/active-users`, `/risk-flags` (30s server cache), `/rollup/by-client`, `/rollup/by-symbol`, `POST /api/admin/trades/[positionId]/close`, `/[positionId]/note`, `/bulk-close`, `/orders/[orderId]/cancel`, `GET /api/admin/trades/export` (streamed CSV). Reads gated by `admin.positions.read`, mutations by `admin.positions.manage`.
- **Schema migration — position closure metadata:** Added nullable `closureReason`, `closureNote`, `closedByUserId` + `closedBy` relation on `Position` with matching back-relation on `User`. Backfill SQL sets `closureReason='USER_CLOSED'` for historical retail-closed positions (identified via `Order.closeMetadata->>'source'='retail_positions_api'`); legacy rows not covered render as `UNKNOWN`.
- **`PositionManagementService.closePosition` extended:** Added optional `closureContext: { reason; closedByUserId?; note? }` parameter that writes the three new columns inside the existing update. All four close call sites pass the correct context — retail close → `USER_CLOSED`, admin net-close → `ADMIN_CLOSED` + note, admin PATCH close → `ADMIN_CLOSED`, risk-monitor auto-liquidation → `AUTO_LIQUIDATED` + breach reason. Missing context defaults to `MANUAL_OTHER` with a warn-log.
- **Shared derivation + CSV helpers:** New `lib/server/admin-trades-derivation.ts` (side / status / entry / exit / held / `isRealizedPnLTransaction`), `admin-trades-number-utils.ts`, `admin-trades-rollup.ts` (SQL builders), `admin-trades-risk-flags.ts`, `admin-trades-csv.ts`. Client-side fmt helpers in `components/admin-console/trades-blotter-number-utils.ts` (compact rupees, duration, P&L/side/status class helpers).
- **Tests:** 36/36 passing — `tests/workers/trades-blotter-number-utils.test.ts` + `tests/api/admin-trades-derivation.test.ts` + service-level `closureContext` variant coverage.

## 2026-03-29
- **PM2 / EC2 (co-host with TradeBazaar):** Replaced duplicate TradeBazaar `ecosystem.config.cjs` with TradingPro-specific `tpro-*` apps, deploy `cwd` `/home/ubuntu/tradingpro-platform`, Next on **4000** and terminal-gateway on **4001**. Added [docs/deployment/ec2-pm2-nginx.md](docs/deployment/ec2-pm2-nginx.md) for env checklist and nginx reverse-proxy example.
- **EC2 nginx + Let’s Encrypt:** Added [scripts/deploy/nginx-site-tradingpro.sh](scripts/deploy/nginx-site-tradingpro.sh) — one-shot vhost for `marketpulse360.live` → `127.0.0.1:4000`, separate from `tradebazar.live`, with optional `certbot --nginx`.

## 2026-03-09
- **WebView mobile wrapper (Android APK + iOS):** Added `webview-app/` — a minimal Capacitor app that builds an Android APK and iOS app loading the production domain in a WebView. Configure `CAPACITOR_APP_URL` (e.g. `https://www.marketpulse360.live`) and see `webview-app/README.md` for build/signing steps.
- **Dashboard URL-based tabs:** User dashboard tabs (Home, Watchlist, Orders, Positions, Account) are now driven by the `?tab=` query parameter. Refreshing or sharing the URL preserves the selected tab; Home uses a clean `/dashboard` URL (no query when tab is home).

## 2026-02-24
- **Client flow hardening (watchlist/header/orders):** Introduced a canonical quote snapshot model (`uiPrice`, `tradePrice`, freshness/source metadata) and applied it across watchlist and order form so stale/snapshot prices are explicit. Header stream indicator now differentiates `Connected`, `Connecting`, `Snapshot`, and `Offline/Error`, and Orders tab now shows `Submitted` vs `Executed` prices to explain async execution deltas.
- **Server MARKET reliability hardening:** Placement now attempts fresh server quote first but falls back to validated client/stock metadata price so MARKET orders stay `PENDING` instead of false immediate cancellation; execution worker now applies a bounded stale-quote retry window before final cancellation. Added explicit worker cancellation reasons for invalid execution price/missing stock and richer order-worker heartbeat feed telemetry.
- **Admin workers feed observability:** Workers tab now surfaces live server market-data probe diagnostics (`/api/admin/market-data-health`) and order-worker feed heartbeat metrics (connected state, message age, cache/subscription counts, deferred stale-quote count) so operators can verify backend feed health directly.
- **Client quote gating & header sync:** Server is sole authority for MARKET acceptance; client no longer hard-blocks submit when local quote is stale. Order panel shows non-blocking stale warning and "Snapshot" label when price is from fallback; backend remains authoritative for PENDING vs CANCELLED and `failureReason`. Dashboard header/index display is freshness-aware: when disconnected or quote older than 5s, index shows "Offline"/"Stale" instead of cached numbers as live. Removed simulated index update loops from enhanced-header and clean-header (static placeholders only). Added regression tests for MARKET price fallback and index freshness behavior.
- Enforced MARKET live-price integrity policy end-to-end: orders now require fresh server quote (`<=5s`) and are cancelled as exchange-rejected when stale/missing.
- Added persistent order rejection metadata (`failureCode`, `failureReason`) in schema + APIs so cancelled reasons appear in order status/list UI.
- Updated worker execution priority to prefer fresh websocket quote for MARKET fills and persist stale-quote cancellation reasons.
- Hardened watchlist live subscriptions via chunked token subscription and visible unresolved-instrument surfacing in UI/data transforms.
- Added regression tests for stale quote rejection behavior in service/worker and order status/list API response payloads.
- Added server-side quote warmup + diagnostics hardening: bounded `waitForFreshQuote(...)` for MARKET placement/execution and MTM worker token warmup, `Stock.token`-first worker/MTM token resolution, richer feed-health telemetry, and new admin probe endpoint `GET /api/admin/market-data-health`.

## 2026-02-25
- **Strict live-only market data (client):** Disabled jitter/interpolation defaults, cleared in-memory quotes on WS disconnect/error, and gated UI numbers behind freshness (<=5s) so stale prices render as `--` with clear `STALE/Live required` messaging.
- **Order/position action gating:** Order dialog now subscribes the selected token on open and blocks MARKET submission until a fresh quote arrives; position square-off now requires a fresh quote (<=5s) and blocks exits when stale/offline.
- **Exchange-aware subscriptions + non-fatal token errors:** Client and server now subscribe using exchange-qualified keys when required (e.g., `NSE_FO-<token>`, `NSE_EQ-<token>`) and treat token-level subscription errors (like `exchange_unresolved`) as per-instrument issues (no global Offline flip). Admin market-data health now surfaces subscription error counts/samples and supports probing with `subscriptionKey`.
- **Kite-style net positions + settlement:** Added `/api/trading/positions/net` for a Kite-like net view (one row per instrument+product) while keeping internal FIFO lot rows; added `POST /api/trading/positions/net/close` for FIFO net square-off/partial exits; standardized product types to `MIS`/`CNC`/`NRML` (with legacy alias compatibility); and fixed BUY/SELL offset settlement so execution now persists realized P&L, releases margin, and credits/debits funds atomically when offsets consume existing lots.

## 2026-01-15
- Hardened admin RBAC with permission catalog and Access Control UI.
- Added super-admin financial manage permission and restricted gating.
- Introduced AppError base with domain error set and tests.

## Key Milestones

### System Architecture
- Built complete trading system with Prisma ORM
- Database-agnostic architecture (PostgreSQL, MySQL, MongoDB compatible)
- Atomic transaction support with auto-retry logic
- Comprehensive logging system

### Authentication System
- Implemented JWT-based authentication
- MPIN system for trading
- Password reset flow
- Mobile authentication support
- Role-based access control (ADMIN, USER roles)

### Core Trading Features
- Order placement (MARKET, LIMIT, MIS, CNC)
- 3-second order execution simulation
- Position management (open/close/update)
- Real-time P&L calculation
- Margin management (NSE: 200x/50x, NFO: 100x)
- Fund operations (block/release/debit/credit)

### Admin Console
- Dashboard with platform statistics
- User management (view/search/activate/deactivate)
- Fund management (add/withdraw)
- Deposit approvals/rejections
- Withdrawal approvals/rejections
- Activity monitoring and logs

### Real-time Updates
- WebSocket integration (optional)
- Polling-based updates (2-3 second intervals)
- Optimistic UI updates
- Toast notifications

### Market Data Integration
- Vortex API integration for live market data
- Multi-tier price resolution (Vortex → Database → Fallback)
- Market realism (spread + slippage simulation)
- Perfect market data jittering (0.15 intensity, 250ms)

### Enterprise Features
- Atomic transactions with rollback
- Rate limiting (20 orders/minute)
- Performance monitoring
- Health checks
- Caching system
- Error boundaries
- Comprehensive audit trail

### Prisma Migration
- Migrated from Supabase RPC to Prisma services
- Type-safe database operations
- Repository pattern implementation
- Service layer architecture

### WebSocket Implementation
- WebSocket architecture for real-time updates
- Auto-reconnection logic
- Event-driven architecture
- Testing implementation complete

### Console & Watchlist
- Console service for user operations
- Watchlist migration to Prisma
- Watchlist API and integration
- User profile management
- Bank account management
- Transaction history

### Deployment & Build Fixes
- Fixed localhost hardcoded URLs in production
- Vercel build fixes
- Environment variable configuration
- Deployment checklist

### UI/UX Improvements
- 404 page implementation
- Enhanced header
- Swipe delete UX
- Mobile-responsive design
- Order badge fixes
- Enhanced market data display

### Security Fixes
- Security improvements
- Input validation with Zod
- SQL injection prevention (Prisma)
- CSRF protection

## Development Notes

- All operations use atomic transactions
- Comprehensive logging to `trading_logs` table
- Type-safe TypeScript throughout
- Console logs for debugging
- Error handling with retry logic
- Performance tracking for all operations

## Architecture

The system follows a clean architecture pattern:
- **Frontend Layer**: Next.js App Router, React components
- **API Layer**: Rate limiting, validation, monitoring
- **Service Layer**: Business logic (Orders, Positions, Funds, Admin)
- **Repository Layer**: Data access (Orders, Positions, Accounts, Transactions)
- **Transaction Layer**: Atomic operations with Prisma

## Key Files

- `TRADING_SYSTEM_ARCHITECTURE.md` - Complete system design
- `FEATURE_ROADMAP.md` - Future enhancements
- `MIGRATION_GUIDE.md` - Migration documentation
- `DEPLOYMENT_CHECKLIST.md` - Deployment guide

