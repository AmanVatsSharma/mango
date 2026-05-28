/**
 * @file route.ts
 * @module api-settings
 * @description Auth-only read of public deposit / payment settings derived from `payment_deposit_config_v1` (with legacy UPI migration).
 * @author StockTrade
 * @created 2026-02-12
 * @updated 2026-03-25
 *
 * Notes:
 * - Authenticated users only.
 * - Uses `Cache-Control: no-store` so admin changes show quickly.
 */

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { withRequest } from "@/lib/observability/logger"
import { AppError, mapErrorToHttp } from "@/src/common/errors"
import {
  loadPaymentDepositConfigV1,
  paymentConfigToPublicV1,
} from "@/lib/server/payment-deposit-config"
const ROUTE = "/api/settings/payment"

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

    const full = await loadPaymentDepositConfigV1(prisma)
    const data = paymentConfigToPublicV1(full)

    const res = NextResponse.json({ success: true, data }, { status: 200 })
    res.headers.set("Cache-Control", "no-store")
    logger.info({ methods: data.order }, "payment settings v1 - success")
    return res
  } catch (error: unknown) {
    logger.error({ err: error }, "payment settings - error")
    const mapped = mapErrorToHttp(error, "Failed to fetch payment settings")
    const res = NextResponse.json({ success: false, ...mapped.body }, { status: mapped.status })
    res.headers.set("Cache-Control", "no-store")
    return res
  }
}
