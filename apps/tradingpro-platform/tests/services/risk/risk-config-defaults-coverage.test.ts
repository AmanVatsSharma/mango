/**
 * File:        tests/services/risk/risk-config-defaults-coverage.test.ts
 * Module:      Tests · Services · Risk · RiskConfig defaults coverage
 * Purpose:     Lock the post-2026-05 segment coverage of `getDefaultLeverage` and
 *              `getDefaultBrokerageAmount`. Pre-fix these functions only handled NSE / BSE /
 *              NFO / MCX, so the watchlist's newer venues (NCO, CDS, BCD, CRYPTO) silently
 *              fell through to leverage=1 (full margin) when admin hadn't created
 *              dedicated RiskConfig rows. The fix added explicit branches for every venue
 *              the watchlist can produce — these tests guarantee none of them silently
 *              regress to "1x" or "₹20 flat" without a maintainer noticing.
 *
 * Exports:     none (jest test file)
 *
 * Depends on:
 *   - @/lib/services/risk/risk-config-defaults — system under test
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - Indian equity intraday (NSE/BSE + MIS) → 200x. Delivery (CNC) → 50x.
 *   - Indian equity F&O (NFO/FNO/NSE_FO/BSE_FO) → 100x.
 *   - Indian commodity (MCX/MCX_FO + NCO/NCO_FO) → 50x.
 *   - Indian currency derivatives (CDS/CDS_FO + BCD/BCD_FO) → 25x.
 *   - Crypto / FX / Index / US equity → 1x (no over-leverage when admin hasn't approved).
 *   - Brokerage defaults match the venue family conventions (cash %ge for equity,
 *     flat ₹20 for derivatives, %ge for crypto, etc).
 *
 * Read order:
 *   1. "leverage — Indian venues" — the load-bearing rates
 *   2. "leverage — global venues" — the conservative defaults
 *   3. "brokerage — venue family conventions"
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-06
 */

import {
  getDefaultLeverage,
  getDefaultBrokerageAmount,
} from "@/lib/services/risk/risk-config-defaults"

describe("getDefaultLeverage — Indian equity (cash market)", () => {
  it("NSE intraday (MIS) → 200x", () => {
    expect(getDefaultLeverage("NSE", "MIS")).toBe(200)
    expect(getDefaultLeverage("NSE_EQ", "MIS")).toBe(200)
    expect(getDefaultLeverage("BSE", "MIS")).toBe(200)
    expect(getDefaultLeverage("BSE_EQ", "MIS")).toBe(200)
  })

  it("NSE delivery (CNC) → 50x", () => {
    expect(getDefaultLeverage("NSE", "CNC")).toBe(50)
    expect(getDefaultLeverage("BSE", "DELIVERY")).toBe(50)
  })
})

describe("getDefaultLeverage — Indian equity F&O", () => {
  it.each(["NFO", "FNO", "NSE_FO", "BSE_FO"])("%p → 100x", (segment) => {
    expect(getDefaultLeverage(segment, "NRML")).toBe(100)
  })
})

describe("getDefaultLeverage — Indian commodity (MCX + NCO)", () => {
  it.each(["MCX", "MCX_FO"])("%p → 50x", (segment) => {
    expect(getDefaultLeverage(segment, "NRML")).toBe(50)
  })

  it("NCO and NCO_FO → 50x (parity with MCX commodity policy)", () => {
    expect(getDefaultLeverage("NCO", "NRML")).toBe(50)
    expect(getDefaultLeverage("NCO_FO", "NRML")).toBe(50)
  })
})

describe("getDefaultLeverage — Indian currency derivatives", () => {
  it.each(["CDS", "CDS_FO", "BCD", "BCD_FO"])("%p → 25x (RBI ~2-5%% margin)", (segment) => {
    expect(getDefaultLeverage(segment, "NRML")).toBe(25)
  })
})

describe("getDefaultLeverage — global venues default to 1x (no over-leverage)", () => {
  it.each(["CRYPTO", "BINANCE", "SPOT", "IDX", "INDICES", "FX", "FOREX", "NASDAQ", "NYSE", "US"])(
    "%p → 1x",
    (segment) => {
      expect(getDefaultLeverage(segment, "MIS")).toBe(1)
      expect(getDefaultLeverage(segment, "NRML")).toBe(1)
    },
  )
})

describe("getDefaultLeverage — unknown segments fall back to 1x (safe default)", () => {
  it.each(["", "WEIRD", "NEW_VENUE"])("%p → 1x", (segment) => {
    expect(getDefaultLeverage(segment, "MIS")).toBe(1)
  })
})

describe("getDefaultBrokerageAmount — venue family conventions", () => {
  it("Indian equity cash uses 0.03%% capped at ₹20", () => {
    expect(getDefaultBrokerageAmount("NSE", "MIS", 50_000, 1)).toBeCloseTo(15, 1) // 50_000 * 0.0003
    expect(getDefaultBrokerageAmount("BSE", "CNC", 1_000_000, 1)).toBe(20) // capped
  })

  it.each(["NFO", "FNO", "NSE_FO", "BSE_FO"])("%p uses flat ₹20", (segment) => {
    expect(getDefaultBrokerageAmount(segment, "NRML", 100_000, 1)).toBe(20)
  })

  it.each(["MCX", "MCX_FO", "NCO", "NCO_FO"])("commodity %p uses flat ₹20", (segment) => {
    expect(getDefaultBrokerageAmount(segment, "NRML", 100_000, 1)).toBe(20)
  })

  it.each(["CDS", "CDS_FO", "BCD", "BCD_FO"])("currency derivative %p uses flat ₹20", (segment) => {
    expect(getDefaultBrokerageAmount(segment, "NRML", 100_000, 1)).toBe(20)
  })

  it("crypto uses 0.1%% per side with a ₹1 floor", () => {
    expect(getDefaultBrokerageAmount("CRYPTO", "MIS", 100_000, 1)).toBe(100) // 100_000 * 0.001
    expect(getDefaultBrokerageAmount("BINANCE", "MIS", 500, 1)).toBe(1) // floor
  })

  it("unknown segment falls back to flat ₹20", () => {
    expect(getDefaultBrokerageAmount("WEIRD", "NRML", 100_000, 1)).toBe(20)
  })
})
