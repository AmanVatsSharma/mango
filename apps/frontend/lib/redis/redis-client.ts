/**
 * File:        apps/frontend/lib/redis/redis-client.ts
 * Module:      Redis client stub
 * Purpose:     Stub for Redis client — UI-only frontend doesn't run background workers.
 *              The market data and realtime hooks use Socket.io, not direct Redis.
 *
 * Author:      Mango Nx Workspace
 * Last-updated: 2026-05-18
 */

// Redis not available in the frontend — market data flows via Socket.io
export const redisClient = null as unknown
