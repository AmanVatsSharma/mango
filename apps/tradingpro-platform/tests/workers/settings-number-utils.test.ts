/**
 * @file tests/workers/settings-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for admin settings brokerage numeric normalization helper.
 * @author StockTrade
 * @created 2026-02-16
 */

import { normalizeSettingsNullableNonNegativeInput } from "@/components/admin-console/settings-number-utils"

describe("settings-number-utils", () => {
  it("normalizes nullable non-negative brokerage inputs safely", () => {
    expect(normalizeSettingsNullableNonNegativeInput("20")).toBe(20)
    expect(normalizeSettingsNullableNonNegativeInput("0.03")).toBe(0.03)
    expect(normalizeSettingsNullableNonNegativeInput("")).toBeNull()
    expect(normalizeSettingsNullableNonNegativeInput("-1")).toBeNull()
    expect(normalizeSettingsNullableNonNegativeInput("Infinity")).toBeNull()
  })
})
