/**
 * @file house-exposure-worker.ts
 * @module scripts
 * @description Long-running house book aggregator. Recomputes the broker counterparty
 *              snapshot every N ms (default 1000) and:
 *                - writes it to Redis under the cache key consumed by /api/admin/house/exposure
 *                - publishes it on the house pub/sub channel for SSE consumers (Phase 8.5+)
 *
 *              Run with: `pnpm tsx scripts/house-exposure-worker.ts`.
 *
 *              Env knobs:
 *                HOUSE_EXPOSURE_WORKER_INTERVAL_MS  default 1000, min 250
 *                HOUSE_EXPOSURE_WORKER_TOP_SYMBOLS  default 10, min 5, max 50
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import {
  HOUSE_EXPOSURE_CACHE_KEY,
  HOUSE_EXPOSURE_CHANNEL,
  aggregateHouseExposure,
} from "../lib/house/exposure-aggregator"
import { isRedisEnabled, redisPublish, redisSet } from "../lib/redis/redis-client"
import { normalizeScriptIntEnv } from "./worker-script-env"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const intervalMs = normalizeScriptIntEnv(
    process.env.HOUSE_EXPOSURE_WORKER_INTERVAL_MS,
    1000,
    { min: 250 },
  )
  const topSymbolsCount = normalizeScriptIntEnv(
    process.env.HOUSE_EXPOSURE_WORKER_TOP_SYMBOLS,
    10,
    { min: 5, max: 50 },
  )

  if (!isRedisEnabled()) {
    console.warn(
      "⚠️ [HOUSE-EXPOSURE-WORKER] Redis disabled — exposure snapshot will not be cached or published. " +
        "API requests will fall back to live aggregation.",
    )
  }

  console.log("🏦 [HOUSE-EXPOSURE-WORKER] Starting worker loop", { intervalMs, topSymbolsCount })

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const tickStart = Date.now()
    try {
      const snapshot = await aggregateHouseExposure({ topSymbolsCount })
      const payload = JSON.stringify(snapshot)
      // 2s TTL — survives a missed tick without serving stale data on multi-second outages.
      await redisSet(HOUSE_EXPOSURE_CACHE_KEY, payload, 2)
      await redisPublish(HOUSE_EXPOSURE_CHANNEL, payload)
    } catch (e: any) {
      console.error("❌ [HOUSE-EXPOSURE-WORKER] Tick error", {
        message: e?.message || String(e),
      })
    }
    const elapsed = Date.now() - tickStart
    const wait = Math.max(0, intervalMs - elapsed)
    if (wait > 0) await sleep(wait)
  }
}

main().catch((e) => {
  console.error("❌ [HOUSE-EXPOSURE-WORKER] Fatal error", e)
  process.exitCode = 1
})
