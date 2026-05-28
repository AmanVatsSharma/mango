/**
 * @file tests/workers/user-quick-actions-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for admin user quick-actions numeric parsing helper.
 * @author StockTrade
 * @created 2026-02-16
 */

import { parseUserQuickActionNumericInput } from "@/components/admin-console/user-quick-actions-number-utils"

describe("user-quick-actions-number-utils", () => {
  it("parses finite numeric values and preserves empty as null", () => {
    expect(parseUserQuickActionNumericInput("100")).toBe(100)
    expect(parseUserQuickActionNumericInput("10.5")).toBe(10.5)
    expect(parseUserQuickActionNumericInput("   ")).toBeNull()
  })

  it("returns NaN sentinel for malformed numeric values", () => {
    expect(Number.isNaN(parseUserQuickActionNumericInput("NaN") as number)).toBe(true)
    expect(Number.isNaN(parseUserQuickActionNumericInput("Infinity") as number)).toBe(true)
    expect(Number.isNaN(parseUserQuickActionNumericInput("abc") as number)).toBe(true)
  })
})
