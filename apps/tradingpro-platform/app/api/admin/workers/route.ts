/**
 * @file route.ts
 * @module admin/workers
 * @description Admin API to view and manage background workers (enable/disable, run once, configure modes).
 * @author StockTrade
 * @created 2026-02-04
 */

export const runtime = "nodejs"

import os from "os"
import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import {
  getWorkersSnapshot,
  POSITION_PNL_MODE_KEY,
  WORKER_IDS,
  WORKER_TRADING_CATEGORY,
  setWorkerEnabled,
  updateWorkerHeartbeat,
} from "@/lib/server/workers/registry"
import { upsertGlobalSetting } from "@/lib/server/workers/system-settings"
import { orderExecutionWorker } from "@/lib/services/order/OrderExecutionWorker"
import { positionPnLWorker } from "@/lib/services/position/PositionPnLWorker"
import { RiskMonitoringService } from "@/lib/services/risk/RiskMonitoringService"
import { getRiskThresholds } from "@/lib/services/risk/risk-thresholds"
import { runRiskBackstop } from "@/lib/services/risk/risk-backstop-runner"
import { isRedisEnabled } from "@/lib/redis/redis-client"
import { releaseWorkerRunLock, tryAcquireWorkerRunLock, type WorkerRunLock } from "@/lib/server/workers/worker-run-lock"
import { parseFiniteWorkerNumber } from "@/lib/server/workers/worker-number-utils"

type WorkerAction = "toggle" | "set_mode" | "run_once"

function normalizeTokenCandidate(input: unknown): string | null {
  if (typeof input !== "string") {
    return null
  }
  const normalizedInput = input.trim().toLowerCase()
  if (!normalizedInput) {
    return null
  }
  const sanitizedToken = normalizedInput
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  return sanitizedToken || null
}

function normalizeAction(input: unknown): WorkerAction | null {
  const normalizedToken = normalizeTokenCandidate(input)
  if (!normalizedToken) {
    return null
  }
  if (normalizedToken === "toggle") {
    return "toggle"
  }
  if (normalizedToken === "set_mode" || normalizedToken === "setmode") {
    return "set_mode"
  }
  if (normalizedToken === "run_once" || normalizedToken === "runonce") {
    return "run_once"
  }
  return null
}

function normalizeWorkerId(input: unknown): "order_execution" | "position_pnl" | "risk_monitoring" | null {
  const normalizedToken = normalizeTokenCandidate(input)
  if (!normalizedToken) {
    return null
  }
  if (normalizedToken === "order_execution") {
    return "order_execution"
  }
  if (normalizedToken === "position_pnl") {
    return "position_pnl"
  }
  if (normalizedToken === "risk_monitoring") {
    return "risk_monitoring"
  }
  return null
}

function normalizePositionMode(input: unknown): "client" | "server" {
  if (typeof input !== "string") {
    return "client"
  }
  return input.trim().toLowerCase() === "server" ? "server" : "client"
}

function normalizeInteger(input: unknown, fallback: number): number {
  const parsedValue = parseFiniteWorkerNumber(input)
  return parsedValue === null ? fallback : Math.trunc(parsedValue)
}

function normalizeOrderRunLimit(input: unknown): number {
  return Math.max(1, Math.min(200, normalizeInteger(input, 25)))
}

function normalizeOrderRunMaxAgeMs(input: unknown): number {
  return Math.max(0, normalizeInteger(input, 0))
}

function normalizePositionRunLimit(input: unknown): number {
  return Math.max(1, Math.min(2000, normalizeInteger(input, 500)))
}

function normalizePositionUpdateThreshold(input: unknown): number {
  const parsedValue = parseFiniteWorkerNumber(input)
  if (parsedValue === null) {
    return 1
  }
  return Math.max(0, parsedValue)
}

function normalizeBooleanFlag(input: unknown): boolean {
  if (typeof input === "boolean") {
    return input
  }
  if (typeof input === "number") {
    return Number.isFinite(input) && input === 1
  }
  if (typeof input !== "string") {
    return false
  }
  const normalized = input.trim().toLowerCase()
  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on" ||
    normalized === "y" ||
    normalized === "t" ||
    normalized === "enabled"
  )
}

function normalizeBooleanSettingValue(input: unknown): boolean | null {
  if (typeof input === "boolean") {
    return input
  }
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      return null
    }
    if (input === 1) {
      return true
    }
    if (input === 0) {
      return false
    }
    return null
  }
  if (typeof input !== "string") {
    return null
  }
  const normalized = input.trim().toLowerCase()
  if (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on" ||
    normalized === "y" ||
    normalized === "t" ||
    normalized === "enabled"
  ) {
    return true
  }
  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "off" ||
    normalized === "n" ||
    normalized === "f" ||
    normalized === "disabled"
  ) {
    return false
  }
  return null
}

function normalizeNonNegativeCount(input: unknown): number {
  const parsedValue = parseFiniteWorkerNumber(input)
  if (parsedValue === null) {
    return 0
  }
  return Math.max(0, Math.trunc(parsedValue))
}

function normalizeWorkerLockTtlMs(input: unknown, fallback: number): number {
  const parsedValue = parseFiniteWorkerNumber(input)
  if (parsedValue === null) {
    return fallback
  }
  const normalized = Math.trunc(parsedValue)
  if (normalized < 10_000) {
    return 10_000
  }
  return Math.min(86_400_000, normalized)
}

function normalizeHeartbeatErrorMessage(input: unknown): string {
  if (typeof input !== "string") {
    return "unknown"
  }
  const normalized = input.trim().replace(/\s+/g, " ")
  if (!normalized) {
    return "unknown"
  }
  return normalized.slice(0, 256)
}

const PAYLOAD_WRAPPER_KEYS = ["payload", "data", "body", "request", "value"] as const
const RUN_ONCE_PARAM_HINT_KEYS = new Set(["limit", "maxAgeMs", "updateThreshold", "dryRun", "forceRun", "mode", "useBackstop"])

function parseRecordCandidate(input: unknown): Record<string, unknown> | null {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }
  if (typeof input !== "string") {
    return null
  }
  const trimmedInput = input.trim()
  if (!trimmedInput) {
    return null
  }
  try {
    const parsedInput = JSON.parse(trimmedInput)
    return parsedInput && typeof parsedInput === "object" && !Array.isArray(parsedInput)
      ? (parsedInput as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function resolveWorkersPostBody(input: unknown): Record<string, unknown> | null {
  let currentPayload = parseRecordCandidate(input)
  if (!currentPayload) {
    return null
  }

  for (let depth = 0; depth < 4; depth += 1) {
    if (currentPayload["action"] !== undefined || currentPayload["workerId"] !== undefined) {
      return currentPayload
    }
    let nextPayload: Record<string, unknown> | null = null
    for (const wrapperKey of PAYLOAD_WRAPPER_KEYS) {
      const wrapperCandidate = parseRecordCandidate(currentPayload[wrapperKey])
      if (wrapperCandidate) {
        nextPayload = wrapperCandidate
        break
      }
    }
    if (!nextPayload) {
      return currentPayload
    }
    currentPayload = nextPayload
  }

  return currentPayload
}

function resolveRunOnceParams(input: unknown): Record<string, unknown> {
  let currentParams = parseRecordCandidate(input)
  if (!currentParams) {
    return {}
  }

  for (let depth = 0; depth < 4; depth += 1) {
    const hasKnownParamKeys = Object.keys(currentParams).some((paramKey) => RUN_ONCE_PARAM_HINT_KEYS.has(paramKey))
    if (hasKnownParamKeys) {
      return currentParams
    }
    let nextParams: Record<string, unknown> | null = null
    for (const wrapperKey of PAYLOAD_WRAPPER_KEYS) {
      const wrapperCandidate = parseRecordCandidate(currentParams[wrapperKey])
      if (wrapperCandidate) {
        nextParams = wrapperCandidate
        break
      }
    }
    if (!nextParams) {
      return currentParams
    }
    currentParams = nextParams
  }

  return currentParams
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/workers",
      required: "admin.system.read",
      fallbackMessage: "Failed to fetch workers",
    },
    async (ctx) => {
      const workers = await getWorkersSnapshot()
      ctx.logger.info({ count: workers.length }, "GET /api/admin/workers - success")
      return NextResponse.json(
        {
          success: true,
          timestamp: new Date().toISOString(),
          workers,
        },
        { status: 200 },
      )
    },
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/workers",
      required: "admin.settings.manage",
      fallbackMessage: "Failed to manage workers",
    },
    async (ctx) => {
      const rawBody = await req.json().catch(() => null)
      const body = resolveWorkersPostBody(rawBody)
      if (!body) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid JSON body", statusCode: 400 })
      }

      const action = normalizeAction(body["action"])
      const workerId = normalizeWorkerId(body["workerId"])
      ctx.logger.debug({ action, workerId }, "POST /api/admin/workers - request")

      if (action === "toggle") {
        if (workerId !== "order_execution" && workerId !== "risk_monitoring") {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid workerId for toggle", statusCode: 400 })
        }
        const enabledValue = normalizeBooleanSettingValue(body["enabled"])
        if (enabledValue === null) {
          throw new AppError({ code: "VALIDATION_ERROR", message: "enabled must be boolean", statusCode: 400 })
        }

        await setWorkerEnabled(workerId, enabledValue)
        const workers = await getWorkersSnapshot()
        return NextResponse.json(
          {
            success: true,
            timestamp: new Date().toISOString(),
            action: "toggle",
            workerId,
            enabled: enabledValue,
            workers,
          },
          { status: 200 },
        )
      }

      if (action === "set_mode") {
        if (workerId !== "position_pnl") {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid workerId for set_mode", statusCode: 400 })
        }
        const mode = normalizePositionMode(body["mode"])

        await upsertGlobalSetting({
          key: POSITION_PNL_MODE_KEY,
          value: mode,
          category: WORKER_TRADING_CATEGORY,
          description: "Position PnL calculation mode: client (quotes-driven) or server (worker-driven)",
        })

        const workers = await getWorkersSnapshot()
        return NextResponse.json(
          {
            success: true,
            timestamp: new Date().toISOString(),
            action: "set_mode",
            workerId,
            mode,
            workers,
          },
          { status: 200 },
        )
      }

      if (action === "run_once") {
        if (workerId !== "order_execution" && workerId !== "position_pnl" && workerId !== "risk_monitoring") {
          throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid workerId for run_once", statusCode: 400 })
        }

        const params = resolveRunOnceParams(body["params"])
        const startedAt = Date.now()

        if (workerId === "order_execution") {
          const limit = normalizeOrderRunLimit(params["limit"])
          const maxAgeMs = normalizeOrderRunMaxAgeMs(params["maxAgeMs"])
          const result = await orderExecutionWorker.processPendingOrders({ limit, maxAgeMs })
          const workers = await getWorkersSnapshot()
          return NextResponse.json(
            {
              success: true,
              timestamp: new Date().toISOString(),
              action: "run_once",
              workerId,
              elapsedMs: Date.now() - startedAt,
              result,
              workers,
            },
            { status: 200 },
          )
        }

        if (workerId === "position_pnl") {
          const limit = normalizePositionRunLimit(params["limit"])
          const updateThreshold = normalizePositionUpdateThreshold(params["updateThreshold"])
          const dryRun = normalizeBooleanFlag(params["dryRun"])
          const result = await positionPnLWorker.processPositionPnL({ limit, updateThreshold, dryRun })
          const workers = await getWorkersSnapshot()
          return NextResponse.json(
            {
              success: true,
              timestamp: new Date().toISOString(),
              action: "run_once",
              workerId,
              elapsedMs: Date.now() - startedAt,
              result,
              workers,
            },
            { status: 200 },
          )
        }

        // risk_monitoring
        const riskRunLockTtlMs = normalizeWorkerLockTtlMs(
          process.env.ADMIN_RISK_MONITORING_LOCK_TTL_MS || process.env.RISK_MONITORING_LOCK_TTL_MS,
          180_000,
        )
        const runLock: WorkerRunLock = await tryAcquireWorkerRunLock({
          workerId: WORKER_IDS.RISK_MONITORING,
          ttlMs: riskRunLockTtlMs,
        })

        if (!runLock.acquired) {
          await updateWorkerHeartbeat(
            WORKER_IDS.RISK_MONITORING,
            JSON.stringify({
              lastRunAtIso: new Date().toISOString(),
              host: os.hostname(),
              pid: process.pid,
              redisEnabled: isRedisEnabled(),
              source: "admin_run_once",
              checkedAccounts: 0,
              positionsClosed: 0,
              alertsCreated: 0,
              errorCount: 0,
              elapsedMs: Date.now() - startedAt,
              reason: "locked",
            }),
          ).catch(() => {})
          const workers = await getWorkersSnapshot()
          return NextResponse.json(
            {
              success: true,
              skipped: true,
              reason: "locked",
              timestamp: new Date().toISOString(),
              action: "run_once",
              workerId,
              elapsedMs: Date.now() - startedAt,
              workers,
            },
            { status: 200 },
          )
        }

        try {
          const normalizedModeToken = normalizeTokenCandidate(params["mode"])
          const useBackstop = normalizeBooleanFlag(params["useBackstop"]) || normalizedModeToken === "backstop"

          if (useBackstop) {
            const forceRun = normalizeBooleanFlag(params["forceRun"])
            const parsedLimit = parseFiniteWorkerNumber(params["limit"])
            const limit = parsedLimit === null ? undefined : Math.max(1, Math.min(2000, Math.trunc(parsedLimit)))
            const result = await runRiskBackstop({ forceRun, limit })

            const workers = await getWorkersSnapshot()
            return NextResponse.json(
              {
                success: true,
                timestamp: new Date().toISOString(),
                action: "run_once",
                workerId,
                elapsedMs: Date.now() - startedAt,
                result,
                workers,
              },
              { status: 200 },
            )
          }

          const thresholdsConfig = await getRiskThresholds({ maxAgeMs: 0 })
          const service = new RiskMonitoringService()
          const monitoringResult = await service.monitorAllAccounts({
            warningThreshold: thresholdsConfig.warningThreshold,
            autoCloseThreshold: thresholdsConfig.autoCloseThreshold,
          })
          const normalizedResultSummary = {
            checkedAccounts: normalizeNonNegativeCount((monitoringResult as any)?.checkedAccounts),
            positionsClosed: normalizeNonNegativeCount((monitoringResult as any)?.positionsClosed),
            alertsCreated: normalizeNonNegativeCount((monitoringResult as any)?.alertsCreated),
            errors: normalizeNonNegativeCount((monitoringResult as any)?.errors),
          }

          await updateWorkerHeartbeat(
            WORKER_IDS.RISK_MONITORING,
            JSON.stringify({
              lastRunAtIso: new Date().toISOString(),
              host: os.hostname(),
              pid: process.pid,
              redisEnabled: isRedisEnabled(),
              source: "admin_run_once",
              checkedAccounts: normalizedResultSummary.checkedAccounts,
              positionsClosed: normalizedResultSummary.positionsClosed,
              alertsCreated: normalizedResultSummary.alertsCreated,
              errorCount: normalizedResultSummary.errors,
              elapsedMs: Date.now() - startedAt,
            }),
          )

          const workers = await getWorkersSnapshot()
          return NextResponse.json(
            {
              success: true,
              timestamp: new Date().toISOString(),
              action: "run_once",
              workerId,
              elapsedMs: Date.now() - startedAt,
              result: {
                checkedAccounts: normalizedResultSummary.checkedAccounts,
                positionsClosed: normalizedResultSummary.positionsClosed,
                alertsCreated: normalizedResultSummary.alertsCreated,
                errors: normalizedResultSummary.errors,
              },
              workers,
            },
            { status: 200 },
          )
        } catch (error: any) {
          const normalizedErrorMessage = normalizeHeartbeatErrorMessage(error?.message)
          await updateWorkerHeartbeat(
            WORKER_IDS.RISK_MONITORING,
            JSON.stringify({
              lastRunAtIso: new Date().toISOString(),
              host: os.hostname(),
              pid: process.pid,
              redisEnabled: isRedisEnabled(),
              source: "admin_run_once",
              checkedAccounts: 0,
              positionsClosed: 0,
              alertsCreated: 0,
              errorCount: 1,
              elapsedMs: Date.now() - startedAt,
              reason: "error",
              errorMessage: normalizedErrorMessage,
            }),
          ).catch(() => {})
          throw error
        } finally {
          await releaseWorkerRunLock(runLock).catch((lockError: any) => {
            ctx.logger.warn({ message: lockError?.message || String(lockError) }, "Failed to release admin risk lock")
          })
        }
      }

      throw new AppError({ code: "VALIDATION_ERROR", message: "Unsupported action", statusCode: 400 })
    },
  )
}

