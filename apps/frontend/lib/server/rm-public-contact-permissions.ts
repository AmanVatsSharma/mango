/**
 * @file rm-public-contact-permissions.ts
 * @module server
 * @description Who may edit an RM's client-facing public contact — mirrors assign-rm hierarchy rules.
 * @author StockTrade
 * @created 2026-03-27
 */

import type { Role } from "@prisma/client"
import { AppError } from "@/src/common/errors"

export function assertCanEditRmPublicContact(input: {
  actorRole: Role
  actorUserId: string
  rmUser: { id: string; role: Role; managedById: string | null }
}): void {
  const { actorRole, actorUserId, rmUser } = input

  if (rmUser.role !== "MODERATOR" && rmUser.role !== "ADMIN") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Only Admin or Moderator records can have RM public contact overrides",
      statusCode: 400,
    })
  }

  if (actorRole === "MODERATOR") {
    if (rmUser.id !== actorUserId) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "You can only edit your own client-facing contact",
        statusCode: 403,
      })
    }
    return
  }

  if (actorRole === "ADMIN") {
    if (rmUser.id === actorUserId) return
    if (rmUser.role === "MODERATOR" && rmUser.managedById === actorUserId) return
    throw new AppError({
      code: "FORBIDDEN",
      message: "You can only edit your own contact or moderators you manage",
      statusCode: 403,
    })
  }

  if (actorRole === "SUPER_ADMIN") {
    return
  }

  throw new AppError({
    code: "FORBIDDEN",
    message: "Insufficient permissions to edit RM public contact",
    statusCode: 403,
  })
}
