/**
 * @file route.ts
 * @module admin-console
 * @description Update RM assignment request status (dismiss / manual fulfill).
 * @author StockTrade
 * @created 2026-03-28
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"

type PatchBody = {
  status?: string
  dismissReason?: string | null
}

/**
 * PATCH /api/admin/rm-assignment-requests/[id]
 * Body: { status: "DISMISSED" | "FULFILLED", dismissReason?: string }
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/rm-assignment-requests/${params.id}`,
      required: "admin.users.rm",
      fallbackMessage: "Failed to update RM assignment request",
    },
    async (ctx) => {
      const { id } = params
      const body = (await req.json().catch(() => ({}))) as PatchBody
      const nextStatus = typeof body.status === "string" ? body.status.toUpperCase() : ""

      if (nextStatus !== "DISMISSED" && nextStatus !== "FULFILLED") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: 'Invalid status; use "DISMISSED" or "FULFILLED"',
          statusCode: 400,
        })
      }

      const row = await prisma.rmAssignmentRequest.findUnique({
        where: { id },
        select: { id: true, status: true, userId: true },
      })

      if (!row) {
        throw new AppError({ code: "NOT_FOUND", message: "Request not found", statusCode: 404 })
      }

      if (row.status !== "PENDING") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Only pending requests can be updated",
          statusCode: 400,
        })
      }

      const adminId = (ctx.session.user as { id: string }).id
      const dismissReason =
        typeof body.dismissReason === "string" ? body.dismissReason.trim().slice(0, 2000) : null

      const updated = await prisma.rmAssignmentRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          resolvedAt: new Date(),
          resolvedById: adminId,
          ...(nextStatus === "DISMISSED"
            ? { dismissReason: dismissReason || null }
            : { dismissReason: null }),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              clientId: true,
            },
          },
        },
      })

      ctx.logger.info({ requestId: id, nextStatus, userId: row.userId }, "PATCH rm-assignment-request - success")

      return NextResponse.json({
        success: true,
        request: {
          id: updated.id,
          userId: updated.userId,
          status: updated.status,
          dismissReason: updated.dismissReason,
          resolvedAt: updated.resolvedAt,
          user: updated.user,
        },
      })
    },
  )
}
