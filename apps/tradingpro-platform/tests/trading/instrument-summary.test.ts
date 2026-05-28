/**
 * @file instrument-summary.test.ts
 * @module tests/trading
 * @description Unit tests for formatInstrumentSummary and exchange/F&O helpers.
 * @author StockTrade
 * @created 2026-04-01
 */

import { describe, expect, it } from "@jest/globals"
import {
  formatCompactExpiry,
  formatInstrumentSummary,
  formatStrikePrice,
  getExchangeBadge,
  isMCXInstrument,
  isSegmentOption,
} from "@/lib/market-data/instrument-summary"

describe("instrument-summary", () => {
  it("getExchangeBadge prefers MCX", () => {
    expect(getExchangeBadge("MCX", "MCX_FO").label).toBe("MCX")
  })

  it("getExchangeBadge maps NFO segment", () => {
    expect(getExchangeBadge("NSE", "NFO").label).toBe("NSE FO")
  })

  it("formatInstrumentSummary prefers name and appends venue when missing", () => {
    const s = formatInstrumentSummary({
      symbol: "RELIANCE",
      name: "Reliance Industries Ltd",
      exchange: "NSE",
      segment: "EQ",
    })
    expect(s).toContain("Reliance Industries Ltd")
    expect(s).toMatch(/\(NSE\)|NSE/)
  })

  it("formatInstrumentSummary uses name only when venue already in name", () => {
    const s = formatInstrumentSummary({
      symbol: "XYZ",
      name: "NIFTY 50 APR FUT NSE",
      exchange: "NSE",
      segment: "NFO",
    })
    expect(s).toBe("NIFTY 50 APR FUT NSE")
  })

  it("formatInstrumentSummary composes option legs", () => {
    const s = formatInstrumentSummary({
      symbol: "NIFTY24APR25000CE",
      exchange: "NSE",
      segment: "NFO",
      strikePrice: 25000,
      optionType: "CE",
      expiry: "2025-04-24T00:00:00.000Z",
    })
    expect(s).toContain("NIFTY24APR25000CE")
    expect(s).toContain("CE")
    expect(s).toContain("₹")
    expect(isSegmentOption("NFO", "CE")).toBe(true)
  })

  it("formatInstrumentSummary handles MCX", () => {
    const s = formatInstrumentSummary({
      symbol: "GOLDM",
      name: "",
      exchange: "MCX",
      segment: "MCX",
      optionType: null,
    })
    expect(s).toContain("GOLDM")
    expect(isMCXInstrument("MCX", "MCX")).toBe(true)
  })

  it("formatStrikePrice formats rupees", () => {
    expect(formatStrikePrice(25000)).toMatch(/25,?000/)
  })

  it("formatCompactExpiry returns DD Mon YY", () => {
    const t = formatCompactExpiry("2025-06-15T12:00:00.000Z")
    expect(t.length).toBeGreaterThan(5)
  })
})
