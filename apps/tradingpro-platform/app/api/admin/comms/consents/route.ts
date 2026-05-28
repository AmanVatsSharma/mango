/**
 * @file app/api/admin/comms/consents/route.ts
 * @module api/admin/comms
 * @description GET — list a user's consent rows across channels.
 *              POST — grant or revoke consent for a (userId, channel) pair.
 *                     Idempotent at the DB layer.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type { CommsChannel, CommsConsentSource } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  grantConsent,
  listConsentsForUser,
  revokeConsent,
} from "@/lib/comms/consent"

export const dynamic = "force-dynamic"

const CHANNELS = new Set<CommsChannel>([
  "WHATSAPP",
  "SMS",
  "EMAIL",
  "VOICE",
  "PUSH",
])
const SOURCES = new Set<CommsConsentSource>([
  "SIGNUP_TERMS",
  "DOUBLE_OPT_IN",
  "ADMIN_GRANT",
  "IMPORT",
])

export async function GET(req: Request) {
  return handleAdminApi(
    req,
    { route: "GET /api/admin/comms/consents", required: "admin.comms.read" },
    async () => {
      const url = new URL(req.url)
      const userId = url.searchParams.get("userId")
      if (!userId) {
        return NextResponse.json(
          { success: false, message: "userId required" },
          { status: 400 },
        )
      }
      const rows = await listConsentsForUser(userId)
      return NextResponse.json({ success: true, rows })
    },
  )
}

interface Body {
  userId?: string
  channel?: CommsChannel
  action?: "GRANT" | "REVOKE"
  source?: CommsConsentSource
  reason?: string
  notes?: string
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/comms/consents", required: "admin.comms.send" },
    async () => {
      const body = (await req.json().catch(() => null)) as Body | null
      if (
        !body ||
        !body.userId ||
        !body.channel ||
        !body.action ||
        (body.action !== "GRANT" && body.action !== "REVOKE")
      ) {
        return NextResponse.json(
          { success: false, message: "userId, channel and action required" },
          { status: 400 },
        )
      }
      if (!CHANNELS.has(body.channel)) {
        return NextResponse.json(
          { success: false, message: "invalid channel" },
          { status: 400 },
        )
      }
      try {
        if (body.action === "GRANT") {
          const source = body.source ?? "ADMIN_GRANT"
          if (!SOURCES.has(source)) {
            return NextResponse.json(
              { success: false, message: "invalid source" },
              { status: 400 },
            )
          }
          const row = await grantConsent({
            userId: body.userId,
            channel: body.channel,
            source,
            notes: body.notes ?? null,
          })
          return NextResponse.json({ success: true, row })
        }
        const row = await revokeConsent({
          userId: body.userId,
          channel: body.channel,
          reason: body.reason ?? null,
        })
        return NextResponse.json({ success: true, row })
      } catch (err) {
        return NextResponse.json(
          {
            success: false,
            message: err instanceof Error ? err.message : "consent op failed",
          },
          { status: 422 },
        )
      }
    },
  )
}
