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
      route: "/api/admin/deposits",
      required: "admin.deposits.manage",
      fallbackMessage: "Failed to fetch deposits",
    },
    async ({ session, role, logger }) => {
      logger.debug({ role }, "GET /api/admin/deposits - start")

      const adminFundService = createAdminFundService()
      // Scope by RM for admins and moderators; super admin sees all
      const managedByIdFilter =
        role === "SUPER_ADMIN"
          ? undefined
          : role === "ADMIN"
            ? session.user.id!
            : (session.user as any).managedById || undefined
      const deposits = await adminFundService.getPendingDeposits(managedByIdFilter)

      logger.info({ count: deposits.length }, "GET /api/admin/deposits - success")
      return NextResponse.json({ success: true, deposits }, { status: 200 })
    }
  )
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/deposits",
      required: "admin.deposits.manage",
      fallbackMessage: "Failed to process deposit",
    },
    async ({ session, role, logger }) => {
      const body = await req.json()
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Invalid request body", statusCode: 400 })
      }
      const { depositId, action, reason } = body
      const normalizedDepositId = normalizeAdminFundIdentifier(depositId)
      const normalizedAction = normalizeAdminFundActionToken(action)
      const normalizedReason = normalizeAdminFundReason(reason)

      logger.debug({ depositId: normalizedDepositId, action: normalizedAction }, "POST /api/admin/deposits - request")

      if (!normalizedDepositId || !normalizedAction) {
        throw new AppError({ code: "VALIDATION_ERROR", message: "Missing required fields", statusCode: 400 })
      }

      const adminFundService = createAdminFundService()

      if (normalizedAction === "approve") {
        const result = await adminFundService.approveDeposit({
          depositId: normalizedDepositId,
          adminId: session.user.id!,
          adminName: session.user.name || "Admin",
          actorRole: role as any,
        })

        // Create notification for user (non-blocking)
        try {
          const deposit = await adminPrisma.deposit.findUnique({
            where: { id: normalizedDepositId },
            select: { userId: true, amount: true },
          })
          if (deposit) {
            const normalizedAmount = normalizeAdminFundNotificationAmount(deposit.amount)
            if (normalizedAmount !== null) {
              await NotificationService.notifyDeposit(deposit.userId, "APPROVED", normalizedAmount)
            } else {
              logger.warn({ depositId: normalizedDepositId }, "POST /api/admin/deposits - skipped approved notification due to invalid amount")
            }
          }
        } catch (notifError) {
          logger.warn({ err: notifError }, "POST /api/admin/deposits - notification failed")
        }

        logger.info({ depositId: normalizedDepositId }, "POST /api/admin/deposits - approved")
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

        const result = await adminFundService.rejectDeposit({
          depositId: normalizedDepositId,
          reason: normalizedReason,
          adminId: session.user.id!,
          adminName: session.user.name || "Admin",
        })

        // Create notification for user (non-blocking)
        try {
          const deposit = await adminPrisma.deposit.findUnique({
            where: { id: normalizedDepositId },
            select: { userId: true, amount: true },
          })
          if (deposit) {
            const normalizedAmount = normalizeAdminFundNotificationAmount(deposit.amount)
            if (normalizedAmount !== null) {
              await NotificationService.notifyDeposit(deposit.userId, "REJECTED", normalizedAmount, normalizedReason)
            } else {
              logger.warn({ depositId: normalizedDepositId }, "POST /api/admin/deposits - skipped rejected notification due to invalid amount")
            }
          }
        } catch (notifError) {
          logger.warn({ err: notifError }, "POST /api/admin/deposits - notification failed")
        }

        logger.info({ depositId: normalizedDepositId }, "POST /api/admin/deposits - rejected")
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