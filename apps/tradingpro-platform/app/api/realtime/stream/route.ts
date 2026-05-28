/**
 * File:        app/api/realtime/stream/route.ts
 * Module:      Realtime · SSE entrypoint
 * Purpose:     Authenticated Server-Sent Events stream that fans the per-user
 *              realtime event bus out to the dashboard. Resolves caller identity
 *              from the NextAuth session; the optional `?userId=` query is a
 *              consistency parameter and MUST equal the session user when present.
 *
 * Exports:
 *   - GET(request) → Response  — long-lived SSE response
 *
 * Depends on:
 *   - @/auth                                                — NextAuth session resolver
 *   - @/lib/services/realtime/RealtimeEventEmitter          — per-user pub/sub registry
 *   - @/lib/observability/logger                            — Pino logger with request context
 *
 * Side-effects:
 *   - Subscribes/unsubscribes the controller in the in-process realtime registry
 *   - Touches Redis presence (via subscribe path) and pub/sub fanout
 *
 * Key invariants:
 *   - `userId` returned from this handler is ALWAYS `session.user.id`. The query
 *     param can never widen the trust boundary; it can only fail-fast on mismatch.
 *   - Unsubscribe is idempotent and is invoked from BOTH `abort` and `cancel`
 *     because either may fire first depending on the consumer (browser tab close,
 *     fetch abort, garbage-collected stream).
 *
 * Read order:
 *   1. GET — entry; session check + userId mismatch guard
 *   2. ReadableStream.start — subscribe + abort cleanup
 *   3. ReadableStream.cancel — second cleanup path (consumer-initiated)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { NextRequest } from "next/server"
import { auth } from "@/auth"
import { getRealtimeEventEmitter } from "@/lib/services/realtime/RealtimeEventEmitter"
import { withRequest } from "@/lib/observability/logger"

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || request.headers.get("x-correlation-id") || undefined
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")?.[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  const log = withRequest({ requestId, ip, route: "/api/realtime/stream" }).child({ module: "sse-stream" })

  log.info("new connection request")

  try {
    const searchParams = request.nextUrl.searchParams
    const userIdParam = searchParams.get("userId")

    const session = await auth()
    const sessionUserId = (session?.user?.id as string | undefined) ?? null

    if (!sessionUserId) {
      log.warn({ hadUserIdParam: Boolean(userIdParam) }, "unauthorized: no session")
      return new Response("Unauthorized", { status: 401 })
    }

    // Hardening: query-param identity must equal the session identity when present.
    // Pre-fix the handler used `userIdParam || sessionUserId`, which let any
    // authenticated user subscribe to ANY other user's stream by tampering with
    // the URL. Now the param is a consistency check, not an authority claim.
    if (userIdParam && userIdParam !== sessionUserId) {
      log.warn({ sessionUserId, userIdParam }, "forbidden: userId param does not match session")
      return new Response("Forbidden", { status: 403 })
    }

    const userId = sessionUserId

    log.info({ userId }, "user authenticated")

    const eventEmitter = getRealtimeEventEmitter()

    // Shared between start() and cancel() so a consumer-initiated cancel (no
    // abort signal) still unsubscribes the controller. Pre-fix the cancel()
    // path leaked the controller in the connection registry until the next
    // 30s heartbeat sweep cleared it.
    let cleanedUp = false
    let activeController: ReadableStreamDefaultController<Uint8Array> | null = null
    const cleanup = (source: "abort" | "cancel") => {
      if (cleanedUp) return
      cleanedUp = true
      log.info({ userId, source }, "client disconnected")
      if (activeController) {
        eventEmitter.unsubscribe(userId, activeController)
        try {
          activeController.close()
        } catch {
          // controller already closed — harmless
        }
        activeController = null
      }
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        log.info({ userId }, "starting SSE stream")
        activeController = controller
        eventEmitter.subscribe(userId, controller)
        request.signal.addEventListener("abort", () => cleanup("abort"))
      },

      cancel(reason) {
        log.info({ userId, reason: reason ? String(reason) : undefined }, "stream cancelled")
        cleanup("cancel")
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    log.error({ message: (error as any)?.message || String(error) }, "failed to create SSE stream")
    return new Response(
      JSON.stringify({ error: "Failed to create SSE stream" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
}
