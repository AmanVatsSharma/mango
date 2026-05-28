/**
 * @file types.ts
 * @module workers
 * @description Shared worker types for Admin Console worker management (status, heartbeat, actions).
 * @author StockTrade
 * @created 2026-02-04
 */

export const WORKER_ID_LIST = ["order_execution", "position_pnl", "risk_monitoring"] as const
export type WorkerId = (typeof WORKER_ID_LIST)[number]

export type WorkerHealth = "healthy" | "stale" | "unknown" | "disabled"

export type WorkerHeartbeat = {
  lastRunAtIso: string
  [k: string]: unknown
}

export type WorkerSnapshot = {
  id: WorkerId
  label: string
  description: string

  enabled: boolean
  enabledSource: "setting" | "default_enabled" | "derived_from_mode" | "default_disabled"

  healthTtlMs: number
  health: WorkerHealth
  lastRunAtIso: string | null
  heartbeat: WorkerHeartbeat | null

  // Worker-specific config surfaced to UI (safe, non-secret)
  config: Record<string, unknown>

  // Operational hints
  ec2Command?: string
  cronEndpoint?: string
}

export type WorkersApiGetResponse = {
  success: true
  timestamp: string
  workers: WorkerSnapshot[]
}

export type WorkersApiPostAction = "toggle" | "run_once" | "set_mode"

