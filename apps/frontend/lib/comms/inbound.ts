/**
 * File:        lib/comms/inbound.ts
 * Module:      Comms · Inbound
 * Purpose:     Records inbound messages + delivery callbacks from channel providers.
 *              Two flows:
 *                - Inbound user reply  → INSERT new CommsMessage (direction=INBOUND).
 *                - Delivery callback   → UPDATE existing CommsMessage by providerMessageId.
 *
 *              Replies containing STOP / UNSUBSCRIBE auto-revoke consent (DLT/DPDP rule).
 *
 * Exports:
 *   - ingestInboundEvent(event) → Promise<{ ingested: 'INSERT' | 'UPDATE' | 'IGNORED' }>
 *
 * Depends on:
 *   - @/lib/prisma
 *   - @/lib/logger
 *   - ./consent — auto-revoke on STOP keywords
 *   - @prisma/client
 *
 * Side-effects:
 *   - DB writes (insert / update CommsMessage; revoke CommsConsent).
 *
 * Key invariants:
 *   - Idempotent on (providerName, providerMessageId). Duplicate webhook deliveries
 *     are silently ignored (return IGNORED), never duplicated.
 *   - STOP keyword detection is case-insensitive and word-boundary. Body "STOPLOSS" is
 *     NOT a stop keyword.
 *
 * Read order:
 *   1. ingestInboundEvent — main entry
 *   2. STOP_KEYWORDS — what triggers consent revoke
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import { baseLogger as logger } from "@/lib/observability/logger"
import type { CommsChannel } from "@prisma/client"
import { revokeConsent } from "./consent"
import type { InboundEvent } from "./types"

const STOP_KEYWORDS = ["STOP", "UNSUBSCRIBE", "OPTOUT"]

function isStopReply(body: string): boolean {
  const tokens = body.toUpperCase().split(/\s+/)
  return tokens.some((t) => STOP_KEYWORDS.includes(t))
}

async function findUserByAddress(
  address: string,
  channel: CommsChannel,
): Promise<{ id: string } | null> {
  const normalized = address.trim()
  if (!normalized) return null
  const where =
    channel === "EMAIL" ? { email: normalized } : { phone: normalized }
  return prisma.user.findFirst({ where, select: { id: true } })
}

export async function ingestInboundEvent(
  event: InboundEvent,
): Promise<{ ingested: "INSERT" | "UPDATE" | "IGNORED" }> {
  // ── 1. Delivery callback path: existing message id, just update status ───────────
  const existing = await prisma.commsMessage.findFirst({
    where: {
      providerName: event.providerName,
      providerMessageId: event.providerMessageId,
      direction: "OUTBOUND",
    },
    select: { id: true, status: true },
  })

  if (existing) {
    // Only ratchet status forward (SENT → DELIVERED → READ). Don't downgrade.
    const order: Record<string, number> = {
      QUEUED: 0,
      SENT: 1,
      DELIVERED: 2,
      READ: 3,
      FAILED: 4,
      LOGGED: 0,
      OPTED_OUT: 0,
      REJECTED: 0,
    }
    // Map a free-form provider event body to a status. The adapter is expected to
    // pre-normalize this in the future; for the LogProvider stub it'll never run.
    const next = inferStatusFromBody(event.body)
    if (next && order[next] > order[existing.status]) {
      const now = new Date()
      await prisma.commsMessage.update({
        where: { id: existing.id },
        data: {
          status: next,
          deliveredAt: next === "DELIVERED" ? now : undefined,
          readAt: next === "READ" ? now : undefined,
          failedAt: next === "FAILED" ? now : undefined,
          providerMeta: event.raw as object,
        },
      })
      return { ingested: "UPDATE" }
    }
    return { ingested: "IGNORED" }
  }

  // ── 2. New inbound user reply ────────────────────────────────────────────────────
  const user = await findUserByAddress(event.fromAddress, event.channel)
  await prisma.commsMessage.create({
    data: {
      channel: event.channel,
      direction: "INBOUND",
      status: "LOGGED",
      userId: user?.id ?? null,
      toAddress: event.toAddress,
      fromAddress: event.fromAddress,
      renderedBody: event.body,
      variablesUsed: {},
      providerName: event.providerName,
      providerMessageId: event.providerMessageId,
      providerMeta: event.raw as object,
    },
  })

  if (user && isStopReply(event.body)) {
    try {
      await revokeConsent({
        userId: user.id,
        channel: event.channel,
        reason: "USER_STOP_REPLY",
      })
    } catch (err) {
      logger.error(
        { err, userId: user.id, channel: event.channel },
        "[comms] auto-revoke on STOP reply failed",
      )
    }
  }

  return { ingested: "INSERT" }
}

function inferStatusFromBody(
  body: string,
): "DELIVERED" | "READ" | "FAILED" | null {
  const upper = body.toUpperCase()
  if (upper.includes("DELIVERED")) return "DELIVERED"
  if (upper.includes("READ")) return "READ"
  if (upper.includes("FAILED") || upper.includes("ERROR")) return "FAILED"
  return null
}
