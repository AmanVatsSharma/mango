/**
 * @file kyc-types.ts
 * @module admin-console/kyc-queue
 * @description Shared types and constants for the modular KYC queue.
 * @author StockTrade
 * @created 2026-04-07
 * @updated 2026-04-07
 */

/** Broker pipeline segment for table + CRM (see GET /api/admin/kyc?lifecycle=). */
export type KycLifecycleSegment = "LEAD" | "APPROVED_NOT_TRADING" | "TRADING"

export type KycUser = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  role: string
  isTradingDashboardOnline?: boolean
  relatedEmailCount?: number
  relatedPhoneCount?: number
  hasRelatedContactOverlap?: boolean
  /** True when the user has at least one EXECUTED order (active trader signal). */
  hasExecutedTrade?: boolean
  lifecycleSegment?: KycLifecycleSegment
  /** Present when `admin.users.crm` and queue included CRM hints. */
  crmTaskHint?: {
    nextDueAt: string | null
    overdueCount: number
    openCount: number
  }
}

export type KycAssignee = {
  id: string
  name: string | null
  email: string | null
  role: string
}

export type KycReviewLog = {
  id: string
  action: string
  note?: string | null
  createdAt: string
  reviewer?: {
    id: string
    name: string | null
    email: string | null
    role: string
  } | null
}

export type KycApplication = {
  id: string
  aadhaarNumber: string
  panNumber: string
  bankProofUrl?: string | null
  bankProofKey?: string | null
  status: string
  submittedAt: string
  approvedAt?: string | null
  assignedToId?: string | null
  assignedAt?: string | null
  slaDueAt?: string | null
  amlStatus: string
  amlFlags: string[]
  suspiciousStatus: string
  user: KycUser
  assignedTo?: KycAssignee | null
  _count?: {
    reviewLogs: number
  }
}

export type KycQueueMeta = {
  overdueCount: number
  flaggedCount: number
  suspiciousCount: number
  assignedCount: number
  crmCallbackRadar?: {
    overdue: number
    dueInHour: number
    dueToday: number
    observedAt: string
  }
}

export type KycRelatedUserBrief = {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  createdAt: string
  kycStatus: string
}

export const SLA_FILTERS = [
  { label: "All", value: "ALL" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Due Soon (24h)", value: "DUE_SOON" },
  { label: "Due in 48h", value: "DUE_48H" },
  { label: "Due in 72h", value: "DUE_72H" },
] as const

export const AML_STATUS_OPTIONS = ["ALL", "PENDING", "CLEAR", "REVIEW", "HIT"] as const
export const SUSPICIOUS_STATUS_OPTIONS = ["ALL", "NONE", "REVIEW", "ESCALATED", "CLEARED"] as const
export const KYC_STATUS_OPTIONS = ["ALL", "PENDING", "APPROVED", "REJECTED"] as const
export const UNASSIGNED_ASSIGNEE_VALUE = "__UNASSIGNED__"

/** UI + API query param values (see `normalizeAdminKycLifecycleParam`). */
export const KYC_LIFECYCLE_OPTIONS = [
  { label: "All pipeline", value: "ALL" },
  { label: "Leads (not approved)", value: "LEAD" },
  { label: "Approved — no trades yet", value: "APPROVED_NOT_TRADING" },
  { label: "Trading (has fills)", value: "TRADING" },
] as const

export function lifecycleSegmentShortLabel(segment: KycLifecycleSegment | undefined): string {
  if (segment === "TRADING") return "Trading"
  if (segment === "APPROVED_NOT_TRADING") return "Approved"
  return "Lead"
}

export function lifecycleSegmentDescription(segment: KycLifecycleSegment | undefined): string {
  if (segment === "TRADING") return "KYC approved and at least one executed order."
  if (segment === "APPROVED_NOT_TRADING") return "KYC approved; no executed orders yet."
  return "KYC pending or rejected — compliance funnel."
}

/** Tailwind classes for pipeline badges (table + CRM drawer). */
export function lifecycleSegmentBadgeClassName(segment: KycLifecycleSegment | undefined): string {
  const s = segment ?? "LEAD"
  if (s === "TRADING") {
    return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-400"
  }
  if (s === "APPROVED_NOT_TRADING") {
    return "bg-sky-500/15 text-sky-800 border-sky-500/25 dark:text-sky-300"
  }
  return "bg-amber-500/12 text-amber-800 border-amber-500/25 dark:text-amber-300"
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" })
}

export function maskAadhaar(value: string): string {
  return value.replace(/(\d{4})(\d{4})(\d{4})/, "$1-****-****")
}
