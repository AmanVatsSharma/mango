/**
 * File:        lib/affiliate/tier-rules.ts
 * Module:      Affiliate / IB Program · Tier engine
 * Purpose:     Compute the affiliate's tier from their lifetime metrics. Pure-ish service —
 *              reads aggregate counts, returns the tier the ladder dictates. Persistence is
 *              left to the caller (admin route or nightly worker).
 *
 * Exports:
 *   - recomputeTierForAffiliate(affiliateId)   — read metrics → return target tier
 *   - applyTierRecompute(affiliateId)          — recompute + persist (no-op if unchanged)
 *
 * Depends on:
 *   - @/lib/prisma
 *   - ./types (DEFAULT_TIER_LADDER)
 *
 * Side-effects:
 *   - applyTierRecompute writes Affiliate.tier on promotion/demotion. NEVER touches `pinned`-
 *     style overrides (admin can hard-pin a tier via direct PATCH; this engine respects the
 *     pin via... [for now: no pin field exists; admin demotes by direct edit. Phase 11.5 may
 *     add a pin flag if the demotion churn proves disruptive]).
 *
 * Key invariants:
 *   - Tier ladder is monotonic (BRONZE < SILVER < GOLD). No skipping.
 *   - "Funded clients" counts unique users where this affiliate is the live attribution AND
 *     the user has at least one completed deposit (Deposit.status === "COMPLETED").
 *   - "Lifetime commission" sums ACCRUED + PAYABLE + PAID rows. CLAWED_BACK and VOID are excluded.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import { DEFAULT_TIER_LADDER, toNumber, type AffiliateTier } from "./types"

interface TierMetrics {
  fundedClients: number
  lifetimeCommissionRupees: number
}

async function readMetrics(affiliateId: string): Promise<TierMetrics> {
  const [fundedClients, lifetimeAgg] = await Promise.all([
    // Distinct user count where this affiliate is the live attribution + user has any
    // completed deposit. We count via a join through AffiliateAttribution → User.deposits.
    prisma.affiliateAttribution.count({
      where: {
        affiliateId,
        replacedById: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        user: {
          deposits: {
            some: { status: "COMPLETED" },
          },
        },
      },
    }),
    prisma.affiliateCommission.aggregate({
      where: {
        affiliateId,
        status: { in: ["ACCRUED", "PAYABLE", "PAID"] },
      },
      _sum: { amount: true },
    }),
  ])

  return {
    fundedClients,
    lifetimeCommissionRupees: toNumber(lifetimeAgg._sum.amount),
  }
}

/** Picks the highest tier whose thresholds the metrics meet. */
function tierFromMetrics(metrics: TierMetrics): AffiliateTier {
  // Iterate in descending order — highest tier wins.
  const sorted = [...DEFAULT_TIER_LADDER].sort((a, b) => {
    if (b.minLifetimeCommission !== a.minLifetimeCommission) {
      return b.minLifetimeCommission - a.minLifetimeCommission
    }
    return b.minFundedClients - a.minFundedClients
  })
  for (const t of sorted) {
    if (
      metrics.fundedClients >= t.minFundedClients &&
      metrics.lifetimeCommissionRupees >= t.minLifetimeCommission
    ) {
      return t.tier
    }
  }
  return "BRONZE"
}

export async function recomputeTierForAffiliate(
  affiliateId: string,
): Promise<{ currentTier: AffiliateTier; targetTier: AffiliateTier; metrics: TierMetrics }> {
  const aff = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: { tier: true },
  })
  if (!aff) throw new Error("affiliate not found")
  const metrics = await readMetrics(affiliateId)
  return { currentTier: aff.tier, targetTier: tierFromMetrics(metrics), metrics }
}

export async function applyTierRecompute(
  affiliateId: string,
): Promise<{ changed: boolean; from: AffiliateTier; to: AffiliateTier }> {
  const result = await recomputeTierForAffiliate(affiliateId)
  if (result.currentTier === result.targetTier) {
    return { changed: false, from: result.currentTier, to: result.targetTier }
  }
  await prisma.affiliate.update({
    where: { id: affiliateId },
    data: { tier: result.targetTier },
  })
  return { changed: true, from: result.currentTier, to: result.targetTier }
}
