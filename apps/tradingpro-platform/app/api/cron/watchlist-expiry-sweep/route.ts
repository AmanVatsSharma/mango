/**
 * @file route.ts
 * @module api/cron/watchlist-expiry-sweep
 * @description Daily server-side sweep that hard-deletes WatchlistItem rows whose contract
 *              expiry has passed (futures + options). Designed to run once daily after
 *              market close (16:00 IST is the recommended cron time — gives the 15:30 close a
 *              30-minute buffer for any straggling settlement messages).
 *
 *              Idempotent: re-running on the same day deletes 0 rows. Auth via `Bearer
 *              ${CRON_SECRET}` matching the existing convention in
 *              app/api/cron/order-worker/route.ts.
 *
 *              The realtime websocket provider auto-unsubscribes any token no longer present
 *              in the user's watchlist on the next fetch (see
 *              lib/market-data/providers/WebSocketMarketDataProvider.tsx:956-970), so no
 *              additional unsubscribe wiring is needed here.
 *
 * Exports:
 *   - GET  — runs the sweep (Bearer auth)
 *   - POST — alias for GET; some external schedulers send POST
 *
 * Side-effects:
 *   - Deletes WatchlistItem rows where expiry < today_IST.
 *   - Pino-logs the sweep summary.
 *
 * Key invariants:
 *   - Cutoff is "today midnight IST" — anything expiring TODAY at any time during today is kept;
 *     it will be swept tomorrow. This avoids racing the 15:30 settlement broadcast.
 *   - Hard delete (matches existing watchlist remove behavior). No soft-archive in v1.
 *
 * @author        BharatERP
 * @created       2026-05-01
 */

export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withRequest } from "@/lib/observability/logger"

const ROUTE = "/api/cron/watchlist-expiry-sweep"

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  const header = req.headers.get("authorization")?.trim()
  if (header === `Bearer ${secret}`) return true
  const q = new URL(req.url).searchParams.get("secret")
  return q === secret
}

/**
 * Returns midnight (00:00) of "today in IST" as a UTC Date suitable for direct comparison
 * against a Prisma DateTime column. IST is UTC+05:30 — we get today's date in IST then build
 * a Date at that day's 00:00 IST = 18:30 UTC of the previous day.
 */
function startOfTodayIst(): Date {
  const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
  const y = istNow.getFullYear()
  const m = istNow.getMonth()
  const d = istNow.getDate()
  // 00:00 IST = 18:30 UTC of the previous calendar day → use Date.UTC offset.
  const utcMs = Date.UTC(y, m, d, 0, 0, 0) - 5 * 60 * 60 * 1000 - 30 * 60 * 1000
  return new Date(utcMs)
}

async function runSweep(req: Request): Promise<NextResponse> {
  const logger = withRequest({
    requestId: req.headers.get("x-request-id") || undefined,
    route: ROUTE,
  })

  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const cutoff = startOfTodayIst()
  try {
    const result = await prisma.watchlistItem.deleteMany({
      where: { expiry: { not: null, lt: cutoff } },
    })
    logger.info(
      { deleted: result.count, cutoffIso: cutoff.toISOString() },
      "watchlist expiry sweep complete",
    )
    return NextResponse.json({
      success: true,
      data: {
        deleted: result.count,
        cutoffIso: cutoff.toISOString(),
      },
    })
  } catch (error) {
    logger.error({ err: error }, "watchlist expiry sweep failed")
    return NextResponse.json(
      { success: false, error: "Sweep failed" },
      { status: 500 },
    )
  }
}

export async function GET(req: Request) {
  return runSweep(req)
}

export async function POST(req: Request) {
  return runSweep(req)
}
