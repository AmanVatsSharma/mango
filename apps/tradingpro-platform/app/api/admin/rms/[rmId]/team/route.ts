/**
 * @file route.ts
 * @module admin-console
 * @description API route for fetching team members of a specific RM
 * @author StockTrade
 * @created 2025-01-27
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"

/**
 * Helper function to determine which roles a user can manage based on their role
 * ADMINs and MODERATORs can be RMs (can have users managed by them)
 */
function getManageableRoles(userRole: string): string[] {
  switch (userRole) {
    case 'SUPER_ADMIN':
      return ['ADMIN', 'MODERATOR', 'USER']
    case 'ADMIN':
      return ['MODERATOR', 'USER'] // ADMINs can manage MODERATORs and USERs
    case 'MODERATOR':
      return ['USER'] // MODERATORs can only manage USERs
    default:
      return []
  }
}

/**
 * GET /api/admin/rms/[rmId]/team
 * Get all users managed by a specific RM/Admin/Moderator (hierarchical)
 * - Shows users based on role hierarchy
 * - SUPER_ADMIN can see teams of ADMIN/MODERATOR/USER
 * - ADMIN can see teams of MODERATOR/USER they manage
 * - MODERATOR can see their own USER team
 */
export async function GET(
  req: Request,
  { params }: { params: { rmId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/rms/${params.rmId}/team`,
      required: "admin.users.rm",
      fallbackMessage: "Failed to fetch team members",
    },
    async (ctx) => {
      const rmId = params.rmId

      const rm = await prisma.user.findUnique({
        where: { id: rmId },
        select: { id: true, role: true, name: true, managedById: true },
      })

      if (!rm) {
        throw new AppError({ code: "NOT_FOUND", message: "User not found", statusCode: 404 })
      }

      // Authorization checks based on role hierarchy
      if (ctx.role === "MODERATOR") {
        if (ctx.session.user.id !== rmId) {
          throw new AppError({
            code: "FORBIDDEN",
            message: "Unauthorized: You can only view your own team",
            statusCode: 403,
          })
        }
      } else if (ctx.role === "ADMIN") {
        if (ctx.session.user.id !== rmId) {
          if (rm.managedById !== ctx.session.user.id) {
            if (rm.managedById) {
              const managedByUser = await prisma.user.findUnique({
                where: { id: rm.managedById },
                select: { id: true, role: true, managedById: true },
              })

              if (!managedByUser || managedByUser.managedById !== ctx.session.user.id) {
                throw new AppError({
                  code: "FORBIDDEN",
                  message: "Unauthorized: You can only view teams you manage",
                  statusCode: 403,
                })
              }
            } else {
              throw new AppError({
                code: "FORBIDDEN",
                message: "Unauthorized: You can only view teams you manage",
                statusCode: 403,
              })
            }
          }
        }
      }
      // SUPER_ADMIN can see any team (no additional check needed)

      const manageableRoles = getManageableRoles(rm.role)
      ctx.logger.debug({ rmId, targetRole: rm.role, manageableRoles }, "GET /api/admin/rms/[rmId]/team - scope")

      const members = await prisma.user.findMany({
        where: {
          managedById: rmId,
          role: { in: manageableRoles },
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          clientId: true,
          isActive: true,
          role: true,
          createdAt: true,
        },
        orderBy: [{ role: "asc" }, { createdAt: "desc" }],
      })

      ctx.logger.info({ rmId, count: members.length }, "GET /api/admin/rms/[rmId]/team - success")
      return NextResponse.json({
        rmId,
        rmName: rm.name,
        rmRole: rm.role,
        members,
        count: members.length,
      })
    }
  )
}
