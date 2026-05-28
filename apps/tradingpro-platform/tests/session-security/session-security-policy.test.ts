/**
 * @file session-security-policy.test.ts
 * @module session-security-tests
 * @description mergeSessionSecurityPolicy bounds and defaults.
 * @author StockTrade
 * @created 2026-03-28
 */

import {
  DEFAULT_SESSION_SECURITY_POLICY_V1,
  mergeSessionSecurityPolicy,
} from "@/lib/session-security/session-security-policy"

describe("mergeSessionSecurityPolicy", () => {
  it("returns defaults for invalid input", () => {
    const m = mergeSessionSecurityPolicy(null)
    expect(m).toEqual(DEFAULT_SESSION_SECURITY_POLICY_V1)
  })

  it("clamps maxConcurrentSessions", () => {
    const m = mergeSessionSecurityPolicy({ version: 1, maxConcurrentSessions: 500 })
    expect(m.maxConcurrentSessions).toBe(100)
  })

  it("accepts BLOCK_LOGIN action", () => {
    const m = mergeSessionSecurityPolicy({ version: 1, multiAccountAction: "BLOCK_LOGIN" })
    expect(m.multiAccountAction).toBe("BLOCK_LOGIN")
  })
})
