/**
 * @file risk-config-instrument-kind.test.ts
 * @module tests-services
 * @description Unit tests for risk config instrument kind labels (admin / watchlist alignment).
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-30 — MIS_OPT / MIS_FUT labels
 */

import { deriveRiskConfigInstrumentKind } from "@/lib/services/risk/risk-config-instrument-kind"

describe("deriveRiskConfigInstrumentKind", () => {
  it("labels equity segments", () => {
    expect(deriveRiskConfigInstrumentKind("NSE", "MIS")).toBe("Equity")
    expect(deriveRiskConfigInstrumentKind("BSE_EQ", "CNC")).toBe("Equity")
  })

  it("labels commodity", () => {
    expect(deriveRiskConfigInstrumentKind("MCX", "NRML")).toBe("Commodity")
  })

  it("labels F&O split product keys", () => {
    expect(deriveRiskConfigInstrumentKind("NFO", "NRML_OPT")).toBe("Options")
    expect(deriveRiskConfigInstrumentKind("NFO", "NRML_OPT_BUY")).toBe("Options")
    expect(deriveRiskConfigInstrumentKind("NFO", "NRML_OPT_SELL")).toBe("Options")
    expect(deriveRiskConfigInstrumentKind("NFO", "MIS_OPT")).toBe("Options")
    expect(deriveRiskConfigInstrumentKind("NFO", "MIS_OPT_BUY")).toBe("Options")
    expect(deriveRiskConfigInstrumentKind("NFO", "MIS_OPT_SELL")).toBe("Options")
    expect(deriveRiskConfigInstrumentKind("NSE_FO", "OPT")).toBe("Options")
    expect(deriveRiskConfigInstrumentKind("NFO", "NRML_FUT")).toBe("Futures")
    expect(deriveRiskConfigInstrumentKind("NFO", "MIS_FUT")).toBe("Futures")
  })

  it("labels shared NRML on F&O", () => {
    expect(deriveRiskConfigInstrumentKind("NFO", "NRML")).toBe("F&O shared")
  })
})
