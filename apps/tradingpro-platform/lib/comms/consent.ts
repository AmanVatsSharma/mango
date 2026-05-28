/**
 * File:        lib/comms/consent.ts
 * Module:      Comms · Consent
 * Purpose:     Per-user, per-channel opt-in/opt-out. Single source of truth for "may we
 *              send to this person on this channel". Used by the send-router (Gate #2).
 *
 * Exports:
 *   - hasActiveConsent(userId, channel) → Promise<boolean>
 *   - getConsent(userId, channel) → Promise<CommsConsent | null>
 *   - listConsentsForUser(userId) → Promise<CommsConsent[]>
 *   - grantConsent(input) → Promise<CommsConsent>          (idempotent — upserts)
 *   - revokeConsent(input) → Promise<CommsConsent>         (idempotent — sets optOutAt)
 *
 * Depends on:
 *   - @/lib/prisma — DB access
 *   - @prisma/client — CommsChannel, CommsConsent, CommsConsentSource
 *
 * Side-effects:
 *   - DB writes on grant/revoke. Reads on get/list/has.
 *
 * Key invariants:
 *   - Active consent = optInAt != null AND optOutAt == null. The send-router relies on
 *     this exact predicate; mirrors must not diverge.
 *   - Revoke does NOT delete the row — DPDP Act audit trail requires the historical
 *     optInAt to remain. Re-opt-in clears optOutAt and updates optInAt.
 *
 * Read order:
 *   1. hasActiveConsent — the gate predicate
 *   2. grantConsent / revokeConsent — the writers
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import type {
  CommsChannel,
  CommsConsent,
  CommsConsentSource,
  Prisma,
} from "@prisma/client"

/**
 * Channels that get auto-granted at user signup under SIGNUP_TERMS source. Voice + Push
 * are NOT auto-granted (voice requires explicit DLT for marketing calls; push needs a
 * device token that doesn't exist at signup time).
 */
export const SIGNUP_AUTO_CHANNELS: CommsChannel[] = [
  "WHATSAPP",
  "SMS",
  "EMAIL",
]

export async function hasActiveConsent(
  userId: string,
  channel: CommsChannel,
): Promise<boolean> {
  const row = await prisma.commsConsent.findUnique({
    where: { userId_channel: { userId, channel } },
    select: { optInAt: true, optOutAt: true },
  })
  if (!row) return false
  return Boolean(row.optInAt) && !row.optOutAt
}

export async function getConsent(
  userId: string,
  channel: CommsChannel,
): Promise<CommsConsent | null> {
  return prisma.commsConsent.findUnique({
    where: { userId_channel: { userId, channel } },
  })
}

export async function listConsentsForUser(
  userId: string,
): Promise<CommsConsent[]> {
  return prisma.commsConsent.findMany({
    where: { userId },
    orderBy: { channel: "asc" },
  })
}

export interface GrantConsentInput {
  userId: string
  channel: CommsChannel
  source: CommsConsentSource
  notes?: string | null
}

export async function grantConsent(
  input: GrantConsentInput,
): Promise<CommsConsent> {
  const now = new Date()
  return prisma.commsConsent.upsert({
    where: { userId_channel: { userId: input.userId, channel: input.channel } },
    create: {
      userId: input.userId,
      channel: input.channel,
      source: input.source,
      optInAt: now,
      notes: input.notes ?? null,
    },
    update: {
      source: input.source,
      optInAt: now,
      optOutAt: null,
      optOutReason: null,
      notes: input.notes ?? undefined,
    },
  })
}

/**
 * Transaction-aware variant. Used by the registration flow inside a single $transaction
 * so consent rows + user + tradingAccount land atomically (or all roll back together).
 */
export async function grantSignupConsentsTx(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const now = new Date()
  await tx.commsConsent.createMany({
    data: SIGNUP_AUTO_CHANNELS.map((channel) => ({
      userId,
      channel,
      source: "SIGNUP_TERMS" as const,
      optInAt: now,
    })),
    skipDuplicates: true,
  })
}

export interface RevokeConsentInput {
  userId: string
  channel: CommsChannel
  reason?: string | null
}

export async function revokeConsent(
  input: RevokeConsentInput,
): Promise<CommsConsent> {
  const now = new Date()
  // The row must exist (or we'd be opting out of nothing). Upsert defensively — the
  // create branch records a never-opted-in row marked as already-out; this is correct
  // behaviour for users who reply STOP before any opt-in event.
  return prisma.commsConsent.upsert({
    where: { userId_channel: { userId: input.userId, channel: input.channel } },
    create: {
      userId: input.userId,
      channel: input.channel,
      source: "ADMIN_GRANT",
      optInAt: null,
      optOutAt: now,
      optOutReason: input.reason ?? "USER_STOP_REPLY",
    },
    update: {
      optOutAt: now,
      optOutReason: input.reason ?? "USER_STOP_REPLY",
    },
  })
}
