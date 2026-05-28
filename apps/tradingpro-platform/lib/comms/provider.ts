/**
 * File:        lib/comms/provider.ts
 * Module:      Comms · Provider Interface
 * Purpose:     Abstract contract every channel adapter implements. Keeps the send-router
 *              free of channel-specific logic and makes vendor-swap (Gupshup → AiSensy,
 *              etc.) a config flip.
 *
 * Exports:
 *   - CommsProvider               — interface every channel adapter implements
 *   - ProviderDispatchInput       — what the router hands to the adapter
 *   - ProviderInboundContext      — webhook handler context for adapter-side parsing
 *
 * Depends on:
 *   - @prisma/client — CommsChannel
 *   - ./types — ProviderDispatchOutcome, InboundEvent
 *
 * Side-effects: none (interface-only)
 *
 * Key invariants:
 *   - Adapters MUST be stateless. Any provider config (api keys, sender ids) is read
 *     fresh on each call from env or the registry — no cached client state.
 *   - Adapter MUST throw on unrecoverable failure; the router catches and records as
 *     status=FAILED with the error message.
 *
 * Read order:
 *   1. CommsProvider — the interface
 *   2. ProviderDispatchInput — what the send-router hands in
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import type { CommsChannel } from "@prisma/client"
import type { InboundEvent, ProviderDispatchOutcome } from "./types"

export interface ProviderDispatchInput {
  channel: CommsChannel
  toAddress: string
  fromAddress?: string
  /** Already-rendered body — provider does NOT re-substitute. */
  body: string
  /** Channel-specific extras: WhatsApp template approval id, SMS DLT id, email subject, etc. */
  meta?: Record<string, unknown>
  /** Source CommsMessage.id (for adapter-side correlation if needed). */
  messageId: string
}

export interface ProviderInboundContext {
  /** Raw HTTP request body (unparsed) — adapters that verify HMAC need the raw bytes. */
  rawBody: string
  /** All headers, lowercase keys. */
  headers: Record<string, string>
}

export interface CommsProvider {
  readonly name: string
  readonly channel: CommsChannel

  /**
   * Verify a webhook payload's authenticity. Return true to allow ingestion, false to
   * reject (the route handler returns 401 in that case).
   */
  verifyInboundSignature(ctx: ProviderInboundContext): boolean

  /**
   * Parse a verified webhook payload into normalized InboundEvent(s). A single delivery
   * callback may fan-out to multiple status updates (one per recipient in a batch).
   */
  parseInbound(ctx: ProviderInboundContext): InboundEvent[]

  /**
   * Dispatch a message via the provider. MUST be idempotent w.r.t. messageId — if called
   * twice with the same messageId, the provider should return the same providerMessageId.
   */
  dispatch(input: ProviderDispatchInput): Promise<ProviderDispatchOutcome>
}
