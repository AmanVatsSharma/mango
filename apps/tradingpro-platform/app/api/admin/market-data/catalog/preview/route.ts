/**
 * @file route.ts
 * @module api/admin/market-data/catalog/preview
 * @description Live recipe preview for the admin catalog editor. Accepts a *single* catalog
 *              item (instrument or options-chain) and returns the resolved tree without
 *              persisting anything. Used to show the admin "this is what users will see"
 *              before they hit Save.
 *
 *              Bypasses the loader/resolver caches so the preview always reflects the latest
 *              recipe + the latest Vedpragya data.
 *
 * Exports:
 *   - POST — body = { item: CatalogItem }; returns { success, data: ResolvedItem | null }
 *
 * Side-effects:
 *   - Vedpragya fetch via the resolver's upstream client.
 *
 * Key invariants:
 *   - No DB writes; no cache mutation. Pure read.
 *   - Permission required: admin.settings.manage (same as the parent route).
 *
 * @author        BharatERP
 * @created       2026-05-01
 */

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import {
  catalogItemSchema,
  type CatalogItem,
  type MarketCatalogV1,
} from "@/lib/market-catalog/catalog-schema"
import {
  invalidateResolveCatalogCache,
  resolveCatalog,
} from "@/lib/market-catalog/resolve-catalog"

const ROUTE = "/api/admin/market-data/catalog/preview"
const PERMISSION = "admin.settings.manage" as const

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: ROUTE, required: PERMISSION, fallbackMessage: "Failed to preview recipe" },
    async () => {
      const body = await req.json().catch(() => null)
      const parsed = catalogItemSchema.safeParse(body?.item)
      if (!parsed.success) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Invalid item: " + parsed.error.issues.map((i) => i.message).join("; "),
          statusCode: 400,
        })
      }

      const item: CatalogItem = parsed.data
      // Wrap into a single-group catalog and resolve. Drop the cache first so this preview
      // always sees the latest Vedpragya state — admins lose patience with stale previews.
      invalidateResolveCatalogCache()
      const wrapper: MarketCatalogV1 = {
        version: 1,
        groups: [
          {
            id: "preview",
            label: "preview",
            sortOrder: 0,
            items: [item],
          },
        ],
      }
      const resolved = await resolveCatalog(wrapper)
      // Drop the wrapper cache after we're done — actual saves take care of their own invalidation.
      invalidateResolveCatalogCache()

      const resolvedItem = resolved.groups[0]?.items[0] ?? null
      return NextResponse.json({ success: true, data: resolvedItem })
    },
  )
}
