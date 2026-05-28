/**
 * @file route.ts
 * @module api/admin/market-data/catalog
 * @description Admin-only read/write of MARKET_CATALOG_V1 — the raw curated catalog (NOT the
 *              resolved tree; admins edit recipes, not expansions). Mirror of the
 *              /api/admin/market-controls/config pattern: GET returns raw + meta, PUT
 *              validates with Zod, persists in a transaction, invalidates cache, audits, and
 *              fires the cross-container pubsub.
 *
 * Exports:
 *   - GET — { success, data: MarketCatalogV1, updatedAt }
 *   - PUT — body = MarketCatalogV1; returns { success, data, updatedAt }
 *
 * Side-effects:
 *   - SystemSettings read/write via Prisma transaction.
 *   - Cache invalidation (loader + resolver) on write.
 *   - Audit row insert (best-effort).
 *   - Redis pubsub on write (no-op if Redis disabled).
 *
 * Key invariants:
 *   - PUT always replaces the catalog wholesale — partial patches not supported. Frontend
 *     must round-trip the entire blob.
 *   - Permission required: admin.settings.manage.
 *
 * @author        BharatERP
 * @created       2026-05-01
 */

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { ADMIN_SETTING_KEYS, ADMIN_SETTING_CATEGORIES } from "@/lib/constants/admin-settings"
import {
  marketCatalogV1Schema,
  parseMarketCatalogJson,
  type MarketCatalogV1,
} from "@/lib/market-catalog/catalog-schema"
import { invalidateMarketCatalogCache } from "@/lib/market-catalog/market-catalog-loader"
import { invalidateResolveCatalogCache } from "@/lib/market-catalog/resolve-catalog"
import { writeMarketCatalogAudit } from "@/lib/market-catalog/market-catalog-audit"
import { publishCatalogChanged } from "@/lib/market-catalog/market-catalog-pubsub"

const ROUTE = "/api/admin/market-data/catalog"
const PERMISSION = "admin.settings.manage" as const

async function readRawCatalog(): Promise<{ data: MarketCatalogV1; updatedAt: Date | null }> {
  const row = await prisma.systemSettings.findFirst({
    where: { key: ADMIN_SETTING_KEYS.MARKET_CATALOG_V1, ownerId: null, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { value: true, updatedAt: true },
  })
  return {
    data: parseMarketCatalogJson(row?.value ?? null),
    updatedAt: row?.updatedAt ?? null,
  }
}

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: ROUTE, required: PERMISSION, fallbackMessage: "Failed to load catalog" },
    async () => {
      const { data, updatedAt } = await readRawCatalog()
      return NextResponse.json({
        success: true,
        data,
        updatedAt: updatedAt?.toISOString() ?? null,
      })
    },
  )
}

export async function PUT(req: Request) {
  return handleAdminApi(
    req,
    { route: ROUTE, required: PERMISSION, fallbackMessage: "Failed to save catalog" },
    async ({ session: adminSession }) => {
      const body = await req.json().catch(() => null)
      const parsed = marketCatalogV1Schema.safeParse(body)
      if (!parsed.success) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: `Invalid catalog: ${parsed.error.issues
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; ")}`,
          statusCode: 400,
        })
      }
      const config: MarketCatalogV1 = {
        ...parsed.data,
        updatedAt: new Date().toISOString(),
      }
      const value = JSON.stringify(config)

      const beforeData = (await readRawCatalog()).data

      const saved = await prisma.$transaction(async (tx) => {
        const existing = await tx.systemSettings.findFirst({
          where: { key: ADMIN_SETTING_KEYS.MARKET_CATALOG_V1, ownerId: null },
          orderBy: { updatedAt: "desc" },
        })
        if (existing) {
          await tx.systemSettings.updateMany({
            where: {
              key: ADMIN_SETTING_KEYS.MARKET_CATALOG_V1,
              ownerId: null,
              id: { not: existing.id },
            },
            data: { isActive: false, updatedAt: new Date() },
          })
          return tx.systemSettings.update({
            where: { id: existing.id },
            data: {
              value,
              isActive: true,
              description: "Admin-curated market catalog (v1)",
              category: ADMIN_SETTING_CATEGORIES.MARKET_DATA,
              updatedAt: new Date(),
            },
          })
        }
        return tx.systemSettings.create({
          data: {
            key: ADMIN_SETTING_KEYS.MARKET_CATALOG_V1,
            value,
            isActive: true,
            description: "Admin-curated market catalog (v1)",
            category: ADMIN_SETTING_CATEGORIES.MARKET_DATA,
          },
        })
      })

      invalidateMarketCatalogCache()
      invalidateResolveCatalogCache()

      const actorId = (adminSession as { user?: { id?: string } })?.user?.id ?? null
      await writeMarketCatalogAudit({
        actorId,
        action: "MARKET_CATALOG_UPDATED",
        before: beforeData,
        after: config,
        summary: `${config.groups.length} group(s)`,
      })
      await publishCatalogChanged({ scope: "global" })

      return NextResponse.json({
        success: true,
        data: config,
        updatedAt: saved.updatedAt,
      })
    },
  )
}
