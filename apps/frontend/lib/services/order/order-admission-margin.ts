/**
 * @file order-admission-margin.ts
 * @module order
 * @description Release or reconcile per-order blocked margin and placement charges inside Prisma transactions.
 * @author StockTrade
 * @created 2026-03-25
 *
 * Notes:
 * - Uses amounts persisted on Order at placement (`blockedMargin`, `placementCharges`) for broker-correct release.
 */
import type { Prisma } from "@prisma/client"

import type { FundManagementService } from "@/lib/services/funds/FundManagementService"

export type ReleaseOrderAdmissionOnCancelTxParams = {
  orderId: string
  tradingAccountId: string
  blockedMargin: number
  placementCharges: number
  marginReleaseDescription: string
  chargesRefundDescription: string
}

/**
 * Release admission margin and refund placement-time charges (pending order cancelled).
 */
export async function releaseOrderAdmissionOnCancelTx(
  tx: Prisma.TransactionClient,
  fundService: FundManagementService,
  p: ReleaseOrderAdmissionOnCancelTxParams,
): Promise<void> {
  const m = Math.max(0, Math.trunc(p.blockedMargin))
  const c = Math.max(0, Math.trunc(p.placementCharges))
  if (m === 0 && c === 0) {
    return
  }

  if (m > 0) {
    await fundService.releaseMarginTx(tx, p.tradingAccountId, m, p.marginReleaseDescription, {
      orderId: p.orderId,
    })
  }

  if (c > 0) {
    await fundService.creditTx(tx, p.tradingAccountId, c, p.chargesRefundDescription, { orderId: p.orderId })
  }

  await tx.order.update({
    where: { id: p.orderId },
    data: { blockedMargin: 0, placementCharges: 0 },
  })
}

export type ReconcileOrderAdmissionAfterFillTxParams = {
  orderId: string
  tradingAccountId: string
  blockedMargin: number
  placementCharges: number
  marginReleaseDescription: string
}

/**
 * On fill: release order admission margin only (charges stay debited); clear persisted admission fields.
 */
export async function reconcileOrderAdmissionAfterFillTx(
  tx: Prisma.TransactionClient,
  fundService: FundManagementService,
  p: ReconcileOrderAdmissionAfterFillTxParams,
): Promise<void> {
  const m = Math.max(0, Math.trunc(p.blockedMargin))

  if (m > 0) {
    await fundService.releaseMarginTx(tx, p.tradingAccountId, m, p.marginReleaseDescription, {
      orderId: p.orderId,
    })
  }

  await tx.order.update({
    where: { id: p.orderId },
    data: { blockedMargin: 0, placementCharges: 0 },
  })
}
