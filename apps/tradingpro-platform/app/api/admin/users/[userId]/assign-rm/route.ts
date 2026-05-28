/**
 * @file route.ts
 * @module admin-console
 * @description API route for assigning/unassigning Relationship Manager to users
 * @author StockTrade
 * @created 2025-01-27
 * @updated 2026-03-28
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"

/**
 * PATCH /api/admin/users/[userId]/assign-rm
 * Assign or unassign a Relationship Manager to a user
 */
export async function PATCH(
  req: Request,
  { params }: { params: { userId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/assign-rm`,
      required: "admin.users.rm",
      fallbackMessage: "Failed to assign RM",
    },
    async (ctx) => {
      const { userId } = params
      const body = await req.json()
      const { rmId } = body // null to unassign, or RM user ID to assign

      ctx.logger.debug({ userId, rmId }, "PATCH /api/admin/users/[userId]/assign-rm - request")

      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user) {
        throw new AppError({ code: "NOT_FOUND", message: "User not found", statusCode: 404 })
      }

      if (ctx.role === "MODERATOR") {
        if (rmId && rmId !== ctx.session.user.id) {
          throw new AppError({ code: "FORBIDDEN", message: "You can only assign yourself as RM", statusCode: 403 })
        }
      }

      if (rmId) {
        const rm = await prisma.user.findUnique({ where: { id: rmId } })
        if (!rm) {
          throw new AppError({ code: "NOT_FOUND", message: "Relationship Manager not found", statusCode: 404 })
        }
        if (rm.role !== "MODERATOR" && rm.role !== "ADMIN") {
          throw new AppError({
            code: "VALIDATION_ERROR",
            message: "Only Admin or Moderator can be a Relationship Manager",
            statusCode: 400,
          })
        }

        if (ctx.role === "ADMIN" && rm.role === "ADMIN") {
          if (rmId !== ctx.session.user.id) {
            throw new AppError({
              code: "FORBIDDEN",
              message: "You can only assign Moderators or yourself as RM",
              statusCode: 403,
            })
          }
        } else if (ctx.role === "ADMIN" && rm.role === "MODERATOR") {
          if (rm.managedById !== ctx.session.user.id) {
            throw new AppError({
              code: "FORBIDDEN",
              message: "You can only assign Moderators you manage as RM",
              statusCode: 403,
            })
          }
        }
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { managedById: rmId || null },
        include: {
          managedBy: {
            select: { id: true, name: true, email: true, phone: true, clientId: true },
          },
        },
      })

      if (rmId) {
        const resolverId = (ctx.session.user as { id: string }).id
        await prisma.rmAssignmentRequest.updateMany({
          where: { userId, status: "PENDING" },
          data: {
            status: "FULFILLED",
            resolvedAt: new Date(),
            resolvedById: resolverId,
            dismissReason: null,
          },
        })
      }

      ctx.logger.info({ userId, rmId }, "PATCH /api/admin/users/[userId]/assign-rm - success")

      return NextResponse.json({
        success: true,
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          managedById: updatedUser.managedById,
          managedBy: updatedUser.managedBy,
        },
      })
    }
  )
}
