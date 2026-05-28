/**
 * @file cleanup-auto-runner.ts
 * @module workers
 * @description Auto-cleanup scheduler for historical orders and closed positions with IST daily window controls.
 * @author StockTrade
 * @created 2026-02-17
 */

import { prisma } from "@/lib/prisma"
import { ADMIN_SETTING_CATEGORIES, ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import {
  getLatestActiveGlobalSettings,
  parseBooleanSetting,
  upsertGlobalSetting,
} from "@/lib/server/workers/system-settings"
import { parseFiniteWorkerNumber } from "@/lib/server/workers/worker-number-utils"
import { releaseWorkerRunLock, tryAcquireWorkerRunLock } from "@/lib/server/workers/worker-run-lock"

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const CLEANUP_LOCK_TTL_MS = 5 * 60 * 1000
const CLEANUP_WORKER_LOCK_ID = "daily_cleanup"

const CLEANUP_DEFAULTS = {
  enabled: false,
  retentionDays: 0,
  dailyRunHourIst: 6,
} as const

type CleanupAutoRunnerSkipReason = "disabled" | "before_window" | "already_ran_today" | "locked" | "error"

export type CleanupExecutionResult = {
  deletedOrders: number
  deletedPositions: number
}

export type CleanupAutoRunnerConfig = {
  enabled: boolean
  retentionDays: number
  dailyRunHourIst: number
  lastRunDateIst: string | null
}

export type CleanupAutoRunResult = {
  source: string
  config: CleanupAutoRunnerConfig
  executed: boolean
  skippedReason?: CleanupAutoRunnerSkipReason
  errorMessage?: string
  cutoffIso?: string
  deletedOrders?: number
  deletedPositions?: number
}

function normalizeRetentionDays(value: unknown): number {
  const parsedValue = parseFiniteWorkerNumber(value)
  if (parsedValue === null) {
    return CLEANUP_DEFAULTS.retentionDays
  }
  return Math.max(0, Math.min(3650, Math.trunc(parsedValue)))
}

function normalizeDailyRunHourIst(value: unknown): number {
  const parsedValue = parseFiniteWorkerNumber(value)
  if (parsedValue === null) {
    return CLEANUP_DEFAULTS.dailyRunHourIst
  }
  return Math.max(0, Math.min(23, Math.trunc(parsedValue)))
}

function normalizeLastRunDateIst(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalizedValue = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return null
  }
  return normalizedValue
}

function resolveShiftedIstDate(now: Date): Date {
  return new Date(now.getTime() + IST_OFFSET_MS)
}

function resolveIstDateToken(now: Date): string {
  return resolveShiftedIstDate(now).toISOString().slice(0, 10)
}

function resolveIstHour(now: Date): number {
  return resolveShiftedIstDate(now).getUTCHours()
}

function resolveIstStartUtc(now: Date): Date {
  const shifted = resolveShiftedIstDate(now)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - IST_OFFSET_MS)
}

function resolveCleanupCutoffUtc(now: Date, retentionDays: number): Date {
  const todayStartUtc = resolveIstStartUtc(now)
  return new Date(todayStartUtc.getTime() - retentionDays * DAY_MS)
}

function normalizeErrorMessage(value: unknown): string {
  if (typeof value !== "string") {
    return "unknown"
  }
  const normalizedValue = value.trim().replace(/\s+/g, " ")
  if (!normalizedValue) {
    return "unknown"
  }
  return normalizedValue.slice(0, 256)
}

export async function getCleanupAutoRunnerConfig(): Promise<CleanupAutoRunnerConfig> {
  try {
    const rows = await getLatestActiveGlobalSettings([
      ADMIN_SETTING_KEYS.CLEANUP_AUTO_ENABLED,
      ADMIN_SETTING_KEYS.CLEANUP_RETENTION_DAYS,
      ADMIN_SETTING_KEYS.CLEANUP_DAILY_RUN_HOUR_IST,
      ADMIN_SETTING_KEYS.CLEANUP_LAST_RUN_DATE_IST,
    ])
    return {
      enabled: parseBooleanSetting(rows.get(ADMIN_SETTING_KEYS.CLEANUP_AUTO_ENABLED)?.value ?? null) ?? CLEANUP_DEFAULTS.enabled,
      retentionDays: normalizeRetentionDays(rows.get(ADMIN_SETTING_KEYS.CLEANUP_RETENTION_DAYS)?.value ?? null),
      dailyRunHourIst: normalizeDailyRunHourIst(rows.get(ADMIN_SETTING_KEYS.CLEANUP_DAILY_RUN_HOUR_IST)?.value ?? null),
      lastRunDateIst: normalizeLastRunDateIst(rows.get(ADMIN_SETTING_KEYS.CLEANUP_LAST_RUN_DATE_IST)?.value ?? null),
    }
  } catch {
    return {
      enabled: CLEANUP_DEFAULTS.enabled,
      retentionDays: CLEANUP_DEFAULTS.retentionDays,
      dailyRunHourIst: CLEANUP_DEFAULTS.dailyRunHourIst,
      lastRunDateIst: null,
    }
  }
}

export async function executeHistoricalCleanupBefore(cutoff: Date): Promise<CleanupExecutionResult> {
  const result = await prisma.$transaction(async (tx) => {
    const deletedOrders = await tx.order.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    const deletedPositions = await tx.position.deleteMany({
      where: { quantity: 0, createdAt: { lt: cutoff } },
    })
    return {
      deletedOrders: deletedOrders.count,
      deletedPositions: deletedPositions.count,
    }
  })

  return result
}

async function persistCleanupRunSummary(input: {
  source: string
  config: CleanupAutoRunnerConfig
  now: Date
  cutoff: Date
  result: CleanupExecutionResult
}): Promise<void> {
  const runDateIst = resolveIstDateToken(input.now)
  const summaryPayload = JSON.stringify({
    source: input.source,
    lastRunAtIso: input.now.toISOString(),
    runDateIst,
    retentionDays: input.config.retentionDays,
    dailyRunHourIst: input.config.dailyRunHourIst,
    cutoffIso: input.cutoff.toISOString(),
    deletedOrders: input.result.deletedOrders,
    deletedPositions: input.result.deletedPositions,
  })

  await Promise.all([
    upsertGlobalSetting({
      key: ADMIN_SETTING_KEYS.CLEANUP_LAST_RUN_DATE_IST,
      value: runDateIst,
      category: ADMIN_SETTING_CATEGORIES.CLEANUP,
      description: "Last IST date on which automated cleanup completed.",
    }),
    upsertGlobalSetting({
      key: ADMIN_SETTING_KEYS.CLEANUP_LAST_RUN_SUMMARY,
      value: summaryPayload,
      category: ADMIN_SETTING_CATEGORIES.CLEANUP,
      description: "Latest automated cleanup run summary payload.",
    }),
  ])
}

export async function runScheduledCleanupTick(input: { source: string; now?: Date; force?: boolean }): Promise<CleanupAutoRunResult> {
  const now = input.now instanceof Date ? input.now : new Date()
  const source = typeof input.source === "string" && input.source.trim() ? input.source.trim() : "unknown"
  const force = input.force === true
  const config = await getCleanupAutoRunnerConfig()
  const currentIstDate = resolveIstDateToken(now)
  const currentIstHour = resolveIstHour(now)

  if (!force && !config.enabled) {
    return { source, config, executed: false, skippedReason: "disabled" }
  }
  if (!force && currentIstHour < config.dailyRunHourIst) {
    return { source, config, executed: false, skippedReason: "before_window" }
  }
  if (!force && config.lastRunDateIst === currentIstDate) {
    return { source, config, executed: false, skippedReason: "already_ran_today" }
  }

  const runLock = await tryAcquireWorkerRunLock({
    workerId: CLEANUP_WORKER_LOCK_ID,
    ttlMs: CLEANUP_LOCK_TTL_MS,
  })
  if (!runLock.acquired) {
    return { source, config, executed: false, skippedReason: "locked" }
  }

  try {
    const latestConfig = await getCleanupAutoRunnerConfig()
    if (!force && latestConfig.lastRunDateIst === currentIstDate) {
      return { source, config: latestConfig, executed: false, skippedReason: "already_ran_today" }
    }

    const cutoff = resolveCleanupCutoffUtc(now, latestConfig.retentionDays)
    const result = await executeHistoricalCleanupBefore(cutoff)
    await persistCleanupRunSummary({
      source,
      config: latestConfig,
      now,
      cutoff,
      result,
    })

    return {
      source,
      config: latestConfig,
      executed: true,
      cutoffIso: cutoff.toISOString(),
      deletedOrders: result.deletedOrders,
      deletedPositions: result.deletedPositions,
    }
  } catch (error: any) {
    return {
      source,
      config,
      executed: false,
      skippedReason: "error",
      errorMessage: normalizeErrorMessage(error?.message),
    }
  } finally {
    await releaseWorkerRunLock(runLock).catch(() => {})
  }
}
