/**
 * @file admin-api.ts
 * @module rbac
 * @description Shared API helper for admin routes: requestId logging + RBAC guard + standardized error mapping.
 * @author StockTrade
 * @created 2026-02-02
 */

import { NextResponse } from "next/server"
import { withRequest } from "@/lib/observability/logger"
import { requireAdminPermissions } from "@/lib/rbac/admin-guard"
import { mapErrorToHttp } from "@/src/common/errors"
import type { PermissionKey, RoleKey } from "@/lib/rbac/permissions"

export type AdminApiHandlerContext = {
  req: Request
  session: any
  role: RoleKey
  permissions: Set<PermissionKey>
  logger: ReturnType<typeof withRequest>
}

export type AdminApiHandlerOptions = {
  route: string
  required: PermissionKey | PermissionKey[]
  mode?: "all" | "any"
  fallbackMessage?: string
}

const getIstTimestamp = () =>
  new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })

/**
 * Wrap a Next.js Route Handler with:
 * - requestId-aware structured logging
 * - RBAC enforcement via requireAdminPermissions
 * - standardized JSON errors via mapErrorToHttp
 */
export async function handleAdminApi(
  req: Request,
  options: AdminApiHandlerOptions,
  handler: (ctx: AdminApiHandlerContext) => Promise<NextResponse>
): Promise<NextResponse> {
  const logger = withRequest({
    requestId: req.headers.get("x-request-id") || undefined,
    route: options.route,
  })

  logger.debug({ timeIst: getIstTimestamp() }, "admin api - start")

  try {
    const authResult = await requireAdminPermissions(req, options.required, { mode: options.mode })
    if (!authResult.ok) return authResult.response

    const response = await handler({
      req,
      session: authResult.session,
      role: authResult.role,
      permissions: authResult.permissions,
      logger,
    })

    logger.debug({ timeIst: getIstTimestamp() }, "admin api - success")
    return response
  } catch (error: unknown) {
    logger.error({ timeIst: getIstTimestamp(), err: error }, "admin api - error")
    const requestId = req.headers.get("x-request-id") || undefined
    const mapped = mapErrorToHttp(error, options.fallbackMessage || "Internal Server Error")
    return NextResponse.json(
      { success: false, ...mapped.body, ...(requestId ? { requestId } : {}), message: mapped.body.error },
      { status: mapped.status },
    )
  }
}

