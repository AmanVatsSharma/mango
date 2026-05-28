/**
 * @file components/admin-v2/crm/types.ts
 * @module admin-v2/crm
 * @description Canonical CRM shapes for v2. Mirrors the existing /api/admin/users/[userId]/crm/*
 *              and /api/admin/crm/{callback-radar,queue} responses.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export type CrmNoteVisibility = "TEAM" | "MANAGER_ONLY"

export interface CrmActor {
  id: string
  name: string | null
  email: string | null
}

export interface CrmNote {
  id: string
  userId: string
  body: string
  isPinned: boolean
  visibility: CrmNoteVisibility
  createdAt: string
  updatedAt: string
  createdBy: CrmActor | null
}

export type CrmTaskKind = "CALLBACK" | "FOLLOW_UP" | "DOCUMENT" | "OTHER"
export type CrmTaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED"
export type CrmTaskPriority = "LOW" | "NORMAL" | "HIGH"
export type CrmTaskDisposition =
  | "NO_ANSWER"
  | "CALLBACK_SCHEDULED"
  | "WRONG_NUMBER"
  | "SPOKE_FOLLOWUP"
  | "OTHER"

export interface CrmTask {
  id: string
  userId: string
  title: string
  description: string | null
  kind: CrmTaskKind
  status: CrmTaskStatus
  priority: CrmTaskPriority
  dueAt: string | null
  snoozeCount: number
  disposition: CrmTaskDisposition | null
  outcomeNote: string | null
  createdAt: string
  updatedAt: string
  createdBy: CrmActor | null
  completedBy: CrmActor | null
  completedAt: string | null
}

export interface CrmRadarCounts {
  overdue: number
  dueInHour: number
  dueToday: number
  observedAt: string
}

export interface CrmQueueRow extends CrmTask {
  user: {
    id: string
    name: string | null
    email: string | null
    phone: string | null
    clientId: string | null
    isActive: boolean
  }
}

export interface CrmQueueResp {
  bucket: "overdue" | "due_in_hour" | "due_today"
  observedAt: string
  tasks: CrmQueueRow[]
}
