/**
 * File:        lib/comms/types.ts
 * Module:      Comms · Types
 * Purpose:     Shared DTOs + branded types for the multi-channel comms engine.
 *
 * Exports:
 *   - SendInput                  — input to send-router (ad-hoc or campaign-step)
 *   - SendResult                 — outcome from send-router (status + messageId + reason)
 *   - TemplateValidationError    — thrown by template SAVE if vars don't match body
 *   - TEMPLATE_VAR_REGEX         — /\{\{([a-zA-Z0-9_]+)\}\}/g — single source of truth
 *   - VariableMap                — Record<string, string|number|null|undefined>
 *   - InboundEvent               — normalized shape from any provider's inbound webhook
 *   - ProviderDispatchOutcome    — what a CommsProvider.send returns
 *
 * Depends on:
 *   - @prisma/client — for the channel/status enums
 *
 * Side-effects:  none
 *
 * Key invariants:
 *   - TEMPLATE_VAR_REGEX is the single source of truth for variable parsing — never
 *     hand-roll a different regex anywhere else in the comms module.
 *   - VariableMap values are ALWAYS string-coerced before substitution; null/undefined
 *     → empty string. The renderer enforces this.
 *
 * Read order:
 *   1. SendInput → SendResult — the send contract
 *   2. InboundEvent — webhook contract
 *   3. ProviderDispatchOutcome — adapter contract
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import type {
  CommsChannel,
  CommsMessageDirection,
  CommsMessageStatus,
} from "@prisma/client"

export const TEMPLATE_VAR_REGEX = /\{\{([a-zA-Z0-9_]+)\}\}/g

export type VariableMap = Record<string, string | number | null | undefined>

export interface SendInput {
  /** Target user (recipient); required for OUTBOUND. */
  userId: string
  /** Channel to dispatch on. */
  channel: CommsChannel
  /** One of templateId OR rawBody. templateId is preferred and mandatory for SMS. */
  templateId?: string
  /** Free-form body — only allowed when channel != SMS (SMS DLT requires registered template). */
  rawBody?: string
  /** Variables for substitution. Validated against the template's declared `variables[]`. */
  variables?: VariableMap
  /** Optional campaign context — sets campaignId + stepIndex on the message row. */
  campaignId?: string
  stepIndex?: number
  /** Optional override for the destination address (otherwise resolved from User). */
  toAddress?: string
  /** Optional sender override (e.g., specific WhatsApp business number). */
  fromAddress?: string
  /** Optional dispatch-time provider hint; defaults to channel registry. */
  providerName?: string
}

export interface SendResult {
  status: CommsMessageStatus
  messageId: string | null
  /** Failure / OPTED_OUT / REJECTED reason. Filled when status is not SENT/QUEUED. */
  reason?: string
}

export class TemplateValidationError extends Error {
  constructor(
    message: string,
    public readonly missingInBody: string[] = [],
    public readonly undeclaredInBody: string[] = [],
  ) {
    super(message)
    this.name = "TemplateValidationError"
  }
}

export interface InboundEvent {
  channel: CommsChannel
  providerName: string
  providerMessageId: string
  fromAddress: string
  toAddress: string
  body: string
  direction: CommsMessageDirection
  /** Raw provider payload for audit + debugging. */
  raw: unknown
}

export interface ProviderDispatchOutcome {
  /** Provider-side message id; persisted on CommsMessage.providerMessageId. */
  providerMessageId: string
  /** Initial post-dispatch status. SENT for sync ack; QUEUED if provider accepted async. */
  status: Extract<CommsMessageStatus, "SENT" | "QUEUED">
  /** Provider's response object — stored verbatim on CommsMessage.providerMeta. */
  providerMeta?: Record<string, unknown>
}
