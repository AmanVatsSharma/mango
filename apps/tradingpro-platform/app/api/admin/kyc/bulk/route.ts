/**
 * @file app/api/admin/kyc/bulk/route.ts
 * @module admin-console
 * @description Bulk KYC approve/reject endpoint. Best-effort (per-row try/catch) — returns a
 *              detailed report of which rows succeeded vs failed instead of all-or-nothing.
 *              Each successful row writes its own KycReviewLog + TradingLog (existing per-row
 *              audit pattern preserved) and dispatches NotificationService asynchronously
 *              (fire-and-forget; the queue worker handles backpressure).
 *
 *              Exports:
 *                - POST  — bulk approve/reject.
 *
 *              Request body:
 *                {
 *                  kycIds:  string[]                         // 1..50 ids
 *                  status:  "APPROVED" | "REJECTED"
 *                  reason?: string                           // optional, applied to all rows
 *                }
 *
 *              Response:
 *                {
 *                  attempted: number
 *                  succeeded: number
 *                  failed:    number
 *                  results: Array<
 *                    | { kycId, status: "APPROVED" | "REJECTED", success: true }
 *                    | { kycId, success: false, error: string, code?: string }
 *                  >
 *                }
 *
 *              Side-effects (per successful row): one prisma.kYC.update, one prisma.kycReviewLog.create,
 *              one prisma.tradingLog.create, one async NotificationService.notifyKYC call.
 *
 *              Key invariants:
 *                - Per-request cap: 50 KYCs (validated up-front; over-cap returns 400).
 *                - Bulk is best-effort, NOT atomic. The response shape lets the UI show partial success.
 *                - Notifications are fire-and-forget per row; failures are logged but do not flip the row to failed.
 *                - Same permission key as single-update: admin.users.kyc.
 *
 *              Read order:
 *                1. POST handler — entry point, body validation, permission gate.
 *                2. processOne — per-row work (factored so the loop reads cleanly).
 *                3. Response shaping — includes success / failed counts for the v2 UI's bulk-action bar.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

import { NextRequest, NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { prisma } from "@/lib/prisma"
import { KycReviewAction, KycStatus } from "@prisma/client"

const MAX_BULK = 50
const VALID_STATUSES = new Set<string>([KycStatus.APPROVED, KycStatus.REJECTED])

interface BulkBody {
  kycIds?: unknown
  status?: unknown
  reason?: unknown
}

interface RowResult {
  kycId: string
  success: boolean
  status?: "APPROVED" | "REJECTED"
  error?: string
  code?: string
}

export async function POST(request: NextRequest) {
  return handleAdminApi(
    request,
    {
      route: "/api/admin/kyc/bulk",
      required: "admin.users.kyc",
      fallbackMessage: "Failed bulk KYC update",
    },
    async (ctx) => {
      const raw = (await request.json().catch(() => ({}))) as BulkBody

      const status = typeof raw.status === "string" ? raw.status : ""
      const reason = typeof raw.reason === "string" ? raw.reason : null
      const kycIds = Array.isArray(raw.kycIds)
        ? Array.from(new Set(raw.kycIds.filter((v): v is string => typeof v === "string" && v.length > 0)))
        : []

      if (!VALID_STATUSES.has(status)) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "status must be APPROVED or REJECTED",
          statusCode: 400,
        })
      }
      if (kycIds.length === 0) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "kycIds must contain at least one id",
          statusCode: 400,
        })
      }
      if (kycIds.length > MAX_BULK) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: `kycIds exceeds per-request cap (${MAX_BULK}). Submit in batches.`,
          statusCode: 400,
        })
      }

      ctx.logger.info(
        { count: kycIds.length, status },
        "POST /api/admin/kyc/bulk - request",
      )

      const reviewerId = ctx.session.user.id
      const typedStatus = status as "APPROVED" | "REJECTED"

      const results: RowResult[] = []
      for (const kycId of kycIds) {
        try {
          await processOne({ kycId, status: typedStatus, reason, reviewerId })
          results.push({ kycId, success: true, status: typedStatus })
        } catch (e) {
          const err = e instanceof AppError ? e : null
          results.push({
            kycId,
            success: false,
            error: e instanceof Error ? e.message : "Unknown error",
            code: err?.code,
          })
          ctx.logger.warn({ kycId, err: e }, "POST /api/admin/kyc/bulk - row failed")
        }
      }

      const succeeded = results.filter((r) => r.success).length
      const failed = results.length - succeeded

      ctx.logger.info(
        { attempted: results.length, succeeded, failed },
        "POST /api/admin/kyc/bulk - done",
      )

      return NextResponse.json(
        {
          attempted: results.length,
          succeeded,
          failed,
          results,
        },
        { status: 200 },
      )
    },
  )
}

interface ProcessOneArgs {
  kycId: string
  status: "APPROVED" | "REJECTED"
  reason: string | null
  reviewerId: string
}

async function processOne({ kycId, status, reason, reviewerId }: ProcessOneArgs): Promise<void> {
  const kyc = await prisma.kYC.update({
    where: { id: kycId },
    data: {
      status,
      approvedAt: status === KycStatus.APPROVED ? new Date() : null,
      slaBreachedAt: null,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, phone: true, clientId: true },
      },
    },
  })

  await prisma.kycReviewLog.create({
    data: {
      kycId,
      reviewerId,
      action: KycReviewAction.STATUS_UPDATED,
      note: reason,
      metadata: { status, source: "bulk" },
    },
  })

  await prisma.tradingLog.create({
    data: {
      clientId: kyc.user.clientId || "UNKNOWN",
      userId: reviewerId,
      action: `KYC_${status.toLowerCase()}_BULK`,
      message: `Bulk KYC ${status.toLowerCase()} for ${kyc.user.name ?? kyc.user.email ?? kyc.user.id}`,
      details: {
        kycId,
        reason: reason ?? "",
        approvedAt: status === KycStatus.APPROVED ? new Date() : null,
      },
      category: "SYSTEM",
      level: "INFO",
    },
  })

  // Fire-and-forget notification — failures logged inside, do not flip row to failed.
  void (async () => {
    try {
      const { NotificationService } = await import("@/lib/services/notifications/NotificationService")
      await NotificationService.notifyKYC(kyc.userId, status, reason ?? undefined)
    } catch {
      // swallow — caller already returned. Worker queue handles eventual delivery.
    }
  })()
}
