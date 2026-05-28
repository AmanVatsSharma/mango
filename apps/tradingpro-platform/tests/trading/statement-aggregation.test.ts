/**
 * @file statement-aggregation.test.ts
 * @module tests/trading
 * @description Unit tests for statement charge heuristic (ledger classification).
 * @author StockTrade
 * @created 2026-03-30
 */

import { isLedgerRowLikelyChargesDebit } from "@/lib/services/statement/statement-aggregation.service"

describe("isLedgerRowLikelyChargesDebit", () => {
  it("matches brokerage and common tax tokens case-insensitively", () => {
    expect(isLedgerRowLikelyChargesDebit("Brokerage and charges for order ABC")).toBe(true)
    expect(isLedgerRowLikelyChargesDebit("STT on trade")).toBe(true)
    expect(isLedgerRowLikelyChargesDebit("GST component")).toBe(true)
    expect(isLedgerRowLikelyChargesDebit("SEBI fees")).toBe(true)
  })

  it("returns false for unrelated descriptions", () => {
    expect(isLedgerRowLikelyChargesDebit("Margin blocked for BUY RELIANCE")).toBe(false)
    expect(isLedgerRowLikelyChargesDebit("Realized P&L credit on offset close")).toBe(false)
    expect(isLedgerRowLikelyChargesDebit(null)).toBe(false)
    expect(isLedgerRowLikelyChargesDebit("")).toBe(false)
  })
})
