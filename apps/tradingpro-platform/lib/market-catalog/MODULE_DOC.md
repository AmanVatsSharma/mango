# `lib/market-catalog`

Admin-curated market catalog for the user-facing watchlist Add drawer's Browse mode.

## What this module owns

- The **schema** for `MARKET_CATALOG_V1` — the JSON blob persisted in `SystemSettings` that
  describes admin-curated groups (Indices, Sectors, Options Chains) of catalog items
  (instruments, options-chain recipes).
- The **resolver** that expands stored *recipes* (e.g. "next 3 weekly NIFTY expiries, ATM ± 5
  strikes") into a concrete tree of expiry → strike → CE/PE rows by querying the live
  Vedpragya feed.
- The **cache + invalidation pubsub** so admin saves are reflected in user reads within
  ~250 ms across all containers.
- The **audit trail** for every admin save.
- A **server-only Vedpragya client** for the resolver to bypass the internal proxy hop.

## What this module does NOT own

- The user-facing Browse UI (`components/watchlist/catalog-browser.tsx`).
- The admin editor UI (`components/admin-console/market-data/MarketCatalogEditor.tsx`).
- The Vedpragya proxy routes used by free-text Search (`app/api/market-data/{search,options,…}`).
- The watchlist expiry sweep cron (`app/api/cron/watchlist-expiry-sweep/route.ts`) — that
  module reads `WatchlistItem.expiry` directly; it doesn't touch the catalog.

## Files

| File | Role |
|---|---|
| `catalog-schema.ts` | Zod schema + types + `parseMarketCatalogJson()` defensive parser |
| `strike-step.ts` | Per-underlying strike step (NIFTY=50, BANKNIFTY=100, …) |
| `upstream-instruments-client.ts` | **Server-only** direct Vedpragya fetcher |
| `resolve-catalog.ts` | Recipe → resolved tree, with 30s in-process cache |
| `market-catalog-loader.ts` | DB read of the raw catalog with 5s cache |
| `market-catalog-pubsub.ts` | Redis channel for cross-container cache invalidation |
| `market-catalog-audit.ts` | Audit trail for admin saves (mirrors market-control-audit) |

## Persistence shape

```
SystemSettings(
  key       = 'market_catalog_v1',
  ownerId   = null,                    -- global; v1.5 reserves ownerId for per-segment
  category  = 'MARKET_DATA',
  isActive  = true,
  value     = JSON.stringify(MarketCatalogV1)
)
```

Audit rows use the `market_catalog_audit:` key prefix so a single audit-viewer UI can read both
this trail and `market_control_audit:` by simple namespacing.

## Caching

Two layers:

1. **Loader cache** (5s TTL): bounds DB hits per container.
2. **Resolver cache** (30s TTL): bounds Vedpragya hits per container, keyed by catalog hash.

Both layers are dropped on admin PUT via `invalidateMarketCatalogCache()` +
`invalidateResolveCatalogCache()`. Cross-container invalidation rides on the Redis pubsub channel
`market-catalog:config-changed` (no-op if Redis disabled — TTLs still bound staleness).

## Adding new strike steps

Edit `strike-step.ts` → `STRIKE_STEPS`. Underlying root must match the symbol stripped of
spaces and trailing digit suffixes (so "NIFTY 50" → "NIFTY"). The override on a single recipe's
`strikeStrategy.step` always wins.

## Adding new item kinds

1. Add the discriminated-union variant to `catalogItemSchema` in `catalog-schema.ts`.
2. Add a resolver branch in `resolveItem()` in `resolve-catalog.ts`.
3. Add a corresponding ResolvedItem type + UI renderer in `components/watchlist/catalog-browser.tsx`.
4. Add a row editor in `components/admin-console/market-data/catalog-editor/`.
