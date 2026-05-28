# MarketPulse360 API Scalability Plan

## Objectives
- Sustain 200+ concurrent users, 100+ RPS with <1% 5xx under normal conditions.
- p50 ≤ 300ms, p95 ≤ 800ms, p99 ≤ 1500ms for cached/batched responses.
- Graceful degradation via cache/SWR on upstream slowness.

## Assumptions
- Next.js 14 API routes, primary endpoint: `/api/quotes`.
- Upstream Vortex budget ≤ 1 request/second.
- In‑memory cache for local; Redis optional later.

## Scope & Constraints
- No secrets in code; env‑driven config only.
- Step‑load tests only; never direct upstream flood.
- Incremental, reversible behind feature flags.

## Phased Rollout
1. Observability foundation: Prometheus metrics, health/ready; structured logs.
2. Edge headers + ETag; per‑IP 1 rps at API edge.
3. Server cache TTL 2s + SWR + single‑flight; 1s batch window.
4. Upstream gate 1 RPS with queue + keep‑alive; short timeouts + 1 retry.
5. Dashboard load test (admin only) and monitoring views.

## Acceptance Criteria
- Metrics visible at `/api/metrics`; health/ready endpoints return 200.
- Per‑IP 1 rps enforced with 429 + Retry‑After.
- Batching flushes ~1s; upstream capped to 1 RPS.
- Cache headers: Cache-Control with SWR; stable ETag; 304 served.
- p50/p95/p99 within targets for cached paths under step loads.

## Rollback
- Disable via feature flags: `FEATURE_ENABLE_*` envs; no code revert needed.
