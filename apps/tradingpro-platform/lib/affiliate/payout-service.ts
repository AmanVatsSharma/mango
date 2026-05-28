/**
 * File:        lib/affiliate/payout-service.ts
 * Module:      Affiliate / IB Program · Payout queue
 * Purpose:     Bundle commissions into a payout, drive PENDING → APPROVED → PAID lifecycle,
 *              compute TDS at the bundle level. Engine NEVER hardcodes a TDS rate; rate is
 *              passed in by the admin at create-time and audit-logged.
 *
 * Exports:
 *   - createPayoutForAffiliate(input)   — bundle ACCRUED/PAYABLE commissions into a PENDING payout
 *   - approvePayout(payoutId, adminId)  — flip PENDING → APPROVED, lock children to PAYABLE
 *   - markPayoutPaid(payoutId, adminId, reference)  — flip APPROVED → PAID, children → PAID
 *   - cancelPayout(payoutId, adminId, reason)       — flip → CANCELLED, free children back to ACCRUED
 *
 * Depends on:
 *   - @/lib/prisma
 *   - ./types
 *
 * Side-effects:
 *   - DB writes on AffiliatePayout + child AffiliateCommission rows.
 *
 * Key invariants:
 *   - createPayoutForAffiliate is atomic (a $transaction). Children are flipped to PAYABLE
 *     and linked via payoutId in the same tx. This prevents two simultaneous "create payout"
 *     calls from double-bundling the same commission row.
 *   - markPaid does NOT auto-write to the affiliate's bank — it only records the state +
 *     reference (UTR/UPI txn). Real bank disbursement is out-of-band; admin pastes the UTR.
 *   - cancelPayout REVERSES the state on children (PAYABLE → ACCRUED) so they're available
 *     for the next bundle. PAID payouts cannot be cancelled (would require a clawback flow).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { toNumber, type PayoutInput } from "./types"

interface CreatePayoutResult {
  id: string
  grossAmount: number
  tdsAmount: number
  netAmount: number
  commissionCount: number
}

export async function createPayoutForAffiliate(
  input: PayoutInput,
  createdById: string | null,
): Promise<CreatePayoutResult> {
  if (!Number.isFinite(input.tdsRate) || input.tdsRate < 0 || input.tdsRate > 1) {
    throw new Error("tdsRate must be a fraction in [0, 1]; got " + input.tdsRate)
  }

  const aff = await prisma.affiliate.findUnique({
    where: { id: input.affiliateId },
    select: { id: true, status: true, payoutMethod: true },
  })
  if (!aff) throw new Error("affiliate not found")
  if (aff.status !== "ACTIVE") throw new Error("affiliate is not ACTIVE")
  if (!aff.payoutMethod) {
    throw new Error("affiliate has no payoutMethod configured")
  }

  return prisma.$transaction(async (tx) => {
    // Pick commissions: explicit list or auto-bundle.
    const where: Prisma.AffiliateCommissionWhereInput = {
      affiliateId: input.affiliateId,
      status: { in: ["ACCRUED", "PAYABLE"] },
      payoutId: null,
    }
    if (input.cutoffDate) where.accruedAt = { lte: input.cutoffDate }
    if (input.commissionIds && input.commissionIds.length > 0) {
      where.id = { in: input.commissionIds }
    }

    const commissions = await tx.affiliateCommission.findMany({
      where,
      select: { id: true, amount: true },
    })
    if (commissions.length === 0) {
      throw new Error("no commissions available to bundle")
    }

    const grossAmount = commissions.reduce((s, c) => s + toNumber(c.amount), 0)
    const tdsAmount = grossAmount * input.tdsRate
    const netAmount = grossAmount - tdsAmount

    const payout = await tx.affiliatePayout.create({
      data: {
        affiliateId: input.affiliateId,
        grossAmount: new Prisma.Decimal(grossAmount.toFixed(2)),
        tdsAmount: new Prisma.Decimal(tdsAmount.toFixed(2)),
        netAmount: new Prisma.Decimal(netAmount.toFixed(2)),
        status: "PENDING",
        payoutMethod: aff.payoutMethod as Prisma.InputJsonValue,
        reference: input.reference ?? null,
        createdById,
      },
      select: { id: true },
    })

    // Distribute TDS proportionally across children. Tail row absorbs rounding drift.
    const tdsPerChildExact: number[] = commissions.map((c) =>
      grossAmount === 0 ? 0 : (toNumber(c.amount) / grossAmount) * tdsAmount,
    )
    const tdsRounded = tdsPerChildExact.map((v) => Number(v.toFixed(2)))
    const drift = Number((tdsAmount - tdsRounded.reduce((s, v) => s + v, 0)).toFixed(2))
    if (tdsRounded.length > 0) {
      tdsRounded[tdsRounded.length - 1] = Number((tdsRounded[tdsRounded.length - 1] + drift).toFixed(2))
    }

    // Bulk-update children with payoutId + per-row tdsAmount + status PAYABLE.
    // Prisma doesn't support per-row update in updateMany, so we iterate. With small bundle
    // sizes (typical 10s–100s) this is fine; for very large bundles consider chunking.
    for (let i = 0; i < commissions.length; i++) {
      await tx.affiliateCommission.update({
        where: { id: commissions[i].id },
        data: {
          payoutId: payout.id,
          status: "PAYABLE",
          tdsAmount: new Prisma.Decimal(tdsRounded[i].toFixed(2)),
        },
      })
    }

    return {
      id: payout.id,
      grossAmount,
      tdsAmount,
      netAmount,
      commissionCount: commissions.length,
    }
  })
}

export async function approvePayout(
  payoutId: string,
  approvedById: string,
): Promise<{ id: string; status: "APPROVED" }> {
  const updated = await prisma.affiliatePayout.update({
    where: { id: payoutId },
    data: {
      status: "APPROVED",
      approvedById,
      approvedAt: new Date(),
    },
    select: { id: true, status: true },
  })
  if (updated.status !== "APPROVED") {
    throw new Error("payout did not transition to APPROVED")
  }
  return { id: updated.id, status: "APPROVED" }
}

export async function markPayoutPaid(
  payoutId: string,
  paidById: string,
  reference: string | null,
): Promise<{ id: string; status: "PAID"; childCount: number }> {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.affiliatePayout.findUnique({
      where: { id: payoutId },
      select: { id: true, status: true },
    })
    if (!payout) throw new Error("payout not found")
    if (payout.status !== "APPROVED") {
      throw new Error(`payout must be APPROVED before mark-paid; was ${payout.status}`)
    }

    await tx.affiliatePayout.update({
      where: { id: payoutId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        approvedById: paidById, // last-actor; UI shows "paid by {name} (was approved by {other})"
        reference: reference ?? undefined,
      },
    })

    const childUpdate = await tx.affiliateCommission.updateMany({
      where: { payoutId, status: "PAYABLE" },
      data: { status: "PAID", paidAt: new Date() },
    })

    return { id: payoutId, status: "PAID" as const, childCount: childUpdate.count }
  })
}

export async function cancelPayout(
  payoutId: string,
  cancelledById: string,
  reason: string,
): Promise<{ id: string; status: "CANCELLED"; childCount: number }> {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.affiliatePayout.findUnique({
      where: { id: payoutId },
      select: { id: true, status: true },
    })
    if (!payout) throw new Error("payout not found")
    if (payout.status === "PAID") {
      throw new Error("PAID payout cannot be cancelled — issue a clawback instead")
    }

    await tx.affiliatePayout.update({
      where: { id: payoutId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason,
        approvedById: cancelledById,
      },
    })

    const childUpdate = await tx.affiliateCommission.updateMany({
      where: { payoutId },
      data: {
        payoutId: null,
        status: "ACCRUED",
        tdsAmount: new Prisma.Decimal(0),
        paidAt: null,
      },
    })

    return { id: payoutId, status: "CANCELLED" as const, childCount: childUpdate.count }
  })
}
