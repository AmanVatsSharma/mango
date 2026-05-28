/**
 * @file tests/workers/trade-management-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for admin trade-management numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeTradeManagementAmount,
  normalizeTradeManagementEditableAmount,
  normalizeTradeManagementPage,
} from "@/components/admin-console/trade-management-number-utils"

describe("trade-management-number-utils", () => {
  it("normalizes pagination and row amounts safely", () => {
    expect(normalizeTradeManagementPage("4")).toBe(4)
    expect(normalizeTradeManagementPage("0")).toBe(1)
    expect(normalizeTradeManagementPage("NaN")).toBe(1)
    expect(normalizeTradeManagementAmount("1250.75")).toBe(1250.75)
    expect(normalizeTradeManagementAmount("Infinity", 9)).toBe(9)
  })

  it("normalizes editable transaction amounts with non-negative guard", () => {
    expect(normalizeTradeManagementEditableAmount("100")).toBe(100)
    expect(normalizeTradeManagementEditableAmount("0")).toBe(0)
    expect(normalizeTradeManagementEditableAmount("-1")).toBeNull()
    expect(normalizeTradeManagementEditableAmount("NaN")).toBeNull()
  })
})
