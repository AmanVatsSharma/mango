/**
 * @file order-worker.ts
 * @module scripts
 * @description Long-running order execution worker for EC2/Docker/ECS.
 * Run with: `pnpm tsx scripts/order-worker.ts` (or `npm run` equivalent).
 * @author StockTrade
 * @created 2026-02-03
 */

import { orderExecutionWorker } from "../lib/services/order/OrderExecutionWorker"
import { runScheduledCleanupTick } from "../lib/server/workers/cleanup-auto-runner"
import { normalizeScriptIntEnv } from "./worker-script-env"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const intervalMs = normalizeScriptIntEnv(process.env.ORDER_WORKER_INTERVAL_MS, 750, { min: 50 })
  const limit = normalizeScriptIntEnv(process.env.ORDER_WORKER_BATCH_LIMIT, 50, { min: 1, max: 200 })
  const maxAgeMs = normalizeScriptIntEnv(process.env.ORDER_WORKER_MAX_AGE_MS, 0, { min: 0 })

  console.log("🧵 [ORDER-WORKER-SCRIPT] Starting worker loop", { intervalMs, limit, maxAgeMs })

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await orderExecutionWorker.processPendingOrders({ limit, maxAgeMs })
      await runScheduledCleanupTick({ source: "order_worker_script" }).catch((cleanupError: any) => {
        console.warn("⚠️ [ORDER-WORKER-SCRIPT] Auto cleanup tick failed", {
          message: cleanupError?.message || String(cleanupError),
        })
      })
    } catch (e: any) {
      console.error("❌ [ORDER-WORKER-SCRIPT] Worker loop error", {
        message: e?.message || String(e)
      })
    }
    await sleep(intervalMs)
  }
}

main().catch((e) => {
  console.error("❌ [ORDER-WORKER-SCRIPT] Fatal error", e)
  process.exitCode = 1
})

