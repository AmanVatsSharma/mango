/**
 * @file route.ts
 * @module admin-console
 * @description API route for withdrawal management (pending list + approve/reject)
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-02-02
 */

import { NextResponse } from "next/server"
import { createAdminFundService } from "@/lib/services/admin/AdminFundService"
import { NotificationService } from "@/lib/services/notifications/NotificationService"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import {
  normalizeAdminFundActionToken,
  normalizeAdminFundIdentifier,
  normalizeAdminFundNotificationAmount,
  normalizeAdminFundReason,
} from "@/lib/server/admin-funds-number-utils"

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/withdrawals",
      required: "admin.withdrawals.manage",
      fallbackMessage: "Failed to fetch withdrawals",
    },
    async ({ session, role, logger }) => {
      logger.debug({ role }, "GET /api/admin/withdrawals - start")

      const adminFundService = createAdminFundService()
      // Scope by RM for admins and moderators; super admin sees all
      const managedByIdFilter =
        role === "SUPER_ADMIN"
          ? undefined
          : role === "ADMIN"
            ? session.user.id!
            : (session.user as any).managedById || undefined
      const withdrawals = await adminFundService.getPendingWithdrawals(managedByIdFilter)

      logger.info({ count: withdrawals.length }, "GET /api/admin/withdrawals - success")
      return NextResponse.json({ success: true, withdrawals }, { status: 200 })
    }
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/withdrawals",
      required: "admin.withdrawals.manage",
      fallbackMessage: "Failed to process withdrawal",
    },
    async ({ session, role, logger }) => {
      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid request body", statusCode: 400 })
      }
      const { withdrawalId, action, reason, transactionId } = body
      const normalizedWithdrawalId = normalizeAdminFundIdentifier(withdrawalId)
      const normalizedAction = normalizeAdminFundActionToken(action)
      const normalizedReason = normalizeAdminFundReason(reason)
      const normalizedTransactionId = normalizeAdminFundIdentifier(transactionId)

      logger.debug({ withdrawalId: normalizedWithdrawalId, action: normalizedAction }, "POST /api/admin/withdrawals - request")

      if (!normalizedWithdrawalId || !normalizedAction) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Missing required fields",
          statusCode: 400,
        })
      }

      const adminFundService = createAdminFundService()

      if (normalizedAction === "approve") {
        if (!normalizedTransactionId) {
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "Transaction ID required for approval",
            statusCode: 400,
          })
        }

        const result = await adminFundService.approveWithdrawal({
          withdrawalId: normalizedWithdrawalId,
          transactionId: normalizedTransactionId,
          adminId: session.user.id!,
          adminName: session.user.name || "Admin",
          actorRole: role as any,
        })

        // Create notification for user (non-blocking)
        try {
          const withdrawal = await adminPrisma.withdrawal.findUnique({
            where: { id: normalizedWithdrawalId },
            select: { userId: true, amount: true },
          })
          if (withdrawal) {
            const normalizedAmount = normalizeAdminFundNotificationAmount(withdrawal.amount)
            if (normalizedAmount === null) {
              logger.warn({ withdrawalId: normalizedWithdrawalId }, "POST /api/admin/withdrawals - skipped approved notification due to invalid amount")
            } else {
              await NotificationService.notifyWithdrawal(withdrawal.userId, "APPROVED", normalizedAmount)
            }
          }
        } catch (notifError) {
          logger.warn({ err: notifError }, "POST /api/admin/withdrawals - notification failed")
        }

        logger.info({ withdrawalId: normalizedWithdrawalId }, "POST /api/admin/withdrawals - approved")
        return NextResponse.json(result, { status: 200 })
      }

      if (normalizedAction === "reject") {
        if (!normalizedReason) {
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "Rejection reason required",
            statusCode: 400,
          })
        }

        const result = await adminFundService.rejectWithdrawal({
          withdrawalId: normalizedWithdrawalId,
          reason: normalizedReason,
          adminId: session.user.id!,
          adminName: session.user.name || "Admin",
          actorRole: role as any,
        })

        // Create notification for user (non-blocking)
        try {
          const withdrawal = await adminPrisma.withdrawal.findUnique({
            where: { id: normalizedWithdrawalId },
            select: { userId: true, amount: true },
          })
          if (withdrawal) {
            const normalizedAmount = normalizeAdminFundNotificationAmount(withdrawal.amount)
            if (normalizedAmount === null) {
              logger.warn({ withdrawalId: normalizedWithdrawalId }, "POST /api/admin/withdrawals - skipped rejected notification due to invalid amount")
            } else {
              await NotificationService.notifyWithdrawal(
                withdrawal.userId,
                "REJECTED",
                normalizedAmount,
                normalizedReason
              )
            }
          }
        } catch (notifError) {
          logger.warn({ err: notifError }, "POST /api/admin/withdrawals - notification failed")
        }

        logger.info({ withdrawalId: normalizedWithdrawalId }, "POST /api/admin/withdrawals - rejected")
        return NextResponse.json(result, { status: 200 })
      }

      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Invalid action. Use 'approve' or 'reject'",
        statusCode: 400,
      })
    }
  )
}