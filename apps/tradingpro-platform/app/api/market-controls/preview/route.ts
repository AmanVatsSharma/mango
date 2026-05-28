/**
 * @file route.ts
 * @module api/market-controls/preview
 * @description Public (authenticated) endpoint that resolves the effective market-control
 *              knobs for a given {segment, symbol, userGroup, side, qty, ltp} and returns
 *              both the effective spread/slippage AND the synthesised ask/bid pair that
 *              the customer will actually fill at. The watchlist card and order sheet call
 *              this so what the user SEES is what they GET.
 * @author StockTrade
 * @created 2026-04-15
 */

import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/auth"
import { AppError, mapErrorToHttp } from "@/src/common/errors"
import { loadMarketControlConfig } from "@/lib/market-control/market-control-loader"
import {
  resolveMarketControls,
  quoteFromLtp,
  fillPriceFromSnapshot,
} from "@/lib/market-control/market-control-resolver"
import { getUserMarketGroup } from "@/lib/market-control/user-group"
import { withRequest } from "@/lib/observability/logger"

const ROUTE = "/api/market-controls/preview"

const previewInputSchema = z.object({
  segment: z.string().min(1),
  symbol: z.string().min(1),
  ltp: z.number().positive(),
  side: z.enum(["BUY", "SELL"]).optional(),
  qty: z.number().int().nonnegative().optional(),
  userGroup: z.enum(["VIP", "STANDARD", "HIGH_RISK", "SCALPER"]).optional(),
})

export async function POST(req: Request) {
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

    const body = await req.json().catch(() => null)
    const parsed = previewInputSchema.safeParse(body)
    if (!parsed.success) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: parsed.error.issues.map((i) => i.message).join(", "),
        statusCode: 400,
      })
    }
    const input = parsed.data

    const config = await loadMarketControlConfig()
    const userGroup = input.userGroup ?? (await getUserMarketGroup(session.user.id))

    const effective = resolveMarketControls(config, {
      segment: input.segment,
      symbol: input.symbol,
      userGroup,
      orderSide: input.side ?? "BUY",
      quantity: input.qty ?? 0,
      orderValueRupees: (input.qty ?? 0) * input.ltp,
      now: new Date(),
    })

    const { ask, bid } = quoteFromLtp(input.ltp, effective.spreadPct)
    const fillPriceBuy = fillPriceFromSnapshot(input.ltp, "BUY", {
      spreadPct: effective.spreadPct,
      tiltBiasPct: effective.tiltBiasPct,
    })
    const fillPriceSell = fillPriceFromSnapshot(input.ltp, "SELL", {
      spreadPct: effective.spreadPct,
      tiltBiasPct: effective.tiltBiasPct,
    })

    const res = NextResponse.json(
      {
        success: true,
        data: {
          userGroup,
          resolvedSegmentKey: effective.resolvedSegmentKey,
          spreadPct: effective.spreadPct,
          spreadMin: effective.spreadMin,
          spreadMax: effective.spreadMax,
          slippagePct: effective.slippagePct,
          sizeMultiplier: effective.sizeMultiplier,
          tiltBiasPct: effective.tiltBiasPct,
          killSwitch: effective.killSwitch,
          blocked: effective.blocked,
          ltp: input.ltp,
          ask,
          bid,
          fillPriceBuy,
          fillPriceSell,
          // Trading-mfk: surface the admin-resolved jitter rule so the client market-data
          // provider can use it as default (admin-persistent) instead of the hardcoded
          // dev-noise defaults that previously only lived in the per-tab demo provider.
          jitter: effective.jitter,
        },
      },
      { status: 200 },
    )
    res.headers.set("Cache-Control", "no-store")
    return res
  } catch (error) {
    logger.error({ err: error }, "market-controls preview error")
    const mapped = mapErrorToHttp(error, "Failed to resolve market-control preview")
    const res = NextResponse.json({ success: false, ...mapped.body }, { status: mapped.status })
    res.headers.set("Cache-Control", "no-store")
    return res
  }
}
