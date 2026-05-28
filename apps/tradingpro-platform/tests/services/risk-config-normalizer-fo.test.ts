/**
 * @file risk-config-normalizer-fo.test.ts
 * @module tests-services
 * @description F&O product candidate ordering for options vs futures (precedence for DB lookup).
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-30 — MIS_OPT/MIS_FUT precede shared MIS; intraday chain before NRML_*.
 * @updated 2026-04-08 — marginRiskSide NRML_OPT_BUY/SELL and MIS_OPT_BUY/SELL precedence.
 */

import {
  isAllowedRiskConfigProductType,
  isAllowedRiskConfigSegment,
  resolveRiskConfigProductTypeCandidatesForInstrument,
  resolveRiskConfigSegmentCandidates,
} from "@/lib/services/risk/risk-config-normalizer"

describe("resolveRiskConfigProductTypeCandidatesForInstrument", () => {
  it("prefers NRML_OPT before NRML for options", () => {
    const c = resolveRiskConfigProductTypeCandidatesForInstrument("NFO", "NRML", "CE")
    expect(c[0]).toBe("NRML_OPT")
    expect(c).toContain("NRML")
  })

  it("prefers NRML_FUT before NRML for futures", () => {
    const c = resolveRiskConfigProductTypeCandidatesForInstrument("NFO", "NRML", null)
    expect(c[0]).toBe("NRML_FUT")
    expect(c).toContain("NRML")
  })

  it("does not expand equity segments", () => {
    const c = resolveRiskConfigProductTypeCandidatesForInstrument("NSE", "MIS", "CE")
    expect(c).toEqual(["MIS", "INTRADAY"])
  })

  it("prefers MIS_OPT before shared MIS for F&O options when product is intraday", () => {
    const c = resolveRiskConfigProductTypeCandidatesForInstrument("NFO", "MIS", "CE")
    expect(c[0]).toBe("MIS_OPT")
    expect(c).toContain("MIS")
    expect(c).toContain("NRML_OPT")
    expect(c.indexOf("MIS_OPT")).toBeLessThan(c.indexOf("MIS"))
    expect(c.indexOf("MIS")).toBeLessThan(c.indexOf("NRML_OPT"))
  })

  it("prefers MIS_FUT before shared MIS for F&O futures when product is intraday", () => {
    const c = resolveRiskConfigProductTypeCandidatesForInstrument("NFO", "INTRADAY", null)
    expect(c[0]).toBe("MIS_FUT")
    expect(c.indexOf("MIS_FUT")).toBeLessThan(c.indexOf("MIS"))
    expect(c.indexOf("MIS")).toBeLessThan(c.indexOf("NRML_FUT"))
  })

  it("prefers MIS_OPT before NRML_* for NSE_FO options intraday same as NFO", () => {
    const c = resolveRiskConfigProductTypeCandidatesForInstrument("NSE_FO", "MIS", "CE")
    expect(c[0]).toBe("MIS_OPT")
    expect(c.indexOf("INTRADAY")).toBeLessThan(c.indexOf("NRML_OPT"))
  })

  it("with marginRiskSide BUY, prepends NRML_OPT_BUY before NRML_OPT for carryforward options", () => {
    const c = resolveRiskConfigProductTypeCandidatesForInstrument("NFO", "NRML", "CE", "BUY")
    expect(c[0]).toBe("NRML_OPT_BUY")
    expect(c).toContain("NRML_OPT")
  })

  it("with marginRiskSide SELL, prepends NRML_OPT_SELL before NRML_OPT", () => {
    const c = resolveRiskConfigProductTypeCandidatesForInstrument("NFO", "NRML", "CE", "SELL")
    expect(c[0]).toBe("NRML_OPT_SELL")
  })

  it("with marginRiskSide BUY intraday options, prepends MIS_OPT_BUY then MIS_OPT", () => {
    const c = resolveRiskConfigProductTypeCandidatesForInstrument("NFO", "MIS", "CE", "BUY")
    expect(c[0]).toBe("MIS_OPT_BUY")
    expect(c).toContain("MIS_OPT")
    expect(c).toContain("NRML_OPT_BUY")
  })
})

describe("admin allow-lists", () => {
  it("allows known segments and product tokens", () => {
    expect(isAllowedRiskConfigSegment("NFO")).toBe(true)
    expect(isAllowedRiskConfigSegment("NSE_FO")).toBe(true)
    expect(isAllowedRiskConfigProductType("NRML_OPT")).toBe(true)
    expect(isAllowedRiskConfigProductType("MIS_OPT")).toBe(true)
    expect(isAllowedRiskConfigProductType("MIS_FUT")).toBe(true)
    expect(isAllowedRiskConfigProductType("NRML_OPT_BUY")).toBe(true)
    expect(isAllowedRiskConfigProductType("NRML_OPT_SELL")).toBe(true)
    expect(isAllowedRiskConfigProductType("MIS_OPT_BUY")).toBe(true)
    expect(isAllowedRiskConfigProductType("MIS_OPT_SELL")).toBe(true)
    expect(isAllowedRiskConfigProductType("bogus")).toBe(false)
  })

  it("allows NCO / CDS / BCD segments and their *_FO variants", () => {
    expect(isAllowedRiskConfigSegment("NCO")).toBe(true)
    expect(isAllowedRiskConfigSegment("NCO_FO")).toBe(true)
    expect(isAllowedRiskConfigSegment("CDS")).toBe(true)
    expect(isAllowedRiskConfigSegment("CDS_FO")).toBe(true)
    expect(isAllowedRiskConfigSegment("BCD")).toBe(true)
    expect(isAllowedRiskConfigSegment("BCD_FO")).toBe(true)
  })
})

describe("resolveRiskConfigSegmentCandidates — NCO / CDS / BCD inheritance", () => {
  // Aliases let admin RiskConfig lookups inherit a nearest-shape policy until dedicated
  // rows are created. Without these chains, NCO_FO / CDS_FO / BCD_FO orders would silently
  // fall through to default margin formulas.
  it("NCO_FO inherits MCX commodity policy as the nearest-shape fallback", () => {
    const c = resolveRiskConfigSegmentCandidates("NCO_FO")
    expect(c[0]).toBe("NCO_FO")
    expect(c).toContain("MCX_FO")
    expect(c).toContain("MCX")
    // Dedicated NCO_FO row should win when present.
    expect(c.indexOf("NCO_FO")).toBeLessThan(c.indexOf("MCX_FO"))
  })

  it("NCO (cash commodity) borrows MCX policy as fallback", () => {
    const c = resolveRiskConfigSegmentCandidates("NCO")
    expect(c).toContain("NCO")
    expect(c).toContain("MCX_FO")
  })

  it("CDS_FO (NSE currency derivatives) inherits NSE_FO policy as fallback", () => {
    const c = resolveRiskConfigSegmentCandidates("CDS_FO")
    expect(c[0]).toBe("CDS_FO")
    expect(c).toContain("NFO")
    expect(c).toContain("NSE_FO")
    // Dedicated CDS_FO row first.
    expect(c.indexOf("CDS_FO")).toBeLessThan(c.indexOf("NSE_FO"))
  })

  it("BCD_FO (BSE currency derivatives) prefers BSE_FO before NSE_FO", () => {
    const c = resolveRiskConfigSegmentCandidates("BCD_FO")
    expect(c[0]).toBe("BCD_FO")
    expect(c).toContain("BSE_FO")
    expect(c).toContain("NSE_FO")
    // BSE_FO should win over NSE_FO since BCD lives on BSE.
    expect(c.indexOf("BSE_FO")).toBeLessThan(c.indexOf("NSE_FO"))
  })

  it("preserves existing NSE/BSE/NFO/MCX chains unchanged", () => {
    expect(resolveRiskConfigSegmentCandidates("NFO")).toEqual(["NFO", "FNO", "NSE_FO", "BSE_FO"])
    expect(resolveRiskConfigSegmentCandidates("MCX_FO")).toEqual(["MCX", "MCX_FO"])
    expect(resolveRiskConfigSegmentCandidates("BSE_FO")).toEqual([
      "BSE_FO",
      "NFO",
      "FNO",
      "NSE_FO",
    ])
  })
})
