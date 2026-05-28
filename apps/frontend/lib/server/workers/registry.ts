/**
 * @file registry.ts
 * @module workers
 * @description Central registry for background workers (status, enable flags, heartbeats) used by Admin Console.
 * @author StockTrade
 * @created 2026-02-04
 *
 * Notes:
 * - Treats SystemSettings(ownerId=null) keys as non-unique; picks latest active row by updatedAt.
 * - Enable/disable here is a soft-toggle; OS process control is out-of-scope.
 */

import { getLatestActiveGlobalSettings, parseBooleanSetting, upsertGlobalSetting } from "@/lib/server/workers/system-settings"
import { parseFiniteWorkerNumber } from "@/lib/server/workers/worker-number-utils"
import type { WorkerHealth, WorkerHeartbeat, WorkerId, WorkerSnapshot } from "@/lib/server/workers/types"
import { isRedisEnabled } from "@/lib/redis/redis-client"
import { resolveMarketDisplayQuoteFreshness } from "@/lib/server/market-display-pnl-meta"

export const WORKER_SETTINGS_CATEGORY = "SYSTEM" as const
export const WORKER_TRADING_CATEGORY = "TRADING" as const

export const ORDER_WORKER_ENABLED_KEY = "worker_order_execution_enabled" as const
export const ORDER_WORKER_HEARTBEAT_KEY = "order_worker_heartbeat" as const

export const POSITION_PNL_MODE_KEY = "position_pnl_mode" as const
export const POSITION_PNL_HEARTBEAT_KEY = "positions_pnl_worker_heartbeat" as const

export const RISK_MONITORING_ENABLED_KEY = "worker_risk_monitoring_enabled" as const
export const RISK_MONITORING_HEARTBEAT_KEY = "risk_monitoring_heartbeat" as const

export const WORKER_IDS = {
  ORDER_EXECUTION: "order_execution",
  POSITION_PNL: "position_pnl",
  RISK_MONITORING: "risk_monitoring",
} as const

export type PositionPnLMode = "client" | "server"

export function parsePositionPnLMode(value: string | null | undefined): PositionPnLMode {
  const normalizedValue = typeof value === "string" ? value.trim().toLowerCase() : ""
  return normalizedValue === "server" ? "server" : "client"
}

function envNumber(key: string, fallback: number): number {
  const parsedValue = parseFiniteWorkerNumber(process.env[key])
  return parsedValue === null ? fallback : parsedValue
}

function normalizeWorkerHealthTtlMs(value: unknown, fallback: number): number {
  const parsedValue = parseFiniteWorkerNumber(value)
  if (parsedValue === null) {
    return fallback
  }
  const normalizedTtlMs = Math.trunc(parsedValue)
  if (normalizedTtlMs < 1_000) {
    return 1_000
  }
  return Math.min(86_400_000, normalizedTtlMs)
}

function resolveIsoTimestampFromEpochMs(epochMs: number): string | null {
  const normalizedEpochMs = Math.trunc(epochMs)
  const dateCandidate = new Date(normalizedEpochMs)
  const resolvedEpochMs = dateCandidate.getTime()
  if (!Number.isFinite(resolvedEpochMs) || resolvedEpochMs <= 0) {
    return null
  }
  try {
    return dateCandidate.toISOString()
  } catch {
    return null
  }
}

function resolveHeartbeatIsoTimestamp(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (value instanceof Date) {
    const timestamp = value.getTime()
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return null
    }
    return new Date(timestamp).toISOString()
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return null
    }
    return resolveIsoTimestampFromEpochMs(value)
  }

  if (typeof value !== "string") {
    return null
  }

  const trimmedValue = value.trim()
  if (trimmedValue.length === 0) {
    return null
  }

  const asNumericTimestamp = Number(trimmedValue)
  if (Number.isFinite(asNumericTimestamp) && asNumericTimestamp > 0) {
    return resolveIsoTimestampFromEpochMs(asNumericTimestamp)
  }

  const parsedTimestamp = Date.parse(trimmedValue)
  if (!Number.isFinite(parsedTimestamp) || parsedTimestamp <= 0) {
    return null
  }
  return resolveIsoTimestampFromEpochMs(parsedTimestamp)
}

function resolveHeartbeatTimestampCandidate(payload: Record<string, unknown>): unknown {
  const timestampKeys = ["lastRunAtIso", "lastRunAt", "last_run_at", "timestamp", "ts"] as const
  for (const key of timestampKeys) {
    if (payload[key] !== undefined && payload[key] !== null) {
      return payload[key]
    }
  }
  return null
}

function parseHeartbeat(value: string | null | undefined): WorkerHeartbeat | null {
  if (!value) return null
  // Backward-compatible: accept either JSON heartbeat {lastRunAtIso,...} OR plain ISO string.
  try {
    const parsed = JSON.parse(value)
    if (parsed && typeof parsed === "object") {
      const parsedHeartbeat = parsed as Record<string, unknown>
      const directTimestampCandidate = resolveHeartbeatTimestampCandidate(parsedHeartbeat)
      const nestedHeartbeatPayload = parsedHeartbeat.heartbeat
      const nestedTimestampCandidate =
        nestedHeartbeatPayload && typeof nestedHeartbeatPayload === "object" && !Array.isArray(nestedHeartbeatPayload)
          ? resolveHeartbeatTimestampCandidate(nestedHeartbeatPayload as Record<string, unknown>)
          : null
      const lastRunAtIso = resolveHeartbeatIsoTimestamp(directTimestampCandidate ?? nestedTimestampCandidate)
      if (lastRunAtIso) {
        return {
          ...(parsed as WorkerHeartbeat),
          lastRunAtIso,
        }
      }
    }
  } catch {
    // ignore
  }

  const resolvedIso = resolveHeartbeatIsoTimestamp(value)
  if (resolvedIso) {
    return { lastRunAtIso: resolvedIso }
  }

  return null
}

function computeHealth(input: { enabled: boolean; lastRunAtIso: string | null; ttlMs: number }): WorkerHealth {
  if (!input.enabled) return "disabled"
  if (!input.lastRunAtIso) return "unknown"
  const t = Date.parse(input.lastRunAtIso)
  if (!Number.isFinite(t) || t <= 0) return "unknown"
  return Date.now() - t < input.ttlMs ? "healthy" : "stale"
}

export type WorkersSnapshotOptions = {
  orderTtlMs?: number
  positionPnlTtlMs?: number
  riskTtlMs?: number
}

export async function getWorkersSnapshot(options: WorkersSnapshotOptions = {}): Promise<WorkerSnapshot[]> {
  const orderTtlMs = normalizeWorkerHealthTtlMs(options.orderTtlMs, 2 * 60 * 1000)
  const positionTtlMs = normalizeWorkerHealthTtlMs(options.positionPnlTtlMs, 2 * 60 * 1000)
  const riskTtlMs = normalizeWorkerHealthTtlMs(options.riskTtlMs, 10 * 60 * 1000)
  const redisEnabled = isRedisEnabled()
  const positionsPnlRedisTtlSeconds = Math.max(5, Math.floor(envNumber("REDIS_POSITIONS_PNL_TTL_SECONDS", 120)))
  const quoteFresh = await resolveMarketDisplayQuoteFreshness()
  const positionsPnlRedisMaxAgeMs = quoteFresh.pnlServerMaxAgeMs

  const keys = [
    ORDER_WORKER_ENABLED_KEY,
    ORDER_WORKER_HEARTBEAT_KEY,
    POSITION_PNL_MODE_KEY,
    POSITION_PNL_HEARTBEAT_KEY,
    RISK_MONITORING_ENABLED_KEY,
    RISK_MONITORING_HEARTBEAT_KEY,
  ]

  let rows = new Map<string, { value: string }>()
  try {
    rows = await getLatestActiveGlobalSettings(keys)
  } catch {
    rows = new Map<string, { value: string }>()
  }
  const get = (k: string) => rows.get(k)?.value ?? null

  // Order execution worker
  const orderEnabled = parseBooleanSetting(get(ORDER_WORKER_ENABLED_KEY))
  const orderEnabledResolved = orderEnabled ?? true
  const orderHeartbeat = parseHeartbeat(get(ORDER_WORKER_HEARTBEAT_KEY))
  const orderLast = orderHeartbeat?.lastRunAtIso ?? null

  const orderWorker: WorkerSnapshot = {
    id: "order_execution",
    label: "Order Execution Worker",
    description: "Executes PENDING orders asynchronously and updates positions/account.",
    enabled: orderEnabledResolved,
    enabledSource: orderEnabled == null ? "default_enabled" : "setting",
    healthTtlMs: orderTtlMs,
    lastRunAtIso: orderLast,
    heartbeat: orderHeartbeat,
    health: computeHealth({ enabled: orderEnabledResolved, lastRunAtIso: orderLast, ttlMs: orderTtlMs }),
    config: {
      batchLimitDefault: 50,
      cronLimitDefault: 25,
      cronEndpoint: "/api/cron/order-worker",
      redisEnabled,
      realtimeBus: redisEnabled ? "redis_pubsub" : "in_memory_only",
    },
    ec2Command: "ORDER_WORKER_INTERVAL_MS=750 ORDER_WORKER_BATCH_LIMIT=50 pnpm tsx scripts/order-worker.ts",
    cronEndpoint: "/api/cron/order-worker",
  }

  // Position PnL worker (enabled derived from mode=server)
  const pnlMode = parsePositionPnLMode(get(POSITION_PNL_MODE_KEY))
  const pnlEnabled = pnlMode === "server"
  const pnlHeartbeat = parseHeartbeat(get(POSITION_PNL_HEARTBEAT_KEY))
  const pnlLast = pnlHeartbeat?.lastRunAtIso ?? null

  const positionPnLWorker: WorkerSnapshot = {
    id: "position_pnl",
    label: "Positions PnL Worker",
    description: "Computes and persists server-side Position unrealized/day PnL in DB (optional).",
    enabled: pnlEnabled,
    enabledSource: "derived_from_mode",
    healthTtlMs: positionTtlMs,
    lastRunAtIso: pnlLast,
    heartbeat: pnlHeartbeat,
    health: computeHealth({ enabled: pnlEnabled, lastRunAtIso: pnlLast, ttlMs: positionTtlMs }),
    config: {
      mode: pnlMode,
      updateThresholdDefault: 1,
      cronEndpoint: "/api/cron/position-pnl-worker",
      redisEnabled,
      realtimeBus: redisEnabled ? "redis_pubsub" : "in_memory_only",
      redisPnlCacheKeyPrefix: "positions:pnl:",
      redisPnlCacheTtlSeconds: positionsPnlRedisTtlSeconds,
      redisPnlMaxAgeMs: positionsPnlRedisMaxAgeMs,
      pnlRealtimeEvent: "positions_pnl_updated",
    },
    ec2Command:
      "POSITION_PNL_WORKER_INTERVAL_MS=3000 POSITION_PNL_WORKER_BATCH_LIMIT=500 POSITION_PNL_UPDATE_THRESHOLD=1 pnpm tsx scripts/position-pnl-worker.ts",
    cronEndpoint: "/api/cron/position-pnl-worker",
  }

  // Risk monitoring
  const riskEnabled = parseBooleanSetting(get(RISK_MONITORING_ENABLED_KEY))
  const riskEnabledResolved = riskEnabled ?? true
  const riskHeartbeat = parseHeartbeat(get(RISK_MONITORING_HEARTBEAT_KEY))
  const riskLast = riskHeartbeat?.lastRunAtIso ?? null

  const riskWorker: WorkerSnapshot = {
    id: "risk_monitoring",
    label: "Risk Monitoring",
    description: "Runs platform risk monitoring and can trigger protective actions (alerts/auto-close).",
    enabled: riskEnabledResolved,
    enabledSource: riskEnabled == null ? "default_enabled" : "setting",
    healthTtlMs: riskTtlMs,
    lastRunAtIso: riskLast,
    heartbeat: riskHeartbeat,
    health: computeHealth({ enabled: riskEnabledResolved, lastRunAtIso: riskLast, ttlMs: riskTtlMs }),
    config: {
      cronEndpoint: "/api/cron/risk-monitoring",
      recommendedIntervalSeconds: 60,
      redisEnabled,
      realtimeBus: redisEnabled ? "redis_pubsub" : "in_memory_only",
    },
    cronEndpoint: "/api/cron/risk-monitoring",
  }

  return [orderWorker, positionPnLWorker, riskWorker]
}

export function isKnownWorkerId(id: string): id is WorkerId {
  return id === "order_execution" || id === "position_pnl" || id === "risk_monitoring"
}

function heartbeatKeyFor(workerId: WorkerId): string {
  if (workerId === WORKER_IDS.ORDER_EXECUTION) return ORDER_WORKER_HEARTBEAT_KEY
  if (workerId === WORKER_IDS.POSITION_PNL) return POSITION_PNL_HEARTBEAT_KEY
  if (workerId === WORKER_IDS.RISK_MONITORING) return RISK_MONITORING_HEARTBEAT_KEY
  throw new Error(`Unknown workerId for heartbeat key resolution: ${String(workerId)}`)
}

function heartbeatCategoryFor(workerId: WorkerId): string {
  if (workerId === WORKER_IDS.RISK_MONITORING) return "RISK"
  if (workerId === WORKER_IDS.ORDER_EXECUTION || workerId === WORKER_IDS.POSITION_PNL) return WORKER_TRADING_CATEGORY
  throw new Error(`Unknown workerId for heartbeat category resolution: ${String(workerId)}`)
}

function heartbeatDescriptionFor(workerId: WorkerId): string {
  if (workerId === WORKER_IDS.ORDER_EXECUTION) return "Heartbeat for Order Execution Worker (cron/EC2)."
  if (workerId === WORKER_IDS.POSITION_PNL) return "Heartbeat for Positions PnL Worker (cron/EC2)."
  if (workerId === WORKER_IDS.RISK_MONITORING) return "Heartbeat for Risk Monitoring (cron)."
  throw new Error(`Unknown workerId for heartbeat description resolution: ${String(workerId)}`)
}

export async function updateWorkerHeartbeat(workerId: WorkerId, heartbeatJson?: string): Promise<void> {
  if (!isKnownWorkerId(workerId)) {
    throw new Error(`Unknown workerId: ${String(workerId)}`)
  }
  const normalizedHeartbeatJson = typeof heartbeatJson === "string" ? heartbeatJson.trim() : ""
  const value =
    normalizedHeartbeatJson.length > 0 && parseHeartbeat(normalizedHeartbeatJson)
      ? normalizedHeartbeatJson
      : JSON.stringify({ lastRunAtIso: new Date().toISOString() })
  await upsertGlobalSetting({
    key: heartbeatKeyFor(workerId),
    value,
    category: heartbeatCategoryFor(workerId),
    description: heartbeatDescriptionFor(workerId),
  })
}

export async function setWorkerEnabled(workerId: WorkerId, enabled: boolean): Promise<void> {
  if (!isKnownWorkerId(workerId)) {
    throw new Error(`Unknown workerId: ${String(workerId)}`)
  }
  if (workerId === WORKER_IDS.POSITION_PNL) {
    throw new Error("Position PnL worker enabled flag is derived from position_pnl_mode (use set_mode).")
  }
  const key = workerId === WORKER_IDS.ORDER_EXECUTION ? ORDER_WORKER_ENABLED_KEY : RISK_MONITORING_ENABLED_KEY
  await upsertGlobalSetting({
    key,
    value: String(enabled),
    category: WORKER_SETTINGS_CATEGORY,
    description: `Enable/disable ${workerId} worker`,
  })
}

