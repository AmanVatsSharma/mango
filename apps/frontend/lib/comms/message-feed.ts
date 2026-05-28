/**
 * File:        lib/comms/message-feed.ts
 * Module:      Comms · Message Feed
 * Purpose:     Read APIs over CommsMessage. Powers the admin global feed AND the
 *              per-client Comms Inbox tab in Client 360 (the "thread" — derived from
 *              messages, not stored in a thread row).
 *
 * Exports:
 *   - listMessages(filter, page) → Promise<{ rows, total, hasNext }>
 *   - listMessagesForUser(userId, channel?, limit) → Promise<CommsMessage[]>
 *
 * Depends on:
 *   - @/lib/prisma
 *   - @prisma/client — CommsMessage, CommsChannel, CommsMessageStatus, etc.
 *
 * Side-effects:  none (read-only)
 *
 * Key invariants:
 *   - Default ordering is queuedAt DESC. Per-user view returns OUTBOUND + INBOUND
 *     interleaved by queuedAt — that IS the thread.
 *
 * Read order:
 *   1. listMessages — admin global feed
 *   2. listMessagesForUser — Client 360 inbox derive
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import {
  Prisma,
  type CommsChannel,
  type CommsMessage,
  type CommsMessageDirection,
  type CommsMessageStatus,
} from "@prisma/client"

export interface MessageFeedFilter {
  userId?: string
  channel?: CommsChannel
  status?: CommsMessageStatus
  direction?: CommsMessageDirection
  campaignId?: string
  q?: string
}

export async function listMessages(
  filter: MessageFeedFilter = {},
  page: { limit?: number; offset?: number } = {},
): Promise<{ rows: CommsMessage[]; total: number; hasNext: boolean }> {
  const limit = Math.min(Math.max(page.limit ?? 50, 1), 200)
  const offset = Math.max(page.offset ?? 0, 0)

  const where: Prisma.CommsMessageWhereInput = {}
  if (filter.userId) where.userId = filter.userId
  if (filter.channel) where.channel = filter.channel
  if (filter.status) where.status = filter.status
  if (filter.direction) where.direction = filter.direction
  if (filter.campaignId) where.campaignId = filter.campaignId
  if (filter.q) {
    where.OR = [
      { renderedBody: { contains: filter.q, mode: "insensitive" } },
      { toAddress: { contains: filter.q, mode: "insensitive" } },
      { providerMessageId: { contains: filter.q, mode: "insensitive" } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.commsMessage.findMany({
      where,
      orderBy: { queuedAt: "desc" },
      skip: offset,
      take: limit,
    }),
    prisma.commsMessage.count({ where }),
  ])

  return { rows, total, hasNext: offset + rows.length < total }
}

export async function listMessagesForUser(
  userId: string,
  opts: { channel?: CommsChannel; limit?: number } = {},
): Promise<CommsMessage[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
  const where: Prisma.CommsMessageWhereInput = { userId }
  if (opts.channel) where.channel = opts.channel
  return prisma.commsMessage.findMany({
    where,
    orderBy: { queuedAt: "desc" },
    take: limit,
  })
}
