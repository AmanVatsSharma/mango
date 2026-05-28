/**
 * @file route.ts
 * @module admin-console
 * @description API route for cleanup execution
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { executeHistoricalCleanupBefore } from "@/lib/server/workers/cleanup-auto-runner"

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/cleanup/execute",
      required: "admin.cleanup.execute",
      fallbackMessage: "Failed to execute cleanup",
    },
    async ({ logger }) => {
      const body = (await req.json().catch(() => ({}))) as any
      const beforeParam = body.before as string | undefined
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const before = beforeParam ? new Date(beforeParam) : today
      if (Number.isNaN(before.getTime())) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid before date",
          statusCode: 400,
        })
      }

      // Safety: never allow cleanup beyond today's boundary.
      const cutoff = new Date(before)
      cutoff.setHours(0, 0, 0, 0)
      const maxAllowed = new Date()
      maxAllowed.setHours(0, 0, 0, 0)
      if (cutoff > maxAllowed) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Cannot cleanup future data",
          statusCode: 400,
        })
      }

      logger.debug({ cutoff: cutoff.toISOString() }, "POST /api/admin/cleanup/execute - start")

      const result = await executeHistoricalCleanupBefore(cutoff)

      logger.info({ cutoff: cutoff.toISOString(), result }, "POST /api/admin/cleanup/execute - success")
      return NextResponse.json({ ...result, cutoff: cutoff.toISOString() }, { status: 200 })
    }
  )
}
