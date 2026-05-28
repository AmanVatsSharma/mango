/**
 * @file app/api/admin/comms/send/route.ts
 * @module api/admin/comms
 * @description POST — single-recipient ad-hoc dispatch. Used by Client 360 → Comms tab
 *              ("send WhatsApp / SMS / email" buttons). All three hard gates apply
 *              (DLT, consent, variable resolution); see lib/comms/send-router.ts.
 *
 *              Body: { userId, channel, templateId?, rawBody?, variables? }
 *              Response: { success, status, messageId, reason? }
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import type { CommsChannel } from "@prisma/client"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { sendMessage } from "@/lib/comms/send-router"
import type { VariableMap } from "@/lib/comms/types"

export const dynamic = "force-dynamic"

const CHANNELS = new Set<CommsChannel>([
  "WHATSAPP",
  "SMS",
  "EMAIL",
  "VOICE",
  "PUSH",
])

interface Body {
  userId?: string
  channel?: CommsChannel
  templateId?: string
  rawBody?: string
  variables?: VariableMap
  toAddress?: string
  fromAddress?: string
}

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    { route: "POST /api/admin/comms/send", required: "admin.comms.send" },
    async () => {
      const body = (await req.json().catch(() => null)) as Body | null
      if (!body || !body.userId || !body.channel) {
        return NextResponse.json(
          { success: false, message: "userId and channel are required" },
          { status: 400 },
        )
      }
      if (!CHANNELS.has(body.channel)) {
        return NextResponse.json(
          { success: false, message: "invalid channel" },
          { status: 400 },
        )
      }
      if (!body.templateId && !body.rawBody) {
        return NextResponse.json(
          { success: false, message: "templateId or rawBody required" },
          { status: 400 },
        )
      }
      const result = await sendMessage({
        userId: body.userId,
        channel: body.channel,
        templateId: body.templateId,
        rawBody: body.rawBody,
        variables: body.variables ?? {},
        toAddress: body.toAddress,
        fromAddress: body.fromAddress,
      })
      // The send-router never throws — it always returns a SendResult with the
      // gate's reason. Therefore the HTTP shape is always 200; clients inspect
      // `status` to know whether it actually went out.
      return NextResponse.json({ success: true, ...result })
    },
  )
}
