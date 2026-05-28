---
name: Redis realtime bus + positions cache
overview: Add Redis Pub/Sub as a cross-process realtime bus (workers ↔ app) while keeping SSE to the browser, and add Redis-backed positions/PnL caching so /dashboard can stay smooth without frequent refetches. Fallback remains DB + low-frequency safety polling when Redis is unavailable.
todos:
  - id: add-redis-clients
    content: Add server-only Redis client wrapper (pub/sub + get) and env contract (REDIS_URL).
    status: completed
  - id: redis-realtime-bus
    content: Implement RedisRealtimeBus with per-user channels and sourceInstanceId envelope.
    status: completed
  - id: emitter-redis-integration
    content: Integrate Redis bus into RealtimeEventEmitter (publish + subscribe per user, ignore self).
    status: completed
  - id: pnl-cache-worker
    content: Update PositionPnLWorker to write PnL into Redis cache each tick and emit PnL updates even when DB update is skipped.
    status: completed
  - id: ui-no-refetch
    content: Update SSE types + use-realtime-positions to patch PnL updates without scheduleRevalidate, keep safety-net revalidate/polling.
    status: completed
  - id: positions-api-overlay
    content: Overlay Redis PnL into /api/trading/positions/list with DB fallback when Redis unavailable.
    status: completed
  - id: tests-docs
    content: Add unit tests and update MODULE_DOC.md + docs/modules changelog entries for Redis realtime architecture.
    status: in_progress
isProject: false
---

## Goal

- Make **server-side position updates** (incl. PnL worker ticks) reach `/dashboard` reliably even when workers run as separate processes on EC2.
- Keep the browser transport as **SSE** (`/api/realtime/stream`).
- Use **Redis (localhost on EC2 via env)** as:
  - **Pub/Sub bus** for realtime events across processes.
  - **Cache** for positions/PnL so UI doesn’t need to refetch on every tick.
- Preserve a safe fallback: if Redis is down/unset → current DB behavior + adaptive polling stays.

## Why (current reality)

- Prisma middleware emits events into an **in-memory** `RealtimeEventEmitter`:
  - `lib/prisma-middleware.ts` → `getRealtimeEventEmitter().emit(...)`
- On EC2, workers are separate Node processes → in-memory emitter is **not shared**, so worker-originated events won’t reach the app’s SSE connections.
- `useRealtimePositions` currently patches cache then **revalidates(fetches)** on every `position_updated`, which becomes expensive when PnL updates are frequent.

## Design

### A) Redis clients (server-only)

- Add a small Redis wrapper (server-only) that exposes:
  - `publish(channel, payload)`
  - `subscribe(channel, handler)` with ref-counting
  - health probes + graceful disable when `REDIS_URL` is missing
- Env:
  - `REDIS_URL` (e.g. `redis://127.0.0.1:6379`)
  - optional `REDIS_REALTIME_ENABLED=true` (or enable if `REDIS_URL` exists)

### B) Cross-process realtime bus (Pub/Sub)

- Implement a **RedisRealtimeBus** that publishes SSE messages to `realtime:user:<userId>`.
- Add message envelope fields:
  - `sourceInstanceId` (random UUID per process) to prevent echo loops
  - `payload` (the existing `SSEMessage` shape)

### C) Integrate bus into `RealtimeEventEmitter`

- Update `lib/services/realtime/RealtimeEventEmitter.ts`:
  - `emit()` delivers locally **and** publishes to Redis (when enabled)
  - `subscribe()` ensures a Redis subscription exists for that userId; forwards Redis messages to local controllers
  - ignore Redis messages with `sourceInstanceId === self`
  - when last local controller for a user disconnects → unsubscribe from that user’s Redis channel

### D) Redis cache for positions/PnL

- Add Redis keys:
  - `positions:pnl:<positionId>` (hash or JSON): `{ unrealizedPnL, dayPnL, updatedAtMs }`
  - optional per-account snapshot later (phase 2), but start with per-position cache to keep it simple and incremental
- Update `lib/services/position/PositionPnLWorker.ts`:
  - On each scan, compute PnL.
  - Write latest PnL into Redis cache even if DB update is skipped.
  - Publish realtime updates via the bus (either:
    - **new event** `positions_pnl_updated` (batched per user), or
    - enrich existing `position_updated` payloads with `unrealizedPnL/dayPnL` and add batching)

### E) UI: stop “refetch on every tick”

- Update `lib/hooks/use-shared-sse.ts` union to include the new event (if we add one).
- Update `lib/hooks/use-realtime-positions.ts`:
  - On PnL-only updates: patch SWR cache with `unrealizedPnL/dayPnL` and **do not** call `scheduleRevalidate()`.
  - Keep `scheduleRevalidate()` for lifecycle events (`position_opened/closed`) and still keep a low-frequency safety net poll.

### F) API overlay (Redis first, DB fallback)

- Update `[app/api/trading/positions/list/route.ts](app/api/trading/positions/list/route.ts)`:
  - fetch positions from DB as today
  - overlay `unrealizedPnL/dayPnL` from Redis cache when present+fresh
  - if Redis unavailable → return DB values

## Files most likely to change/add

- Add:
  - `lib/redis/redis-client.ts` (server-only)
  - `lib/services/realtime/redis-realtime-bus.ts`
- Update:
  - `lib/services/realtime/RealtimeEventEmitter.ts`
  - `lib/services/position/PositionPnLWorker.ts`
  - `app/api/trading/positions/list/route.ts`
  - `lib/hooks/use-shared-sse.ts`
  - `lib/hooks/use-realtime-positions.ts`
  - `lib/prisma-middleware.ts` (optional: include `unrealizedPnL/dayPnL` in payloads; and/or skip emitting PnL-only DB updates to avoid duplicates)

## Test plan

- Unit tests:
  - Redis bus publish/subscribe ignores self-echo and forwards to local subscribers.
  - PositionPnLWorker writes Redis PnL cache and emits batched updates.
  - Positions list API overlays Redis values when present and falls back to DB when Redis missing.
- Manual:
  - Run app + worker in separate processes; verify `/dashboard` PnL updates without rapid refetch; SSE stays connected.

## Notes

- This keeps SSE for browser simplicity.
- Redis is the shared glue between the **separate processes** on EC2, and also enables “no-refetch PnL ticks”.

