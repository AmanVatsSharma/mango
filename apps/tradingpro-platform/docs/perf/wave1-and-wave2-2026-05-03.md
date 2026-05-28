# Performance Waves 1 + 2 — 2026-05-03

Origin: client report of ~20 s first render on `/dashboard` and `/console`.
Plan: `~/.claude/plans/you-needa-go-to-purrfect-castle.md`.
Branches: `main` in both `tradingpro-platform/` and `TradeBazaar/`.

## What changed (15 commits across both waves)

### Wave 1 — Structural fixes (highest ROI, lowest risk)

| Commit | Beads | Summary |
|---|---|---|
| `f9bce45` | Trading-4fm | Drop edge middleware self-fetches to `/api/maintenance/status` + `/api/kyc/config`; strip 43 `console.log` calls behind `MIDDLEWARE_DEBUG` |
| `a98cf7a` | Trading-7ur | Skip the 120 ms `setTimeout` retry in `auth.ts` JWT callback for deterministic invalid reasons (revoked, expired, mismatch); only `row_not_found` keeps the read-replica race retry |
| `1e8ef34` | Trading-klx | Drop `react-icons` (83 MB installed, 5 files) → lucide-react aliases; extend `optimizePackageImports` (framer-motion, recharts, date-fns, all radix); add `output:'standalone'` |
| `a29f17d` | Trading-8u5 | Move `SessionProvider` + `ApolloProviderWrapper` out of root layout into `(main)/layout.tsx`, `(admin)/layout.tsx`, `(console)/console/layout.tsx`. New `AuthedAppProviders` wrapper. Marketing pages no longer hydrate Apollo (16 MB installed). |
| `8ba5610` | Trading-yl3 | Convert `app/(main)/dashboard/page.tsx` from `"use client"` to a server component reading `searchParams` from props; new `dashboard-client.tsx` houses the ErrorBoundary + TradingDashboard |
| `96afb47` | Trading-8w8 | Convert `/console` page to server shell + new `console-client.tsx` with `next/dynamic` for all 9 sections (Account, Bank, Deposits, etc.) — only the active section's chunk loads on first paint |
| `5978b42` | Trading-j8w | Convert `app/(admin)/admin-console/layout.tsx` from `"use client"` to a server layout; lift state + framer-motion into new `admin-console-shell.tsx` client island |
| `932ecc8` | Trading-a98 | Mirror Wave 1 (23 files) to `TradeBazaar/` — verified identical via `diff -q`; flagged unrelated pre-existing drift |

### Wave 2 — Bundle reduction + runtime polish

| Commit | Beads | Summary |
|---|---|---|
| `384af6a` | Trading-08k | Defer 6 eager imports in `TradingDashboard.tsx` via `next/dynamic`: `OrderDialog`, `WatchlistOrderDrawer`, `DesktopTerminalLayout`, `WatchlistObsidianChartShell`, `RiskMonitor`, `NotificationBell` |
| `778ed75` | Trading-cf0 | Lazy-load `jspdf` + `jspdf-autotable` (29 MB installed) inline inside `exportFinancialPdf` — only loads on Export-PDF click |
| `2b4013a` | Trading-2ze | Page-level `next/dynamic` split for the 3 recharts-heavy admin routes (analytics, system-health, financial-reports). New `AdminPageSkeleton` is the SSR shell while the chart chunk loads. |
| `ad501f8` | Trading-lx9 | Add global `SWRConfig` defaults in `AuthedAppProviders` (no `revalidateOnFocus`, 2 s `dedupingInterval`, 5 s `focusThrottleInterval`) — kills the thundering refetch when users tab back |
| `0a12002` | Trading-rp9 | Add `.perf-cv-list`, `.perf-cv-card`, `.perf-touch` utility classes to `globals.css`. Inter already optimal (variable font + latin-only + display:swap). No raw `<img>`. |
| Trading-oo4 | n/a | Closed as no-op — `WebSocketMarketDataProvider` is already only mounted inside `TradingDashboard.tsx` on `/dashboard`. No marketing/admin route pulls it into its bundle. |
| Trading-q2w | n/a | Closed as no-op — `MiniChart.tsx` is dead code (no consumers). Active lightweight-charts consumer (`instrument-candle-chart`) is already inside dynamic-imported chart shells from W2.1. |
| (this file) | Trading-1kt | Mirror Wave 2 (8 files) to `TradeBazaar/` + this measurement document |

### Wave 2 — Hot-path follow-ups (post-live-test, 2026-05-03)

| Change | Summary |
|---|---|
| `app/layout.tsx` | Add `suppressHydrationWarning` on `<html>` — kills the next-themes hydration warning on every load. |
| `app/api/notifications/route.ts` | Strip ~10 verbose logs (incl. `JSON.stringify(where, null, 2)` and per-row `notifications.map(...)` payload-builds inside `console.log`). Replaced with a `dlog()` helper gated by `NOTIFICATIONS_DEBUG=1`. The polled endpoint no longer pays the log-build cost on every request. |
| `lib/graphql/apollo-client.ts` | Replaced the Supabase-pointed Apollo client with a no-op `ApolloLink`. The previous client fell back to `https://dummy.supabase.co/graphql/v1` whenever Supabase env vars were unset and was generating real network failures on every page that imported `use-trading-data.ts` or `lib/logger.ts`. The shim returns `{ data: undefined }` synchronously so all `useQuery`/`useMutation` consumers settle into their existing empty branch with no traffic. admin-v2's GraphQL (Pothos) is consumed via fetch/SWR and is unaffected. |
| Deleted dead Supabase server files | `lib/server/{fund-management,position-management,enhanced-order-execution,order-execution,logger}.ts`, `app/api/trading/positions/actions.ts`, `lib/supabase/{supabase-client,supabase-server}.ts`, `types/supabase.ts`. All verified zero live consumers (only self-references in their own headers). |
| `package.json` | Removed `@supabase/auth-helpers-nextjs` and `@supabase/supabase-js` deps. Run `npm install` to refresh the lockfile. |

**Vortex deliberately NOT removed** — the JsVortex SDK and the `lib/market-data/providers/vortex` integration are live (broker API for orders, positions, quotes). The user message asked to remove "supabase or vortex" but evidence in code shows Vortex is still the active broker. Treat Vortex removal as a separate, much larger migration; do not bundle it with the Supabase cleanup.

### Wave 2 — Vortex → Vedpragya migration (2026-05-03)

**Correction to the previous note:** the dashboard primary data path was already on `marketdata.vedpragya.com` Socket.IO; Vortex's only remaining role was the `/api/quotes` REST endpoint plus admin v1 tooling for managing Vortex sessions. After confirming this with the user, Vortex was removed completely.

| Change | Summary |
|---|---|
| `app/api/quotes/route.ts` | Rewrote to call `getServerMarketDataService()` (vedpragya WS singleton) instead of Vortex. Same input/output contract — all REST consumers (`WebSocketMarketDataProvider` browser fallback, `PriceResolutionService`, `PositionManagementService`, `RiskMonitoringService`) keep working unchanged. New impl uses `service.getQuote()` for instant cache hits and `service.waitForFreshQuote()` (800ms timeout, 50ms poll) for misses. Caching, ETag, rate limiting, last-known-good fallback all preserved. |
| Deleted entire Vortex code surface | `lib/vortex/` (9 files: vortex-enhanced, vortexApi, vortexClient, vortexLogger, request-queue, quotes-batcher, quotes-batcher-config, quotes-batcher-number-utils, websocket-health-monitor), `components/vortex/WebSocketErrorBoundary.tsx`, `tests/vortex/quotes-batcher-number-utils.test.ts`. |
| Deleted Vortex-only admin v1 routes | `app/(admin)/admin/api/{callback,db-status,instruments,nifty,nifty50,vortex}/`, `app/(admin)/admin/{auth,dashboard,vortex-dashboard}/`, `app/api/admin/{queue-status,quotes-batcher-status,vortex-test}/`, `app/api/debug/vortex-session/`, `app/api/ws/`, `app/api/quotes/docs/`. Admin v1 still has `kyc/`, `logs/`, and `api/{db-status,loadtest}/` — all vortex-free. |
| `middleware.ts` | Removed `/admin/api/callback` from the public route allowlist (Vortex OAuth callback is gone). |
| `lib/branding-routes.ts`, `Branding/identity.ts` | Removed `adminAuthLogin`, `adminDashboard`, `adminVortexDashboard` route types and entries. Kept `adminRoot` and `adminKyc`. |
| `package.json` | Removed `@rupeezy/jsvortex` dep. Run `npm install` to refresh lockfile. |
| `.env.example` | Removed the SUPABASE and VORTEX_API blocks entirely. |
| `lib/services/order/PriceResolutionService.ts` | Updated stale "Vortex API" log strings to "vedpragya quotes API". |

**Server-side critical paths were ALREADY on vedpragya** — `OrderExecutionService`, `PositionPnLWorker`, `position-square-off-exit-price`, `market-data-health` admin route, `position-instrument-resolution`, and `market-quote-redis` all call `getServerMarketDataService()` directly. The `/api/quotes` rewrite is the last bridge to retire.

**Deferred (require explicit DB review):**
- `prisma.VortexSession` model is still in `schema.prisma` (and `schema-enhanced.prisma`). The model has no live consumer after these deletions — but dropping it is a destructive prod schema change. Recommended next step: a single Prisma migration `DROP TABLE vortex_sessions;` after confirming no production data needs preserving. Submit as a reviewed PR.
- `lib/logger.ts` (client-side trading-log helper) was kept because `use-trading-data.ts` still imports `LogLevel`/`LogCategory`/`createLoggerFromSession`. Its mutations now no-op via the Apollo shim. Plan to delete it as part of the broader `use-trading-data.ts` REST migration.

## Bundle measurements (tradingpro-platform `next build`)

These are the **First Load JS** numbers — the bytes the browser must download
before a route is interactive.

| Route | Before Wave 1 | After Wave 1 | After Wave 2 | Δ vs baseline |
|---|---|---|---|---|
| `/` (marketing) | ~250+ kB (with Apollo + Session) | **182 kB** | 182 kB | **−27%+** |
| `/products`, `/contact`, `/privacy-policy`, etc. | ~250+ kB | **182 kB** | 182 kB | **−27%+** |
| `/auth/login` | ~250+ kB | **215 kB** | 216 kB | **−14%** |
| `/dashboard` | ~493 kB | 493 kB | **261 kB** | **−47%** |
| `/console` | ~480 kB | **215 kB** | 216 kB | **−55%** |
| `/admin-console/financial-overview` | 358 kB | 358 kB | **218 kB** | **−39%** |
| `/admin-console/analytics` | 292 kB | 292 kB | 293 kB | unchanged (recharts dominant; deeper split needed) |
| `/admin-console/*` (other) | varies | now prerender as ○ static (was forced ƒ dynamic by client layout) | same | TTFB win |
| Shared chunks | 88 kB | 88 kB | 88.8 kB | basically flat |
| Middleware | ? | 134 kB | 134 kB | runtime: ZERO loopback fetches (was 2 per request) |

## What we did NOT change (and why)

- **Trading WebSocket logic**: works and is already correctly scoped (only mounts on `/dashboard`). No marketing/admin route imports it. Subscription burst splitting is deferred — needs runtime measurement.
- **NextAuth session strategy**: stays JWT (already optimal — DB sessions are slower).
- **Prisma schema / queries**: out of scope for Wave 1+2 (read-only audit).
- **Per-component recharts splitting**: page-level dynamic gave perceived TTFB win but bundle didn't drop because the chart renders on first paint. True drop needs lazy-load behind a viewport-intersection trigger — defer to a measured Wave 3 if dashboards still feel slow.
- **List virtualization (react-window)**: deps already present but applying to `position-tracking` (2053 lines), `WatchlistManager` (921 lines), `order-management` (612 lines) needs per-component height profiling — defer.
- **Service worker / PWA**: skipped (would risk caching staleness on trading-critical paths).

## How to verify locally

```bash
cd tradingpro-platform
npm run type-check
npx jest --config jest.config.cjs tests/lib/kyc-enforcement.test.ts --forceExit
prisma generate && next build   # check bundle table at the end of output
```

Then the same in `TradeBazaar/`. The mirror policy from `CLAUDE.md` is in force —
all changes happen in `tradingpro-platform/` first, then file-level mirror.

## What to do with the remaining drift

`diff -rq tradingpro-platform/ TradeBazaar/ | grep -vE '(Dockerfile|docker-compose|node_modules|\.next|Branding)'`
still shows about a dozen pre-existing differences (downloads/page.tsx,
api/admin/kyc, api/ready/session, several MODULE_DOC.md, kyc-queue-table.tsx,
deposits forms). These existed BEFORE Wave 1 and were intentionally NOT
overwritten per `CLAUDE.md` mirror policy. They need human review to determine
which side is the source of truth.
