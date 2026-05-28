/**
 * File: lib/services/risk/risk-backstop-runner.ts
 * Module: risk
 * Purpose: Backstop risk runner that triggers PositionPnLWorker only when its heartbeat is stale.
 * Author: StockTrade
 * Last-updated: 2026-02-13
 * Notes:
 * - Canonical risk enforcement is expected to happen continuously in PositionPnLWorker.
 * - This runner exists as a safety net for cron/admin “run now”.
 */

import os from "os"
import { baseLogger } from "@/lib/observability/logger"
import { getWorkersSnapshot, updateWorkerHeartbeat, WORKER_IDS } from "@/lib/server/workers/registry"
import { positionPnLWorker } from "@/lib/services/position/PositionPnLWorker"

export type RiskBackstopRunResult = {
  success: boolean
  skipped: boolean
  skippedReason?: string
  pnlWorkerHealth: string
  pnlWorkerLastRunAtIso: string | null
  elapsedMs: number
  result?: unknown
}

export async function runRiskBackstop(input?: {
  /**
   * If true, will run even when the positions worker is healthy.
   */
  forceRun?: boolean
  /**
   * Override worker scan limit.
   */
  limit?: number
}): Promise<RiskBackstopRunResult> {
  const startedAt = Date.now()
  const forceRun = input?.forceRun === true
  const limit = Number.isFinite(Number(input?.limit)) ? Math.trunc(Number(input?.limit)) : 2000

  const log = baseLogger.child({ module: "risk-backstop", host: os.hostname(), pid: process.pid })

  const workers = await getWorkersSnapshot()
  const pnl = workers.find((w) => w.id === "position_pnl") || null
  const pnlWorkerHealth = pnl?.health || "unknown"
  const pnlWorkerLastRunAtIso = pnl?.lastRunAtIso || null

  if (!forceRun && pnlWorkerHealth === "healthy") {
    const heartbeat = {
      lastRunAtIso: new Date().toISOString(),
      host: os.hostname(),
      pid: process.pid,
      source: "backstop",
      skipped: true,
      skippedReason: "positions_worker_healthy",
      pnlWorkerHealth,
      pnlWorkerLastRunAtIso,
      elapsedMs: Date.now() - startedAt,
    }
    await updateWorkerHeartbeat(WORKER_IDS.RISK_MONITORING, JSON.stringify(heartbeat)).catch(() => {})

    log.info({ pnlWorkerHealth, pnlWorkerLastRunAtIso }, "skipped (positions worker healthy)")
    return {
      success: true,
      skipped: true,
      skippedReason: "positions_worker_healthy",
      pnlWorkerHealth,
      pnlWorkerLastRunAtIso,
      elapsedMs: Date.now() - startedAt,
      result: { heartbeat },
    }
  }

  // Run the positions worker in a more aggressive “backstop” mode.
  const result = await positionPnLWorker.processPositionPnL({
    limit,
    updateThreshold: 1,
    dryRun: false,
    forceRun: true,
    sltpMaxAutoClosesPerTick: 500,
    riskMaxAutoClosesPerAccount: 5,
    riskMaxReductionRoundsPerTick: 35,
    riskAlertCooldownMs: 0, // backstop should surface alerts immediately when invoked
  })

  const heartbeat = {
    lastRunAtIso: new Date().toISOString(),
    host: os.hostname(),
    pid: process.pid,
    source: "backstop",
    skipped: false,
    pnlWorkerHealth,
    pnlWorkerLastRunAtIso,
    elapsedMs: Date.now() - startedAt,
    // Bubble up the positions worker heartbeat for operator visibility.
    positionWorkerHeartbeat: (result as any)?.heartbeat || null,
    success: Boolean((result as any)?.success),
  }
  await updateWorkerHeartbeat(WORKER_IDS.RISK_MONITORING, JSON.stringify(heartbeat)).catch(() => {})

  log.info(
    {
      pnlWorkerHealth,
      pnlWorkerLastRunAtIso,
      limit,
      success: Boolean((result as any)?.success),
    },
    "ran backstop",
  )

  return {
    success: Boolean((result as any)?.success),
    skipped: false,
    pnlWorkerHealth,
    pnlWorkerLastRunAtIso,
    elapsedMs: Date.now() - startedAt,
    result,
  }
}

