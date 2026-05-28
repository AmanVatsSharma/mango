/**
 * File:        components/admin-v2/surveillance/types.ts
 * Module:      admin-v2/surveillance
 * Purpose:     UI-side DTOs for the Phase 13b surveillance workbench. Mirror of the
 *              server projection in `lib/surveillance/types.ts` — kept separate so the client
 *              bundle never imports server-only modules (Prisma, DB).
 *
 * Exports:
 *   - SurveillanceQueueRow, SurveillanceQueueResponse
 *   - SurveillanceRuleRow, SurveillanceRuleListResponse
 *   - SurveillanceAlertDetail
 *   - SurveillanceFilter — UI-side filter state shape
 *
 * Side-effects: none.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

export type SurveillanceSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
export type SurveillanceAlertStatus =
  | "OPEN"
  | "ASSIGNED"
  | "INVESTIGATING"
  | "DISMISSED"
  | "RESOLVED"
  | "ESCALATED"

export interface SurveillanceQueueRow {
  id: string
  ruleKey: string
  ruleName: string
  severity: SurveillanceSeverity
  confidenceScore: number
  status: SurveillanceAlertStatus
  message: string
  createdAt: string
  user: {
    id: string | null
    name: string | null
    email: string | null
    phone: string | null
  }
  relatedWithdrawalId: string | null
  relatedTransactionId: string | null
  relatedBonusGrantId: string | null
  relatedAffiliateId: string | null
  assignedTo: { id: string; name: string | null } | null
  evidence: Record<string, unknown>
}

export interface SurveillanceKpis {
  open: number
  highSeverity: number
  unassigned: number
  resolvedToday: number
}

export interface SurveillanceQueueResponse {
  success: boolean
  rows: SurveillanceQueueRow[]
  total: number
  kpis: SurveillanceKpis
}

export interface SurveillanceRuleRow {
  id: string
  ruleKey: string
  name: string
  description: string | null
  severity: SurveillanceSeverity
  baseConfidence: number
  isActive: boolean
  params: Record<string, unknown>
  updatedAt: string
}

export interface SurveillanceRuleListResponse {
  success: boolean
  rules: SurveillanceRuleRow[]
}

export interface SurveillanceAlertDetail {
  success: boolean
  alert: {
    id: string
    ruleKey: string
    severity: SurveillanceSeverity
    confidenceScore: number
    status: SurveillanceAlertStatus
    message: string
    evidence: Record<string, unknown>
    createdAt: string
    relatedUser: { id: string; name: string | null; email: string | null; phone: string | null } | null
    relatedWithdrawalId: string | null
    relatedTransactionId: string | null
    relatedBonusGrantId: string | null
    relatedAffiliateId: string | null
    assignedTo: { id: string; name: string | null } | null
    dismissedBy: { id: string; name: string | null } | null
    dismissedAt: string | null
    dismissReason: string | null
    resolvedAt: string | null
    resolutionNote: string | null
  }
  rule: { name: string; description: string | null } | null
}

export interface SurveillanceFilter {
  status: SurveillanceAlertStatus | "ANY"
  severity: SurveillanceSeverity | "ANY"
  ruleKey: string | "ANY"
  q: string
}
