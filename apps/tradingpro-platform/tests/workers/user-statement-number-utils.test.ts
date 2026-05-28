/**
 * @file tests/workers/user-statement-number-utils.test.ts
 * @module tests-workers
 * @description Unit tests for admin user-statement numeric normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import {
  normalizeUserStatementDepositAmount,
  normalizeUserStatementLedgerSignedAmount,
  normalizeUserStatementTradePrice,
  normalizeUserStatementTradeQuantity,
  normalizeUserStatementWithdrawalAmount,
} from "@/components/admin-console/user-statement-number-utils"

describe("user-statement-number-utils", () => {
  it("normalizes trade quantity and price values safely", () => {
    expect(normalizeUserStatementTradeQuantity("25")).toBe(25)
    expect(normalizeUserStatementTradeQuantity("-1")).toBe(0)
    expect(normalizeUserStatementTradePrice("150.75")).toBe(150.75)
    expect(normalizeUserStatementTradePrice("NaN")).toBe(0)
  })

  it("normalizes ledger, deposit, and withdrawal amounts safely", () => {
    expect(normalizeUserStatementLedgerSignedAmount("CREDIT", "100")).toBe(100)
    expect(normalizeUserStatementLedgerSignedAmount("DEBIT", "100")).toBe(-100)
    expect(normalizeUserStatementLedgerSignedAmount("DEBIT", "NaN")).toBe(0)
    expect(normalizeUserStatementDepositAmount("2500")).toBe(2500)
    expect(normalizeUserStatementDepositAmount("-1")).toBe(0)
    expect(normalizeUserStatementWithdrawalAmount("300", "10")).toBe(-310)
    expect(normalizeUserStatementWithdrawalAmount("NaN", "10")).toBe(-10)
  })
})
