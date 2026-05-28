/**
 * File:        components/admin-v2/withdrawals/types.ts
 * Module:      admin-v2/withdrawals
 * Purpose:     UI-side DTOs for the Phase 13a withdrawal-review workbench. Mirror of the
 *              server projection in `lib/withdrawal/types.ts` — kept separate so the client
 *              bundle never imports server-only modules.
 *
 * Exports:
 *   - QueueResponse, RuleRow, RuleListResponse
 *   - QueueFilter (re-exported as a string-literal union)
 *
 * Side-effects: none.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

export type QueueFilter =
  | "ALL"
  | "PENDING_HIGH_RISK"
  | "PENDING_LOW_RISK"
  | "HELD"
  | "PROCESSING"
  | "COMPLETED"

export interface ApprovalStep {
  stepIndex: number
  role: "RM" | "OPS" | "SUPER_ADMIN"
  action: "REQUIRED" | "APPROVED" | "REJECTED" | "ESCALATED"
  approverId?: string | null
  approverName?: string | null
  at?: string | null
  note?: string | null
}

export interface QueueRow {
  id: string
  userId: string
  userName: string | null
  userEmail: string | null
  clientId: string | null
  amount: string
  charges: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED"
  riskScore: number
  holdReason: string | null
  holdRuleKeys: string[]
  approvalChain: ApprovalStep[]
  heldAt: string | null
  releasedAt: string | null
  createdAt: string
  bankMasked: string | null
}

export interface QueueResponse {
  success: boolean
  rows: QueueRow[]
  total: number
  kpis: {
    pendingHighRisk: number
    pendingLowRisk: number
    held: number
    completedToday: number
  }
}

export interface RuleRow {
  id: string
  ruleKey: string
  name: string
  description: string | null
  points: number
  isActive: boolean
  params: Record<string, unknown>
  createdById: string | null
  updatedById: string | null
  createdAt: string
  updatedAt: string
}

export interface RuleListResponse {
  success: boolean
  rules: RuleRow[]
}
