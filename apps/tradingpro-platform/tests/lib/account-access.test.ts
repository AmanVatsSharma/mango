/**
 * @file account-access.test.ts
 * @module tests-lib
 * @description Unit tests for login eligibility (suspended vs deactivated).
 * @author StockTrade
 * @created 2026-04-01
 */

import {
  ACCOUNT_ACCESS_ERROR_CODE,
  accountAccessToErrorCode,
  resolveAccountAccess,
} from "@/lib/auth/account-access-policy"

describe("account-access", () => {
  it("allows login when active and not suspended", () => {
    const r = resolveAccountAccess({ isActive: true, suspendedAt: null })
    expect(r.state).toBe("ok")
    expect(r.userMessage).toBe("")
  })

  it("blocks suspended before deactivated check", () => {
    const r = resolveAccountAccess({ isActive: true, suspendedAt: new Date() })
    expect(r.state).toBe("suspended")
    expect(accountAccessToErrorCode("suspended")).toBe(ACCOUNT_ACCESS_ERROR_CODE.SUSPENDED)
  })

  it("blocks deactivated when not suspended", () => {
    const r = resolveAccountAccess({ isActive: false, suspendedAt: null })
    expect(r.state).toBe("deactivated")
    expect(accountAccessToErrorCode("deactivated")).toBe(ACCOUNT_ACCESS_ERROR_CODE.DEACTIVATED)
  })
})
