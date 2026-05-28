/**
 * @file route.ts
 * @module cron
 * @description Cron endpoint for automated risk monitoring
 * Can be called by Vercel Cron, external cron services, or scheduled tasks
 * Protected by CRON_SECRET environment variable
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-04-01
 */

export const runtime = "nodejs"

import os from "os"
import { NextResponse } from "next/server"
import { runRiskBackstop } from "@/lib/services/risk/risk-backstop-runner"
import { RISK_MONITORING_ENABLED_KEY, updateWorkerHeartbeat, WORKER_IDS } from "@/lib/server/workers/registry"
import { getLatestActiveGlobalSettings, parseBooleanSetting } from "@/lib/server/workers/system-settings"
import { releaseWorkerRunLock, tryAcquireWorkerRunLock, type WorkerRunLock } from "@/lib/server/workers/worker-run-lock"
import { parseFiniteWorkerNumber } from "@/lib/server/workers/worker-number-utils"
import { RiskMonitoringService } from "@/lib/services/risk/RiskMonitoringService"
import { getRiskThresholds } from "@/lib/services/risk/risk-thresholds"
import { getRiskEnforcementSettings, isRiskEnabled } from "@/lib/services/risk/risk-enforcement-settings"
import { isRedisEnabled } from "@/lib/redis/redis-client"
import { runScheduledCleanupTick } from "@/lib/server/workers/cleanup-auto-runner"

// Trading-8nt: previously this module had `let riskMonitoringInFlight = false` to skip
// overlapping runs. That flag is meaningless on serverless platforms (Vercel functions get
// a fresh module scope per cold-start) and gives a false sense of safety in long-running
// Node processes too — the canonical concurrency control is `tryAcquireWorkerRunLock` below
// (which uses Redis SETNX). The flag has been removed; the Redis lock is the single source
// of truth for "another run is already happening." When Redis is unavailable, the lock
// helper falls back to a process-local lock (see worker-run-lock.ts) so behaviour is the
// same as the old flag in that environment without the misleading global state.

function resolveCallableValue<T>(value: T | (() => T)): T | undefined {
  try {
    return typeof value === "function" ? (value as () => T)() : value
  } catch {
    return undefined
  }
}

function normalizeAuthorizationHeaderValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (Array.isArray(value)) {
    for (const candidateValue of value) {
      const normalizedCandidateValue = normalizeAuthorizationHeaderValue(candidateValue)
      if (normalizedCandidateValue) {
        return normalizedCandidateValue
      }
    }
    return null
  }
  if (typeof value === "string") {
    const normalizedValue = value.trim()
    return normalizedValue.length > 0 ? normalizedValue : null
  }
  const serializedValue = String(value).trim()
  if (
    serializedValue.length === 0 ||
    serializedValue === "[object Object]" ||
    serializedValue === "[object Undefined]" ||
    serializedValue === "[object Null]"
  ) {
    return null
  }
  return serializedValue
}

function resolveAuthorizationFromHeaderMap(headers: Record<string, unknown>): string | null {
  for (const [headerName, rawHeaderValue] of Object.entries(headers)) {
    if (headerName.toLowerCase() !== "authorization") {
      continue
    }
    const rawValue = resolveCallableValue(rawHeaderValue as unknown)
    const normalizedValue = normalizeAuthorizationHeaderValue(rawValue)
    if (normalizedValue) {
      return normalizedValue
    }
  }
  return null
}

function resolveAuthorizationFromIterable(headers: Iterable<unknown>): string | null {
  for (const entry of headers) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue
    }
    const headerName = String(entry[0]).trim().toLowerCase()
    if (headerName !== "authorization") {
      continue
    }
    const rawValue = resolveCallableValue(entry[1] as unknown)
    const normalizedValue = normalizeAuthorizationHeaderValue(rawValue)
    if (normalizedValue) {
      return normalizedValue
    }
  }
  return null
}

function resolveAuthorizationFromFlatHeaderArray(headers: unknown[]): string | null {
  if (headers.length < 2) {
    return null
  }
  for (let index = 0; index + 1 < headers.length; index += 2) {
    const normalizedHeaderName = String(headers[index]).trim().toLowerCase()
    if (normalizedHeaderName !== "authorization") {
      continue
    }
    const normalizedValue = normalizeAuthorizationHeaderValue(resolveCallableValue(headers[index + 1] as unknown))
    if (normalizedValue) {
      return normalizedValue
    }
  }
  return null
}

function resolveAuthorizationFromEntriesAccessor(rawHeaders: { entries?: unknown }): string | null {
  const maybeEntries = rawHeaders.entries
  if (typeof maybeEntries !== "function") {
    return null
  }
  try {
    const resolvedEntries = maybeEntries.call(rawHeaders) as unknown
    if (!resolvedEntries || typeof (resolvedEntries as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== "function") {
      return null
    }
    return resolveAuthorizationFromIterable(resolvedEntries as Iterable<unknown>)
  } catch {
    return null
  }
}

function resolveAuthorizationFromForEachAccessor(rawHeaders: { forEach?: unknown }): string | null {
  const maybeForEach = rawHeaders.forEach
  if (typeof maybeForEach !== "function") {
    return null
  }
  let resolvedAuthorization: string | null = null
  try {
    maybeForEach.call(rawHeaders, (firstArg: unknown, secondArg: unknown) => {
      if (resolvedAuthorization) {
        return
      }
      const candidates: Array<{ headerName: unknown; headerValue: unknown }> = [
        { headerName: secondArg, headerValue: firstArg },
        { headerName: firstArg, headerValue: secondArg },
      ]
      for (const candidate of candidates) {
        const normalizedHeaderName = String(candidate.headerName).trim().toLowerCase()
        if (normalizedHeaderName !== "authorization") {
          continue
        }
        const normalizedValue = normalizeAuthorizationHeaderValue(resolveCallableValue(candidate.headerValue as unknown))
        if (normalizedValue) {
          resolvedAuthorization = normalizedValue
          return
        }
      }
    })
  } catch {
    return null
  }
  return resolvedAuthorization
}

function resolveAuthorizationHeader(req: Request): string | null {
  try {
    const rawHeaders = resolveCallableValue((req as { headers?: unknown }).headers)
    if (!rawHeaders || (typeof rawHeaders !== "object" && typeof rawHeaders !== "function")) {
      return null
    }

    const maybeGet = (rawHeaders as { get?: unknown }).get
    if (typeof maybeGet === "function") {
      const headerNames = ["authorization", "Authorization", "AUTHORIZATION"]
      for (const headerName of headerNames) {
        let rawValue: unknown
        try {
          rawValue = maybeGet.call(rawHeaders, headerName)
        } catch {
          continue
        }
        const normalizedValue = normalizeAuthorizationHeaderValue(rawValue)
        if (normalizedValue) {
          return normalizedValue
        }
      }
    }

    if (Array.isArray(rawHeaders)) {
      const flatHeaderAuthorization = resolveAuthorizationFromFlatHeaderArray(rawHeaders)
      if (flatHeaderAuthorization) {
        return flatHeaderAuthorization
      }
    }

    const entriesAuthorization = resolveAuthorizationFromEntriesAccessor(rawHeaders as { entries?: unknown })
    if (entriesAuthorization) {
      return entriesAuthorization
    }
    const forEachAuthorization = resolveAuthorizationFromForEachAccessor(rawHeaders as { forEach?: unknown })
    if (forEachAuthorization) {
      return forEachAuthorization
    }

    if (typeof rawHeaders === "object") {
      const maybeIterator = (rawHeaders as { [Symbol.iterator]?: unknown })[Symbol.iterator]
      if (typeof maybeIterator === "function") {
        try {
          const iterableAuthorization = resolveAuthorizationFromIterable(rawHeaders as Iterable<unknown>)
          if (iterableAuthorization) {
            return iterableAuthorization
          }
        } catch {
          // ignore iterable-access errors
        }
      }
      const directHeaderMatch = resolveAuthorizationFromHeaderMap(rawHeaders as Record<string, unknown>)
      if (directHeaderMatch) {
        return directHeaderMatch
      }
      const nestedHeaders = resolveCallableValue((rawHeaders as { headers?: unknown }).headers)
      if (nestedHeaders && typeof nestedHeaders === "object") {
        return resolveAuthorizationFromHeaderMap(nestedHeaders as Record<string, unknown>)
      }
    }
    return null
  } catch {
    return null
  }
}

function resolveCronSecrets(): string[] {
  const secretCandidates = [process.env.RISK_MONITORING_SECRET, process.env.CRON_SECRET]
  const placeholderValues = new Set(["undefined", "null", "none", "nil", "n/a", "na", "-", "false", "0", "off", "disabled"])
  const normalizeSecretToken = (secretToken: string): string => {
    const trimmedToken = secretToken.trim()
    if (
      (trimmedToken.startsWith('"') && trimmedToken.endsWith('"')) ||
      (trimmedToken.startsWith("'") && trimmedToken.endsWith("'"))
    ) {
      return trimmedToken.slice(1, -1).trim()
    }
    return trimmedToken
  }
  const splitSecretCandidate = (secretCandidate: string): string[] => {
    const normalizedCandidate = normalizeSecretToken(secretCandidate)
    if (!normalizedCandidate) {
      return []
    }
    let parsedJsonCandidate = false
    if (
      (normalizedCandidate.startsWith("[") && normalizedCandidate.endsWith("]")) ||
      (normalizedCandidate.startsWith("{") && normalizedCandidate.endsWith("}"))
    ) {
      try {
        const parsedCandidate = JSON.parse(normalizedCandidate)
        parsedJsonCandidate = true
        if (Array.isArray(parsedCandidate)) {
          return parsedCandidate.map((value) => String(value))
        }
        if (parsedCandidate && typeof parsedCandidate === "object") {
          const candidateRecord = parsedCandidate as Record<string, unknown>
          const arrayCarrierKeys = ["secrets", "values", "tokens", "items"] as const
          for (const arrayCarrierKey of arrayCarrierKeys) {
            const carrierValue = candidateRecord[arrayCarrierKey]
            if (Array.isArray(carrierValue)) {
              return carrierValue.map((value) => String(value))
            }
          }
          const singleCarrierKeys = ["secret", "value", "token"] as const
          for (const singleCarrierKey of singleCarrierKeys) {
            const carrierValue = candidateRecord[singleCarrierKey]
            if (carrierValue !== undefined && carrierValue !== null) {
              return [String(carrierValue)]
            }
          }
        }
      } catch {
        // fall through to delimiter split
      }
      if (parsedJsonCandidate) {
        return []
      }
    }
    return normalizedCandidate
      .split(/[,\n;]+/)
      .map((tokenPart) => tokenPart.trim())
      .filter((tokenPart) => tokenPart.length > 0)
  }
  const normalizedSecrets = secretCandidates
    .flatMap((secretCandidate) =>
      typeof secretCandidate === "string"
        ? splitSecretCandidate(secretCandidate)
            .map((secretToken) => normalizeSecretToken(secretToken))
            .filter((secretToken) => {
              if (secretToken.length === 0) {
                return false
              }
              return !placeholderValues.has(secretToken.toLowerCase())
            })
        : [],
    )
  return Array.from(new Set(normalizedSecrets))
}

function matchesBearerSecret(authHeader: string | null, secret: string): boolean {
  if (!authHeader) {
    return false
  }
  const bearerSegments = authHeader
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)

  for (const bearerSegment of bearerSegments) {
    const segmentMatch = bearerSegment.match(/^Bearer\s+(.+)$/i)
    if (!segmentMatch?.[1]) {
      continue
    }
    const token = segmentMatch[1].trim()
    if (!token) {
      continue
    }
    const normalizedToken =
      (token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))
        ? token.slice(1, -1).trim()
        : token
    if (normalizedToken === secret) {
      return true
    }
  }

  return false
}

function matchesAnyBearerSecret(authHeader: string | null, secrets: string[]): boolean {
  return secrets.some((secret) => matchesBearerSecret(authHeader, secret))
}

function normalizeHeartbeatCount(value: unknown): number {
  const parsedValue = parseFiniteWorkerNumber(value)
  if (parsedValue === null) {
    return 0
  }
  return Math.max(0, Math.trunc(parsedValue))
}

function normalizeHeartbeatReason(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const normalizedValue = value.trim()
  if (!normalizedValue) {
    return undefined
  }
  return normalizedValue.slice(0, 64)
}

function normalizeWorkerLockTtlMs(value: unknown, fallback: number): number {
  const parsedValue = parseFiniteWorkerNumber(value)
  if (parsedValue === null) {
    return fallback
  }
  const normalizedValue = Math.trunc(parsedValue)
  if (normalizedValue < 10_000) {
    return 10_000
  }
  return Math.min(86_400_000, normalizedValue)
}

function normalizeHeartbeatErrorMessage(value: unknown): string {
  if (typeof value !== "string") {
    return "unknown"
  }
  const normalizedValue = value.trim().replace(/\s+/g, " ")
  if (!normalizedValue) {
    return "unknown"
  }
  return normalizedValue.slice(0, 256)
}

function resolveRiskRunMode(req: Request): "monitor" | "backstop" {
  try {
    const url = new URL(req.url, "http://localhost")
    const modeToken = url.searchParams.get("mode")?.trim().toLowerCase()
    if (modeToken === "backstop") {
      return "backstop"
    }
    const useBackstopToken = url.searchParams.get("useBackstop")?.trim().toLowerCase()
    if (
      useBackstopToken === "true" ||
      useBackstopToken === "1" ||
      useBackstopToken === "yes" ||
      useBackstopToken === "on" ||
      useBackstopToken === "enabled"
    ) {
      return "backstop"
    }
  } catch {
    // Fall back to canonical monitoring mode when URL parsing is unavailable.
  }

  return "monitor"
}

async function writeRiskHeartbeat(input: {
  checkedAccounts: unknown
  positionsClosed: unknown
  alertsCreated: unknown
  errorCount: unknown
  startedAt: number
  reason?: unknown
  errorMessage?: unknown
}): Promise<void> {
  const checkedAccounts = normalizeHeartbeatCount(input.checkedAccounts)
  const positionsClosed = normalizeHeartbeatCount(input.positionsClosed)
  const alertsCreated = normalizeHeartbeatCount(input.alertsCreated)
  const errorCount = normalizeHeartbeatCount(input.errorCount)
  const reason = normalizeHeartbeatReason(input.reason)
  const errorMessage = normalizeHeartbeatErrorMessage(input.errorMessage)

  await updateWorkerHeartbeat(
    WORKER_IDS.RISK_MONITORING,
    JSON.stringify({
      lastRunAtIso: new Date().toISOString(),
      host: os.hostname(),
      pid: process.pid,
      redisEnabled: isRedisEnabled(),
      checkedAccounts,
      positionsClosed,
      alertsCreated,
      errorCount,
      elapsedMs: Date.now() - input.startedAt,
      reason,
      errorMessage: reason === "error" ? errorMessage : undefined,
    }),
  )
}

export async function GET(req: Request) {
  console.log("⏰ [CRON-RISK-MONITORING] Cron request received")
  const startedAt = Date.now()
  let runLock: WorkerRunLock | null = null

  try {
    // Verify cron secret (for security)
    const authHeader = resolveAuthorizationHeader(req)
    const cronSecrets = resolveCronSecrets()
    
    if (cronSecrets.length > 0) {
      if (!matchesAnyBearerSecret(authHeader, cronSecrets)) {
        console.warn("⚠️ [CRON-RISK-MONITORING] Invalid authorization header")
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    } else {
      // Allow if no secret is set (for development)
      console.warn("⚠️ [CRON-RISK-MONITORING] No CRON_SECRET set, allowing request (development mode)")
    }

    // Soft-toggle support (Admin Console → Workers)
    try {
      const rows = await getLatestActiveGlobalSettings([RISK_MONITORING_ENABLED_KEY])
      const raw = rows.get(RISK_MONITORING_ENABLED_KEY)?.value ?? null
      const enabled = parseBooleanSetting(raw) ?? true
      if (!enabled) {
        await writeRiskHeartbeat({
          checkedAccounts: 0,
          positionsClosed: 0,
          alertsCreated: 0,
          errorCount: 0,
          startedAt,
          reason: "disabled",
        }).catch(() => {})
        console.log("⏸️ [CRON-RISK-MONITORING] Disabled via SystemSettings; skipping run")
        return NextResponse.json(
          { success: true, skipped: true, reason: "disabled", timestamp: new Date().toISOString() },
          { status: 200 },
        )
      }
    } catch (e) {
      console.warn("⚠️ [CRON-RISK-MONITORING] Failed to read enabled flag; defaulting to enabled", {
        message: (e as any)?.message || String(e),
      })
    }

    // Master risk toggle: primary gate for all auto-close behaviour.
    // Admin controls this via riskAutoCloseEnabled / circuitBreakerPausedUntil in enforcement settings.
    try {
      const riskSettings = await getRiskEnforcementSettings({ maxAgeMs: 0 })
      if (!isRiskEnabled(riskSettings)) {
        await writeRiskHeartbeat({
          checkedAccounts: 0,
          positionsClosed: 0,
          alertsCreated: 0,
          errorCount: 0,
          startedAt,
          reason: "risk_disabled",
        }).catch(() => {})
        console.log("⏸️ [CRON-RISK-MONITORING] Skipped: risk auto-close is disabled (riskAutoCloseEnabled=false or circuit breaker active)")
        return NextResponse.json(
          { success: true, skipped: true, reason: "risk_disabled", timestamp: new Date().toISOString() },
          { status: 200 },
        )
      }
    } catch (e) {
      console.warn("⚠️ [CRON-RISK-MONITORING] Failed to read risk enabled flag; continuing", {
        message: (e as any)?.message || String(e),
      })
    }

    const lockTtlMs = normalizeWorkerLockTtlMs(process.env.RISK_MONITORING_LOCK_TTL_MS, 180_000)
    runLock = await tryAcquireWorkerRunLock({
      workerId: WORKER_IDS.RISK_MONITORING,
      ttlMs: lockTtlMs,
    })
    if (!runLock.acquired) {
      await writeRiskHeartbeat({
        checkedAccounts: 0,
        positionsClosed: 0,
        alertsCreated: 0,
        errorCount: 0,
        startedAt,
        reason: "locked",
      }).catch(() => {})
      console.log("⏸️ [CRON-RISK-MONITORING] Skipping run: global lock active")
      return NextResponse.json(
        { success: true, skipped: true, reason: "locked", timestamp: new Date().toISOString() },
        { status: 200 },
      )
    }

    const runMode = resolveRiskRunMode(req)
    if (runMode === "backstop") {
      const backstop = await runRiskBackstop()
      const autoCleanup = await runScheduledCleanupTick({ source: "cron_risk_monitoring_backstop" })

      console.log("✅ [CRON-RISK-MONITORING] Backstop completed:", {
        skipped: backstop.skipped,
        skippedReason: backstop.skippedReason,
        pnlWorkerHealth: backstop.pnlWorkerHealth,
        elapsedMs: backstop.elapsedMs,
      })

      return NextResponse.json(
        {
          success: true,
          timestamp: new Date().toISOString(),
          result: backstop,
          autoCleanup,
        },
        { status: 200 },
      )
    }

    const thresholdsConfig = await getRiskThresholds({ maxAgeMs: 0 })
    const monitoringService = new RiskMonitoringService()
    const monitoringResult = await monitoringService.monitorAllAccounts({
      warningThreshold: thresholdsConfig.warningThreshold,
      autoCloseThreshold: thresholdsConfig.autoCloseThreshold,
    })
    const normalizedResult = {
      checkedAccounts: normalizeHeartbeatCount((monitoringResult as any)?.checkedAccounts),
      positionsClosed: normalizeHeartbeatCount((monitoringResult as any)?.positionsClosed),
      alertsCreated: normalizeHeartbeatCount((monitoringResult as any)?.alertsCreated),
      errors: normalizeHeartbeatCount((monitoringResult as any)?.errors),
    }

    await writeRiskHeartbeat({
      checkedAccounts: normalizedResult.checkedAccounts,
      positionsClosed: normalizedResult.positionsClosed,
      alertsCreated: normalizedResult.alertsCreated,
      errorCount: normalizedResult.errors,
      startedAt,
    })
    const autoCleanup = await runScheduledCleanupTick({ source: "cron_risk_monitoring" })

    console.log("✅ [CRON-RISK-MONITORING] Monitoring completed:", normalizedResult)

    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        result: normalizedResult,
        autoCleanup,
      },
      { status: 200 },
    )

  } catch (error: any) {
    console.error("❌ [CRON-RISK-MONITORING] Error:", error)
    await writeRiskHeartbeat({
      checkedAccounts: 0,
      positionsClosed: 0,
      alertsCreated: 0,
      errorCount: 1,
      startedAt,
      reason: "error",
      errorMessage: error?.message,
    }).catch(() => {})
    const normalizedErrorMessage = normalizeHeartbeatErrorMessage(error?.message)
    return NextResponse.json(
      { 
        success: false,
        error: normalizedErrorMessage === "unknown" ? "Failed to run risk monitoring" : normalizedErrorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  } finally {
    if (runLock?.acquired) {
      await releaseWorkerRunLock(runLock).catch((e) => {
        console.warn("⚠️ [CRON-RISK-MONITORING] Failed to release worker lock", e)
      })
    }
  }
}

// Also support POST for cron services that use POST
export async function POST(req: Request) {
  return GET(req)
}
