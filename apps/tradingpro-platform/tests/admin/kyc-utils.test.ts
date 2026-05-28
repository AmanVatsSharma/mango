/**
 * @file kyc-utils.test.ts
 * @module admin-console
 * @description Unit tests for KYC SLA and AML flag utilities
 * @author StockTrade
 * @created 2026-01-15
 */

import { getSlaState, normalizeAmlFlags } from "@/lib/admin/kyc-utils"

describe("normalizeAmlFlags", () => {
  it("normalizes and deduplicates flags", () => {
    const result = normalizeAmlFlags(["  pep_match ", "pep_match", "sanctions", ""])
    expect(result).toEqual(["PEP_MATCH", "SANCTIONS"])
  })
})

describe("getSlaState", () => {
  const now = new Date("2026-01-15T10:00:00.000Z")

  it("returns NO_SLA when missing due date", () => {
    expect(getSlaState(undefined, "PENDING", now)).toBe("NO_SLA")
  })

  it("returns OVERDUE when due date is in the past", () => {
    expect(getSlaState("2026-01-14T10:00:00.000Z", "PENDING", now)).toBe("OVERDUE")
  })

  it("returns DUE_SOON when within 24 hours", () => {
    expect(getSlaState("2026-01-15T20:00:00.000Z", "PENDING", now)).toBe("DUE_SOON")
  })

  it("returns ON_TRACK when status not pending", () => {
    expect(getSlaState("2026-01-10T10:00:00.000Z", "APPROVED", now)).toBe("ON_TRACK")
  })
})
