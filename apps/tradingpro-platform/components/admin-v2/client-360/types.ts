/**
 * @file components/admin-v2/client-360/types.ts
 * @module admin-v2/client-360
 * @description TypeScript shapes that mirror the existing /api/admin/users responses.
 *              Loose where the API is loose — the goal is correct keys at compile time,
 *              not perfect runtime validation (that lives in zod schemas server-side).
 *
 *              Exports:
 *                - UserSummary    — row shape returned by GET /api/admin/users.
 *                - UserListResp   — list response wrapper.
 *                - UserDetail     — row shape returned by GET /api/admin/users/[userId].
 *                - UserDetailResp — detail response wrapper.
 *                - KycSummary, TradingAccountSummary, BankAccountSummary — nested shapes.
 *                - ClientFilters  — filter inputs accepted by useClientsList.
 *                - TabKey         — the union of Client 360 tab keys.
 *
 *              Side-effects: none.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export type TabKey =
  | "overview"
  | "compliance"
  | "trading"
  | "funds"
  | "crm"
  | "risk"
  | "winners"
  | "bonuses"
  | "affiliate"
  | "comms"
  | "sessions"
  | "audit"

export interface KycSummary {
  /** KYC primary key — required for inline approve/reject via /api/admin/kyc/bulk. */
  id?: string | null
  status?: "PENDING" | "APPROVED" | "REJECTED" | null
  amlStatus?: "PENDING" | "CLEAR" | "REVIEW" | "HIT" | null
  suspiciousStatus?: "NONE" | "REVIEW" | "ESCALATED" | "CLEARED" | null
  panNumber?: string | null
  aadhaarNumber?: string | null
  bankProofUrl?: string | null
  bankProofKey?: string | null
  submittedAt?: string | null
  approvedAt?: string | null
  slaDueAt?: string | null
  slaBreachedAt?: string | null
  amlFlags?: string[]
}

export interface TradingAccountSummary {
  balance?: number | string | null
  availableMargin?: number | string | null
  usedMargin?: number | string | null
}

export interface BankAccountSummary {
  id: string
  bankName: string
  accountNumber: string
  ifscCode: string
  accountHolderName: string
  isDefault: boolean
  isActive: boolean
}

export interface RmRef {
  id: string
  name: string | null
  email: string | null
}

export interface UserSummary {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  role: "USER" | "MODERATOR" | "ADMIN" | "SUPER_ADMIN"
  isActive: boolean
  suspendedAt?: string | null
  suspensionReason?: string | null
  createdAt: string
  /** Trading dashboard SSE presence — added by withTradingDashboardPresence. */
  isTradingDashboardOnline?: boolean
  /** Joined from related clusters when contactDuplicate=1. */
  hasRelatedContactOverlap?: boolean
  /** Joined when KYC is loaded by the list query. */
  kyc?: KycSummary | null
  managedBy?: RmRef | null
  tradingAccount?: TradingAccountSummary | null
}

export interface UserListResp {
  success?: boolean
  users: UserSummary[]
  total: number
  pages: number
}

export interface UserDetail extends UserSummary {
  bio?: string | null
  emailVerified?: string | null
  phoneVerified?: string | null
  requireOtpOnLogin?: boolean
  managedById?: string | null
  bankAccounts?: BankAccountSummary[]
  /** Pre-resolved presigned URL per /api/admin/users/[userId] hydration. */
  kyc?: KycSummary | null
  /** Denormalized from ReferralAttribution — peer User-to-User referral (separate from IB). */
  referredByUserId?: string | null
}

export interface UserDetailResp {
  success: true
  user: UserDetail
}

export interface ClientFilters {
  page?: number
  limit?: number
  search?: string
  status?: "all" | "active" | "deactivated" | "suspended"
  kycStatus?: "all" | "PENDING" | "APPROVED" | "REJECTED"
  role?: "all" | "USER" | "MODERATOR" | "ADMIN" | "SUPER_ADMIN"
  dateFrom?: string
  dateTo?: string
  rmId?: string
  contactDuplicate?: boolean
}
