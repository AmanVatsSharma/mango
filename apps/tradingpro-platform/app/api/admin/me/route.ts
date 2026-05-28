/**
 * @file route.ts
 * @module admin-console
 * @description Admin profile endpoint for the current authenticated admin (user + permissions)
 * @author StockTrade
 * @created 2026-01-25
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminPermissions } from "@/lib/rbac/admin-guard"
import { withRequest } from "@/lib/observability/logger"
import { AppError, mapErrorToHttp } from "@/src/common/errors"

const getIstTimestamp = () =>
  new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  })

/**
 * GET - Get current admin user
 */
export async function GET(req: NextRequest) {
  const logger = withRequest({
    requestId: req.headers.get("x-request-id") || undefined,
    route: "/api/admin/me",
  })

  logger.debug({ timeIst: getIstTimestamp() }, "GET admin me - start")

  try {
    const authResult = await requireAdminPermissions(req, "admin.profile.read")
    if (!authResult.ok) return authResult.response
    const session = authResult.session

    logger.debug(
      { timeIst: getIstTimestamp(), actorId: session?.user?.id },
      "GET admin me - authenticated"
    )

    // Get full user details from database
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        clientId: true
      }
    })

    if (!user) {
      throw new AppError({
        code: "ADMIN_USER_NOT_FOUND",
        message: "User not found",
        statusCode: 404,
        details: { userId: session.user.id },
      })
    }

    logger.debug({ timeIst: getIstTimestamp() }, "GET admin me - success")

    return NextResponse.json(
      {
        success: true,
        user,
        permissions: Array.from(authResult.permissions),
      },
      { status: 200 }
    )

  } catch (error: any) {
    logger.error({ timeIst: getIstTimestamp(), err: error }, "GET admin me - error")
    const mapped = mapErrorToHttp(error, "Failed to fetch user")
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}

/**
 * PATCH - Update current admin user
 */
export async function PATCH(req: NextRequest) {
  const logger = withRequest({
    requestId: req.headers.get("x-request-id") || undefined,
    route: "/api/admin/me",
  })

  logger.debug({ timeIst: getIstTimestamp() }, "PATCH admin me - start")

  try {
    const authResult = await requireAdminPermissions(req, "admin.profile.manage")
    if (!authResult.ok) return authResult.response
    const session = authResult.session

    logger.debug(
      { timeIst: getIstTimestamp(), actorId: session?.user?.id },
      "PATCH admin me - authenticated"
    )

    const body = await req.json()
    const { name, phone, image } = body

    logger.debug(
      { timeIst: getIstTimestamp(), hasName: name !== undefined, hasPhone: phone !== undefined, hasImage: image !== undefined },
      "PATCH admin me - payload"
    )

    // Build update data
    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (phone !== undefined) updateData.phone = phone
    if (image !== undefined) updateData.image = image

    if (Object.keys(updateData).length === 0) {
      throw new AppError({
        code: "ADMIN_PROFILE_NO_FIELDS",
        message: "No fields provided to update",
        statusCode: 400,
      })
    }

    // Update user
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        clientId: true
      }
    })

    logger.debug({ timeIst: getIstTimestamp() }, "PATCH admin me - success")

    return NextResponse.json({
      success: true,
      user,
      message: "Profile updated successfully"
    }, { status: 200 })

  } catch (error: any) {
    logger.error({ timeIst: getIstTimestamp(), err: error }, "PATCH admin me - error")
    const mapped = mapErrorToHttp(error, "Failed to update profile")
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
}