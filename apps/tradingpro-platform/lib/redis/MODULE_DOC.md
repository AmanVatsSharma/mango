<!--
MODULE_DOC.md
Module: lib/redis
Purpose: Server-only Redis wrapper for cache + Pub/Sub with graceful disable when REDIS_URL is missing.
Last-updated: 2026-02-13
-->

## Overview

This module provides a small Redis wrapper used by:

- Realtime cross-process bus (`lib/services/realtime/redis-realtime-bus.ts`)
- Position PnL cache overlay (`app/api/trading/positions/list/route.ts`)

## Design goals

- **Server-only** import surface (safe for Next.js app router)\n- **Graceful disable** when `REDIS_URL` is not set (no crashes; system falls back to DB + polling)\n- Separate Pub/Sub connection under the hood\n
## Env vars

- `REDIS_URL` (e.g. `redis://127.0.0.1:6379`)

## Changelog

- **2026-03-28**: Added `session-jti-cache.ts` (optional jti cache; parity with TradeBazaar).
- **2026-02-13**: Added Redis client wrapper (publish/subscribe/get/set/mget).
- **2026-02-13**: Removed `server-only` marker imports so `tsx` workers can import Redis utilities without runtime throws.

