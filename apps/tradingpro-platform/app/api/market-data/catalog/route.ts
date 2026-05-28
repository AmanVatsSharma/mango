/**
 * @file route.ts
 * @module api/market-data/catalog
 * @description User-facing endpoint that returns the *resolved* admin-curated catalog —
 *              Indices, Sectors, and recipe-driven options-chain trees expanded against the
 *              live Vedpragya feed. Consumed by the watchlist Add drawer's Browse tab.
 *
 *              Auth: any authenticated session (USER or admin). Anonymous requests are
 *              rejected so we don't leak the curation strategy publicly.
 *
 *              Caching: response is `Cache-Control: no-store` (the resolver already has its
 *              own 30s in-process cache; we don't want browsers to additionally pin it).
 *
 * Exports:
 *   - GET — returns { success, data: ResolvedCatalog }
 *
 * Side-effects:
 *   - Reads SystemSettings via loadMarketCatalog().
 *   - Indirectly fetches Vedpragya for options-chain expansion.
 *
 * Key invariants:
 *   - Failure to resolve any single options-chain recipe degrades gracefully (empty tree),
 *     never a 500. The whole-route 500 is reserved for unexpected programmer error.
 *
 * @author        BharatERP
 * @created       2026-05-01
 */

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { withRequest } from "@/lib/observability/logger"
import { loadMarketCatalog } from "@/lib/market-catalog/market-catalog-loader"
import { resolveCatalog } from "@/lib/market-catalog/resolve-catalog"

const ROUTE = "/api/market-data/catalog"

export async function GET(req: Request) {
  const logger = withRequest({
    requestId: req.headers.get("x-request-id") || undefined,
    route: ROUTE,
  })
  try {
    const session = await auth().catch(() => null)
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const raw = await loadMarketCatalog()
    const resolved = await resolveCatalog(raw)

    logger.debug({ groups: resolved.groups.length }, "catalog resolved")

    const response = NextResponse.json({ success: true, data: resolved })
    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    logger.error({ err: error }, "catalog resolution failed")
    return NextResponse.json(
      { success: false, error: "Failed to load catalog" },
      { status: 500 },
    )
  }
}
