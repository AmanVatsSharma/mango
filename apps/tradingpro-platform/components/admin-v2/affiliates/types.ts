/**
 * @file components/admin-v2/affiliates/types.ts
 * @module admin-v2/affiliates
 * @description Loose TypeScript shapes mirroring the affiliate API responses.
 *
 *              Exports:
 *                - AffiliateRow / AffiliateListResp
 *                - AffiliateDetail / AffiliateDetailResp
 *                - CommissionRow / CommissionListResp
 *                - PayoutRow / PayoutListResp
 *                - AttributionRow / AttributionListResp
 *                - Tier / Status / Kind / CommissionStatus / PayoutStatus enums (string literals)
 *
 * @author StockTrade
 * @created 2026-04-27
 */

export type Tier = "BRONZE" | "SILVER" | "GOLD"
export type Status = "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED"
export type Kind = "SPREAD" | "LOSS" | "LOT" | "FIXED"
export type CommissionStatus = "ACCRUED" | "PAYABLE" | "PAID" | "CLAWED_BACK" | "VOID"
export type PayoutStatus = "PENDING" | "APPROVED" | "PAID" | "CANCELLED"

export interface AffiliateRow {
  id: string
  affiliateCode: string
  email: string
  name: string
  tier: Tier
  status: Status
  parentAffiliateId: string | null
  childCount: number
  attributedCount: number
  lifetimeAccruedRupees: number | string
  pendingPayableRupees: number | string
  paidRupees: number | string
  createdAt: string
}

export interface AffiliateListResp {
  success: boolean
  rows: AffiliateRow[]
  total: number
  page: number
  limit: number
}

export interface CommissionRule {
  id: string
  affiliateId: string
  kind: Kind
  rate: string | number
  perEventCap?: string | number | null
  perMonthCap?: string | number | null
  isActive: boolean
  validFrom?: string | null
  validTo?: string | null
  notes?: string | null
  createdAt: string
}

export interface AffiliateDetail extends AffiliateRow {
  phone: string | null
  payoutMethod: Record<string, unknown> | null
  kycLite: Record<string, unknown> | null
  notes: string | null
  parentAffiliate?: { id: string; affiliateCode: string; name: string; tier: Tier } | null
  children?: { id: string; affiliateCode: string; name: string; tier: Tier; status: Status }[]
  commissionRules?: CommissionRule[]
  linkedUser?: { id: string; name: string | null; email: string | null; clientId: string | null } | null
  totals?: {
    lifetime: number
    pending: number
    paid: number
    clawedBack: number
  }
}

export interface AffiliateDetailResp {
  success: boolean
  row: AffiliateDetail
}

export interface CommissionRow {
  id: string
  affiliateId: string
  affiliate?: { id: string; affiliateCode: string; name: string; tier: Tier }
  sourceUserId: string
  sourceUser?: { id: string; name: string | null; email: string | null; clientId: string | null }
  sourceTransactionId: string
  kind: Kind
  amount: string | number
  tdsAmount: string | number
  status: CommissionStatus
  payoutId: string | null
  metadata?: Record<string, unknown> | null
  accruedAt: string
  paidAt: string | null
}

export interface CommissionListResp {
  success: boolean
  rows: CommissionRow[]
  total: number
  page: number
  limit: number
  sumGrossRupees: number
  sumTdsRupees: number
}

export interface PayoutRow {
  id: string
  affiliateId: string
  affiliate?: { id: string; affiliateCode: string; name: string; tier: Tier }
  grossAmount: string | number
  tdsAmount: string | number
  netAmount: string | number
  status: PayoutStatus
  payoutMethod: Record<string, unknown>
  reference: string | null
  approvedAt: string | null
  paidAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  createdAt: string
  _count?: { commissions: number }
}

export interface PayoutListResp {
  success: boolean
  rows: PayoutRow[]
  total: number
  page: number
  limit: number
}

export interface AttributionRow {
  id: string
  userId: string
  user?: { id: string; name: string | null; email: string | null; clientId: string | null }
  affiliateId: string
  affiliate?: { id: string; affiliateCode: string; name: string; tier: Tier }
  source: string
  utm?: Record<string, string | null> | null
  firstTouchAt: string
  expiresAt: string | null
  attributedById: string | null
  replacedById: string | null
  createdAt: string
}

export interface AttributionListResp {
  success: boolean
  rows: AttributionRow[]
  total: number
  page: number
  limit: number
}
