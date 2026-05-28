/**
 * @file tests/api/admin-funds-number-utils.test.ts
 * @module tests-api
 * @description Unit tests for admin deposits/withdrawals request + notification amount normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeAdminFundActionToken,
  normalizeAdminFundIdentifier,
  normalizeAdminFundNotificationAmount,
  normalizeAdminFundReason,
} from "@/lib/server/admin-funds-number-utils"

describe("admin-funds-number-utils", () => {
  it("normalizes admin action tokens and identifiers", () => {
    expect(normalizeAdminFundActionToken("approve")).toBe("approve")
    expect(normalizeAdminFundActionToken(" REJECT ")).toBe("reject")
    expect(normalizeAdminFundActionToken("other")).toBeNull()
    expect(normalizeAdminFundIdentifier(" abc-123 ")).toBe("abc-123")
    expect(normalizeAdminFundIdentifier(123)).toBe("")
    expect(normalizeAdminFundReason("  test reason ")).toBe("test reason")
  })

  it("normalizes notification amount serialization values", () => {
    expect(normalizeAdminFundNotificationAmount("100.5")).toBe(100.5)
    expect(normalizeAdminFundNotificationAmount(0)).toBe(0)
    expect(normalizeAdminFundNotificationAmount("bad")).toBeNull()
  })
})
