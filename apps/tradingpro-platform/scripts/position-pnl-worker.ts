/**
 * @file position-pnl-worker.ts
 * @module scripts
 * @description Long-running positions PnL worker for EC2/Docker/ECS.
 * Run with: `pnpm tsx scripts/position-pnl-worker.ts`.
 * @author StockTrade
 * @created 2026-02-04
 */

import { positionPnLWorker } from "../lib/services/position/PositionPnLWorker"
import { runScheduledCleanupTick } from "../lib/server/workers/cleanup-auto-runner"
import { normalizeScriptFloatEnv, normalizeScriptIntEnv } from "./worker-script-env"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const intervalMs = normalizeScriptIntEnv(process.env.POSITION_PNL_WORKER_INTERVAL_MS, 3000, { min: 50 })
  const limit = normalizeScriptIntEnv(process.env.POSITION_PNL_WORKER_BATCH_LIMIT, 500, { min: 1, max: 2000 })
  const updateThreshold = normalizeScriptFloatEnv(process.env.POSITION_PNL_UPDATE_THRESHOLD, 1, { min: 0 })

  console.log("🧮 [POSITION-PNL-WORKER-SCRIPT] Starting worker loop", { intervalMs, limit, updateThreshold })

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await positionPnLWorker.processPositionPnL({ limit, updateThreshold })
      await runScheduledCleanupTick({ source: "position_pnl_worker_script" }).catch((cleanupError: any) => {
        console.warn("⚠️ [POSITION-PNL-WORKER-SCRIPT] Auto cleanup tick failed", {
          message: cleanupError?.message || String(cleanupError),
        })
      })
    } catch (e: any) {
      console.error("❌ [POSITION-PNL-WORKER-SCRIPT] Worker loop error", {
        message: e?.message || String(e)
      })
    }
    await sleep(intervalMs)
  }
}

main().catch((e) => {
  console.error("❌ [POSITION-PNL-WORKER-SCRIPT] Fatal error", e)
  process.exitCode = 1
})

