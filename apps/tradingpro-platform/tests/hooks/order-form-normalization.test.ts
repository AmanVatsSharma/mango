/**
 * @file tests/hooks/order-form-normalization.test.ts
 * @module tests-hooks
 * @description Unit tests for strict order-form normalization helpers.
 * @author StockTrade
 * @created 2026-02-16
 * @updated 2026-04-08 — `minMarginPerLot` on risk config payload tests.
 */

import {
  deriveInstrumentTokenFromOrderFormInstrumentId,
  normalizeOrderFormRiskConfigPayload,
  normalizeOrderFormStockData,
  parseFiniteOrderFormNumber,
} from "@/lib/hooks/order-form-normalization"

describe("order-form-normalization helpers", () => {
  it("parses finite numeric values and rejects sentinel numbers", () => {
    expect(parseFiniteOrderFormNumber(125)).toBe(125)
    expect(parseFiniteOrderFormNumber(" 125.5 ")).toBe(125.5)
    expect(parseFiniteOrderFormNumber("NaN")).toBeNull()
    expect(parseFiniteOrderFormNumber("Infinity")).toBeNull()
    expect(parseFiniteOrderFormNumber("")).toBeNull()
    expect(parseFiniteOrderFormNumber(false)).toBeNull()
  })

  it("extracts strict positive token from instrument ids", () => {
    expect(deriveInstrumentTokenFromOrderFormInstrumentId("NSE_EQ-26000")).toBe(26000)
    expect(deriveInstrumentTokenFromOrderFormInstrumentId("NSE_EQ--NaN--7600")).toBe(7600)
    expect(deriveInstrumentTokenFromOrderFormInstrumentId("NSE_EQ-26000.5")).toBeUndefined()
    expect(deriveInstrumentTokenFromOrderFormInstrumentId("NSE_EQ-0")).toBeUndefined()
    expect(deriveInstrumentTokenFromOrderFormInstrumentId("NSE_EQ-1e3")).toBeUndefined()
  })

  it("normalizes stock payload with strict numeric and enum formatting", () => {
    const normalized = normalizeOrderFormStockData({
      id: "wl-1",
      symbol: "  nifty  ",
      exchange: " nse_eq ",
      instrumentId: "nse_eq--NaN--25000",
      lot_size: "bad",
      ltp: "Infinity",
      close: " 125.25 ",
      strike_price: "25000",
      option_type: " ce ",
      expiry: " 2026-02-26 ",
      name: "  ",
    })

    expect(normalized).toMatchObject({
      token: 25000,
      exchange: "NSE_EQ",
      segment: "NSE_EQ",
      instrumentId: "NSE_EQ--NAN--25000",
      lot_size: undefined,
      close: 125.25,
      strikePrice: 25000,
      optionType: "CE",
      name: "nifty",
      watchlistItemId: "wl-1",
      expiry: "2026-02-26",
    })
    expect(normalized?.ltp).toBeUndefined()
  })

  it("defaults derivative lot size and canonical risk config values", () => {
    const normalizedStock = normalizeOrderFormStockData({
      segment: "nfo",
      token: "12000",
      lotSize: " 0 ",
      ltp: "200",
    })
    expect(normalizedStock).toMatchObject({
      segment: "NFO",
      token: 12000,
      lot_size: 1,
      lotSize: 1,
      ltp: 200,
    })

    expect(
      normalizeOrderFormRiskConfigPayload({
        leverage: " 5 ",
        brokerageFlat: " 20 ",
        brokerageRate: "0.0003",
        brokerageCap: "Infinity",
      }),
    ).toEqual({
      leverage: 5,
      marginRate: null,
      minMarginPerLot: null,
      brokerageFlat: 20,
      brokerageRate: 0.0003,
      brokerageCap: null,
    })

    expect(normalizeOrderFormRiskConfigPayload(null)).toBeNull()
    expect(normalizeOrderFormRiskConfigPayload([])).toBeNull()
  })

  it("keeps watchlist identity stable for order flow", () => {
    const normalized = normalizeOrderFormStockData({
      id: "watch-77",
      watchlistItemId: "watch-77",
      symbol: "banknifty",
      exchange: "nse_fo",
      segment: "nfo",
      instrumentId: "nse_fo-2953217",
      token: "2953217",
      optionType: "pe",
      strikePrice: "51000",
      expiry: "2026-03-26",
      ltp: "320.5",
    })

    expect(normalized).toMatchObject({
      watchlistItemId: "watch-77",
      symbol: "banknifty",
      exchange: "NSE_FO",
      segment: "NFO",
      instrumentId: "NSE_FO-2953217",
      token: 2953217,
      optionType: "PE",
      strikePrice: 51000,
      expiry: "2026-03-26",
      ltp: 320.5,
    })
  })
})
