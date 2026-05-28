/**
 * @file components/admin-v2/comms/types.ts
 * @module admin-v2/comms
 * @description Loose TypeScript shapes mirroring the comms API responses.
 *
 *              Exports:
 *                - Channel, TemplateStatus, CampaignKind, CampaignStatus, MessageStatus,
 *                  MessageDirection, ConsentSource — string literal enums
 *                - TemplateRow, TemplateListResp
 *                - CampaignRow, CampaignListResp
 *                - MessageRow, MessageListResp
 *                - ConsentRow, ConsentListResp
 *                - SendResultResp — wrapped SendResult from the send-router
 *
 * @author StockTrade
 * @created 2026-04-27
 */

export type Channel = "WHATSAPP" | "SMS" | "EMAIL" | "VOICE" | "PUSH"
export type TemplateStatus = "DRAFT" | "ACTIVE" | "ARCHIVED"
export type CampaignKind = "ONE_SHOT" | "DRIP" | "TRIGGERED"
export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED"
export type MessageStatus =
  | "QUEUED"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "LOGGED"
  | "OPTED_OUT"
  | "REJECTED"
export type MessageDirection = "OUTBOUND" | "INBOUND"
export type ConsentSource =
  | "SIGNUP_TERMS"
  | "DOUBLE_OPT_IN"
  | "ADMIN_GRANT"
  | "IMPORT"

export interface TemplateRow {
  id: string
  name: string
  channel: Channel
  variables: string[]
  body: string
  meta: Record<string, unknown>
  dltTemplateId: string | null
  status: TemplateStatus
  createdById: string | null
  createdAt: string
  updatedAt: string
}

export interface TemplateListResp {
  success: boolean
  rows: TemplateRow[]
}

export interface CampaignStep {
  templateId: string
  delayMinutes?: number
}

export interface CampaignRow {
  id: string
  name: string
  channel: Channel
  kind: CampaignKind
  status: CampaignStatus
  steps: CampaignStep[] | unknown
  audience: Record<string, unknown>
  scheduledAt: string | null
  defaultTemplateId: string | null
  enrollmentCount: number
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface CampaignListResp {
  success: boolean
  rows: CampaignRow[]
}

export interface MessageRow {
  id: string
  channel: Channel
  direction: MessageDirection
  status: MessageStatus
  userId: string | null
  toAddress: string | null
  fromAddress: string | null
  renderedBody: string
  variablesUsed: Record<string, unknown>
  templateId: string | null
  campaignId: string | null
  stepIndex: number | null
  providerMessageId: string | null
  providerName: string | null
  failureReason: string | null
  providerMeta: Record<string, unknown>
  queuedAt: string
  sentAt: string | null
  deliveredAt: string | null
  readAt: string | null
  failedAt: string | null
}

export interface MessageListResp {
  success: boolean
  rows: MessageRow[]
  total: number
  hasNext: boolean
  page: number
  limit: number
}

export interface ConsentRow {
  id: string
  userId: string
  channel: Channel
  source: ConsentSource
  optInAt: string | null
  optOutAt: string | null
  optOutReason: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface ConsentListResp {
  success: boolean
  rows: ConsentRow[]
}

export interface SendResultResp {
  success: boolean
  status: MessageStatus
  messageId: string | null
  reason?: string
}
