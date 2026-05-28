/**
 * @file components/admin-v2/compliance/types.ts
 * @module admin-v2/compliance
 * @description Shapes mirrored from the existing GET /api/admin/kyc response. Loose where the
 *              API is loose — runtime validation lives server-side; this file is for compile-time
 *              correctness in the v2 components.
 *
 *              Exports: KycRow, KycListResp, KycFilters.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export interface KycUserRef {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  isTradingDashboardOnline?: boolean
  relatedEmailCount?: number
  relatedPhoneCount?: number
  hasRelatedContactOverlap?: boolean
  lifecycleSegment?: "LEAD" | "APPROVED_NOT_TRADING" | "TRADING" | null
  crmTaskHint?: { nextDueAt?: string | null; overdueCount?: number; openCount?: number } | null
}

export interface KycRow {
  id: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  amlStatus: "PENDING" | "CLEAR" | "REVIEW" | "HIT"
  amlFlags: string[]
  suspiciousStatus: "NONE" | "REVIEW" | "ESCALATED" | "CLEARED"
  submittedAt: string
  approvedAt: string | null
  assignedToId: string | null
  assignedAt: string | null
  slaDueAt: string | null
  slaBreachedAt: string | null
  user: KycUserRef
  assignedTo?: { id: string; name: string | null; email: string | null; role: string } | null
  _count?: { reviewLogs: number }
}

export interface KycListResp {
  kycApplications: KycRow[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  statusCounts: Partial<Record<"PENDING" | "APPROVED" | "REJECTED", number>>
  meta: {
    overdueCount: number
    flaggedCount: number
    suspiciousCount: number
    assignedCount: number
    crmCallbackRadar?: { overdue: number; dueInHour: number; dueToday: number; observedAt: string }
  }
}

export interface KycFilters {
  page?: number
  limit?: number
  search?: string
  status?: "ALL" | "PENDING" | "APPROVED" | "REJECTED"
  assignedTo?: string
  amlStatus?: "ALL" | "PENDING" | "CLEAR" | "REVIEW" | "HIT"
  suspiciousStatus?: "ALL" | "NONE" | "REVIEW" | "ESCALATED" | "CLEARED"
  sla?: "ALL" | "OVERDUE" | "DUE_SOON" | "DUE_48H" | "DUE_72H"
  flag?: string
  relatedContactOverlap?: boolean
  lifecycle?: "ALL" | "LEAD" | "APPROVED_NOT_TRADING" | "TRADING"
}

export interface BulkResultRow {
  kycId: string
  success: boolean
  status?: "APPROVED" | "REJECTED"
  error?: string
  code?: string
}

export interface BulkResp {
  attempted: number
  succeeded: number
  failed: number
  results: BulkResultRow[]
}
