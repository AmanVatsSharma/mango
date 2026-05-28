/**
 * File: tests/admin/access-control-guard.test.ts
 * Module: admin-console
 * Purpose: Validate RBAC permission evaluation logic.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Focuses on `hasPermission` behavior.
 * - Uses PermissionKey literals for coverage.
 */

jest.mock("@/auth", () => ({
  auth: jest.fn(async () => null),
}))

jest.mock("@/lib/services/admin/AccessControlService", () => ({
  AccessControlService: {
    getConfig: jest.fn(async () => ({
      config: { roles: { ADMIN: [], MODERATOR: [], SUPER_ADMIN: [] } },
    })),
  },
}))

import { hasPermission } from "@/lib/rbac/admin-guard"
import type { PermissionKey } from "@/lib/rbac/permissions"

describe("hasPermission", () => {
  it("grants access when admin.all is present", () => {
    const permissions = new Set<PermissionKey>(["admin.all"])
    expect(hasPermission(permissions, "admin.super.financial.manage")).toBe(true)
  })

  it("requires all permissions by default", () => {
    const permissions = new Set<PermissionKey>(["admin.users.read", "admin.activity.read"])
    expect(hasPermission(permissions, ["admin.users.read", "admin.activity.read"])).toBe(true)
    expect(hasPermission(permissions, ["admin.users.read", "admin.funds.manage"])).toBe(false)
  })

  it("allows any permission when mode is any", () => {
    const permissions = new Set<PermissionKey>(["admin.users.read", "admin.activity.read"])
    expect(hasPermission(permissions, ["admin.users.read", "admin.funds.manage"], "any")).toBe(true)
    expect(hasPermission(permissions, ["admin.funds.manage", "admin.orders.manage"], "any")).toBe(false)
  })
})
