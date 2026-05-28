/**
 * @file trade-management-ledger-display.test.ts
 * @module tests/lib
 * @description Unit tests for Advanced ledger amount labels (type-driven sign/color helpers).
 * @author StockTrade
 * @created 2026-03-31
 */

import {
  formatLedgerAmountRupeeLabel,
  formatLedgerSignedAmountForCsv,
  ledgerAmountDisplayClass,
} from "@/components/admin-console/trade-management-number-utils"

describe("ledgerAmountDisplayClass", () => {
  it("uses emerald for CREDIT and red for DEBIT", () => {
    expect(ledgerAmountDisplayClass("CREDIT")).toContain("emerald")
    expect(ledgerAmountDisplayClass("DEBIT")).toContain("red")
  })
})

describe("formatLedgerAmountRupeeLabel", () => {
  it("prefixes credit with plus and debit with minus using absolute magnitude", () => {
    expect(formatLedgerAmountRupeeLabel("CREDIT", 100)).toMatch(/^\+\u20b9/)
    expect(formatLedgerAmountRupeeLabel("DEBIT", 100)).toMatch(/^[\u2212-]\u20b9/)
    expect(formatLedgerAmountRupeeLabel("CREDIT", -50)).toMatch(/^\+\u20b9/)
  })
})

describe("formatLedgerSignedAmountForCsv", () => {
  it("exports positive for credit and negative for debit", () => {
    expect(formatLedgerSignedAmountForCsv("CREDIT", 10)).toBe("10")
    expect(formatLedgerSignedAmountForCsv("DEBIT", 10)).toBe("-10")
  })
})
