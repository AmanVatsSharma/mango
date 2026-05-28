/**
 * File:        app/api/admin/withdrawals/bulk-approve/route.ts
 * Module:      Admin · Funds · Withdrawals · Bulk approve (Phase 13a)
 * Purpose:     POST that approves a batch of LOW-RISK withdrawals (riskScore < holdThreshold)
 *              with one transactionId per row. Best-effort — a failure on one row does NOT
 *              block the rest. Returns per-row outcomes.
 *
 * Exports:
 *   - POST — body { items: { withdrawalId, transactionId }[] }, max 50 per request.
 *
 * Depends on:
 *   - @/lib/rbac/admin-api          — RBAC + audit + logger.
 *   - @/lib/services/admin/AdminFundService — financial action.
 *
 * Side-effects: DB writes via the existing approveWithdrawal flow per item.
 *
 * Key invariants:
 *   - HARD GUARD: this endpoint REFUSES rows that are currently held (`heldAt != null`,
 *     `releasedAt == null`). The whole point of holding is to force the chain — bulk-bypassing
 *     it here defeats Phase 13a.
 *   - Cap of 50 mirrors the bulk-KYC endpoint convention.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { NextResponse } from "next/server"
import { handleAdminApi } from "@/lib/rbac/admin-api"
import { AppError } from "@/src/common/errors"
import { prisma } from "@/lib/prisma"
import { createAdminFundService } from "@/lib/services/admin/AdminFundService"

interface BulkItem {
  withdrawalId: string
  transactionId: string
}

const MAX_PER_REQUEST = 50

export async function POST(req: Request) {
  return handleAdminApi(
    req,
    {
      route: "/api/admin/withdrawals/bulk-approve",
      required: "admin.withdrawals.manage",
      fallbackMessage: "Failed to bulk-approve withdrawals",
    },
    async ({ session, role, logger }) => {
      const body = (await req.json().catch(() => ({}))) as { items?: BulkItem[] }
      const raw = Array.isArray(body.items) ? body.items : []
      if (raw.length === 0) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "items[] is required",
          statusCode: 400,
        })
      }
      if (raw.length > MAX_PER_REQUEST) {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: `Max ${MAX_PER_REQUEST} items per request`,
          statusCode: 400,
        })
      }
      const items: BulkItem[] = raw
        .filter(
          (i): i is BulkItem =>
            !!i &&
            typeof i.withdrawalId === "string" &&
            typeof i.transactionId === "string" &&
            i.withdrawalId.trim() !== "" &&
            i.transactionId.trim() !== "",
        )
        .map((i) => ({
          withdrawalId: i.withdrawalId.trim(),
          transactionId: i.transactionId.trim(),
        }))

      const ids = items.map((i) => i.withdrawalId)
      const heldRows = await adminPrisma.withdrawal.findMany({
        where: { id: { in: ids }, heldAt: { not: null }, releasedAt: null },
        select: { id: true },
      })
      const heldSet = new Set(heldRows.map((r) => r.id))

      const adminFundService = createAdminFundService()
      const approved: string[] = []
      const skippedHeld: string[] = []
      const failed: { withdrawalId: string; reason: string }[] = []

      for (const item of items) {
        if (heldSet.has(item.withdrawalId)) {
          skippedHeld.push(item.withdrawalId)
          continue
        }
        try {
          await adminFundService.approveWithdrawal({
            withdrawalId: item.withdrawalId,
            transactionId: item.transactionId,
            adminId: session.user.id!,
            adminName: session.user.name || "Admin",
            actorRole: role as "ADMIN" | "SUPER_ADMIN" | "MODERATOR",
          })
          approved.push(item.withdrawalId)
        } catch (err) {
          const reason =
            err instanceof Error ? err.message : "Unknown error"
          failed.push({ withdrawalId: item.withdrawalId, reason })
        }
      }

      logger.info(
        {
          requested: items.length,
          approved: approved.length,
          skippedHeld: skippedHeld.length,
          failed: failed.length,
        },
        "withdrawal bulk-approve done",
      )
      return NextResponse.json(
        {
          success: true,
          approved,
          skippedHeld,
          failed,
        },
        { status: 200 },
      )
    },
  )
}
