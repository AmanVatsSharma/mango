/**
 * File: app/api/admin/users/[userId]/statement-override/route.ts
 * Module: admin-console
 * Purpose: Manage per-user statements visibility override (tri-state).
 * Author: StockTrade
 * Last-updated: 2026-02-03
 * Notes:
 * - Tri-state model:
 *   - Default: no active override row
 *   - ForceEnable: value=force_enable
 *   - ForceDisable: value=force_disable
 * - Stored in SystemSettings(ownerId=userId, key=console_statements_enabled_override)
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { prisma } from "@/lib/prisma"
import { AppError } from "@/src/common/errors"
import {
  CONSOLE_STATEMENTS_OVERRIDE_KEY,
  CONSOLE_STATEMENTS_SETTINGS_CATEGORY,
  invalidateConsoleStatementsCache,
} from "@/lib/server/console-statements"

type OverrideMode = "default" | "force_enable" | "force_disable"

function normalizeMode(v: any): OverrideMode | null {
  if (v === "default" || v === "force_enable" || v === "force_disable") return v
  return null
}

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/statement-override`,
      required: "admin.users.read",
      fallbackMessage: "Failed to fetch statement override",
    },
    async (ctx) => {
      const userId = params.userId
      ctx.logger.debug({ userId }, "GET /api/admin/users/[userId]/statement-override - request")

      const existing = await prisma.systemSettings.findFirst({
        where: {
          ownerId: userId,
          key: CONSOLE_STATEMENTS_OVERRIDE_KEY,
          isActive: true,
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, value: true },
      })

      const mode: OverrideMode = existing?.value === "force_enable" || existing?.value === "force_disable" ? existing.value : "default"

      ctx.logger.info({ userId, mode }, "GET /api/admin/users/[userId]/statement-override - success")

      return NextResponse.json(
        {
          success: true,
          userId,
          mode,
        },
        { status: 200 }
      )
    }
  )
}

export async function PUT(req: Request, { params }: { params: { userId: string } }) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/users/${params.userId}/statement-override`,
      required: "admin.users.manage",
      fallbackMessage: "Failed to update statement override",
    },
    async (ctx) => {
      const userId = params.userId
      const body = await req.json().catch(() => ({}))
      const mode = normalizeMode(body?.mode)

      ctx.logger.debug({ userId, mode }, "PUT /api/admin/users/[userId]/statement-override - request")

      if (!mode) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid mode. Expected one of: default, force_enable, force_disable",
          statusCode: 400,
        })
      }

      // Ensure target user exists (avoid creating orphan ownerId rows)
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
      if (!user) {
        throw new AppError({
          code: "USER_NOT_FOUND",
          message: "User not found",
          statusCode: 404,
        })
      }

      await prisma.$transaction(async (tx) => {
        const latest = await tx.systemSettings.findFirst({
          where: { ownerId: userId, key: CONSOLE_STATEMENTS_OVERRIDE_KEY },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        })

        if (mode === "default") {
          // Remove override by soft-disabling all rows for this key/user
          await tx.systemSettings.updateMany({
            where: { ownerId: userId, key: CONSOLE_STATEMENTS_OVERRIDE_KEY, isActive: true },
            data: { isActive: false, updatedAt: new Date() },
          })
          return
        }

        if (latest?.id) {
          await tx.systemSettings.update({
            where: { id: latest.id },
            data: {
              value: mode,
              category: CONSOLE_STATEMENTS_SETTINGS_CATEGORY,
              isActive: true,
              updatedAt: new Date(),
            },
          })

          // Soft-disable accidental duplicates
          await tx.systemSettings.updateMany({
            where: { ownerId: userId, key: CONSOLE_STATEMENTS_OVERRIDE_KEY, id: { not: latest.id } },
            data: { isActive: false, updatedAt: new Date() },
          })
          return
        }

        await tx.systemSettings.create({
          data: {
            ownerId: userId,
            key: CONSOLE_STATEMENTS_OVERRIDE_KEY,
            value: mode,
            category: CONSOLE_STATEMENTS_SETTINGS_CATEGORY,
            isActive: true,
            description: "Per-user statements visibility override (force_enable/force_disable)",
          },
        })
      })

      invalidateConsoleStatementsCache()

      ctx.logger.info({ userId, mode }, "PUT /api/admin/users/[userId]/statement-override - success")
      return NextResponse.json({ success: true, userId, mode }, { status: 200 })
    }
  )
}

