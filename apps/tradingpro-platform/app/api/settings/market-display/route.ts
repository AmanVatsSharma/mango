/**
 * File:        app/api/settings/market-display/route.ts
 * Module:      api-settings · Market Display Config
 * Purpose:     Read (GET, any authenticated user) and write (PUT, admin only) for
 *              the global market_display_config_v1 SystemSettings JSON blob.
 *
 * Exports:
 *   - GET  /api/settings/market-display  — returns parsed MarketDisplayConfigV1; supports weak ETag
 *   - PUT  /api/settings/market-display  — admin-only upsert of full MarketDisplayConfigV1 blob
 *
 * Depends on:
 *   - @/lib/rbac/admin-api          — handleAdminApi for admin-scoped auth + error handling
 *   - @/lib/market-display/market-display-config.schema — schema, parser, type
 *   - @/lib/server/http-etag        — ETag helpers for GET caching
 *
 * Side-effects:
 *   - GET: read-only Prisma query
 *   - PUT: Prisma transaction (update existing row or create new); disables duplicate globals
 *
 * Key invariants:
 *   - ownerId = null identifies the global (platform-wide) setting row
 *   - PUT validates body through marketDisplayConfigV1Schema before persisting
 *   - Duplicate global rows for same key are soft-disabled in the same transaction
 *
 * Read order:
 *   1. GET — read path with ETag
 *   2. PUT — admin write path with validation + upsert
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { withRequest } from "@/lib/observability/logger"
import { AppError, mapErrorToHttp } from "@/src/common/errors"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import {
  parseMarketDisplayConfigJson,
  marketDisplayConfigV1Schema,
  type MarketDisplayConfigV1,
} from "@/lib/market-display/market-display-config.schema"
import { normalizeEtag, normalizeIfNoneMatch, weakEtagFromPayload } from "@/lib/server/http-etag"
import { handleAdminApi } from "@/lib/rbac/admin-api"

const ROUTE = "/api/settings/market-display"

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

    const row = await prisma.systemSettings.findFirst({
      where: {
        isActive: true,
        ownerId: null,
        key: ADMIN_SETTING_KEYS.MARKET_DISPLAY_CONFIG_V1,
      },
      orderBy: { updatedAt: "desc" },
      select: { value: true, updatedAt: true },
    })

    const data: MarketDisplayConfigV1 = parseMarketDisplayConfigJson(row?.value ?? null)
    const updatedAt = row?.updatedAt?.toISOString() ?? null

    const bodyPayload = JSON.stringify({
      success: true,
      data,
      updatedAt,
    })
    const etag = weakEtagFromPayload(bodyPayload)
    const clientEtag = normalizeIfNoneMatch(req.headers.get("if-none-match"))
    if (clientEtag && clientEtag === normalizeEtag(etag)) {
      const notModified = new NextResponse(null, { status: 304 })
      notModified.headers.set("ETag", etag)
      notModified.headers.set("Cache-Control", "no-store")
      if (updatedAt) {
        notModified.headers.set("Last-Modified", new Date(updatedAt).toUTCString())
      }
      logger.info({ version: data.version, notModified: true }, "market-display settings - 304")
      return notModified
    }

    const res = NextResponse.json(
      {
        success: true,
        data,
        updatedAt,
      },
      { status: 200 },
    )
    res.headers.set("Cache-Control", "no-store")
    res.headers.set("ETag", etag)
    if (updatedAt) {
      res.headers.set("Last-Modified", new Date(updatedAt).toUTCString())
    }
    logger.info({ version: data.version }, "market-display settings - success")
    return res
  } catch (error: unknown) {
    logger.error({ err: error }, "market-display settings - error")
    const mapped = mapErrorToHttp(error, "Failed to fetch market display settings")
    const res = NextResponse.json({ success: false, ...mapped.body }, { status: mapped.status })
    res.headers.set("Cache-Control", "no-store")
    return res
  }
}

export async function PUT(req: Request) {
  return handleAdminApi(
    req,
    {
      route: `${ROUTE} PUT`,
      required: "admin.settings.manage",
      fallbackMessage: "Failed to save market display config",
    },
    async (ctx) => {
      const body: unknown = await req.json()
      const result = marketDisplayConfigV1Schema.safeParse(body)
      if (!result.success) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid market_display_config_v1 payload",
          statusCode: 400,
        })
      }

      const serialized = JSON.stringify(result.data)

      const setting = await prisma.$transaction(async (tx) => {
        const existing = await tx.systemSettings.findFirst({
          where: { key: ADMIN_SETTING_KEYS.MARKET_DISPLAY_CONFIG_V1, ownerId: null },
          orderBy: { updatedAt: "desc" },
        })

        if (existing) {
          const updated = await tx.systemSettings.update({
            where: { id: existing.id },
            data: { value: serialized, category: "MARKET", updatedAt: new Date() },
          })
          await tx.systemSettings.updateMany({
            where: {
              key: ADMIN_SETTING_KEYS.MARKET_DISPLAY_CONFIG_V1,
              ownerId: null,
              id: { not: existing.id },
            },
            data: { isActive: false, updatedAt: new Date() },
          })
          return updated
        }

        return tx.systemSettings.create({
          data: {
            key: ADMIN_SETTING_KEYS.MARKET_DISPLAY_CONFIG_V1,
            value: serialized,
            category: "MARKET",
            isActive: true,
          },
        })
      })

      ctx.logger.info({ id: setting.id }, "market-display settings PUT - saved")
      const res = NextResponse.json({ success: true, updatedAt: setting.updatedAt.toISOString() }, { status: 200 })
      res.headers.set("Cache-Control", "no-store")
      return res
    },
  )
}
