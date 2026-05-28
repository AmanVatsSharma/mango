/**
 * File: app/api/admin/access-control/route.ts
 * Module: admin-console
 * Purpose: Manage RBAC role permissions for the admin console.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - GET returns the permission catalog and current role mapping.
 * - Start with `GET` to understand payload shape.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAdminPermissions } from "@/lib/rbac/admin-guard"
import { AccessControlService } from "@/lib/services/admin/AccessControlService"
import { DEFAULT_ROLE_PERMISSIONS, RESTRICTED_PERMISSIONS } from "@/lib/rbac/permissions"
import { AppError, mapErrorToHttp } from "@/src/common/errors"
import { withRequest } from "@/lib/observability/logger"

const getIstTimestamp = () =>
  new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const logger = withRequest({
    requestId: req.headers.get("x-request-id") || undefined,
    route: "/api/admin/access-control",
  })

  logger.debug({ timeIst: getIstTimestamp() }, "GET access control - start")

  try {
    const authResult = await requireAdminPermissions(req, "admin.access-control.view")
    if (!authResult.ok) return authResult.response

    const { config, source, defaults } = await AccessControlService.getConfig()
    const permissions = AccessControlService.listPermissions()

    logger.debug({ timeIst: getIstTimestamp(), source }, "GET access control - success")
    return NextResponse.json(
      {
        success: true,
        config,
        source,
        defaults,
        permissions,
        restrictedPermissions: RESTRICTED_PERMISSIONS,
        currentRole: authResult.role,
        currentPermissions: Array.from(authResult.permissions),
        canManage:
          authResult.permissions.has("admin.access-control.manage") ||
          authResult.permissions.has("admin.all"),
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    logger.error({ timeIst: getIstTimestamp(), err: error }, "GET access control - error")
    const mapped = mapErrorToHttp(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

export async function PUT(req: NextRequest) {
  const logger = withRequest({
    requestId: req.headers.get("x-request-id") || undefined,
    route: "/api/admin/access-control",
  })

  logger.debug({ timeIst: getIstTimestamp() }, "PUT access control - start")

  try {
    const authResult = await requireAdminPermissions(req, "admin.access-control.manage")
    if (!authResult.ok) return authResult.response

    const body = await req.json()
    const roles = body?.resetToDefault ? DEFAULT_ROLE_PERMISSIONS : body?.roles

    if (!roles) {
      throw new AppError({
        code: "RBAC_ROLES_REQUIRED",
        message: "roles payload is required",
        statusCode: 400,
      })
    }

    const actor = {
      id: authResult.session?.user?.id,
      name: authResult.session?.user?.name ?? null,
      email: authResult.session?.user?.email ?? null,
    }

    const config = await AccessControlService.updateConfig(roles, actor)
    logger.debug({ timeIst: getIstTimestamp() }, "PUT access control - success")
    return NextResponse.json({ success: true, config }, { status: 200 })
  } catch (error: unknown) {
    logger.error({ timeIst: getIstTimestamp(), err: error }, "PUT access control - error")
    const mapped = mapErrorToHttp(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

