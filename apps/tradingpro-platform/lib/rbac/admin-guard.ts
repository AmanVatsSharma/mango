/**
 * File: lib/rbac/admin-guard.ts
 * Module: rbac
 * Purpose: Enforce admin permissions for API routes.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Uses AccessControlService for role-permission resolution.
 * - Start with `requireAdminPermissions` for request flow.
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { AccessControlService } from "@/lib/services/admin/AccessControlService"
import type { PermissionKey, RoleKey } from "@/lib/rbac/permissions"

type AdminAuthSuccess = {
  ok: true
  session: any
  role: RoleKey
  permissions: Set<PermissionKey>
}

type AdminAuthFailure = {
  ok: false
  response: NextResponse
}

type RequireOptions = {
  mode?: "all" | "any"
}

const ADMIN_ROLES: RoleKey[] = ["ADMIN", "MODERATOR", "SUPER_ADMIN"]

const toPermissionList = (required: PermissionKey | PermissionKey[]) =>
  Array.isArray(required) ? required : [required]

// Shared permission check with admin.all short-circuit.
const hasPermission = (
  permissions: Set<PermissionKey>,
  required: PermissionKey | PermissionKey[],
  mode: "all" | "any" = "all"
) => {
  if (permissions.has("admin.all")) return true
  const list = toPermissionList(required)
  if (list.length === 0) return true
  return mode === "any"
    ? list.some((permission) => permissions.has(permission))
    : list.every((permission) => permissions.has(permission))
}

const deny = (status: number, message: string): AdminAuthFailure => ({
  ok: false,
  response: NextResponse.json({ error: message }, { status }),
})

const resolveRolePermissions = async (role: RoleKey): Promise<Set<PermissionKey>> => {
  const { config } = await AccessControlService.getConfig()
  return new Set(config.roles[role] || [])
}

export const requireAdminPermissions = async (
  req: Request,
  required: PermissionKey | PermissionKey[],
  options: RequireOptions = {}
): Promise<AdminAuthSuccess | AdminAuthFailure> => {
  const session = await auth()
  if (!session?.user) return deny(401, "Unauthorized")

  const role = (session.user as any).role as RoleKey | undefined
  if (!role || !ADMIN_ROLES.includes(role)) {
    return deny(403, "Forbidden")
  }

  const permissions = await resolveRolePermissions(role)
  if (!hasPermission(permissions, required, options.mode)) {
    return deny(403, "Forbidden")
  }

  return { ok: true, session, role, permissions }
}

export { hasPermission }

