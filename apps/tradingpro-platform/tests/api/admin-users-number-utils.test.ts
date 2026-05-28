/**
 * @file tests/api/admin-users-number-utils.test.ts
 * @module tests-api
 * @description Unit tests for admin users route numeric/date normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeAdminUsersDateFilter,
  normalizeAdminUsersLimitParam,
  normalizeAdminUsersOptionalNonNegativeAmount,
  normalizeAdminUsersOptionalInitialBalance,
  normalizeAdminUsersOutputNumber,
  normalizeAdminUsersPageParam,
} from "@/lib/server/admin-users-number-utils"

describe("admin-users-number-utils", () => {
  it("normalizes page and limit params with fallback and clamping", () => {
    expect(normalizeAdminUsersPageParam("5")).toBe(5)
    expect(normalizeAdminUsersPageParam("0")).toBe(1)
    expect(normalizeAdminUsersPageParam("bad")).toBe(1)
    expect(normalizeAdminUsersLimitParam("25")).toBe(25)
    expect(normalizeAdminUsersLimitParam("500")).toBe(200)
    expect(normalizeAdminUsersLimitParam("-1")).toBe(1)
    expect(normalizeAdminUsersLimitParam("bad")).toBe(50)
  })

  it("normalizes date and optional initial balance values safely", () => {
    expect(normalizeAdminUsersDateFilter("2026-02-16")).toBeInstanceOf(Date)
    expect(normalizeAdminUsersDateFilter("bad-date")).toBeUndefined()
    expect(normalizeAdminUsersOptionalInitialBalance(undefined)).toBeUndefined()
    expect(normalizeAdminUsersOptionalInitialBalance("")).toBeUndefined()
    expect(normalizeAdminUsersOptionalInitialBalance("15000.5")).toBe(15000.5)
    expect(normalizeAdminUsersOptionalInitialBalance("-10")).toBeNull()
    expect(normalizeAdminUsersOptionalInitialBalance("NaN")).toBeNull()
    expect(normalizeAdminUsersOptionalNonNegativeAmount(undefined)).toBeUndefined()
    expect(normalizeAdminUsersOptionalNonNegativeAmount("250.75")).toBe(250.75)
    expect(normalizeAdminUsersOptionalNonNegativeAmount("-1")).toBeNull()
    expect(normalizeAdminUsersOutputNumber("95.5")).toBe(95.5)
    expect(normalizeAdminUsersOutputNumber("bad", 7)).toBe(7)
  })
})
