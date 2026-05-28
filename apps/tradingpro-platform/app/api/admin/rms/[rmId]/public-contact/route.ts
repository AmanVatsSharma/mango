/**
 * @file route.ts
 * @module admin-console
 * @description PUT client-facing RM contact overrides (optional masks for account tab).
 * @author StockTrade
 * @created 2026-03-27
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Role } from "@prisma/client"
import { Prisma } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { assertCanEditRmPublicContact } from "@/lib/server/rm-public-contact-permissions"

function normalizeOptionalString(v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (typeof v !== "string") {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Public contact fields must be strings or null",
      statusCode: 400,
    })
  }
  const t = v.trim()
  return t.length ? t : null
}

/**
 * PUT /api/admin/rms/[rmId]/public-contact
 * Body: partial { displayName, email, phone, whatsappPhone, imageUrl } — omit to leave unchanged; null or "" clears override for that slot.
 */
export async function PUT(
  req: Request,
  { params }: { params: { rmId: string } }
) {
  return handleAdminApi(
    req,
    {
      route: `/api/admin/rms/${params.rmId}/public-contact`,
      required: "admin.users.rm",
      fallbackMessage: "Failed to update RM public contact",
    },
    async (ctx) => {
      const { rmId } = params
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>

      const rmUser = await prisma.user.findUnique({
        where: { id: rmId },
        select: { id: true, role: true, managedById: true, rmPublicContact: true },
      })
      if (!rmUser) {
        throw new AppError({ code: "NOT_FOUND", message: "User not found", statusCode: 404 })
      }

      assertCanEditRmPublicContact({
        actorRole: ctx.role as Role,
        actorUserId: ctx.session.user.id,
        rmUser,
      })

      const prevRaw = rmUser.rmPublicContact
      const prev: Record<string, string> =
        prevRaw !== null &&
        typeof prevRaw === "object" &&
        !Array.isArray(prevRaw)
          ? { ...(prevRaw as Record<string, string>) }
          : {}

      const keys = ["displayName", "email", "phone", "whatsappPhone", "imageUrl"] as const
      for (const k of keys) {
        if (!Object.prototype.hasOwnProperty.call(body, k)) continue
        const n = normalizeOptionalString(body[k])
        if (n === null) delete prev[k]
        else prev[k] = n
      }

      const rmPublicContactValue: Prisma.InputJsonValue | typeof Prisma.DbNull =
        Object.keys(prev).length === 0
          ? Prisma.DbNull
          : (prev as unknown as Prisma.InputJsonValue)

      const updated = await prisma.user.update({
        where: { id: rmId },
        data: { rmPublicContact: rmPublicContactValue },
        select: { id: true, rmPublicContact: true },
      })

      ctx.logger.info({ rmId }, "PUT /api/admin/rms/[rmId]/public-contact - success")

      return NextResponse.json({
        success: true,
        rmPublicContact: updated.rmPublicContact,
      })
    }
  )
}
