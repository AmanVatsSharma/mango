/**
 * File:        lib/affiliate/types.ts
 * Module:      Affiliate / IB Program · Shared types
 * Purpose:     Cross-module shapes for the affiliate engine — attribution payloads,
 *              accrual context, payout DTOs. Mirrors the Prisma models so call sites
 *              don't import Prisma types directly.
 *
 * Exports:
 *   - AttributionContext       — input to recordAttribution()
 *   - AccrualEvent             — input to accrueForTrade()
 *   - AccrualResult            — { accruals, dedupeHits } returned per fill
 *   - CommissionFilter         — query shape for the admin commission feed
 *   - PayoutInput              — input to createPayoutForAffiliate()
 *   - TierThreshold            — tier promotion config (lifetime client volume / count)
 *
 * Depends on:
 *   - @prisma/client — enum + Decimal types
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - All monetary fields are in INR rupees (Decimal). Engines never round mid-pipeline;
 *     `.toFixed(2)` is applied ONLY when persisting via Prisma.Decimal.
 *   - Attribution windows are STRICT — accrual past `expiresAt` is a no-op, never a partial credit.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import type {
  AffiliateCommissionKind,
  AffiliateCommissionStatus,
  AffiliateStatus,
  AffiliateTier,
  Prisma,
} from "@prisma/client"

export type {
  AffiliateCommissionKind,
  AffiliateCommissionStatus,
  AffiliateStatus,
  AffiliateTier,
}

/** Default first-touch attribution window. 90 days from `firstTouchAt`. */
export const ATTRIBUTION_WINDOW_DAYS = 90

/** Tier promotion thresholds — used by tier-rules.recomputeTier(). */
export interface TierThreshold {
  tier: AffiliateTier
  /** Min number of attributed clients with at least one funded deposit. */
  minFundedClients: number
  /** Min lifetime gross commission generated (₹). */
  minLifetimeCommission: number
}

export const DEFAULT_TIER_LADDER: TierThreshold[] = [
  { tier: "BRONZE", minFundedClients: 0, minLifetimeCommission: 0 },
  { tier: "SILVER", minFundedClients: 25, minLifetimeCommission: 50_000 },
  { tier: "GOLD", minFundedClients: 100, minLifetimeCommission: 500_000 },
]

/** Source of an attribution event — one of these strings is stored on the row. */
export type AttributionSource = "URL" | "PROMO_CODE" | "MANUAL_ADMIN" | "API"

export interface AttributionContext {
  userId: string
  affiliateCode: string
  source: AttributionSource
  utm?: Record<string, string | null | undefined> | null
  /** Set when source === "MANUAL_ADMIN" — the admin User.id that performed the override. */
  attributedById?: string | null
}

/**
 * One settled trade event. Fed in by OrderExecutionWorker.runPostFillBookkeeping after a
 * fill is committed. The accrual engine reads the active rules for the attributed affiliate
 * (and any sub-affiliate parents in the cascade) and writes one AffiliateCommission row per
 * (affiliate, kind) it qualifies for.
 *
 * NOTE: `notional` is the gross trade value in rupees. `realizedPnl` is positive when the
 * client made money (broker lost), negative when client lost (broker made money). LOSS-scope
 * commissions only accrue on positive-broker-PnL trades — i.e., `realizedPnl < 0`.
 */
export interface AccrualEvent {
  /** Trader user id whose fill triggered the accrual. */
  userId: string
  /** Realized P&L Transaction.id for closing fills; orderId fallback for opening fills. */
  sourceTransactionId: string
  notional: number
  /** Spread revenue collected on this fill (positive ₹). */
  spreadRevenue?: number | null
  /** Client-side realized P&L. Negative number = client loss = broker gain. */
  realizedPnl?: number | null
  /** Lots traded on this fill (1 lot = 1 standard contract; equity = 1 share). */
  lots?: number | null
  /** True only for closing fills — drives FIXED-per-trade scope (one event = one trade). */
  isClose: boolean
}

export interface AccrualResult {
  /** Number of new commissions written. */
  accruals: number
  /** Idempotent hits — accruals that already existed for the same dedupe key. */
  dedupeHits: number
  /** Affiliates that had at least one accrual (top-of-cascade + parents). */
  affiliateIds: string[]
}

export interface CommissionFilter {
  affiliateId?: string
  status?: AffiliateCommissionStatus
  kind?: AffiliateCommissionKind
  fromDate?: Date
  toDate?: Date
  limit?: number
  offset?: number
}

export interface PayoutInput {
  affiliateId: string
  /** Optional explicit list of commission ids. If omitted, every PAYABLE/ACCRUED commission
   *  for this affiliate up to `cutoffDate` is bundled. */
  commissionIds?: string[]
  /** Window cap for the auto-bundle path. */
  cutoffDate?: Date
  /** TDS rate as a fraction (e.g., 0.05 = 5%). Required — engine never assumes a default. */
  tdsRate: number
  /** Optional reference (UTR for bank, txn ID for UPI) — set later via mark-paid. */
  reference?: string | null
  notes?: string | null
}

/** Lightweight projection used by the admin list. */
export interface AffiliateRow {
  id: string
  affiliateCode: string
  email: string
  name: string
  tier: AffiliateTier
  status: AffiliateStatus
  parentAffiliateId: string | null
  childCount: number
  attributedCount: number
  lifetimeAccruedRupees: number
  pendingPayableRupees: number
  paidRupees: number
  createdAt: Date
}

/** Helper: convert Decimal | number | string → number safely. Returns 0 on bad input. */
export function toNumber(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  // Prisma.Decimal
  const n = Number(v.toString())
  return Number.isFinite(n) ? n : 0
}
