/**
 * File:        app/api/admin/presence/pnl-stream/route.ts
 * Module:      admin-console
 * Purpose:     Long-lived SSE stream for admin consoles (Positions Panel, Command Centre)
 *              to receive live position PNL updates across ALL positions.
 *              Subscribes the SSE controller to the RealtimeEventEmitter admin pool so
 *              every connected admin receives every `positions_pnl_updated` batch — regardless
 *              of which user owns the positions.
 *
 * Exports:
 *   - GET(request) → Response  — long-lived SSE response
 *
 * Depends on:
 *   - @/lib/rbac/admin-guard        — requireAdminPermissions
 *   - @/lib/services/realtime/RealtimeEventEmitter — subscribeAdmin / unsubscribeAdmin
 *   - @/lib/observability/logger    — Pino logger with request context
 *
 * Side-effects:
 *   - Registers/unregisters controller in the RealtimeEventEmitter admin connection pool
 *   - Cross-process fanout via Redis pub/sub (handled by RealtimeEventEmitter)
 *
 * Key invariants:
 *   - Any authenticated admin can connect — no per-position scoping needed (admin sees all).
 *   - The controller reference is held in a closure so cancel() and abort() can both use it.
 *
 * Read order:
 *   1. GET — entry; auth check + SSE stream setup
 *   2. ReadableStream.start — subscribe controller to admin pool
 *   3. ReadableStream.cancel / abort — cleanup path
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-11
 */

import { NextRequest } from "next/server"
import { requireAdminPermissions } from "@/lib/rbac/admin-guard"
import { getRealtimeEventEmitter } from "@/lib/services/realtime/RealtimeEventEmitter"
import { withRequest } from "@/lib/observability/logger"

export async function GET(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") || req.headers.get("x-correlation-id") || undefined
  const log = withRequest({ requestId, route: "/api/admin/presence/pnl-stream" }).child({ module: "admin-pnl-sse" })

  const auth = await requireAdminPermissions(
    req,
    ["admin.positions.read", "admin.analytics.read"],
    { mode: "any" },
  )
  if (!auth.ok) {
    return auth.response
  }

  log.info({ adminRole: auth.role }, "admin PNL SSE connect")

  const encoder = new TextEncoder()
  // Shared controller reference so cancel() and abort() can both call unsubscribeAdmin.
  let activeController: ReadableStreamDefaultController<Uint8Array> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let cleanedUp = false

  const cleanup = (source: "cancel" | "abort") => {
    if (cleanedUp) return
    cleanedUp = true
    log.info({ source }, "admin PNL SSE cleanup")
    if (heartbeat) {
      clearInterval(heartbeat)
      heartbeat = null
    }
    if (activeController) {
      const emitter = getRealtimeEventEmitter()
      emitter.unsubscribeAdmin(activeController)
      try {
        activeController.close()
      } catch {
        /* already closed */
      }
      activeController = null
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      activeController = controller
      log.info("starting admin PNL SSE stream")
      const emitter = getRealtimeEventEmitter()
      emitter.subscribeAdmin(controller)

      // Send initial connected message
      try {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              event: "connected",
              data: { role: auth.role, timestamp: new Date().toISOString() },
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        )
      } catch {
        /* stream already closed */
      }
    },

    cancel(reason) {
      log.info({ reason: reason ? String(reason) : undefined }, "admin PNL SSE cancelled")
      cleanup("cancel")
    },
  })

  // Heartbeat via SSE comment frames — keeps the connection alive behind proxies.
  heartbeat = setInterval(() => {
    if (!activeController) {
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null }
      return
    }
    try {
      activeController.enqueue(encoder.encode(": ping\n\n"))
    } catch {
      cleanup("cancel")
    }
  }, 25_000)
  ;(heartbeat as unknown as { unref?: () => void }).unref?.()

  req.signal.addEventListener("abort", () => {
    log.info("admin PNL SSE aborted")
    cleanup("abort")
  }, { once: true })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
