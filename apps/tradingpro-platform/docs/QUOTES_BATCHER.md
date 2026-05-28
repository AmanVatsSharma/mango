# Quotes Batcher (API/quotes)

Enterprise-grade batching layer that coalesces all `/api/quotes` requests arriving within a configurable window (default 1000ms) per `mode`, deduplicates instruments across users, and performs a single upstream call to Vortex.

## Why
- Reduce upstream load and rate limiting issues
- Deduplicate repeated instruments across many users
- Preserve per-request API contract and latency SLOs via short windowing

## Behavior
- Window: `QUOTES_BATCH_WINDOW_MS` (default 1000ms)
- Unique cap: `QUOTES_BATCH_MAX_UNION` (default 1000)
- Per-request timeout: `QUOTES_BATCH_REQUEST_TIMEOUT_MS` (default 4000ms)
- Partitioning: batches are keyed by `mode` (e.g., `ltp`)
- Deduplication: instruments are stored in a `Set`, shared across users
- Micro-cache (optional): `QUOTES_BATCH_MICRO_CACHE_TTL_MS` short-lived cache of union results
- Circuit breaker: configurable failure threshold and half-open period
- Flush triggers:
  - Window elapsed (timer)
  - Unique cap reached (max_union)
  - Manual flush via admin endpoint

## Flow
```
Client(s) ---- /api/quotes?q=...&mode=ltp -------------------------> Batcher enqueue
               |                                                  (per-mode batch)
               |-- more requests within 1s --> join same batch ->  instruments: Set
                                                                     requests: []
After 1s or 1000 uniques -> Single Vortex call with union --------> vortexAPI.getQuotes()
                                                                    |
                                                                    v
Fan-out results back to each request -----------------------------> resolve per subset
```

## Integration
- `app/api/quotes/route.ts` uses `requestQuotesBatched()` instead of calling Vortex directly.
- Response shape:
  - Success:
    - `{ success: true, data: { [instrumentId]: Quote }, meta: { instrumentCount, mode, processingTime, timestamp } }`
  - Error:
    - `{ error, code, timestamp }` with appropriate HTTP status
  - Note: Upstream responses are normalized in `vortex-enhanced.getQuotes()` so `data` is always a flat mapping.

## Diagnostics & Control
- Admin endpoint: `GET /api/admin/quotes-batcher-status`
  - Returns active batches, `lastFlushMeta`, and current config
- Manual flush: `POST /api/admin/quotes-batcher-status` body `{ action: 'flush', mode: 'ltp' }`
- Update config: `POST /api/admin/quotes-batcher-status` body `{ action: 'setConfig', config: { ... } }`

### UI Integration
- Vortex Dashboard `(/admin/vortex-dashboard)` now has a "Quotes Batcher" tab to:
  - View active batches and last flush metadata
  - Adjust runtime configuration (window, unique cap, request timeout, micro-cache TTL, circuit breaker thresholds)
  - Trigger manual flush (for `ltp` mode)

## Env Vars
- `QUOTES_BATCH_WINDOW_MS` (default `1000`)
- `QUOTES_BATCH_MAX_UNION` (default `1000`)
- `QUOTES_BATCH_REQUEST_TIMEOUT_MS` (default `4000`)
- `QUOTES_BATCH_MICRO_CACHE_TTL_MS` (default `0`, disabled)
- `QUOTES_BATCH_CB_FAILURES` (default `5`)
- `QUOTES_BATCH_CB_HALF_OPEN_MS` (default `10000`)

### Config safety hardening (2026-02-16)
- Startup config now applies strict integer normalization + schema-safe bounds to all `QUOTES_BATCH_*` env vars.
- Malformed values (for example `1e3`, blank, non-numeric tokens) no longer produce `NaN` runtime config state.
- Out-of-range values are clamped to schema bounds before runtime initialization.

## Notes
- In-memory batching is per-runtime. For multi-instance deployments, consider a Redis-based aggregator if cross-instance coalescing is required.
- Upstream Vortex requests still pass through the existing `requestQueue` (via `vortex-enhanced.ts`), preserving global rate limits.

## File Map
- `lib/vortex/quotes-batcher.ts`: batching implementation
- `app/api/quotes/route.ts`: API integration
- `app/api/admin/quotes-batcher-status/route.ts`: diagnostics
