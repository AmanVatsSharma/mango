/**
 * @file tests/utils/expiry-date.test.ts
 * @module tests-utils
 * @description Unit tests for strict expiry date parsing helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseExpiryDateCandidate } from "@/lib/utils/expiry-date"

describe("parseExpiryDateCandidate", () => {
  it("parses valid YYYYMMDD and YYYY-MM-DD values", () => {
    expect(parseExpiryDateCandidate("20260216")?.toISOString()).toContain("2026-02-16")
    expect(parseExpiryDateCandidate("2026-02-16")?.toISOString()).toContain("2026-02-16")
  })

  it("rejects overflowed compact and date-only values", () => {
    expect(parseExpiryDateCandidate("20260231")).toBeUndefined()
    expect(parseExpiryDateCandidate("2026-02-31")).toBeUndefined()
  })

  it("parses valid ISO datetime and rejects blank inputs", () => {
    expect(parseExpiryDateCandidate("2026-02-16T10:30:00.000Z")?.toISOString()).toBe("2026-02-16T10:30:00.000Z")
    expect(parseExpiryDateCandidate(" ")).toBeUndefined()
    expect(parseExpiryDateCandidate(null)).toBeUndefined()
  })
})
