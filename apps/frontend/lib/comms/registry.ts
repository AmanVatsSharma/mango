/**
 * File:        lib/comms/registry.ts
 * Module:      Comms · Registry
 * Purpose:     Channel → provider lookup. The registry is intentionally simple — one
 *              active provider per channel today; vendor selection (Gupshup vs AiSensy
 *              for WhatsApp, Karix vs Kaleyra for SMS) is a config flip in Phase 12.5.
 *
 * Exports:
 *   - getProviderForChannel(channel) → CommsProvider
 *   - listProviders() → CommsProvider[]                — admin observability
 *   - registerProvider(provider) → void                 — for tests / future vendor swap
 *
 * Depends on:
 *   - @prisma/client — CommsChannel
 *   - ./provider — CommsProvider
 *   - ./providers/log-provider — default Phase 12 stub for every channel
 *
 * Side-effects:
 *   - Module-level mutable map. Mutated by registerProvider().
 *
 * Key invariants:
 *   - Phase 12 ships with LogProvider for every channel (no network). Phase 12.5 swaps
 *     each entry for a real vendor adapter via env-config.
 *   - registerProvider OVERWRITES — last write wins. Tests that swap providers MUST
 *     restore the original (use beforeEach + afterEach).
 *
 * Read order:
 *   1. defaultRegistry — what ships
 *   2. getProviderForChannel — the runtime lookup
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-27
 */

import { CommsChannel } from "@prisma/client"
import type { CommsProvider } from "./provider"
import { createLogProvider } from "./providers/log-provider"

const registry = new Map<CommsChannel, CommsProvider>()

function seedDefaults() {
  for (const channel of Object.values(CommsChannel)) {
    if (!registry.has(channel)) {
      registry.set(channel, createLogProvider(channel))
    }
  }
}

seedDefaults()

export function getProviderForChannel(channel: CommsChannel): CommsProvider {
  const provider = registry.get(channel)
  if (!provider) {
    // Should be unreachable — seedDefaults covers every channel — but keep an explicit
    // throw so a future enum addition without a default surfaces immediately.
    throw new Error(`[comms] no provider registered for channel ${channel}`)
  }
  return provider
}

export function listProviders(): CommsProvider[] {
  return Array.from(registry.values())
}

export function registerProvider(provider: CommsProvider): void {
  registry.set(provider.channel, provider)
}
