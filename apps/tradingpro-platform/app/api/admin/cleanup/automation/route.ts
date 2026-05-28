/**
 * @file route.ts
 * @module admin-console/cleanup
 * @description API route to manage automated cleanup schedule settings.
 * @author StockTrade
 * @created 2026-02-17
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { ADMIN_SETTING_CATEGORIES, ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import { getLatestActiveGlobalSettings, parseBooleanSetting, upsertGlobalSetting } from "@/lib/server/workers/system-settings"
import { getCleanupAutoRunnerConfig } from "@/lib/server/workers/cleanup-auto-runner"
import { parseFiniteWorkerNumber } from "@/lib/server/workers/worker-number-utils"

function normalizeRetentionDays(value: unknown): number {
  const parsedValue = parseFiniteWorkerNumber(value)
  if (parsedValue === null) {
    return 0
  }
  return Math.max(0, Math.min(3650, Math.trunc(parsedValue)))
}

function normalizeRunHourIst(value: unknown): number {
  const parsedValue = parseFiniteWorkerNumber(value)
  if (parsedValue === null) {
    return 6
  }
  return Math.max(0, Math.min(23, Math.trunc(parsedValue)))
}

function normalizeEnabled(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "string") {
    return parseBooleanSetting(value) ?? false
  }
  return false
}

function parseSummaryPayload(value: string | null | undefined): Record<string, unknown> | null {
  if (typeof value !== "string" || !value.trim()) {
    return null
  }
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

async function readCleanupSummary(): Promise<Record<string, unknown> | null> {
  const rows = await getLatestActiveGlobalSettings([ADMIN_SETTING_KEYS.CLEANUP_LAST_RUN_SUMMARY])
  const summaryRaw = rows.get(ADMIN_SETTING_KEYS.CLEANUP_LAST_RUN_SUMMARY)?.value ?? null
  return parseSummaryPayload(summaryRaw)
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/cleanup/automation",
      required: "admin.cleanup.read",
      fallbackMessage: "Failed to fetch cleanup automation settings",
    },
    async (ctx) => {
      const config = await getCleanupAutoRunnerConfig()
      const summary = await readCleanupSummary().catch(() => null)
      ctx.logger.info({ enabled: config.enabled }, "GET /api/admin/cleanup/automation - success")
      return NextResponse.json(
        {
          success: true,
          automation: {
            ...config,
            summary,
          },
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
      route: "/api/admin/cleanup/automation",
      required: "admin.cleanup.execute",
      fallbackMessage: "Failed to save cleanup automation settings",
    },
    async (ctx) => {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
      const enabled = normalizeEnabled(body.enabled)
      const retentionDays = normalizeRetentionDays(body.retentionDays)
      const dailyRunHourIst = normalizeRunHourIst(body.dailyRunHourIst)

      if (!Number.isFinite(retentionDays) || retentionDays < 0) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "retentionDays must be a non-negative number",
          statusCode: 400,
        })
      }
      if (!Number.isFinite(dailyRunHourIst) || dailyRunHourIst < 0 || dailyRunHourIst > 23) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "dailyRunHourIst must be between 0 and 23",
          statusCode: 400,
        })
      }

      await Promise.all([
        upsertGlobalSetting({
          key: ADMIN_SETTING_KEYS.CLEANUP_AUTO_ENABLED,
          value: String(enabled),
          category: ADMIN_SETTING_CATEGORIES.CLEANUP,
          description: "Enable automated cleanup while worker loops are running.",
        }),
        upsertGlobalSetting({
          key: ADMIN_SETTING_KEYS.CLEANUP_RETENTION_DAYS,
          value: String(retentionDays),
          category: ADMIN_SETTING_CATEGORIES.CLEANUP,
          description: "Retention days for orders and closed positions (0 keeps only today).",
        }),
        upsertGlobalSetting({
          key: ADMIN_SETTING_KEYS.CLEANUP_DAILY_RUN_HOUR_IST,
          value: String(dailyRunHourIst),
          category: ADMIN_SETTING_CATEGORIES.CLEANUP,
          description: "Daily IST hour after which auto cleanup may run once per day.",
        }),
      ])

      const config = await getCleanupAutoRunnerConfig()
      const summary = await readCleanupSummary().catch(() => null)
      ctx.logger.info({ enabled: config.enabled, retentionDays, dailyRunHourIst }, "POST /api/admin/cleanup/automation - success")
      return NextResponse.json(
        {
          success: true,
          automation: {
            ...config,
            summary,
          },
        },
        { status: 200 },
      )
    },
  )
}
