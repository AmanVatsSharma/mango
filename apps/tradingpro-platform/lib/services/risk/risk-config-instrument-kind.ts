/**
 * @file risk-config-instrument-kind.ts
 * @module lib/services/risk
 * @description Display labels for RiskConfig rows (admin UI) aligned with watchlist futures vs options rules.
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-30 — MIS_OPT / MIS_FUT kinds for F&O intraday split rows.
 * @updated 2026-04-08 — NRML_OPT_BUY/SELL and MIS_OPT_BUY/SELL map to Options.
 */

export type RiskConfigInstrumentKind =
  | "Equity"
  | "Commodity"
  | "Futures"
  | "Options"
  | "F&O shared"
  | "Other"

function isDerivativeSegment(segment: string): boolean {
  const s = segment.toUpperCase()
  return (
    s === "NFO" ||
    s === "FNO" ||
    s === "NSE_FO" ||
    s === "BSE_FO" ||
    s === "MCX" ||
    s === "MCX_FO" ||
    s.includes("_FO")
  )
}

/**
 * Derived kind for admin table: matches watchlist — options use `NRML_OPT`/`OPT`; futures `NRML_FUT`/`FUT`;
 * plain `NRML`/`MIS` on F&O apply to both until split rows exist; intraday split uses `MIS_OPT`/`MIS_FUT`.
 */
export function deriveRiskConfigInstrumentKind(segment: string, productType: string): RiskConfigInstrumentKind {
  const seg = segment.toUpperCase()
  const pt = (productType || "").toUpperCase()

  if (seg === "MCX" || seg === "MCX_FO") {
    return "Commodity"
  }

  if (seg === "NSE" || seg === "NSE_EQ" || seg === "BSE" || seg === "BSE_EQ") {
    return "Equity"
  }

  if (isDerivativeSegment(seg)) {
    if (
      pt === "MIS_OPT" ||
      pt === "MIS_OPT_BUY" ||
      pt === "MIS_OPT_SELL" ||
      pt === "NRML_OPT" ||
      pt === "NRML_OPT_BUY" ||
      pt === "NRML_OPT_SELL" ||
      pt === "OPT"
    ) {
      return "Options"
    }
    if (pt === "MIS_FUT" || pt === "NRML_FUT" || pt === "FUT") {
      return "Futures"
    }
    return "F&O shared"
  }

  return "Other"
}
