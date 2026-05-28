/**
 * @file route.ts
 * @module admin-console
 * @description Admin SSE: trading-dashboard presence deltas (Redis pub/sub) + optional id snapshot.
 * @author StockTrade
 * @created 2026-04-03
 *
 * Notes:
 * - Auth via session cookie (EventSource); RBAC same as batch endpoint.
 * - `ids` query: comma-separated user IDs for initial snapshot (capped).
 */

import { redisSubscribe } from "@/lib/redis/redis-client"
import { requireAdminPermissions } from "@/lib/rbac/admin-guard"
import {
  ADMIN_TRADING_PRESENCE_CHANNEL,
  type AdminTradingPresenceDeltaPayload,
} from "@/lib/services/realtime/trading-dashboard-presence"
import { getTradingDashboardPresenceMap } from "@/lib/services/realtime/trading-dashboard-presence"
import { withRequest } from "@/lib/observability/logger"

const MAX_SNAPSHOT_IDS = 500

export async function GET(req: Request) {
  const log = withRequest({
    requestId: req.headers.get("x-request-id") || undefined,
    route: "/api/admin/presence/stream",
  }).child({ module: "admin-presence-sse" })

  const auth = await requireAdminPermissions(
    req,
    ["admin.users.read", "admin.users.kyc", "admin.analytics.read"],
    { mode: "any" },
  )
  if (!auth.ok) {
    return auth.response
  }

  const url = new URL(req.url)
  const ids = (url.searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SNAPSHOT_IDS)

  log.info({ viewerRole: auth.role, snapshotIdCount: ids.length }, "admin presence sse connect")

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          /* stream closed */
        }
      }

      try {
        const map = ids.length > 0 ? await getTradingDashboardPresenceMap(ids) : {}
        safeEnqueue(`data: ${JSON.stringify({ event: "snapshot", data: { map } })}\n\n`)
      } catch (e) {
        log.warn({ message: (e as Error)?.message }, "presence snapshot failed")
        safeEnqueue(`data: ${JSON.stringify({ event: "snapshot", data: { map: {} } })}\n\n`)
      }

      const heartbeat = setInterval(() => safeEnqueue(": ping\n\n"), 25_000)
      ;(heartbeat as unknown as { unref?: () => void }).unref?.()

      const unsubscribe = await redisSubscribe(ADMIN_TRADING_PRESENCE_CHANNEL, (message) => {
        let parsed: AdminTradingPresenceDeltaPayload | null = null
        try {
          parsed = JSON.parse(message) as AdminTradingPresenceDeltaPayload
        } catch {
          return
        }
        if (!parsed?.userId || typeof parsed.online !== "boolean") return
        safeEnqueue(
          `data: ${JSON.stringify({
            event: "presence",
            data: { userId: parsed.userId, online: parsed.online, ts: parsed.ts },
          })}\n\n`,
        )
      })

      const onAbort = () => {
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }

      req.signal.addEventListener("abort", onAbort, { once: true })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
