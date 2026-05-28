/**
 * @file tests/api/api-number-utils.test.ts
 * @module tests-api
 * @description Unit tests for shared non-admin API numeric/date normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeApiBoundedInteger,
  normalizeApiFiniteNumber,
  normalizeApiOptionalDate,
} from "@/lib/server/api-number-utils"

describe("api-number-utils", () => {
  it("normalizes bounded integer query values with fallback and clamping", () => {
    expect(normalizeApiBoundedInteger("25", 10, 1, 100)).toBe(25)
    expect(normalizeApiBoundedInteger("0", 10, 1, 100)).toBe(1)
    expect(normalizeApiBoundedInteger("999", 10, 1, 100)).toBe(100)
    expect(normalizeApiBoundedInteger("bad", 10, 1, 100)).toBe(10)
  })

  it("normalizes optional dates and finite numeric serialization", () => {
    expect(normalizeApiOptionalDate("2026-02-16")).toBeInstanceOf(Date)
    expect(normalizeApiOptionalDate("")).toBeUndefined()
    expect(normalizeApiOptionalDate("bad-date")).toBeUndefined()
    expect(normalizeApiFiniteNumber("100.5")).toBe(100.5)
    expect(normalizeApiFiniteNumber("bad", 7)).toBe(7)
    expect(normalizeApiFiniteNumber(null, 2)).toBe(2)
  })
})
