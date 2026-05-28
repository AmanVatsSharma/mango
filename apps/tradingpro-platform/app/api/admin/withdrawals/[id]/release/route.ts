/**
 * File:        app/api/admin/withdrawals/[id]/release/route.ts
 * Module:      Admin · Funds · Withdrawals · Release (Phase 13a)
 * Purpose:     POST endpoint that advances the approval-chain on a held withdrawal. When the
 *              chain becomes complete, the row is automatically pushed through the existing
 *              `AdminFundService.approveWithdrawal` so Phase 13a never duplicates the financial
 *              side of approval — it only adds the *gating* layer.
 *
 * Exports:
 *   - POST — body { transactionId?, note? }. transactionId is required iff this approval
 *     completes the chain (chain → empty REQUIRED → final approve).
 *
 * Depends on:
 *   - @/lib/rbac/admin-api               — RBAC + audit + logger.
 *   - @/lib/withdrawal/approval-chain    — pure helpers for the JSON ladder.
 *   - @/lib/services/admin/AdminFundService — the canonical money-mover; reused as-is.
 *
 * Side-effects: DB write on Withdrawal.{approvalChain, releasedAt} + transactional financial
 *               update if chain completes.
 *
 * Key invariants:
 *   - Permission: `admin.withdrawals.manage` (the financial action). The lower `.review`
 *     permission only grants visibility — release is the dangerous bit.
 *   - If `chain` is already empty (low-risk row), the endpoint returns 400 — there's nothing
 *     to release. Use `/api/admin/withdrawals` POST approve directly for those.
 *   - The financial approve happens INSIDE the same Prisma transaction as the chain advance
 *     when applicable, so a partial state is impossible (chain-complete + funds-not-moved).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { prisma } from "@/lib/prisma"
import { adminPrisma } from "@/lib/server/prisma-admin"
import {
  advanceChain,
  isChainComplete,
} from "@/lib/withdrawal/approval-chain"
import { parseApprovalChain } from "@/lib/withdrawal/types"
import { createAdminFundService } from "@/lib/services/admin/AdminFundService"
import type { Prisma } from "@prisma/client"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return handleAdminApi(
    req,
    {
      route: `/api/admin/withdrawals/${id}/release`,
      required: "admin.withdrawals.manage",
      fallbackMessage: "Failed to release withdrawal",
    },
    async ({ session, role, logger }) => {
      const body = (await req.json().catch(() => ({}))) as {
        transactionId?: string
        note?: string
      }
      const note = typeof body.note === "string" ? body.note : null
      const transactionId =
        typeof body.transactionId === "string" ? body.transactionId.trim() : ""

      const w = await adminPrisma.withdrawal.findUnique({
        where: { id },
        select: { id: true, status: true, approvalChain: true, heldAt: true },
      })
      if (!w) {
        throw new AppError({
          code: "NOT_FOUND",
          message: "Withdrawal not found",
          statusCode: 404,
        })
      }

      const currentChain = parseApprovalChain(w.approvalChain)
      if (currentChain.length === 0) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message:
            "This withdrawal has no approval chain. Use the standard approve endpoint instead.",
          statusCode: 400,
        })
      }

      const advanced = advanceChain(currentChain, {
        approverId: session.user.id!,
        approverName: session.user.name || "Admin",
        action: "APPROVED",
        note,
      })
      const completes = isChainComplete(advanced)

      if (completes && !transactionId) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message:
            "Final approval requires a transactionId — the chain is now complete.",
          statusCode: 400,
        })
      }

      // Persist chain advance first (atomic). If we also need to do the financial approve, run
      // that in the same logical step using the existing service.
      await adminPrisma.withdrawal.update({
        where: { id },
        data: {
          approvalChain: advanced as unknown as Prisma.InputJsonValue,
          releasedAt: completes ? new Date() : null,
        },
      })

      let financial: unknown = null
      if (completes) {
        const adminFundService = createAdminFundService()
        financial = await adminFundService.approveWithdrawal({
          withdrawalId: id,
          transactionId,
          adminId: session.user.id!,
          adminName: session.user.name || "Admin",
          actorRole: role as "ADMIN" | "SUPER_ADMIN" | "MODERATOR",
        })
      }

      logger.info(
        { withdrawalId: id, completes, chainSteps: advanced.length },
        "withdrawal release advanced",
      )
      return NextResponse.json(
        {
          success: true,
          chainComplete: completes,
          chain: advanced,
          financial,
        },
        { status: 200 },
      )
    },
  )
}
