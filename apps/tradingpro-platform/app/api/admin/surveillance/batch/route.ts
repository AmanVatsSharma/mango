/**
 * File:        app/api/admin/surveillance/batch/route.ts
 * Module:      Admin · Surveillance · Batch trigger (Phase 13b)
 * Purpose:     SUPER_ADMIN-only POST that runs the surveillance batch immediately. Used by
 *              ops to verify rule changes without waiting for the nightly cron, and as the
 *              callable target for an external cron/scheduler.
 *
 * Exports:
 *   - POST — runs `runSurveillanceBatch`; returns the per-rule report.
 *
 * Depends on:
 *   - @/lib/rbac/admin-api
 *   - @/lib/surveillance/batch-runner
 *
 * Side-effects:
 *   - DB writes through the batch runner (alerts upsert + auto-dismiss sweep).
 *
 * Key invariants:
 *   - Permission: `admin.surveillance.rules` (the highest-trust surveillance perm; manually
 *     forcing a batch is functionally equivalent to a tuning operation).
 *   - The batch is idempotent — repeated triggers within a window are safe (DB-level dedupe).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { runSurveillanceBatch } from "@/lib/surveillance/batch-runner"

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/surveillance/batch",
      required: "admin.surveillance.rules",
      fallbackMessage: "Failed to run surveillance batch",
    },
    async ({ logger }) => {
      const result = await runSurveillanceBatch()
      logger.info(
        {
          ranAt: result.ranAt,
          summary: result.reports.map((r) => ({
            ruleKey: r.ruleKey,
            fires: r.fires,
            errored: r.errored,
          })),
        },
        "surveillance batch run ok",
      )
      return NextResponse.json({ success: true, ...result }, { status: 200 })
    },
  )
}
