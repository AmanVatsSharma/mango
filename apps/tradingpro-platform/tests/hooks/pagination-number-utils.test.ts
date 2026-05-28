/**
 * @file tests/hooks/pagination-number-utils.test.ts
 * @module tests-hooks
 * @description Unit tests for strict pagination page-token normalization helper.
 * @author StockTrade
 * @created 2026-02-16
 */

import { normalizePaginationPageToken } from "@/hooks/admin/pagination-number-utils"

describe("pagination-number-utils", () => {
  it("normalizes valid positive integer page tokens", () => {
    expect(normalizePaginationPageToken("1", 5)).toBe(1)
    expect(normalizePaginationPageToken(" 42 ", 5)).toBe(42)
  })

  it("falls back for malformed or non-positive page tokens", () => {
    expect(normalizePaginationPageToken(null, 7)).toBe(7)
    expect(normalizePaginationPageToken("", 7)).toBe(7)
    expect(normalizePaginationPageToken("abc", 7)).toBe(7)
    expect(normalizePaginationPageToken("1e2", 7)).toBe(7)
    expect(normalizePaginationPageToken("-1", 7)).toBe(7)
    expect(normalizePaginationPageToken("0", 7)).toBe(7)
  })
})
