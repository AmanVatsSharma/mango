/**
 * @file admin-transactions-filters.test.ts
 * @module tests/lib
 * @description Unit tests for admin transaction list sort allowlist and IST date-range parsing.
 * @author StockTrade
 * @created 2026-03-31
 */

import {
  normalizeAdminTransactionsSortByParam,
  parseAdminTransactionDateFilterForRange,
} from "@/lib/server/admin-transactions-number-utils"

describe("normalizeAdminTransactionsSortByParam", () => {
  it("defaults to createdAt when empty", () => {
    expect(normalizeAdminTransactionsSortByParam(null)).toEqual({
      field: "createdAt",
      invalidExplicit: false,
    })
    expect(normalizeAdminTransactionsSortByParam("")).toEqual({
      field: "createdAt",
      invalidExplicit: false,
    })
  })

  it("accepts allowlisted fields", () => {
    expect(normalizeAdminTransactionsSortByParam("amount")).toEqual({
      field: "amount",
      invalidExplicit: false,
    })
    expect(normalizeAdminTransactionsSortByParam("id")).toEqual({
      field: "id",
      invalidExplicit: false,
    })
  })

  it("rejects unknown explicit sortBy", () => {
    expect(normalizeAdminTransactionsSortByParam("password")).toEqual({
      field: "createdAt",
      invalidExplicit: true,
    })
  })
})

describe("parseAdminTransactionDateFilterForRange", () => {
  it("uses IST start of day for from YYYY-MM-DD", () => {
    const d = parseAdminTransactionDateFilterForRange("2026-06-15", "from")
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe("2026-06-14T18:30:00.000Z")
  })

  it("uses IST end of day for to YYYY-MM-DD", () => {
    const d = parseAdminTransactionDateFilterForRange("2026-06-15", "to")
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe("2026-06-15T18:29:59.999Z")
  })

  it("returns null for empty input", () => {
    expect(parseAdminTransactionDateFilterForRange(null, "from")).toBeNull()
    expect(parseAdminTransactionDateFilterForRange("   ", "to")).toBeNull()
  })
})
