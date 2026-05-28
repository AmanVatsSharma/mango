# Realtime Stability — Design Spec

**Date:** 2026-05-07
**Author:** Aman + Claude (learning mode)
**Status:** Draft — awaiting approval

## Problem Statement

User-reported symptoms:

1. **Prices disappear / are inconsistent** — some symbols update, others don't; prices flash blank intermittently.
2. **Tabs render blank-white until the user clicks away and back** — common after returning from another browser tab.
3. **API request storm on tab return** — every time the user comes back to the tab, dozens of `/api/...` calls fire.
4. **General stability concern** — "auto reconnect, resubscribe if no price arrives, just be stable."

## Root Causes (verified)

| # | Cause | Evidence |
|---|-------|----------|
| 1 | `quotes` memo wipes the entire map on disconnect when `disconnectedPriceMode === "dash"`. | `WebSocketMarketDataProvider.tsx:1417-1429` |
| 2 | 14 SWR hooks override the global `revalidateOnFocus: false` with `true`. Returning to the tab → thundering herd. | grep of `revalidateOnFocus: true` |
| 3 | No global tick-flow watchdog. Socket can stay "connected" while the upstream gateway has stopped emitting `market_data` events. The per-token recovery only fires after 60s idle. | `WebSocketMarketDataProvider.tsx:1036+` |
| 4 | Per-token resubscribe ladder gives up after 8 attempts (`NO_QUOTE_RESUBSCRIBE_MAX_ATTEMPTS = 8`). After that the symbol is silently abandoned. | `WebSocketMarketDataProvider.tsx:114` |
| 5 | The in-memory tick cache lives on the service instance, which is created inside `useWebSocketMarketData`. Any provider remount (route change, error boundary recovery) destroys the priceCache. | `WebSocketMarketDataService.ts:114`, hook lifecycle |
| 6 | None of the realtime SWR hooks set `keepPreviousData: true`. SWR v2 *does* keep stale `data` during revalidation, but ad-hoc empty-array returns from the API can momentarily empty the dashboard until the next event re-populates. | grep |

## Out of Scope

- Persistence across **hard reload** (sessionStorage/IndexedDB tick cache). Not implementing now — adds surface area without addressing the reported symptoms.
- Wholesale flipping `revalidateOnFocus: true → false`. Some hooks (notifications, account) need a focus-sync as recovery against missed SSE events. Throttle, don't disable.
- Reworking the GraphQL → REST split.
- Migrating off SWR.

## Design

### Layer 1 — Tick survival (fixes symptoms 1, 4, 5)

**1a. Stop wiping quotes on disconnect.**
`WebSocketMarketDataProvider.tsx:1417` change:

```ts
// BEFORE
const quotes = useMemo(() => {
  if (wsData.isConnected !== "connected" && displayDocument.ui.disconnectedPriceMode === "dash") {
    return {};
  }
  return enhancedQuotes;
}, [...])

// AFTER
const quotes = enhancedQuotes; // never wipe; staleness handled per-quote in components
```

The `disconnectedPriceMode === "dash"` policy is enforced per-component already through `marketDisplayUi.staleQuotePriceMode` and quote freshness metadata. The wholesale wipe is the wrong layer for that decision.

**1b. Module-singleton tick cache.**
The current `priceCache: Map<number, EnhancedQuote>` lives on a service instance created by `useWebSocketMarketData`. Move it to a module-level `globalTickCache` so:

- Provider remounts (route change, error boundary recovery) preserve the cache.
- Service initialize() seeds `priceCache` from the global cache.
- Service teardown copies its current `priceCache` into the global cache.

**1c. Resubscribe forever.**
`NO_QUOTE_RESUBSCRIBE_MAX_ATTEMPTS = 8` → `Infinity`, but introduce a tiered cooldown: `5s × attempt` capped at `60s`. Symbols never get permanently abandoned.

### Layer 2 — Tick-flow watchdog (fixes symptom 1, "prices stop coming")

Add a global watchdog at the provider level:
- Track last `market_data` event time across the whole feed (any token).
- If `wsData.isConnected === "connected"` AND `now - lastAnyTickAt > 45_000` AND market is open → call `reconnectTransport()`.
- Reset on every inbound `market_data` event.

This catches the failure mode the per-token resubscribe can't see: the gateway is alive (heartbeats OK) but stopped fanning out.

### Layer 3 — Tab-return refetch storm (fixes symptom 3)

Audit all 14 `revalidateOnFocus: true` and add `focusThrottleInterval: 30_000` (or `60_000` for non-critical hooks). This keeps the recovery semantic but caps fan-out to one fetch per hook per 30s.

Specific assignments:

| Hook | Reason for focus-revalidate | Throttle |
|---|---|---|
| `use-prisma-watchlist` | Catches missed SSE events on watchlist edits | 30s |
| `use-realtime-positions` | Recovery against missed pos events | 30s |
| `use-realtime-orders` | Recovery against missed order events | 30s |
| `use-realtime-account` | Margin/funds drift recovery | 60s |
| `use-trading-data` (×3) | Portfolio/quotes | 60s |
| `use-notifications` | Catch missed pushes | 30s |
| `use-admin-notifications` | Same | 60s |
| `use-position-history` | Read-only history | 60s |
| `use-order-form` | Form state | 60s |
| `use-console-features` | Feature flags | 120s |
| `use-market-catalog` | Catalog (rarely changes) | 300s |
| `WatchlistItemCard` (per-card) | Per-item details | 60s |

### Layer 4 — Blank-tab on focus (fixes symptom 2)

Pre-condition discovery showed:
- `WatchlistManager` has a proper skeleton.
- `OrderManagement` renders chrome + "No orders" — not blank.
- `PositionTracking` renders empty state for `positions.length === 0`.
- The `TradingDashboard` has `{!hasAnyData && isRealtimeLoading ? <DashboardSkeleton /> : renderContent()}`. For users with no positions/orders, `hasAnyData === false` regardless. That dashboard skeleton may be the "blank tab" the user sees.

Fix: change the gate so once the dashboard has rendered ONCE, it never shows the dashboard skeleton again — only inline indicators inside each tab's component. Track a `hasRenderedAtLeastOnce` ref.

```ts
const hasRenderedRef = useRef(false)
useEffect(() => {
  if (!isRealtimeLoading) hasRenderedRef.current = true
}, [isRealtimeLoading])
const shouldShowDashboardSkeleton = !hasRenderedRef.current && isRealtimeLoading
```

Tabs are then never "blank" after the first paint — they show their own empty/skeleton state in-place.

### Layer 5 — Realtime hook resilience (DROPPED in implementation)

Original plan was to add `keepPreviousData: true` to the realtime SWRs. **Dropped** because:

- SWR v2's default behavior **already** keeps `data` populated during same-key revalidation (the focus-refetch scenario we actually care about). `keepPreviousData` doesn't change that.
- `keepPreviousData` only differs from default behavior when the **SWR key changes** — and our SWR keys include `userId`. The only scenario where it would have helped is exactly the cross-user data leak case (impersonation, account switcher) where User A's positions briefly render to User B.
- Net effect: zero benefit for the actual bug, real security risk added. Reverted.

The Layer 4 dashboard skeleton gate carries the blank-tab-on-focus weight on its own.

## Files to Change

1. `lib/market-data/providers/WebSocketMarketDataProvider.tsx` — quotes memo, watchdog, dashboard skeleton refactor not here
2. `lib/market-data/services/WebSocketMarketDataService.ts` — module-singleton tick cache, retry forever
3. `lib/market-data/hooks/useWebSocketMarketData.ts` — wire global cache hydration
4. `components/trading/TradingDashboard.tsx` — `hasRenderedRef` gate
5. **Throttle additions** (one line each):
   - `lib/hooks/use-prisma-watchlist.ts`
   - `lib/hooks/use-realtime-positions.ts`
   - `lib/hooks/use-realtime-orders.ts`
   - `lib/hooks/use-realtime-account.ts`
   - `lib/hooks/use-trading-data.ts` (3 spots)
   - `lib/hooks/use-notifications.ts`
   - `lib/hooks/use-admin-notifications.ts`
   - `lib/hooks/use-position-history.ts`
   - `lib/hooks/use-order-form.ts`
   - `lib/hooks/use-console-features.ts`
   - `lib/hooks/use-market-catalog.ts`
   - `components/watchlist/WatchlistItemCard.tsx`

Total: ~15 files, mostly 1-line throttle additions.

## Tests / Verification

Manual:
- [ ] Connect, see prices, then `Network → Offline` → prices remain visible (no blank), reconnect → ticks resume
- [ ] Connect, hide tab for 60s, return → no flood of API calls (devtools Network panel should show ≤ 5 requests, not 30+)
- [ ] Force gateway to stop emitting (block `market_data` event in service worker) for 60s → watchdog fires `reconnectTransport`, ticks resume
- [ ] Hard reload while market is open → watchlist symbols all show prices within 5s (subscription_confirmed snapshot)
- [ ] Open tab and switch among Home/Watchlist/Orders/Positions/Account 5× rapidly → no blank-white frames

Automated:
- Unit test the global tick cache (write/read/seed-from-existing).
- Unit test the watchdog timer (mock `Date.now` and event bus).

## Risk

- **Module-singleton tick cache** could leak across logout/login. Mitigation: clear on `disconnect()` triggered by signOut.
- **Removing the disconnect wipe** changes a user-facing UX policy (currently shows "--" on disconnect when configured). Mitigation: behavior is now driven by per-quote `staleBadge` only — confirm with PM that this is desired.
- **focusThrottleInterval** could mask a genuine SSE-missed event longer than 30s. Mitigation: 30s is acceptable; SSE auto-reconnect handles most cases.
