/**
 * @file route.ts
 * @module api/admin/market-controls/config
 * @description Read and update the unified MARKET_CONTROL_CONFIG_V1 — the full admin super-controls
 *              blob covering per-segment/symbol/user-group spread + slippage, anti-scalping,
 *              order behaviour, price tilt and kill switches.
 *              GET is allowed for any authenticated user (the order sheet + watchlist preview
 *              endpoint need a read-only view). PUT is admin-only via handleAdminApi.
 * @author StockTrade
 * @created 2026-04-15
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError, mapErrorToHttp } from "@/src/common/errors"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import {
  parseMarketControlConfigJson,
  marketControlConfigV1Schema,
  type MarketControlConfigV1,
} from "@/lib/market-control/market-control-config.schema"
import { invalidateMarketControlConfigCache } from "@/lib/market-control/market-control-loader"
import { writeMarketControlAudit } from "@/lib/market-control/market-control-audit"
import { publishConfigChanged } from "@/lib/market-control/market-control-pubsub"
import { ensureLegacySegmentsExist } from "@/lib/market-control/legacy-segments"
import { withRequest } from "@/lib/observability/logger"

const ROUTE = "/api/admin/market-controls/config"

async function readRawConfig(): Promise<{ data: MarketControlConfigV1; updatedAt: Date | null }> {
  const primary = await prisma.systemSettings.findFirst({
    where: { key: ADMIN_SETTING_KEYS.MARKET_CONTROL_CONFIG_V1, ownerId: null },
    orderBy: { updatedAt: "desc" },
    select: { value: true, updatedAt: true },
  })
  if (primary?.value) {
    try {
      return {
        data: parseMarketControlConfigJson(JSON.parse(primary.value)),
        updatedAt: primary.updatedAt ?? null,
      }
    } catch {
      // fall through to legacy
    }
  }

  // Legacy fallback: upgrade BID_ASK_SPREAD_CONFIG_V1 into the new shape.
  const legacy = await prisma.systemSettings.findFirst({
    where: { key: ADMIN_SETTING_KEYS.BID_ASK_SPREAD_CONFIG_V1, ownerId: null },
    orderBy: { updatedAt: "desc" },
    select: { value: true, updatedAt: true },
  })
  return {
    data: parseMarketControlConfigJson(legacy?.value ? JSON.parse(legacy.value) : null),
    updatedAt: legacy?.updatedAt ?? null,
  }
}

/** GET — available to all authenticated users. */
export async function GET(req: Request) {
  const logger = withRequest({
    requestId: req.headers.get("x-request-id") || undefined,
    ip: req.headers.get("x-forwarded-for"),
    route: ROUTE,
  })

  try {
    const session = await auth()
    if (!session?.user?.id) {
      throw new AppError({ code: "UNAUTHORIZED", message: "Unauthorized", statusCode: 401 })
    }

    const { data, updatedAt } = await readRawConfig()

    const res = NextResponse.json(
      { success: true, data, updatedAt: updatedAt?.toISOString() ?? null },
      { status: 200 },
    )
    res.headers.set("Cache-Control", "no-store")
    logger.info({}, "market-control config GET - success")
    return res
  } catch (error: unknown) {
    logger.error({ err: error }, "market-control config GET - error")
    const mapped = mapErrorToHttp(error, "Failed to fetch market-control config")
    const res = NextResponse.json({ success: false, ...mapped.body }, { status: mapped.status })
    res.headers.set("Cache-Control", "no-store")
    return res
  }
}

/** PUT — admin-only; replaces the full market-control config. */
export async function PUT(req: Request) {
  return handleAdminApi(
    req,
    {
      route: ROUTE,
      required: "admin.settings.manage",
      fallbackMessage: "Failed to save market-control config",
    },
    async ({ session: adminSession }) => {
      const body = await req.json().catch(() => null)
      const parsed = marketControlConfigV1Schema.safeParse(body)
      if (!parsed.success) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: `Invalid market-control config: ${parsed.error.issues
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ")}`,
          statusCode: 400,
        })
      }
      const config = parsed.data
      const value = JSON.stringify(config)

      // Read current for audit before we mutate.
      const beforeData = (await readRawConfig()).data

      const saved = await prisma.$transaction(async (tx) => {
        const existing = await tx.systemSettings.findFirst({
          where: { key: ADMIN_SETTING_KEYS.MARKET_CONTROL_CONFIG_V1, ownerId: null },
          orderBy: { updatedAt: "desc" },
        })
        if (existing) {
          await tx.systemSettings.updateMany({
            where: {
              key: ADMIN_SETTING_KEYS.MARKET_CONTROL_CONFIG_V1,
              ownerId: null,
              id: { not: existing.id },
            },
            data: { isActive: false, updatedAt: new Date() },
          })
          return tx.systemSettings.update({
            where: { id: existing.id },
            data: {
              value,
              description: "Market control super-config (v1)",
              updatedAt: new Date(),
            },
          })
        }
        return tx.systemSettings.create({
          data: {
            key: ADMIN_SETTING_KEYS.MARKET_CONTROL_CONFIG_V1,
            value,
            description: "Market control super-config (v1)",
          },
        })
      })

      invalidateMarketControlConfigCache()

      // Fire-and-forget: audit + pubsub + legacy segment backfill.
      const actorId = (adminSession as { user?: { id?: string } })?.user?.id ?? null
      await writeMarketControlAudit({
        actorId,
        action: "MARKET_CONTROL_CONFIG_UPDATED",
        before: beforeData,
        after: config,
      })
      await publishConfigChanged({ scope: "config" })
      // Auto-create legacy UserSegment rows the first time an admin saves — idempotent.
      ensureLegacySegmentsExist(actorId).catch(() => {
        // best-effort
      })

      return NextResponse.json({
        success: true,
        data: config,
        updatedAt: saved.updatedAt,
      })
    },
  )
}
