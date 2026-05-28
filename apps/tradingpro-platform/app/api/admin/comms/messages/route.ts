/**
 * @file app/api/admin/comms/messages/route.ts
 * @module api/admin/comms
 * @description GET — paginated message feed. Supports per-user filter (used by Client 360
 *              Comms tab to derive the thread). Always ordered by queuedAt DESC.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type {
  CommsChannel,
  CommsMessageDirection,
  CommsMessageStatus,
} from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { listMessages } from "@/lib/comms/message-feed"

export const dynamic = "force-dynamic"

const CHANNELS = new Set<CommsChannel>([
  "WHATSAPP",
  "SMS",
  "EMAIL",
  "VOICE",
  "PUSH",
])
const STATUSES = new Set<CommsMessageStatus>([
  "QUEUED",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
  "LOGGED",
  "OPTED_OUT",
  "REJECTED",
])
const DIRECTIONS = new Set<CommsMessageDirection>(["OUTBOUND", "INBOUND"])

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/comms/messages", required: "admin.comms.read" },
    async () => {
      const url = new URL(req.url)
      const page = Number(url.searchParams.get("page") ?? "1")
      const limit = Number(url.searchParams.get("limit") ?? "50")
      const offset = Math.max((page - 1) * limit, 0)

      const channel = url.searchParams.get("channel") as CommsChannel | null
      const status = url.searchParams.get("status") as CommsMessageStatus | null
      const direction = url.searchParams.get("direction") as CommsMessageDirection | null

      const result = await listMessages(
        {
          userId: url.searchParams.get("userId") ?? undefined,
          channel: channel && CHANNELS.has(channel) ? channel : undefined,
          status: status && STATUSES.has(status) ? status : undefined,
          direction:
            direction && DIRECTIONS.has(direction) ? direction : undefined,
          campaignId: url.searchParams.get("campaignId") ?? undefined,
          q: url.searchParams.get("q") ?? undefined,
        },
        { limit, offset },
      )

      return NextResponse.json({
        success: true,
        rows: result.rows,
        total: result.total,
        hasNext: result.hasNext,
        page,
        limit,
      })
    },
  )
}
