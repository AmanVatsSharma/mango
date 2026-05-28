/**
 * @file app/api/admin/affiliates/payouts/[payoutId]/transition/route.ts
 * @module api/admin/affiliates
 * @description POST — drive a payout's lifecycle. One endpoint, one body switch.
 *              Requires admin.affiliate.payout.
 *
 *              Body:
 *                { action: "APPROVE" }                          — PENDING → APPROVED
 *                { action: "MARK_PAID", reference?: string }    — APPROVED → PAID + children → PAID
 *                { action: "CANCEL", reason: string }           — * → CANCELLED + children freed
 *
 *              Production deployment of MARK_PAID requires legal/finance sign-off on TDS
 *              handling per CLAUDE.md plan §10. The endpoint ships behind the same
 *              admin.affiliate.payout permission; turn it off until counsel approves.
 *
 * @author StockTrade
 * @created 2026-04-27
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import {
  approvePayout,
  cancelPayout,
  markPayoutPaid,
} from "@/lib/affiliate/payout-service"

export const dynamic = "force-dynamic"

type Action = "APPROVE" | "MARK_PAID" | "CANCEL"

interface Body {
  action?: Action
  reference?: string | null
  reason?: string | null
}

export async function POST(
  req: Request,
  { params }: { params: { payoutId: string } },
) {
  return handleAdminApi(
    req,
    {
      route: `POST /api/admin/affiliates/payouts/${params.payoutId}/transition`,
      required: "admin.affiliate.payout",
    },
    async (ctx) => {
      const body = (await req.json().catch(() => null)) as Body | null
      if (!body || !body.action) {
        return NextResponse.json(
          { success: false, message: "action required (APPROVE|MARK_PAID|CANCEL)" },
          { status: 400 },
        )
      }
      const adminId = ctx.session?.user?.id
      if (!adminId) {
        return NextResponse.json(
          { success: false, message: "session missing user id" },
          { status: 401 },
        )
      }
      try {
        let result: unknown
        if (body.action === "APPROVE") {
          result = await approvePayout(params.payoutId, adminId)
        } else if (body.action === "MARK_PAID") {
          result = await markPayoutPaid(params.payoutId, adminId, body.reference ?? null)
        } else if (body.action === "CANCEL") {
          if (!body.reason || !body.reason.trim()) {
            return NextResponse.json(
              { success: false, message: "reason required for CANCEL" },
              { status: 400 },
            )
          }
          result = await cancelPayout(params.payoutId, adminId, body.reason)
        } else {
          return NextResponse.json(
            { success: false, message: "unknown action" },
            { status: 400 },
          )
        }
        return NextResponse.json({ success: true, result })
      } catch (err) {
        return NextResponse.json(
          { success: false, message: err instanceof Error ? err.message : "transition failed" },
          { status: 400 },
        )
      }
    },
  )
}
