/**
 * @file route.ts
 * @module api/admin/market-controls/user-override
 * @description CRUD for the per-user Market Control override layer. Admin-only.
 *              GET   — fetch current override row (or null)
 *              PUT   — upsert the row
 *              DELETE — remove the row
 *
 *              Every mutation writes an audit entry and publishes `market-control:config-changed`
 *              so other containers invalidate their caches immediately.
 * @author StockTrade
 * @created 2026-04-16
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { UserMarketControlOverrideRepository } from "@/lib/repositories/UserMarketControlOverrideRepository"
import { writeMarketControlAudit } from "@/lib/market-control/market-control-audit"
import { publishConfigChanged } from "@/lib/market-control/market-control-pubsub"

const ROUTE = "/api/admin/market-controls/user-override/[userId]"

const bodySchema = z.object({
  enabled: z.boolean().default(true),
  spreadMult: z.number().min(0).max(10).default(1.0),
  slipMult: z.number().min(0).max(10).default(1.0),
  antiScalpRelaxed: z.boolean().default(false),
  forceWorstFill: z.boolean().default(false),
  marginMultiplier: z.number().min(0.5).max(5).default(1.0),
  tiltBiasPct: z.number().min(-1).max(1).default(0),
  reason: z.string().max(240).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
})

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  return handleAdminApi(
    req,
    { route: ROUTE, required: "admin.users.read", fallbackMessage: "Failed to fetch user override" },
    async () => {
      const row = await UserMarketControlOverrideRepository.findByUserId(params.userId)
      return NextResponse.json({ success: true, data: row })
    },
  )
}

export async function PUT(req: Request, { params }: { params: { userId: string } }) {
  return handleAdminApi(
    req,
    { route: ROUTE, required: "admin.users.manage", fallbackMessage: "Failed to save user override" },
    async (ctx) => {
      const body = await req.json().catch(() => null)
      const parsed = bodySchema.safeParse(body)
      if (!parsed.success) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; "),
          statusCode: 400,
        })
      }

      const before = await UserMarketControlOverrideRepository.findByUserId(params.userId)
      const saved = await UserMarketControlOverrideRepository.upsert(params.userId, {
        enabled: parsed.data.enabled,
        spreadMult: parsed.data.spreadMult,
        slipMult: parsed.data.slipMult,
        antiScalpRelaxed: parsed.data.antiScalpRelaxed,
        forceWorstFill: parsed.data.forceWorstFill,
        marginMultiplier: parsed.data.marginMultiplier,
        tiltBiasPct: parsed.data.tiltBiasPct,
        reason: parsed.data.reason ?? null,
        setById: ctx.session?.user?.id ?? null,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      })

      await writeMarketControlAudit({
        actorId: ctx.session?.user?.id ?? null,
        action: "USER_MARKET_CONTROL_OVERRIDE_UPDATED",
        before,
        after: saved,
        summary: `userId=${params.userId}`,
      })
      await publishConfigChanged({ scope: "user-override", target: params.userId })

      return NextResponse.json({ success: true, data: saved })
    },
  )
}

export async function DELETE(req: Request, { params }: { params: { userId: string } }) {
  return handleAdminApi(
    req,
    { route: ROUTE, required: "admin.users.manage", fallbackMessage: "Failed to delete user override" },
    async (ctx) => {
      const before = await UserMarketControlOverrideRepository.findByUserId(params.userId)
      await UserMarketControlOverrideRepository.remove(params.userId)
      await writeMarketControlAudit({
        actorId: ctx.session?.user?.id ?? null,
        action: "USER_MARKET_CONTROL_OVERRIDE_DELETED",
        before,
        after: null,
        summary: `userId=${params.userId}`,
      })
      await publishConfigChanged({ scope: "user-override", target: params.userId })
      return NextResponse.json({ success: true })
    },
  )
}
