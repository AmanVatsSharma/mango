/**
 * File:        tests/server/instrument-segment-venue-label.test.ts
 * Module:      Tests · Server · Venue Display Label
 * Purpose:     Lock the (segment, exchange) → venue label mapping consumed by the order
 *              panel header. Pre-2026-05 the order screen rendered a hardcoded NSE/BSE
 *              toggle for every instrument — including BTC (CRYPTO), gold (MCX), USDINR
 *              (CDS) — which was visually wrong and implied trade routing that doesn't
 *              exist. The helper now produces a SINGLE label matching the instrument's
 *              actual venue, and these tests cover every venue family the watchlist can
 *              produce so the order header doesn't silently regress for new instrument
 *              types.
 *
 * Exports:     none (jest test file)
 *
 * Depends on:
 *   - @/lib/server/instrument-segment-normalize — `resolveVenueDisplayLabel`
 *
 * Side-effects: none (pure function tests).
 *
 * Key invariants:
 *   - One canonical label per venue family — never a list, never a toggle.
 *   - NCO is matched BEFORE MCX because "NCO_FO" doesn't contain "MCX" but the legacy
 *     classifier could mis-route it.
 *   - BCD is matched BEFORE the BSE family for the same reason.
 *   - Unknown input returns the raw exchange or segment so storage doesn't lie about it.
 *
 * Read order:
 *   1. The "indian equity / F&O" describe — primary venues
 *   2. The "indian commodity / currency" describe — recently added watchlist segments
 *   3. The "global / 24-7" describe — crypto, FX, US equity
 *   4. The "fallback" describe — undefined / weird input
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

import { resolveVenueDisplayLabel } from "@/lib/server/instrument-segment-normalize"

describe("resolveVenueDisplayLabel — Indian equity / F&O", () => {
  it.each([
    ["NSE", "NSE", "NSE"],
    ["NSE_EQ", "NSE", "NSE"],
    ["NSE_FO", "NSE", "NSE"],
    ["NFO", "NSE", "NSE"],
    ["FNO", "NSE", "NSE"],
    ["", "NSE", "NSE"],
    ["BSE", "BSE", "BSE"],
    ["BSE_EQ", "BSE", "BSE"],
    ["BSE_FO", "BSE", "BSE"],
    ["BFO", "BSE", "BSE"],
  ])("segment=%p exchange=%p → %p", (segment, exchange, expected) => {
    expect(resolveVenueDisplayLabel(segment, exchange)).toBe(expected)
  })
})

describe("resolveVenueDisplayLabel — Indian commodity (MCX + NCO)", () => {
  it.each([
    ["MCX", "MCX", "MCX"],
    ["MCX_FO", "MCX", "MCX"],
    ["MCX_FO", "", "MCX"],
    ["NCO", "NCO", "NCO"],
    ["NCO_FO", "NCO", "NCO"],
    ["NCO_FO", "BSE", "NCO"], // segment wins over exchange
  ])("segment=%p exchange=%p → %p", (segment, exchange, expected) => {
    expect(resolveVenueDisplayLabel(segment, exchange)).toBe(expected)
  })

  it("does NOT mis-classify NCO as MCX even though both are commodity venues", () => {
    expect(resolveVenueDisplayLabel("NCO_FO", "NCO")).toBe("NCO")
    expect(resolveVenueDisplayLabel("NCO_FO", "NCO")).not.toBe("MCX")
  })
})

describe("resolveVenueDisplayLabel — Indian currency derivatives (CDS + BCD)", () => {
  it.each([
    ["CDS", "CDS", "CDS"],
    ["CDS_FO", "CDS", "CDS"],
    ["CDS_FO", "NSE", "CDS"], // CDS belongs to NSE family but has its own label
    ["BCD", "BCD", "BCD"],
    ["BCD_FO", "BCD", "BCD"],
    ["BCD_FO", "BSE", "BCD"], // BCD belongs to BSE family but has its own label
  ])("segment=%p exchange=%p → %p", (segment, exchange, expected) => {
    expect(resolveVenueDisplayLabel(segment, exchange)).toBe(expected)
  })
})

describe("resolveVenueDisplayLabel — global / 24-7 venues", () => {
  it.each([
    ["CRYPTO", "BINANCE", "BINANCE"],
    ["CRYPTO", "CRYPTO", "CRYPTO"],
    ["SPOT", "BINANCE", "BINANCE"], // SPOT segment alone is ambiguous; exchange settles it
    ["", "BINANCE", "BINANCE"],
    ["", "NASDAQ", "NASDAQ"],
    ["", "NYSE", "NYSE"],
    ["", "US", "US"],
    ["FX", "FX", "FX"],
    ["FOREX", "FX", "FX"],
  ])("segment=%p exchange=%p → %p", (segment, exchange, expected) => {
    expect(resolveVenueDisplayLabel(segment, exchange)).toBe(expected)
  })
})

describe("resolveVenueDisplayLabel — index + GIFT", () => {
  it.each([
    ["INDICES", "IDX", "INDEX"],
    ["IDX", "IDX", "INDEX"],
    ["NSEIX", "NSEIX", "NSEIX"],
  ])("segment=%p exchange=%p → %p", (segment, exchange, expected) => {
    expect(resolveVenueDisplayLabel(segment, exchange)).toBe(expected)
  })
})

describe("resolveVenueDisplayLabel — fallback for missing or unknown input", () => {
  it("returns '—' when both segment and exchange are empty", () => {
    expect(resolveVenueDisplayLabel("", "")).toBe("—")
    expect(resolveVenueDisplayLabel(null, null)).toBe("—")
    expect(resolveVenueDisplayLabel(undefined, undefined)).toBe("—")
  })

  it("preserves an unrecognised exchange so storage doesn't get silently coerced to NSE", () => {
    expect(resolveVenueDisplayLabel("WEIRD", "WEIRD")).toBe("WEIRD")
  })

  it("trims whitespace and uppercases", () => {
    expect(resolveVenueDisplayLabel("  nse  ", "  nse  ")).toBe("NSE")
  })
})
