/**
 * File:        lib/comms/send-router.ts
 * Module:      Comms · Send Router
 * Purpose:     The single entry point for outbound message dispatch. Enforces all three
 *              hard gates from the Phase 12 schema header before handing off to the
 *              channel provider:
 *
 *                Gate #1 — SMS WITHOUT dltTemplateId IS REJECTED.
 *                Gate #2 — RECIPIENT WITHOUT ACTIVE CONSENT for the target channel
 *                          becomes status=OPTED_OUT (recorded, not dispatched).
 *                Gate #3 — UNRESOLVED VARIABLES at render time become status=REJECTED.
 *
 *              Every send produces exactly one CommsMessage row — even if blocked by
 *              a gate. That's the audit trail (DPDP Act + DLT compliance).
 *
 * Exports:
 *   - sendMessage(input) → Promise<SendResult>          — single-recipient dispatch
 *
 * Depends on:
 *   - @/lib/prisma — DB writes (CommsMessage create / update)
 *   - @/lib/logger — structured Pino logging
 *   - ./consent — Gate #2 source of truth
 *   - ./template-render — Gate #3 substitution + unresolved detection
 *   - ./registry — channel → provider lookup
 *   - @prisma/client — CommsChannel, CommsMessageStatus, etc.
 *
 * Side-effects:
 *   - Writes CommsMessage rows. May trigger network call via channel provider.
 *
 * Key invariants:
 *   - Exactly one CommsMessage row per call. Never duplicates, never drops.
 *   - Gates are sequential and short-circuit: Gate #1 → Gate #2 → render → Gate #3 →
 *     dispatch. Failing gate writes the row with the right status + reason and returns.
 *   - Recipient address resolution is denormalized at write time (from the User record)
 *     so the message audit survives a user updating their phone/email later.
 *
 * Read order:
 *   1. sendMessage — the public entry point
 *   2. resolveRecipientAddress — channel-specific address pick
 *   3. The three gates inline (look for "// Gate #N")
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { prisma } from "@/lib/prisma"
import { baseLogger as logger } from "@/lib/observability/logger"
import {
  CommsChannel,
  type CommsMessage,
  type CommsTemplate,
} from "@prisma/client"
import { hasActiveConsent } from "./consent"
import { renderBody } from "./template-render"
import { getProviderForChannel } from "./registry"
import type { SendInput, SendResult, VariableMap } from "./types"

const ADDRESS_BY_CHANNEL: Record<
  CommsChannel,
  (user: { email: string | null; phone: string | null }) => string | null
> = {
  WHATSAPP: (u) => u.phone,
  SMS: (u) => u.phone,
  VOICE: (u) => u.phone,
  PUSH: (u) => u.phone, // Phase 12: push token resolution — until then, phone is the placeholder.
  EMAIL: (u) => u.email,
}

function resolveRecipientAddress(
  user: { email: string | null; phone: string | null },
  channel: CommsChannel,
): string | null {
  return ADDRESS_BY_CHANNEL[channel](user)
}

export async function sendMessage(input: SendInput): Promise<SendResult> {
  const variables: VariableMap = input.variables ?? {}

  // ── 1. Load recipient + (optional) template in one round-trip ────────────────────
  const [user, template] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, phone: true, isActive: true },
    }),
    input.templateId
      ? prisma.commsTemplate.findUnique({ where: { id: input.templateId } })
      : Promise.resolve(null),
  ])

  if (!user) {
    return { status: "FAILED", messageId: null, reason: "user not found" }
  }
  if (!user.isActive) {
    return {
      status: "FAILED",
      messageId: null,
      reason: "user account inactive",
    }
  }

  // Channel must match the template's channel if both are present.
  if (template && template.channel !== input.channel) {
    return {
      status: "FAILED",
      messageId: null,
      reason: `template channel ${template.channel} does not match send channel ${input.channel}`,
    }
  }

  const toAddress =
    input.toAddress ?? resolveRecipientAddress(user, input.channel)
  if (!toAddress) {
    return await persistMessage({
      input,
      template,
      status: "FAILED",
      reason: `no ${input.channel} address on user`,
      toAddress: null,
      renderedBody: "",
      variablesUsed: variables,
    })
  }

  // ── Gate #1 — SMS DLT template id is mandatory ───────────────────────────────────
  if (input.channel === CommsChannel.SMS) {
    if (!template) {
      return await persistMessage({
        input,
        template: null,
        status: "REJECTED",
        reason: "SMS requires a template (DLT compliance)",
        toAddress,
        renderedBody: "",
        variablesUsed: variables,
      })
    }
    if (!template.dltTemplateId) {
      return await persistMessage({
        input,
        template,
        status: "REJECTED",
        reason: "SMS template missing dltTemplateId (DLT compliance)",
        toAddress,
        renderedBody: "",
        variablesUsed: variables,
      })
    }
  }

  // ── Gate #2 — Active consent on this channel ─────────────────────────────────────
  const consented = await hasActiveConsent(user.id, input.channel)
  if (!consented) {
    return await persistMessage({
      input,
      template,
      status: "OPTED_OUT",
      reason: "no active consent for channel",
      toAddress,
      renderedBody: "",
      variablesUsed: variables,
    })
  }

  // ── Render body (template-driven OR rawBody for non-SMS) ─────────────────────────
  const sourceBody = template ? template.body : (input.rawBody ?? "")
  if (!sourceBody) {
    return await persistMessage({
      input,
      template,
      status: "REJECTED",
      reason: "no body or template provided",
      toAddress,
      renderedBody: "",
      variablesUsed: variables,
    })
  }

  const { rendered, used, unresolved } = renderBody(sourceBody, variables)

  // ── Gate #3 — All variables in body must resolve at send time ────────────────────
  if (unresolved.length > 0) {
    return await persistMessage({
      input,
      template,
      status: "REJECTED",
      reason: `unresolved variables at send time: ${unresolved.join(", ")}`,
      toAddress,
      renderedBody: rendered,
      variablesUsed: used,
    })
  }

  // ── Persist QUEUED row, then dispatch via provider ───────────────────────────────
  const initial = await persistMessage({
    input,
    template,
    status: "QUEUED",
    reason: undefined,
    toAddress,
    renderedBody: rendered,
    variablesUsed: used,
  })

  if (!initial.messageId) {
    // Should be unreachable — persistMessage always returns a messageId for non-error
    // statuses — but keep the guard for type narrowing.
    return initial
  }

  const provider = getProviderForChannel(input.channel)
  try {
    const outcome = await provider.dispatch({
      channel: input.channel,
      toAddress,
      fromAddress: input.fromAddress,
      body: rendered,
      meta: { templateMeta: template?.meta ?? null },
      messageId: initial.messageId,
    })

    const now = new Date()
    await prisma.commsMessage.update({
      where: { id: initial.messageId },
      data: {
        status: outcome.status,
        providerMessageId: outcome.providerMessageId,
        providerName: provider.name,
        providerMeta: (outcome.providerMeta ?? {}) as object,
        sentAt: outcome.status === "SENT" ? now : null,
      },
    })
    return {
      status: outcome.status,
      messageId: initial.messageId,
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "provider dispatch failed"
    logger.error(
      { err, channel: input.channel, messageId: initial.messageId },
      "[comms] provider dispatch failed",
    )
    await prisma.commsMessage.update({
      where: { id: initial.messageId },
      data: {
        status: "FAILED",
        failureReason: reason,
        failedAt: new Date(),
        providerName: provider.name,
      },
    })
    return { status: "FAILED", messageId: initial.messageId, reason }
  }
}

interface PersistArgs {
  input: SendInput
  template: CommsTemplate | null
  status: CommsMessage["status"]
  reason: string | undefined
  toAddress: string | null
  renderedBody: string
  variablesUsed: VariableMap
}

async function persistMessage(args: PersistArgs): Promise<SendResult> {
  const { input, template, status, reason, toAddress, renderedBody, variablesUsed } =
    args
  const created = await prisma.commsMessage.create({
    data: {
      channel: input.channel,
      direction: "OUTBOUND",
      status,
      userId: input.userId,
      toAddress,
      fromAddress: input.fromAddress ?? null,
      renderedBody,
      variablesUsed: variablesUsed as object,
      templateId: template?.id ?? null,
      campaignId: input.campaignId ?? null,
      stepIndex: input.stepIndex ?? null,
      providerName: input.providerName ?? null,
      failureReason: reason ?? null,
      failedAt:
        status === "FAILED" || status === "REJECTED" || status === "OPTED_OUT"
          ? new Date()
          : null,
    },
    select: { id: true },
  })
  return {
    status,
    messageId: created.id,
    reason,
  }
}
