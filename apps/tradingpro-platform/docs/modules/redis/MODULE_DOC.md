# Module: redis

**Short:** Server-only Redis utilities for cache + Pub/Sub.

**Purpose:** Provide cross-process realtime delivery and lightweight caching (PnL overlay) when the platform runs multiple Node processes (app + workers) on EC2.

## Key files

- `lib/redis/redis-client.ts` — `publish/subscribe/get/set/mget`, disabled when `REDIS_URL` is missing\n- `lib/services/realtime/redis-realtime-bus.ts` — per-user channel envelope\n
## Env vars

- `REDIS_URL` (e.g. `redis://127.0.0.1:6379`)

## Change-log

- 2026-02-13: Added Redis utilities to support realtime bus + PnL cache overlay.
- 2026-02-13: Removed `server-only` marker imports so `tsx` workers can import Redis utilities without runtime throws.

