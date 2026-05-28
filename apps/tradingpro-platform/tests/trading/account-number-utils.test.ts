/**
 * @file tests/trading/account-number-utils.test.ts
 * @module tests-trading
 * @description Unit tests for account statement amount numeric normalization helper.
 * @author StockTrade
 * @created 2026-02-16
 */

import { normalizeAccountStatementAmount } from "@/components/account-number-utils"

describe("account-number-utils", () => {
  it("normalizes finite amount values", () => {
    expect(normalizeAccountStatementAmount("1500.75")).toBe(1500.75)
    expect(normalizeAccountStatementAmount(0)).toBe(0)
  })

  it("falls back to zero for malformed/non-finite amount values", () => {
    expect(normalizeAccountStatementAmount("Infinity")).toBe(0)
    expect(normalizeAccountStatementAmount("NaN")).toBe(0)
    expect(normalizeAccountStatementAmount(Symbol("bad"))).toBe(0)
  })
})
