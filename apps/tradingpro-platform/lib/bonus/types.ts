/**
 * File:        lib/bonus/types.ts
 * Module:      Bonus · Domain Types
 * Purpose:     Shared types for the B-book Bonus / Credit / Promo engine.
 *
 * Exports:
 *   - BONUS_KIND_META[kind]         — UI label + description + amount-shape hint per kind
 *   - GRANT_STATUS_META[status]     — UI label + tone per status
 *   - BonusRuleRow / BonusRuleInput — DB row + admin write input
 *   - BonusGrantRow / BulkIssueInput — grant row + bulk-issue payload
 *   - PromoCodeRow / PromoCodeInput — promo CRUD shape
 *   - GrantBurndownInput            — input to lib/bonus/burndown.ts
 *
 * Side-effects: none — pure types
 *
 * Key invariants:
 *   - All amounts are rupees (Decimal in Prisma, number on the wire).
 *   - For DEPOSIT_MATCH / LOSSBACK rules, pctOrFlat is interpreted as a percentage (0..100).
 *     For NO_DEPOSIT / REFERRAL it's a flat ₹ amount. Validators enforce this per kind.
 *   - turnoverMultiplier is the "trade N× the grant amount" requirement to UNLOCK.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import type { BonusGrantStatus, BonusKind } from "@prisma/client"

export type { BonusGrantStatus, BonusKind } from "@prisma/client"

export const BONUS_KINDS = [
  "DEPOSIT_MATCH",
  "NO_DEPOSIT",
  "LOSSBACK",
  "REFERRAL",
] as const satisfies readonly BonusKind[]

export const GRANT_STATUSES = [
  "ACTIVE",
  "UNLOCKED",
  "EXPIRED",
  "CLAWED_BACK",
] as const satisfies readonly BonusGrantStatus[]

export interface BonusKindMeta {
  kind: BonusKind
  label: string
  description: string
  /** Whether pctOrFlat is interpreted as a percentage (true) or a flat ₹ amount (false). */
  isPercentage: boolean
  tone: "info" | "success" | "warning" | "neutral"
}

export const BONUS_KIND_META: Record<BonusKind, BonusKindMeta> = {
  DEPOSIT_MATCH: {
    kind: "DEPOSIT_MATCH",
    label: "Deposit match",
    description: "% match on every qualifying deposit, capped by maxAmount.",
    isPercentage: true,
    tone: "info",
  },
  NO_DEPOSIT: {
    kind: "NO_DEPOSIT",
    label: "No-deposit",
    description: "Flat ₹ credit on signup or activation. Acquisition tool.",
    isPercentage: false,
    tone: "success",
  },
  LOSSBACK: {
    kind: "LOSSBACK",
    label: "Lossback",
    description: "% rebate of weekly net losses. Retention + reactivation.",
    isPercentage: true,
    tone: "warning",
  },
  REFERRAL: {
    kind: "REFERRAL",
    label: "Referral",
    description: "Flat ₹ credit on referred client funding. Used by IB program.",
    isPercentage: false,
    tone: "neutral",
  },
}

export interface GrantStatusMeta {
  status: BonusGrantStatus
  label: string
  tone: "info" | "success" | "warning" | "danger" | "neutral"
}

export const GRANT_STATUS_META: Record<BonusGrantStatus, GrantStatusMeta> = {
  ACTIVE: { status: "ACTIVE", label: "Active", tone: "info" },
  UNLOCKED: { status: "UNLOCKED", label: "Unlocked", tone: "success" },
  EXPIRED: { status: "EXPIRED", label: "Expired", tone: "warning" },
  CLAWED_BACK: { status: "CLAWED_BACK", label: "Clawed back", tone: "danger" },
}

export interface BonusRuleRow {
  id: string
  name: string
  kind: BonusKind
  pctOrFlat: number
  maxAmount: number | null
  turnoverMultiplier: number
  expiryDays: number | null
  isActive: boolean
  description: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
  /** Counts derived in the API for the rules table. */
  activeGrantCount?: number
  totalGrantCount?: number
}

export interface BonusRuleInput {
  name: string
  kind: BonusKind
  pctOrFlat: number
  maxAmount?: number | null
  turnoverMultiplier: number
  expiryDays?: number | null
  isActive?: boolean
  description?: string | null
}

export interface BonusGrantRow {
  id: string
  userId: string
  userName: string | null
  clientId: string | null
  ruleId: string
  ruleName: string
  ruleKind: BonusKind
  amount: number
  status: BonusGrantStatus
  turnoverProgress: number
  turnoverRequired: number
  /** 0..1 — derived from turnoverProgress / turnoverRequired. */
  unlockProgress: number
  expiresAt: string | null
  unlockedAt: string | null
  clawedBackAt: string | null
  clawbackReason: string | null
  source: string | null
  grantedById: string | null
  grantedByName: string | null
  grantedAt: string
}

export interface BulkIssueInput {
  ruleId: string
  amount: number
  /** When provided: issue to these specific user ids. */
  userIds?: string[]
  /** When provided: issue to all users matching this server-side filter (Phase 10 ships
   * userIds path; segment-based bulk lands in Phase 14 once segments are admin-driven). */
  segmentId?: string
  source?: string
}

export interface BulkIssueResult {
  success: boolean
  attempted: number
  granted: number
  failed: { userId: string; reason: string }[]
}

export interface PromoCodeRow {
  id: string
  code: string
  ruleId: string
  ruleName: string
  ruleKind: BonusKind
  maxUses: number | null
  usesCount: number
  expiresAt: string | null
  isActive: boolean
  notes: string | null
  createdById: string | null
  createdAt: string
  updatedAt: string
}

export interface PromoCodeInput {
  code: string
  ruleId: string
  maxUses?: number | null
  expiresAt?: string | null
  isActive?: boolean
  notes?: string | null
}

export interface GrantBurndownInput {
  /** The user whose grants should be advanced. */
  userId: string
  /** Trade notional in rupees that just settled. */
  notional: number
  /** Idempotency key — Transaction.id of the settled trade. */
  transactionId: string
}

export interface GrantBurndownResult {
  /** Number of grants whose turnoverProgress was advanced. */
  advanced: number
  /** Grant ids that crossed the unlock threshold during this burndown. */
  unlocked: string[]
  /** Grants that were already past their expiry — moved to EXPIRED. */
  expired: string[]
}
