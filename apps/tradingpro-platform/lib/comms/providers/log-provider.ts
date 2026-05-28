/**
 * File:        lib/comms/providers/log-provider.ts
 * Module:      Comms · Providers · LogProvider
 * Purpose:     Default no-network adapter — logs the dispatch and synthesizes a fake
 *              providerMessageId. Used as the Phase 12 default for every channel until
 *              real vendor adapters land in Phase 12.5.
 *
 * Exports:
 *   - createLogProvider(channel, name?) → CommsProvider
 *
 * Depends on:
 *   - @prisma/client — CommsChannel
 *   - ../provider — CommsProvider, ProviderDispatchInput, ProviderInboundContext
 *   - lib/logger — Pino structured logging
 *
 * Side-effects:
 *   - Emits a Pino info log on dispatch. No network calls.
 *
 * Key invariants:
 *   - LogProvider MUST always return SENT (not QUEUED). It's a synchronous stub; treating
 *     it as async hides bugs in caller code that expects QUEUED → SENT transition.
 *   - LogProvider's verifyInboundSignature returns FALSE always — inbound is not supported
 *     in dev. This forces the route handler to 401 unless a real provider is plugged in.
 *
 * Read order:
 *   1. createLogProvider — factory
 *   2. dispatch — what gets emitted to logs
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { randomUUID } from "node:crypto"
import type { CommsChannel } from "@prisma/client"
import { baseLogger as logger } from "@/lib/observability/logger"
import type {
  CommsProvider,
  ProviderDispatchInput,
  ProviderInboundContext,
} from "../provider"
import type { InboundEvent, ProviderDispatchOutcome } from "../types"

export function createLogProvider(
  channel: CommsChannel,
  name?: string,
): CommsProvider {
  const providerName = name ?? `LOG_${channel}`

  return {
    name: providerName,
    channel,

    verifyInboundSignature(_ctx: ProviderInboundContext): boolean {
      return false
    },

    parseInbound(_ctx: ProviderInboundContext): InboundEvent[] {
      return []
    },

    async dispatch(input: ProviderDispatchInput): Promise<ProviderDispatchOutcome> {
      const providerMessageId = `log-${randomUUID()}`
      logger.info(
        {
          providerName,
          channel: input.channel,
          messageId: input.messageId,
          providerMessageId,
          to: input.toAddress,
          bodyPreview: input.body.slice(0, 80),
        },
        "[comms] log-provider dispatch (no network)",
      )
      return {
        providerMessageId,
        status: "SENT",
        providerMeta: { stub: true, providerName },
      }
    },
  }
}
