/**
 * File: lib/rbac/index.ts
 * Module: rbac
 * Purpose: Re-export RBAC utilities and types.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Start with `permissions.ts` for catalog definitions.
 * - Re-exported types keep imports consistent.
 */

export { requireAdminPermissions, hasPermission } from "@/lib/rbac/admin-guard"
export { handleAdminApi } from "@/lib/rbac/admin-api"
export {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  RESTRICTED_PERMISSIONS,
  ROLE_KEYS,
} from "@/lib/rbac/permissions"
export type { PermissionDefinition, PermissionKey, PermissionRisk, RoleKey } from "@/lib/rbac/permissions"
