/**
 * @file risk-config-normalizer.ts
 * @module risk
 * @description Canonical segment/product normalization helpers for risk-config lookups.
 * @author StockTrade
 * @created 2026-02-17
 * @updated 2026-03-28 — BSE segment aliases; F&O product keys for options vs futures.
 * @updated 2026-03-30 — F&O intraday: MIS before NRML_*; MIS_OPT/MIS_FUT admin keys (mirror NRML_OPT/NRML_FUT).
 * @updated 2026-04-08 — Option BUY vs SELL margin rows: NRML_OPT_BUY/SELL, MIS_OPT_BUY/SELL + marginRiskSide on F&O CE/PE.
 * @updated 2026-05-06 — NCO_FO / CDS_FO / BCD_FO alias chains: NCO commodity borrows MCX_FO policy; CDS/BCD currency derivatives borrow NSE_FO. Without these chains, admin RiskConfig lookups for those segments fell through to defaults instead of inheriting reasonable nearest-segment policy.
 */

const DERIVATIVE_SEGMENT_KEYS = new Set(
  [
    "NFO",
    "FNO",
    "NSE_FO",
    "BSE_FO",
    "MCX",
    "MCX_FO",
    // 2026-05-06 — Indian commodity / currency derivatives reachable from milli-search.
    "NCO",
    "NCO_FO",
    "CDS",
    "CDS_FO",
    "BCD",
    "BCD_FO",
    // 2026-05-11 — FX / FOREX spot borrowed from CDS (NSE) currency derivatives alias chain.
    "FX",
    "FOREX",
  ].map((k) => k.toUpperCase()),
)

const SEGMENT_ALIAS_GROUPS: Record<string, string[]> = {
  NSE: ["NSE", "NSE_EQ"],
  NSE_EQ: ["NSE", "NSE_EQ"],
  BSE: ["BSE", "BSE_EQ"],
  BSE_EQ: ["BSE", "BSE_EQ"],
  NFO: ["NFO", "FNO", "NSE_FO", "BSE_FO"],
  FNO: ["NFO", "FNO", "NSE_FO", "BSE_FO"],
  NSE_FO: ["NFO", "FNO", "NSE_FO", "BSE_FO"],
  BSE_FO: ["BSE_FO", "NFO", "FNO", "NSE_FO"],
  MCX: ["MCX", "MCX_FO"],
  MCX_FO: ["MCX", "MCX_FO"],
  // NCO is the BSE/NSE non-MCX commodity venue — admin rarely creates dedicated rows on day
  // one, so we borrow MCX commodity policy as the nearest-shape fallback. Order: prefer a
  // dedicated NCO_FO row first, then MCX_FO, then plain MCX.
  NCO: ["NCO", "NCO_FO", "MCX_FO", "MCX"],
  NCO_FO: ["NCO_FO", "NCO", "MCX_FO", "MCX"],
  // CDS = NSE currency derivatives. They share the equity-F&O lot/expiry mechanics (just
  // different lot sizes and brokerage), so until admin adds dedicated rows the closest match
  // is NSE F&O. BCD = BSE currency derivatives — same reasoning, prefer BSE_FO before NSE_FO.
  CDS: ["CDS", "CDS_FO", "NFO", "FNO", "NSE_FO"],
  CDS_FO: ["CDS_FO", "CDS", "NFO", "FNO", "NSE_FO"],
  BCD: ["BCD", "BCD_FO", "BSE_FO", "NFO", "FNO", "NSE_FO"],
  BCD_FO: ["BCD_FO", "BCD", "BSE_FO", "NFO", "FNO", "NSE_FO"],
  // FX spot — currency pairs traded OTC. Uses the same CDS currency-derivatives mechanics
  // (notional × margin fraction) so it borrows that alias chain until dedicated rows exist.
  FX: ["FX", "FOREX", "CDS", "CDS_FO", "NFO", "NSE_FO"],
  FOREX: ["FOREX", "FX", "CDS", "CDS_FO", "NFO", "NSE_FO"],
}

export const RISK_CONFIG_ALLOWED_SEGMENTS: ReadonlySet<string> = (() => {
  const set = new Set<string>()
  for (const [key, list] of Object.entries(SEGMENT_ALIAS_GROUPS)) {
    set.add(key.toUpperCase())
    for (const item of list) {
      set.add(item.toUpperCase())
    }
  }
  return set
})()

export function isAllowedRiskConfigSegment(segment: string): boolean {
  const token = (segment || "").trim().toUpperCase()
  return token.length > 0 && RISK_CONFIG_ALLOWED_SEGMENTS.has(token)
}

const PRODUCT_TYPE_ALIAS_GROUPS: Record<string, string[]> = {
  MIS: ["MIS", "INTRADAY"],
  INTRADAY: ["MIS", "INTRADAY"],
  CNC: ["CNC", "DELIVERY"],
  DELIVERY: ["CNC", "DELIVERY"],
  NRML: ["NRML"],
  /** Dedicated rows for optional higher/lower margin than futures */
  NRML_OPT: ["NRML_OPT", "OPT", "NRML"],
  NRML_FUT: ["NRML_FUT", "FUT", "NRML"],
  OPT: ["NRML_OPT", "OPT", "NRML"],
  FUT: ["NRML_FUT", "FUT", "NRML"],
  /** F&O intraday options / futures (admin RiskConfig rows); fall back to shared MIS */
  MIS_OPT: ["MIS_OPT", "MIS", "INTRADAY"],
  MIS_FUT: ["MIS_FUT", "MIS", "INTRADAY"],
  /** Indian-style split: long vs short option margin (admin-tunable); fall back to generic OPT keys */
  NRML_OPT_BUY: ["NRML_OPT_BUY", "NRML_OPT", "OPT", "NRML"],
  NRML_OPT_SELL: ["NRML_OPT_SELL", "NRML_OPT", "OPT", "NRML"],
  MIS_OPT_BUY: ["MIS_OPT_BUY", "MIS_OPT", "MIS", "INTRADAY"],
  MIS_OPT_SELL: ["MIS_OPT_SELL", "MIS_OPT", "MIS", "INTRADAY"],
}

export const RISK_CONFIG_ALLOWED_PRODUCT_TYPES: ReadonlySet<string> = (() => {
  const set = new Set<string>()
  for (const [key, list] of Object.entries(PRODUCT_TYPE_ALIAS_GROUPS)) {
    set.add(key.toUpperCase())
    for (const item of list) {
      set.add(item.toUpperCase())
    }
  }
  return set
})()

/** Admin-created `productType` must match known tokens (alias keys/values). */
export function isAllowedRiskConfigProductType(productType: string): boolean {
  const token = (productType || "").trim().toUpperCase()
  return token.length > 0 && RISK_CONFIG_ALLOWED_PRODUCT_TYPES.has(token)
}

function normalizeUpperToken(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback
  }
  const normalizedValue = value.trim().toUpperCase()
  return normalizedValue || fallback
}

function dedupeUpper(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.toUpperCase())))
}

export function resolveRiskConfigSegmentCandidates(segment: unknown): string[] {
  const normalizedSegment = normalizeUpperToken(segment, "NSE")
  const aliases = SEGMENT_ALIAS_GROUPS[normalizedSegment] ?? [normalizedSegment]
  return dedupeUpper(aliases)
}

export function resolveRiskConfigProductTypeCandidates(productType: unknown): string[] {
  const normalizedProductType = normalizeUpperToken(productType, "MIS")
  const aliases = PRODUCT_TYPE_ALIAS_GROUPS[normalizedProductType] ?? [normalizedProductType]
  return dedupeUpper(aliases)
}

export function normalizeRiskConfigSegment(segment: unknown): string {
  return resolveRiskConfigSegmentCandidates(segment)[0] ?? "NSE"
}

export function normalizeRiskConfigProductType(productType: unknown): string {
  return resolveRiskConfigProductTypeCandidates(productType)[0] ?? "MIS"
}

export function isIntradayRiskConfigProductType(productType: unknown): boolean {
  const normalizedCandidates = resolveRiskConfigProductTypeCandidates(productType)
  return normalizedCandidates.includes("MIS") || normalizedCandidates.includes("INTRADAY")
}

/**
 * Expands product-type candidates for F&O so admins can configure `NRML_OPT` / `NRML_FUT`
 * and intraday `MIS_OPT` / `MIS_FUT`; falls back to shared `NRML` / `MIS` when split rows are absent.
 */
export function resolveRiskConfigProductTypeCandidatesForInstrument(
  segment: unknown,
  productType: unknown,
  optionType?: unknown,
  marginRiskSide?: unknown,
): string[] {
  const normalizedSegment = normalizeUpperToken(segment, "NSE")
  const equityLike =
    normalizedSegment === "NSE" ||
    normalizedSegment === "NSE_EQ" ||
    normalizedSegment === "BSE" ||
    normalizedSegment === "BSE_EQ"

  const base = resolveRiskConfigProductTypeCandidates(productType)
  if (equityLike) {
    return base
  }

  const derivativeLike =
    DERIVATIVE_SEGMENT_KEYS.has(normalizedSegment) || normalizedSegment.includes("_FO")
  if (!derivativeLike) {
    return base
  }

  const ot = String(optionType ?? "").toUpperCase()
  const intradayFirst = base.includes("MIS") || base.includes("INTRADAY")
  const foSpecificOptions = ["NRML_OPT", "OPT"] as const
  const foSpecificFutures = ["NRML_FUT", "FUT"] as const

  const sideToken = String(marginRiskSide ?? "").trim().toUpperCase()

  if (intradayFirst) {
    if (ot === "CE" || ot === "PE") {
      if (sideToken === "BUY") {
        return dedupeUpper(["MIS_OPT_BUY", "MIS_OPT", ...base, "NRML_OPT_BUY", "NRML_OPT", "OPT", "NRML"])
      }
      if (sideToken === "SELL") {
        return dedupeUpper(["MIS_OPT_SELL", "MIS_OPT", ...base, "NRML_OPT_SELL", "NRML_OPT", "OPT", "NRML"])
      }
      return dedupeUpper(["MIS_OPT", ...base, ...foSpecificOptions, "NRML"])
    }
    return dedupeUpper(["MIS_FUT", ...base, ...foSpecificFutures, "NRML"])
  }

  if (ot === "CE" || ot === "PE") {
    if (sideToken === "BUY") {
      return dedupeUpper(["NRML_OPT_BUY", ...foSpecificOptions, ...base])
    }
    if (sideToken === "SELL") {
      return dedupeUpper(["NRML_OPT_SELL", ...foSpecificOptions, ...base])
    }
    return dedupeUpper([...foSpecificOptions, ...base])
  }

  return dedupeUpper([...foSpecificFutures, ...base])
}
