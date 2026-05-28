/**
 * File:        lib/winners/control-service.ts
 * Module:      Winners · Control Service
 * Purpose:     CRUD + audit-log + cache-bust for ClientWinnerControl. The single
 *              entrypoint admin APIs use to mutate per-client mitigation state.
 *
 * Exports:
 *   - getControl(userId)              — fetch (or auto-create at NONE) snapshot
 *   - listFlaggedWinners(opts)        — paginated table for /admin-v2/house/winners
 *   - updateControl(userId, input, performedBy) — apply changes + audit + invalidate cache
 *   - resetControl(userId, performedBy)         — back to baseline + clear all overrides
 *   - getHistory(userId, limit)       — paginated audit trail for one client
 *
 * Depends on:
 *   - @/lib/prisma
 *   - @/lib/redis/redis-client — pub/sub on winner_control:changed for spread engine consumers
 *   - ./types
 *
 * Side-effects:
 *   - DB read + write (ClientWinnerControl + ClientWinnerControlHistory)
 *   - Redis publish on `winner_control:changed` (so spread engine + order gate invalidate)
 *
 * Key invariants:
 *   - Every mutation appends a history row in the SAME transaction. No silent state drift.
 *   - resetControl wipes spreadMultiplier / positionCapPct / blockedInstruments /
 *     blockedSegments / maxOrderNotional and un-pins. Sets rung to NONE.
 *   - performedBy is required on every mutation entry — auditability is non-negotiable.
 *   - Calling getControl on a user with no row returns a synthetic NONE snapshot
 *     (NOT auto-inserted) — keeps reads cheap, writes are explicit.
 *
 * Read order:
 *   1. snapshotFromRow / synthNoneSnapshot — Prisma row → API shape
 *   2. updateControl — the workhorse
 *   3. listFlaggedWinners — admin queue query
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import { Prisma, type WinnerRung } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { redisPublish } from "@/lib/redis/redis-client"
import {
  WINNER_RUNG_META,
  type WinnerControlSnapshot,
  type WinnerControlUpdateInput,
  type WinnerHistoryEntry,
  type WinnerListResponse,
  type WinnerListRow,
} from "./types"

const CACHE_BUST_CHANNEL = "winner_control:changed"

type PrismaWinnerControl = Prisma.ClientWinnerControlGetPayload<true>
type PrismaWinnerHistory = Prisma.ClientWinnerControlHistoryGetPayload<{
  include: { triggeredBy: { select: { id: true; name: true; email: true } } }
}>

function decimalOrNull(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return typeof value === "number" ? value : Number(value)
}

function snapshotFromRow(row: PrismaWinnerControl): WinnerControlSnapshot {
  return {
    id: row.id,
    userId: row.userId,
    rung: row.rung,
    spreadMultiplier: decimalOrNull(row.spreadMultiplier),
    positionCapPct: decimalOrNull(row.positionCapPct),
    blockedInstruments: row.blockedInstruments,
    blockedSegments: row.blockedSegments,
    maxOrderNotional: decimalOrNull(row.maxOrderNotional),
    pinned: row.pinned,
    reason: row.reason,
    updatedById: row.updatedById,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

function synthNoneSnapshot(userId: string): WinnerControlSnapshot {
  const now = new Date().toISOString()
  return {
    id: "",
    userId,
    rung: "NONE",
    spreadMultiplier: null,
    positionCapPct: null,
    blockedInstruments: [],
    blockedSegments: [],
    maxOrderNotional: null,
    pinned: false,
    reason: null,
    updatedById: null,
    updatedAt: now,
    createdAt: now,
  }
}

export async function getControl(userId: string): Promise<WinnerControlSnapshot> {
  const row = await prisma.clientWinnerControl.findUnique({ where: { userId } })
  return row ? snapshotFromRow(row) : synthNoneSnapshot(userId)
}

interface ListOpts {
  rung?: WinnerRung
  pinned?: boolean
  search?: string
  limit?: number
  offset?: number
}

export async function listFlaggedWinners(opts: ListOpts = {}): Promise<WinnerListResponse> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const offset = Math.max(opts.offset ?? 0, 0)

  const where: Prisma.ClientWinnerControlWhereInput = {
    // By default, hide NONE — flagged-winners view should only show active mitigation.
    rung: opts.rung ?? { not: "NONE" },
    ...(opts.pinned !== undefined ? { pinned: opts.pinned } : {}),
    ...(opts.search
      ? {
          user: {
            OR: [
              { name: { contains: opts.search, mode: "insensitive" } },
              { email: { contains: opts.search, mode: "insensitive" } },
              { phone: { contains: opts.search } },
              { clientId: { contains: opts.search, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  }

  const [rows, total, rungGroups] = await Promise.all([
    prisma.clientWinnerControl.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, phone: true, clientId: true } },
      },
      orderBy: [{ rung: "desc" }, { updatedAt: "desc" }],
      take: limit,
      skip: offset,
    }),
    prisma.clientWinnerControl.count({ where }),
    prisma.clientWinnerControl.groupBy({
      by: ["rung"],
      _count: { _all: true },
    }),
  ])

  const byRung: WinnerListResponse["byRung"] = {
    NONE: 0,
    WATCH: 0,
    SPREAD_WIDEN: 0,
    POSITION_CAP: 0,
    INSTRUMENT_BLOCK: 0,
    ORDER_REJECT: 0,
    CLOSE_ONLY: 0,
    CLOSED_OUT: 0,
  }
  for (const g of rungGroups) byRung[g.rung] = g._count._all

  const tableRows: WinnerListRow[] = rows.map((row) => ({
    userId: row.userId,
    name: row.user?.name ?? null,
    email: row.user?.email ?? null,
    phone: row.user?.phone ?? null,
    clientId: row.user?.clientId ?? null,
    rung: row.rung,
    pinned: row.pinned,
    spreadMultiplier: decimalOrNull(row.spreadMultiplier),
    positionCapPct: decimalOrNull(row.positionCapPct),
    blockedInstruments: row.blockedInstruments,
    blockedSegments: row.blockedSegments,
    maxOrderNotional: decimalOrNull(row.maxOrderNotional),
    // Phase 9 ships without lifetime liability cache; surfaces as 0. Phase 13's
    // surveillance worker will populate this via ClientValueSnapshot.
    lifetimeBrokerLiability: 0,
    updatedAt: row.updatedAt.toISOString(),
  }))

  return { success: true, rows: tableRows, total, byRung }
}

interface UpdateContext {
  performedById: string
  /** AUTO_PROMOTE | AUTO_DEMOTE | MANUAL_SET | MANUAL_OVERRIDE | RESET | PIN | UNPIN */
  action: string
  /** Set when the change was triggered by the auto-engine — for idempotency dedupe. */
  triggeredByTransactionId?: string
  /** Free-form metadata stored on the history row. */
  metadata?: Record<string, unknown>
}

export async function updateControl(
  userId: string,
  input: WinnerControlUpdateInput,
  ctx: UpdateContext,
): Promise<WinnerControlSnapshot> {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.clientWinnerControl.findUnique({ where: { userId } })
    const fromRung: WinnerRung = existing?.rung ?? "NONE"
    const toRung: WinnerRung = input.rung ?? fromRung

    const updateData = buildPrismaUpdate(input, ctx.performedById)
    const createData = buildPrismaCreate(userId, input, ctx.performedById)

    const row = existing
      ? await tx.clientWinnerControl.update({ where: { userId }, data: updateData })
      : await tx.clientWinnerControl.create({ data: createData })

    await tx.clientWinnerControlHistory.create({
      data: {
        controlId: row.id,
        action: ctx.action,
        fromRung,
        toRung,
        reason: input.reason ?? null,
        triggeredById: ctx.performedById,
        triggeredByTransactionId: ctx.triggeredByTransactionId ?? null,
        metadata: (ctx.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    })

    return row
  })

  // Fire-and-forget; spread engine + order gate consumers re-read from DB on next request.
  void redisPublish(CACHE_BUST_CHANNEL, JSON.stringify({ userId, rung: updated.rung }))

  return snapshotFromRow(updated)
}

export async function resetControl(
  userId: string,
  ctx: { performedById: string; reason?: string },
): Promise<WinnerControlSnapshot> {
  return updateControl(
    userId,
    {
      rung: "NONE",
      spreadMultiplier: null,
      positionCapPct: null,
      blockedInstruments: [],
      blockedSegments: [],
      maxOrderNotional: null,
      pinned: false,
      reason: ctx.reason ?? "Reset to baseline",
    },
    { performedById: ctx.performedById, action: "RESET" },
  )
}

function buildPrismaUpdate(
  input: WinnerControlUpdateInput,
  performedById: string,
): Prisma.ClientWinnerControlUpdateInput {
  const data: Prisma.ClientWinnerControlUpdateInput = { updatedBy: { connect: { id: performedById } } }
  if (input.rung !== undefined) data.rung = input.rung
  if (input.spreadMultiplier !== undefined) data.spreadMultiplier = input.spreadMultiplier
  if (input.positionCapPct !== undefined) data.positionCapPct = input.positionCapPct
  if (input.blockedInstruments !== undefined) data.blockedInstruments = input.blockedInstruments
  if (input.blockedSegments !== undefined) data.blockedSegments = input.blockedSegments
  if (input.maxOrderNotional !== undefined) data.maxOrderNotional = input.maxOrderNotional
  if (input.pinned !== undefined) data.pinned = input.pinned
  if (input.reason !== undefined) data.reason = input.reason
  return data
}

function buildPrismaCreate(
  userId: string,
  input: WinnerControlUpdateInput,
  performedById: string,
): Prisma.ClientWinnerControlCreateInput {
  return {
    user: { connect: { id: userId } },
    updatedBy: { connect: { id: performedById } },
    rung: input.rung ?? "NONE",
    spreadMultiplier: input.spreadMultiplier ?? null,
    positionCapPct: input.positionCapPct ?? null,
    blockedInstruments: input.blockedInstruments ?? [],
    blockedSegments: input.blockedSegments ?? [],
    maxOrderNotional: input.maxOrderNotional ?? null,
    pinned: input.pinned ?? false,
    reason: input.reason ?? null,
  }
}

export async function getHistory(userId: string, limit = 50): Promise<WinnerHistoryEntry[]> {
  const control = await prisma.clientWinnerControl.findUnique({ where: { userId } })
  if (!control) return []
  const rows = (await prisma.clientWinnerControlHistory.findMany({
    where: { controlId: control.id },
    include: { triggeredBy: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
  })) as PrismaWinnerHistory[]

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    fromRung: row.fromRung,
    toRung: row.toRung,
    reason: row.reason,
    triggeredById: row.triggeredById,
    triggeredByName: row.triggeredBy?.name ?? row.triggeredBy?.email ?? null,
    triggeredByTransactionId: row.triggeredByTransactionId,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  }))
}

/** Re-export the public meta map so client components don't reach into types directly. */
export { WINNER_RUNG_META }
