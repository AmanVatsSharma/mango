/**
 * File:        tests/server/instrument-segment-normalize.test.ts
 * Module:      Tests · Server · Watchlist Segment Normalization
 * Purpose:     Lock the (exchange, segment, instrumentType) tuple produced by
 *              normalizeInstrumentSegment for every venue family the milli-search
 *              API emits, plus the isFOSegment derivative predicate consumed by
 *              OrderExecutionService for default product-type and lot enforcement.
 *
 * Exports:     none (jest test file)
 *
 * Depends on:
 *   - @/lib/server/instrument-segment-normalize — system under test
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - Tests assert *exact* tuples — any change to the canonical mapping (e.g. a future
 *     venue rename, or "let's collapse BSE_FO into NSE_FO") forces a deliberate test
 *     update, surfacing the decision instead of a silent drift.
 *   - The isFOSegment matrix mirrors the legacy aliases the order route may still
 *     receive (NFO/BFO/FNO/MCX) plus every *_FO suffix the normalizer can produce.
 *
 * Read order:
 *   1. normalizeInstrumentSegment matrix tests
 *   2. extractCanonicalPrefix tests
 *   3. isFOSegment predicate tests
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

import {
  normalizeInstrumentSegment,
  extractCanonicalPrefix,
  isFOSegment,
} from "@/lib/server/instrument-segment-normalize"

describe("normalizeInstrumentSegment", () => {
  describe("Indian equity (NSE / BSE)", () => {
    it("treats plain NSE equity as NSE / NSE / EQ", () => {
      expect(normalizeInstrumentSegment({ exchange: "NSE", instrumentType: "EQ" })).toEqual({
        exchange: "NSE",
        segment: "NSE",
        instrumentType: "EQ",
      })
    })

    it("treats plain BSE equity as BSE / BSE / EQ", () => {
      expect(normalizeInstrumentSegment({ exchange: "BSE", instrumentType: "EQ" })).toEqual({
        exchange: "BSE",
        segment: "BSE",
        instrumentType: "EQ",
      })
    })

    it("promotes NSE futures to NSE_FO with FUT instrumentType", () => {
      expect(
        normalizeInstrumentSegment({
          exchange: "NSE",
          instrumentType: "FUT",
          expiry: "2026-05-29",
        }),
      ).toEqual({ exchange: "NSE_FO", segment: "NSE_FO", instrumentType: "FUT" })
    })

    it("promotes BSE options to BSE_FO with CE/PE instrumentType", () => {
      expect(
        normalizeInstrumentSegment({
          exchange: "BSE",
          optionType: "CE",
          strikePrice: 80000,
          expiry: "2026-05-29",
        }),
      ).toEqual({ exchange: "BSE_FO", segment: "BSE_FO", instrumentType: "CE" })
    })

    it("recovers NSE F&O routing from the canonical-symbol prefix when explicit fields are missing", () => {
      expect(
        normalizeInstrumentSegment({
          canonicalSymbol: "NFO:RELIANCE25MAYFUT",
          instrumentType: "FUT",
        }),
      ).toEqual({ exchange: "NSE_FO", segment: "NSE_FO", instrumentType: "FUT" })
    })
  })

  describe("MCX commodities", () => {
    it("treats MCX as derivative regardless of explicit metadata (always MCX_FO)", () => {
      expect(normalizeInstrumentSegment({ exchange: "MCX" })).toEqual({
        exchange: "MCX_FO",
        segment: "MCX_FO",
        instrumentType: undefined,
      })
    })

    it("preserves MCX option type", () => {
      expect(
        normalizeInstrumentSegment({
          exchange: "MCX",
          optionType: "PE",
          strikePrice: 70000,
          expiry: "2026-06-30",
        }),
      ).toEqual({ exchange: "MCX_FO", segment: "MCX_FO", instrumentType: "PE" })
    })
  })

  describe("NCO / CDS / BCD (previously misrouted to NSE)", () => {
    it("routes NCO commodity to NCO without a derivative suffix when no derivative metadata", () => {
      expect(normalizeInstrumentSegment({ exchange: "NCO" })).toEqual({
        exchange: "NCO",
        segment: "NCO",
        instrumentType: undefined,
      })
    })

    it("promotes NCO future to NCO_FO", () => {
      expect(
        normalizeInstrumentSegment({ exchange: "NCO", instrumentType: "FUT", expiry: "2026-06-20" }),
      ).toEqual({ exchange: "NCO_FO", segment: "NCO_FO", instrumentType: "FUT" })
    })

    it("promotes CDS option to CDS_FO", () => {
      expect(
        normalizeInstrumentSegment({
          exchange: "CDS",
          optionType: "CE",
          strikePrice: 84,
          expiry: "2026-05-30",
        }),
      ).toEqual({ exchange: "CDS_FO", segment: "CDS_FO", instrumentType: "CE" })
    })

    it("promotes BCD future to BCD_FO", () => {
      expect(
        normalizeInstrumentSegment({ exchange: "BCD", instrumentType: "FUT", expiry: "2026-06-27" }),
      ).toEqual({ exchange: "BCD_FO", segment: "BCD_FO", instrumentType: "FUT" })
    })
  })

  describe("Spot / non-Indian venues", () => {
    it("routes FX forex to FX/FX/SPOT (never *_FO)", () => {
      expect(normalizeInstrumentSegment({ exchange: "FX" })).toEqual({
        exchange: "FX",
        segment: "FX",
        instrumentType: "SPOT",
      })
    })

    it("routes index to IDX/INDICES/IDX", () => {
      expect(normalizeInstrumentSegment({ exchange: "IDX", instrumentType: "IDX" })).toEqual({
        exchange: "IDX",
        segment: "INDICES",
        instrumentType: "IDX",
      })
    })

    it("preserves NASDAQ as both exchange and segment for US equity", () => {
      expect(normalizeInstrumentSegment({ exchange: "NASDAQ", instrumentType: "EQ" })).toEqual({
        exchange: "NASDAQ",
        segment: "NASDAQ",
        instrumentType: "EQ",
      })
    })

    it("recovers crypto routing from BINANCE canonical prefix when exchange is empty", () => {
      expect(
        normalizeInstrumentSegment({ canonicalSymbol: "BINANCE:BTCUSDT", segment: "SPOT" }),
      ).toEqual({ exchange: "BINANCE", segment: "SPOT", instrumentType: "SPOT" })
    })

    it("routes generic CRYPTO segment without prefix", () => {
      expect(normalizeInstrumentSegment({ exchange: "CRYPTO", segment: "CRYPTO" })).toEqual({
        exchange: "CRYPTO",
        segment: "CRYPTO",
        instrumentType: "SPOT",
      })
    })

    it("routes NSEIX (GIFT City) preserved as-is", () => {
      expect(normalizeInstrumentSegment({ exchange: "NSEIX" })).toEqual({
        exchange: "NSEIX",
        segment: "NSEIX",
        instrumentType: undefined,
      })
    })
  })

  describe("Empty / unknown input", () => {
    it("falls back to NSE for fully empty input (preserves legacy plain-equity behaviour)", () => {
      expect(normalizeInstrumentSegment({})).toEqual({
        exchange: "NSE",
        segment: "NSE",
        instrumentType: "EQ",
      })
    })

    it("ignores literal UNKNOWN exchange and falls back to canonical-symbol prefix", () => {
      expect(
        normalizeInstrumentSegment({ exchange: "UNKNOWN", canonicalSymbol: "MCX:GOLD25JUNFUT" }),
      ).toEqual({ exchange: "MCX_FO", segment: "MCX_FO", instrumentType: undefined })
    })
  })
})

describe("extractCanonicalPrefix", () => {
  it("extracts uppercase prefix from a canonical symbol", () => {
    expect(extractCanonicalPrefix("NSE:RELIANCE")).toBe("NSE")
    expect(extractCanonicalPrefix("binance:btcusdt")).toBe("BINANCE")
    expect(extractCanonicalPrefix("NCO:CASTOR")).toBe("NCO")
  })

  it("returns null for symbols without a colon", () => {
    expect(extractCanonicalPrefix("RELIANCE")).toBeNull()
    expect(extractCanonicalPrefix(":RELIANCE")).toBeNull()
    expect(extractCanonicalPrefix(null)).toBeNull()
    expect(extractCanonicalPrefix(undefined)).toBeNull()
  })
})

describe("isFOSegment", () => {
  it("returns true for every *_FO suffix the normalizer can produce", () => {
    expect(isFOSegment("NSE_FO")).toBe(true)
    expect(isFOSegment("BSE_FO")).toBe(true)
    expect(isFOSegment("MCX_FO")).toBe(true)
    expect(isFOSegment("NCO_FO")).toBe(true)
    expect(isFOSegment("CDS_FO")).toBe(true)
    expect(isFOSegment("BCD_FO")).toBe(true)
  })

  it("returns true for legacy F&O aliases the order route may still pass", () => {
    expect(isFOSegment("NFO")).toBe(true)
    expect(isFOSegment("BFO")).toBe(true)
    expect(isFOSegment("FNO")).toBe(true)
    expect(isFOSegment("MCX")).toBe(true)
  })

  it("normalizes case and whitespace before matching", () => {
    expect(isFOSegment("  nse_fo  ")).toBe(true)
    expect(isFOSegment("Mcx")).toBe(true)
  })

  it("returns false for cash equity, index, FX, US equity, crypto, NSEIX", () => {
    expect(isFOSegment("NSE")).toBe(false)
    expect(isFOSegment("NSE_EQ")).toBe(false)
    expect(isFOSegment("BSE")).toBe(false)
    expect(isFOSegment("BSE_EQ")).toBe(false)
    expect(isFOSegment("IDX")).toBe(false)
    expect(isFOSegment("INDICES")).toBe(false)
    expect(isFOSegment("FX")).toBe(false)
    expect(isFOSegment("NASDAQ")).toBe(false)
    expect(isFOSegment("NYSE")).toBe(false)
    expect(isFOSegment("US")).toBe(false)
    expect(isFOSegment("CRYPTO")).toBe(false)
    expect(isFOSegment("BINANCE")).toBe(false)
    expect(isFOSegment("SPOT")).toBe(false)
    expect(isFOSegment("NSEIX")).toBe(false)
  })

  it("returns false for empty / non-string / nullish input", () => {
    expect(isFOSegment("")).toBe(false)
    expect(isFOSegment("   ")).toBe(false)
    expect(isFOSegment(null)).toBe(false)
    expect(isFOSegment(undefined)).toBe(false)
    expect(isFOSegment(42 as unknown as string)).toBe(false)
  })
})
