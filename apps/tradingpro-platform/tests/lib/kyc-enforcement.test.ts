/**
 * File:        tests/lib/kyc-enforcement.test.ts
 * Module:      KYC enforcement · unit tests
 * Purpose:     Verify the env-only Edge gate and the secure-by-default parser.
 *
 * Exports: (Jest test suite — no module exports)
 *
 * Depends on:
 *   - @/lib/kyc-enforcement — env-based public API (no fetch)
 *   - @/lib/server/kyc-enforcement — DB-side parser
 *
 * Side-effects:
 *   - Mutates process.env.KYC_ENFORCEMENT_ENABLED inside test scope
 *
 * Key invariants:
 *   - The Edge runtime path MUST NOT call fetch(). Tests assert this explicitly to
 *     prevent regression — re-introducing a per-request loopback fetch was the
 *     primary perf bug we removed in Wave 1.
 *
 * Read order:
 *   1. parser tests (secure-by-default semantics)
 *   2. env-gate tests (sync + async, both no-fetch)
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-03
 */

import {
  isKycEnforcementEnabled,
  isKycEnforcementEnabledSync,
  invalidateKycEnforcementRuntimeCache,
} from "@/lib/kyc-enforcement"
import { parseKycEnforcementSettingValue } from "@/lib/server/kyc-enforcement"

describe("kyc enforcement helpers", () => {
  const originalFetch = global.fetch
  const originalEnvValue = process.env.KYC_ENFORCEMENT_ENABLED

  beforeEach(() => {
    invalidateKycEnforcementRuntimeCache()
    delete process.env.KYC_ENFORCEMENT_ENABLED
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    invalidateKycEnforcementRuntimeCache()
    process.env.KYC_ENFORCEMENT_ENABLED = originalEnvValue
    global.fetch = originalFetch
  })

  it("parses setting values with secure-by-default behavior", () => {
    expect(parseKycEnforcementSettingValue(undefined)).toBe(true)
    expect(parseKycEnforcementSettingValue(null)).toBe(true)
    expect(parseKycEnforcementSettingValue("false")).toBe(false)
    expect(parseKycEnforcementSettingValue("true")).toBe(true)
    expect(parseKycEnforcementSettingValue("anything-else")).toBe(true)
  })

  it("returns env value when KYC_ENFORCEMENT_ENABLED=false (sync)", () => {
    process.env.KYC_ENFORCEMENT_ENABLED = "false"
    expect(isKycEnforcementEnabledSync()).toBe(false)
  })

  it("defaults to true when KYC_ENFORCEMENT_ENABLED is unset (sync, secure default)", () => {
    expect(isKycEnforcementEnabledSync()).toBe(true)
  })

  it("async wrapper returns env value without ever calling fetch", async () => {
    process.env.KYC_ENFORCEMENT_ENABLED = "false"
    const first = await isKycEnforcementEnabled("https://example.com")
    const second = await isKycEnforcementEnabled("https://example.com")
    expect(first).toBe(false)
    expect(second).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it("async wrapper defaults to true when env unset (no fetch)", async () => {
    const enabled = await isKycEnforcementEnabled("https://example.com")
    expect(enabled).toBe(true)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
