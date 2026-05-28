/**
 * @file referral-attribution.ts
 * @module lib/services/referral
 * @description Resolve signup ref codes (ReferralLink or referrer clientId) and persist ReferralAttribution + User.referredByUserId inside a DB transaction.
 * @author StockTrade
 * @created 2026-04-01
 */

import type { PrismaTransactionClient } from "@/lib/database-transactions"

const URL_SIGNUP = "URL_SIGNUP"
const MANUAL_ADMIN = "MANUAL_ADMIN"

export type ReferralAttributionSource = typeof URL_SIGNUP | typeof MANUAL_ADMIN

function normalizeClientIdVariant(code: string): string[] {
  const trimmed = code.trim()
  const out = new Set<string>([trimmed])
  if (trimmed.length >= 2) {
    const v = trimmed.slice(0, 2).toUpperCase() + trimmed.slice(2)
    out.add(v)
  }
  return Array.from(out)
}

/**
 * Applies referral attribution for a newly created user. Safe to call multiple times (no-op if already attributed).
 */
export async function applyReferralAttributionOnSignup(
  tx: PrismaTransactionClient,
  refereeUserId: string,
  ref: string | null | undefined,
  source: ReferralAttributionSource,
): Promise<void> {
  const raw = typeof ref === "string" ? ref.trim() : ""
  if (!raw) return

  const existing = await tx.referralAttribution.findUnique({
    where: { refereeUserId },
  })
  if (existing) return

  const now = new Date()

  const link = await tx.referralLink.findFirst({
    where: {
      code: raw,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  })

  let referrerUserId: string | null = null
  let referralLinkId: string | null = null

  if (link) {
    const maxOk = link.maxUses == null || link.usedCount < link.maxUses
    if (!maxOk) return
    referrerUserId = link.createdById
    referralLinkId = link.id
  } else {
    let referrer: { id: string } | null = null
    for (const variant of normalizeClientIdVariant(raw)) {
      referrer = await tx.user.findFirst({
        where: { clientId: variant },
        select: { id: true },
      })
      if (referrer) break
    }
    if (!referrer) return
    referrerUserId = referrer.id
  }

  if (!referrerUserId || referrerUserId === refereeUserId) return

  await tx.referralAttribution.create({
    data: {
      refereeUserId,
      referrerUserId,
      referralLinkId,
      rawCode: raw,
      source,
    },
  })

  await tx.user.update({
    where: { id: refereeUserId },
    data: { referredByUserId: referrerUserId },
  })

  if (referralLinkId) {
    await tx.referralLink.update({
      where: { id: referralLinkId },
      data: { usedCount: { increment: 1 } },
    })
  }
}

export const referralAttributionSource = { URL_SIGNUP, MANUAL_ADMIN }
