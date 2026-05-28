/**
 * @file route.ts
 * @module api/admin/market-controls
 * @description Read and update BID_ASK_SPREAD_CONFIG_V1 (per-segment synthetic bid/ask spread).
 *              GET is accessible to all authenticated users (order sheet and watchlist need it).
 *              GET derives its response from the active MarketControlConfigV1 (same source as
 *              the preview endpoint and order-execution engine) so admin edits in MarketControlPanel
 *              propagate immediately to the order form's locked spread.
 *
 *              Trading-kzf: PUT is now PERMANENTLY DEPRECATED (returns 410 Gone). The legacy
 *              BID_ASK_SPREAD_CONFIG_V1 SystemSettings key is no longer the canonical source —
 *              MarketControlConfigV1 is. Letting the PUT keep writing to the legacy key created
 *              a silent dual-source drift: GET would return MarketControlConfigV1, PUT would
 *              update a different key that nothing reads. Callers must migrate to
 *              PUT /api/admin/market-controls/config.
 *
 * @author StockTrade
 * @created 2026-04-15
 * @updated 2026-05-08 — PUT now returns 410 Gone with a migration hint (Trading-kzf)
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { AppError, mapErrorToHttp } from "@/src/common/errors"
import {
  type BidAskSpreadConfigV1,
} from "@/lib/market-display/bid-ask-spread-config.schema"
import { loadMarketControlConfig } from "@/lib/market-control/market-control-loader"
import { withRequest } from "@/lib/observability/logger"

const ROUTE = "/api/admin/market-controls/spread-config"

/** GET — available to all authenticated users (needed by order sheet and watchlist). */
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

    // Read from the canonical MarketControlConfigV1 — same source used by the preview endpoint
    // and OrderExecutionService — so admin spread edits flow to the order form immediately.
    const config = await loadMarketControlConfig()
    const segments: BidAskSpreadConfigV1["segments"] = {}
    for (const [key, rule] of Object.entries(config.segments)) {
      segments[key] = { min: rule.spread.min, max: rule.spread.max }
    }
    const data: BidAskSpreadConfigV1 = { segments }

    const res = NextResponse.json(
      { success: true, data, updatedAt: null },
      { status: 200 }
    )
    res.headers.set("Cache-Control", "no-store")
    logger.info({}, "spread-config GET - success")
    return res
  } catch (error: unknown) {
    logger.error({ err: error }, "spread-config GET - error")
    const mapped = mapErrorToHttp(error, "Failed to fetch spread config")
    const res = NextResponse.json({ success: false, ...mapped.body }, { status: mapped.status })
    res.headers.set("Cache-Control", "no-store")
    return res
  }
}

/**
 * PUT — REMOVED (Trading-kzf). Returns 410 Gone with migration hint.
 *
 * Why: this PUT used to write the legacy BID_ASK_SPREAD_CONFIG_V1 SystemSettings key, but
 * GET (and the order engine, and the preview endpoint) now read from MarketControlConfigV1.
 * Keeping the PUT alive meant any external script still calling it would silently update
 * a key nothing reads — drift, no error, no audit trail. 410 Gone forces the caller to
 * migrate.
 */
export async function PUT() {
  return NextResponse.json(
    {
      success: false,
      error: "Endpoint removed",
      code: "ENDPOINT_GONE",
      message:
        "PUT /api/admin/market-controls/spread-config has been retired. " +
        "Spread is now part of the unified market control config. " +
        "Migrate to PUT /api/admin/market-controls/config (segments[*].spread.{min,max}).",
      migrateTo: "PUT /api/admin/market-controls/config",
    },
    { status: 410 },
  )
}
