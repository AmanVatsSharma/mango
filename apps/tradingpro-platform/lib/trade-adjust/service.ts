/**
 * File:        lib/trade-adjust/service.ts
 * Module:      Trade Adjust · Service
 * Purpose:     Record manual trade-adjustment actions to TradeAdjustmentLog. Phase 9
 *              ships the audit-recording layer + admin API surface; the actual
 *              order/position state mutations (cancellation, requote, force-liquidate)
 *              are wired via existing services in Phase 9.5 — separate concern.
 *
 * Exports:
 *   - logAdjustment(input, performedById)  — record an adjustment row
 *   - listAdjustmentsForUser(userId, limit) — Client 360 → Trading tab feed
 *   - listAdjustmentsForOrder(orderId)      — Command Centre v2 row drilldown
 *
 * Depends on:
 *   - @/lib/prisma
 *   - ./types
 *
 * Side-effects:
 *   - DB write (TradeAdjustmentLog)
 *
 * Key invariants:
 *   - Either orderId OR positionId must be set (not both null).
 *   - reason is required (not nullable in writes; the schema allows null for legacy
 *     migration headroom but the service rejects empty strings).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  TRADE_ADJUST_ACTIONS,
  type TradeAdjustAction,
  type TradeAdjustInput,
  type TradeAdjustLogRow,
} from "./types"

type PrismaLogRow = Prisma.TradeAdjustmentLogGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true } }
    performedBy: { select: { id: true; name: true; email: true } }
  }
}>

function toRow(row: PrismaLogRow): TradeAdjustLogRow {
  return {
    id: row.id,
    orderId: row.orderId,
    positionId: row.positionId,
    userId: row.userId,
    userName: row.user?.name ?? row.user?.email ?? null,
    action: row.action as TradeAdjustAction,
    fromValue: (row.fromValue as Record<string, unknown> | null) ?? null,
    toValue: (row.toValue as Record<string, unknown> | null) ?? null,
    reason: row.reason,
    performedById: row.performedById,
    performedByName: row.performedBy?.name ?? row.performedBy?.email ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export class TradeAdjustValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TradeAdjustValidationError"
  }
}

export async function logAdjustment(
  input: TradeAdjustInput,
  performedById: string,
): Promise<TradeAdjustLogRow> {
  if (!TRADE_ADJUST_ACTIONS.includes(input.action)) {
    throw new TradeAdjustValidationError(`Unknown action: ${input.action}`)
  }
  if (!input.orderId && !input.positionId) {
    throw new TradeAdjustValidationError("Either orderId or positionId is required.")
  }
  if (!input.reason || input.reason.trim().length === 0) {
    throw new TradeAdjustValidationError("Reason is required for every trade adjustment.")
  }

  const row = await prisma.tradeAdjustmentLog.create({
    data: {
      orderId: input.orderId ?? null,
      positionId: input.positionId ?? null,
      userId: input.userId,
      action: input.action,
      fromValue: (input.fromValue as Prisma.InputJsonValue) ?? undefined,
      toValue: (input.toValue as Prisma.InputJsonValue) ?? undefined,
      reason: input.reason,
      performedById,
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      performedBy: { select: { id: true, name: true, email: true } },
    },
  })

  return toRow(row)
}

export async function listAdjustmentsForUser(
  userId: string,
  limit = 50,
): Promise<TradeAdjustLogRow[]> {
  const rows = (await prisma.tradeAdjustmentLog.findMany({
    where: { userId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      performedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  })) as PrismaLogRow[]
  return rows.map(toRow)
}

export async function listAdjustmentsForOrder(orderId: string): Promise<TradeAdjustLogRow[]> {
  const rows = (await prisma.tradeAdjustmentLog.findMany({
    where: { orderId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      performedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  })) as PrismaLogRow[]
  return rows.map(toRow)
}
