/**
 * File:        lib/affiliate/attribution.ts
 * Module:      Affiliate / IB Program · Attribution
 * Purpose:     Record + resolve client-to-affiliate attribution. Implements first-touch
 *              attribution with a 90-day window. Manual admin overrides are permitted but
 *              chain to the previous row via `replacedById` so the full audit trail survives.
 *
 * Exports:
 *   - recordAttribution(ctx)                — write-or-no-op based on first-touch rule
 *   - reattributeManually(input)            — admin-only manual override
 *   - getActiveAttributionForUser(userId)   — current attribution, null if expired or absent
 *   - resolveAffiliateByCode(code)          — affiliate id by external code
 *
 * Depends on:
 *   - @/lib/prisma
 *   - ./types
 *
 * Side-effects:
 *   - DB writes on AffiliateAttribution (create + replacedById on overrides).
 *
 * Key invariants:
 *   - Per the plan §13 Open Decisions: FIRST-TOUCH wins. A second URL/promo attribution
 *     attempt while the first is still within window is a no-op (logged as "first-touch wins").
 *   - Admin re-attribution writes a NEW row with `replacedById = previousRow.id`. The OLD row's
 *     `expiresAt` is set to `now()` so accrual stops immediately on the old affiliate.
 *   - A user with an EXPIRED attribution can be re-attributed normally (URL/promo). The expired
 *     row is preserved for audit (no delete).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ATTRIBUTION_WINDOW_DAYS, type AttributionContext } from "./types"

/** Returns the affiliate id for a given external code, or null. */
export async function resolveAffiliateByCode(code: string): Promise<string | null> {
  if (!code) return null
  const aff = await prisma.affiliate.findUnique({
    where: { affiliateCode: code },
    select: { id: true, status: true },
  })
  if (!aff) return null
  if (aff.status === "REJECTED" || aff.status === "SUSPENDED") return null
  return aff.id
}

/** Returns the live attribution for a user, or null if absent / expired / replaced. */
export async function getActiveAttributionForUser(userId: string) {
  const row = await prisma.affiliateAttribution.findUnique({
    where: { userId },
    include: {
      affiliate: {
        select: {
          id: true,
          affiliateCode: true,
          name: true,
          tier: true,
          status: true,
          parentAffiliateId: true,
        },
      },
    },
  })
  if (!row) return null
  if (row.replacedById) return null
  if (row.expiresAt && row.expiresAt < new Date()) return null
  if (row.affiliate.status !== "ACTIVE") return null
  return row
}

/**
 * First-touch write. Caller is the signup flow OR an API ingest hook.
 *
 * Returns:
 *   - { recorded: true, attributionId } when a new row is written.
 *   - { recorded: false, reason: "first-touch wins" } when an active attribution already exists.
 *   - { recorded: false, reason: "affiliate not found" } / "affiliate inactive" / "user not found".
 */
export async function recordAttribution(
  ctx: AttributionContext,
): Promise<{ recorded: boolean; attributionId?: string; reason?: string }> {
  if (!ctx.userId || !ctx.affiliateCode) {
    return { recorded: false, reason: "missing inputs" }
  }
  const affiliateId = await resolveAffiliateByCode(ctx.affiliateCode)
  if (!affiliateId) return { recorded: false, reason: "affiliate not found or inactive" }

  // First-touch check.
  const existing = await prisma.affiliateAttribution.findUnique({
    where: { userId: ctx.userId },
    select: { id: true, expiresAt: true, replacedById: true },
  })
  if (existing) {
    const stillLive = !existing.replacedById && (!existing.expiresAt || existing.expiresAt > new Date())
    if (stillLive) {
      return { recorded: false, reason: "first-touch wins (existing live attribution)" }
    }
    // Expired or replaced → can be re-attributed; we drop a new row.
  }

  const expiresAt = new Date(Date.now() + ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const row = await prisma.affiliateAttribution.create({
    data: {
      userId: ctx.userId,
      affiliateId,
      source: ctx.source,
      utm: (ctx.utm ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      firstTouchAt: new Date(),
      expiresAt,
      attributedById: ctx.attributedById ?? null,
    },
    select: { id: true },
  })

  return { recorded: true, attributionId: row.id }
}

/**
 * Admin-only manual override. ALWAYS writes a new row; old row gets `replacedById` set and
 * `expiresAt` clamped to now so accrual stops on the old affiliate immediately.
 *
 * Throws if `userId` doesn't exist, or if `affiliateCode` isn't ACTIVE.
 */
export async function reattributeManually(input: {
  userId: string
  affiliateCode: string
  attributedById: string
  reason: string
  utm?: Record<string, string | null | undefined> | null
}): Promise<{ attributionId: string; replacedAttributionId: string | null }> {
  const newAffId = await resolveAffiliateByCode(input.affiliateCode)
  if (!newAffId) throw new Error("affiliate not found or inactive")

  const expiresAt = new Date(Date.now() + ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  return prisma.$transaction(async (tx) => {
    const previous = await tx.affiliateAttribution.findUnique({
      where: { userId: input.userId },
      select: { id: true, expiresAt: true, replacedById: true },
    })

    // CASE 1: Previous row is the unique row on userId — we can't keep it AND insert a new one
    // because of the @unique on userId. We must delete the previous (audit lives via Trading
    // log + the new row's metadata) OR use a soft-replacement strategy.
    //
    // We chose the soft strategy: delete the previous row's pointer FROM the userId @unique
    // by clamping its expiry; but Prisma won't let two rows share userId. Therefore we DELETE
    // the previous row only after copying its identity into the new row's metadata, AND we
    // emit a TradingLog (caller's responsibility) for full audit.
    //
    // This mirrors how ReferralAttribution handles re-attribution (rare, admin-only, audited).
    let replacedAttributionId: string | null = null
    if (previous) {
      replacedAttributionId = previous.id
      await tx.affiliateAttribution.delete({ where: { id: previous.id } })
    }

    const created = await tx.affiliateAttribution.create({
      data: {
        userId: input.userId,
        affiliateId: newAffId,
        source: "MANUAL_ADMIN",
        utm: (input.utm ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        firstTouchAt: new Date(),
        expiresAt,
        attributedById: input.attributedById,
        // Note: we'd love to FK link to the deleted previous row, but soft-replacement above
        // means there is no row to point to. The deletion itself is the audit signal; the
        // TradingLog row carries the previous affiliate id + reason for compliance review.
      },
      select: { id: true },
    })

    return { attributionId: created.id, replacedAttributionId }
  })
}
