/**
 * @file repository-number-utils.test.ts
 * @module tests-repositories
 * @description Unit tests for repository finite numeric normalization helper.
 * @author StockTrade
 * @created 2026-02-16
 */

import { normalizeRepositoryFiniteNumber } from "@/lib/repositories/repository-number-utils"

describe("repository-number-utils", () => {
  it("normalizes finite numeric values and string numerics", () => {
    expect(normalizeRepositoryFiniteNumber(25.5)).toBe(25.5)
    expect(normalizeRepositoryFiniteNumber("100.75")).toBe(100.75)
    expect(normalizeRepositoryFiniteNumber("  42  ")).toBe(42)
  })

  it("falls back for malformed repository aggregate values", () => {
    expect(normalizeRepositoryFiniteNumber("NaN")).toBe(0)
    expect(normalizeRepositoryFiniteNumber(undefined)).toBe(0)
    expect(normalizeRepositoryFiniteNumber(Symbol("bad"), 9)).toBe(9)
  })
})
