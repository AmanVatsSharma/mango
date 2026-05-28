/**
 * @file route.ts
 * @module api-risk-order-charges
 * @description Session-authenticated read of platform order charges (non-brokerage) for margin preview.
 * @author StockTrade
 * @created 2026-03-27
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getOrderChargesConfig } from "@/lib/server/get-order-charges-config"
import { withRequest } from "@/lib/observability/logger"
import { AppError, mapErrorToHttp } from "@/src/common/errors"
import type { OrderChargesConfigV1 } from "@/lib/order-charges/types"

const ROUTE = "/api/risk/order-charges-config"

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

    const config: OrderChargesConfigV1 = await getOrderChargesConfig()
    logger.info({ userId: session.user.id }, "GET order-charges-config ok")

    return NextResponse.json(
      {
        success: true,
        data: config,
      },
      { status: 200 },
    )
  } catch (e) {
    const mapped = mapErrorToHttp(e)
    logger.error({ err: e }, "GET order-charges-config failed")
    return NextResponse.json(
      { success: false, error: mapped.body.error, code: mapped.body.code },
      { status: mapped.status },
    )
  }
}
