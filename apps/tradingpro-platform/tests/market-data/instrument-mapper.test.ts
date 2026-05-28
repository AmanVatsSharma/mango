/**
 * @file tests/market-data/instrument-mapper.test.ts
 * @module tests-market-data
 * @description Regression tests for strict instrument token parsing helpers.
 * @author StockTrade
 * @created 2026-02-16
 */

import { extractTokens, parseInstrumentId, parseInstrumentKey } from "@/lib/market-data/utils/instrumentMapper"

describe("instrumentMapper token parsing", () => {
  it("parses canonical token formats", () => {
    expect(parseInstrumentId("NSE_EQ-26000")).toBe(26000)
    expect(parseInstrumentId("26009")).toBe(26009)
    expect(parseInstrumentKey("NSE_EQ:2881")).toEqual({ exchange: "NSE_EQ", token: 2881 })
  })

  it("rejects partial, decimal, and non-positive token strings", () => {
    expect(parseInstrumentId("NSE_EQ-26000abc")).toBeNull()
    expect(parseInstrumentId("26000.9")).toBeNull()
    expect(parseInstrumentId("0")).toBeNull()
    expect(parseInstrumentKey("NSE_EQ:12abc")).toBeNull()
    expect(parseInstrumentKey("NSE_EQ:-10")).toBeNull()
  })

  it("extractTokens keeps only valid strictly parsed positive tokens", () => {
    const tokens = extractTokens(["NSE_EQ-26000", "26009", "NSE_EQ-26000abc", "0", "NSE_EQ-26000"])
    expect(tokens).toEqual([26000, 26009])
  })
})
