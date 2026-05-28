/**
 * @file admin-client-crm-scope.ts
 * @module server
 * @description Enforces book scope for client CRM APIs (notes/tasks): MODERATOR may only access assigned USER clients.
 * @author StockTrade
 * @created 2026-04-07
 */

import { prisma } from "@/lib/prisma"
import type { RoleKey } from "@/lib/rbac/permissions"
import { AppError } from "@/src/common/errors"
import { Role } from "@prisma/client"

export async function assertAdminCanManageClientCrm(input: {
  actorRole: RoleKey
  actorUserId: string
  targetUserId: string
}): Promise<void> {
  const { actorRole, actorUserId, targetUserId } = input

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, role: true, managedById: true },
  })

  if (!target) {
    throw new AppError({
      code: "NOT_FOUND",
      message: "User not found",
      statusCode: 404,
    })
  }

  if (target.role !== Role.USER) {
    throw new AppError({
      code: "FORBIDDEN",
      message: "CRM is only available for end-client users",
      statusCode: 403,
    })
  }

  if (actorRole === "MODERATOR") {
    if (target.managedById !== actorUserId) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "You can only manage CRM for users in your book",
        statusCode: 403,
      })
    }
    return
  }

  if (actorRole === "ADMIN" || actorRole === "SUPER_ADMIN") {
    return
  }

  throw new AppError({
    code: "FORBIDDEN",
    message: "Insufficient permissions for client CRM",
    statusCode: 403,
  })
}

/** Whether the actor may see manager-only coaching notes (and full radar). */
export function actorCanSeeManagerCrmNotes(actorRole: RoleKey): boolean {
  return actorRole === "ADMIN" || actorRole === "SUPER_ADMIN"
}
