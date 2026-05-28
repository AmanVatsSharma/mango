/**
 * File: lib/services/notifications/notification-targeting.ts
 * Module: notifications
 * Purpose: Shared helpers for notification targeting visibility logic.
 * Author: StockTrade
 * Last-updated: 2026-01-20
 * Notes:
 * - Centralizes target visibility checks for API and tests.
 * - Keep helpers pure and side-effect free.
 */

export type NotificationTarget = "ALL" | "USERS" | "ADMINS" | "SPECIFIC"

export const ADMIN_ROLES = new Set<string>(["ADMIN", "MODERATOR", "SUPER_ADMIN"])

export const canIncludeAdminTargets = (
  userRole: string,
  includeAdminTargets: boolean
): boolean => includeAdminTargets && ADMIN_ROLES.has(userRole)

export const buildTargetConditions = (
  userId: string,
  allowAdminTargets: boolean
) => {
  const conditions = [
    { target: "ALL" },
    { target: "USERS" },
    {
      AND: [
        { target: "SPECIFIC" },
        { targetUserIds: { has: userId } }
      ]
    }
  ]

  if (allowAdminTargets) {
    conditions.push({ target: "ADMINS" })
  }

  return conditions
}

export const isNotificationVisibleToUser = (params: {
  target: string
  targetUserIds: string[]
  userId: string
  allowAdminTargets: boolean
}): boolean => {
  const { target, targetUserIds, userId, allowAdminTargets } = params

  if (target === "ALL") return true
  if (target === "USERS") return true
  if (target === "ADMINS") return allowAdminTargets
  if (target === "SPECIFIC") {
    return Array.isArray(targetUserIds) && targetUserIds.includes(userId)
  }

  return false
}
