/**
 * File:        app/api/admin/withdrawals/[id]/hold/route.ts
 * Module:      Admin · Funds · Withdrawals · Manual hold + re-evaluate (Phase 13a)
 * Purpose:     POST that lets an admin manually hold a withdrawal that the engine cleared, OR
 *              re-evaluate the engine on demand (e.g. after editing the rule registry).
 *
 * Exports:
 *   - POST — body { mode: "HOLD" | "REEVALUATE", reason?: string }
 *
 * Depends on:
 *   - @/lib/rbac/admin-api          — RBAC + audit + logger.
 *   - @/lib/withdrawal/hold-rules   — engine orchestrator.
 *   - @/lib/withdrawal/approval-chain — chain builder for manual holds.
 *
 * Side-effects: DB writes on Withdrawal.{riskScore, holdReason, holdRuleKeys, approvalChain, heldAt}.
 *
 * Key invariants:
 *   - "HOLD" mode forces holdReason to the admin-provided text and creates a default chain.
 *     Engine-derived rule keys are PRESERVED (not wiped) so the audit trail is complete.
 *   - "REEVALUATE" re-runs the engine and fully overwrites the snapshot — used after rule edits.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import { evaluateAndApplyHold } from "@/lib/withdrawal/hold-rules"
import { buildDefaultChain } from "@/lib/withdrawal/approval-chain"
import type { Prisma } from "@prisma/client"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handleAdminApi(
    req,
    {
      route: `/api/admin/withdrawals/${id}/hold`,
      required: "admin.withdrawals.review",
      fallbackMessage: "Failed to hold withdrawal",
    },
    async ({ logger, session }) => {
      const body = (await req.json().catch(() => ({}))) as {
        mode?: "HOLD" | "REEVALUATE"
        reason?: string
      }
      const mode = body.mode === "HOLD" || body.mode === "REEVALUATE" ? body.mode : null
      if (!mode) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "mode must be 'HOLD' or 'REEVALUATE'",
          statusCode: 400,
        })
      }

      if (mode === "REEVALUATE") {
        const result = await evaluateAndApplyHold(id)
        logger.info(
          { withdrawalId: id, riskScore: result.riskScore, isHeld: result.isHeld },
          "withdrawal re-evaluated",
        )
        return NextResponse.json({ success: true, ...result }, { status: 200 })
      }

      // mode === "HOLD" — manual hold path.
      const reason =
        typeof body.reason === "string" && body.reason.trim().length > 0
          ? body.reason.trim()
          : "Manual hold by admin"

      const w = await adminPrisma.withdrawal.findUnique({
        where: { id },
        select: { id: true, amount: true, holdReason: true },
      })
      if (!w) {
        throw new AppError({
          code: "NOT_FOUND",
          message: "Withdrawal not found",
          statusCode: 404,
        })
      }

      const chain = buildDefaultChain(Number(w.amount))
      await adminPrisma.withdrawal.update({
        where: { id },
        data: {
          holdReason: w.holdReason ?? reason,
          approvalChain: chain as unknown as Prisma.InputJsonValue,
          heldAt: new Date(),
          releasedAt: null,
        },
      })

      logger.info(
        { withdrawalId: id, by: session.user.id, reason },
        "withdrawal manually held",
      )
      return NextResponse.json(
        { success: true, isHeld: true, reason },
        { status: 200 },
      )
    },
  )
}
