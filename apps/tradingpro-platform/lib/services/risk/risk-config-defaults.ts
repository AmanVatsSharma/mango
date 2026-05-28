/**
 * @file risk-config-defaults.ts
 * @module lib/services/risk
 * @description Single source for risk-config fallbacks (leverage, brokerage) shared by MarginCalculator and public APIs.
 * @author StockTrade
 * @created 2026-03-28
 */

/**
 * Default leverage when no matching active RiskConfig row exists.
 * Segment/product normalization should run before calling (e.g. NSE_EQ → NSE).
 *
 * Coverage extended 2026-05-06 to include NCO, CDS, BCD, CRYPTO, INDEX, FX so the
 * watchlist's newer venues don't silently fall through to leverage=1 (full-margin)
 * when admin hasn't created dedicated RiskConfig rows. Numbers chosen as conservative
 * "nearest-shape" defaults — admin should still create explicit rows for production.
 */
export function getDefaultLeverage(segment: string, productType: string): number {
  const seg = (segment || "").toUpperCase()
  const prod = (productType || "").toUpperCase()

  // Indian equity (cash market)
  if (seg === "NSE" || seg === "NSE_EQ" || seg === "BSE" || seg === "BSE_EQ") {
    if (prod === "MIS" || prod === "INTRADAY") return 200
    if (prod === "CNC" || prod === "DELIVERY") return 50
  }

  // Indian equity F&O
  if (seg === "NFO" || seg === "FNO" || seg === "NSE_FO" || seg === "BSE_FO") {
    return 100
  }

  // Indian commodity — MCX (well-known) and NCO (BSE non-MCX commodity, similar mechanics)
  if (seg === "MCX" || seg === "MCX_FO") return 50
  if (seg === "NCO" || seg === "NCO_FO") return 50

  // Indian currency derivatives — CDS (NSE) and BCD (BSE). RBI-mandated currency margin is
  // typically 2-5% of notional, mapping to ~20-50x leverage. Conservative midpoint.
  if (seg === "CDS" || seg === "CDS_FO" || seg === "BCD" || seg === "BCD_FO") {
    return 25
  }

  // Crypto / spot — high-volatility venues. Default to 1x (full margin) until admin
  // explicitly approves leverage. Better to under-leverage by default than over.
  if (seg === "CRYPTO" || seg === "BINANCE" || seg === "SPOT") return 1

  // Index spot (NIFTY 50 etc.) — typically not directly tradable; default to 1x.
  if (seg === "IDX" || seg === "INDICES") return 1

  // FX spot — currency derivatives are CDS/BCD; raw FX spot defaults to 1x.
  if (seg === "FX" || seg === "FOREX") return 1

  // US equity — leveraged trading on NASDAQ/NYSE retail isn't supported on this platform yet;
  // 1x guarantees no over-leverage if rows are missing.
  if (seg === "NASDAQ" || seg === "NYSE" || seg === "US") return 1

  return 1
}

/**
 * Default brokerage (₹) when RiskConfig has no flat/rate. Matches legacy MarginCalculator
 * behavior. Coverage extended 2026-05-06 to give explicit defaults for commodity (#2 venue),
 * currency derivatives, crypto, FX, index and US-equity flows so the order placement preview
 * can show non-misleading charge estimates for the new venues.
 */
export function getDefaultBrokerageAmount(
  segment: string,
  productType: string,
  turnover: number,
  quantity: number,
  lotSize: number = 1,
): number {
  void productType
  void quantity
  void lotSize

  const normalizedSegment = segment.toUpperCase()

  // Indian equity cash — 0.03% of turnover capped at ₹20 (matches legacy retail brokerage
  // levels for delivery-side trades).
  if (
    normalizedSegment === "NSE" ||
    normalizedSegment === "NSE_EQ" ||
    normalizedSegment === "BSE" ||
    normalizedSegment === "BSE_EQ"
  ) {
    return Math.min(20, turnover * 0.0003)
  }

  // Indian equity F&O — flat ₹20 per executed order
  if (
    normalizedSegment === "NFO" ||
    normalizedSegment === "FNO" ||
    normalizedSegment === "NSE_FO" ||
    normalizedSegment === "BSE_FO"
  ) {
    return 20
  }

  // Commodity — MCX and NCO follow the same flat-₹20 retail convention
  if (
    normalizedSegment === "MCX" ||
    normalizedSegment === "MCX_FO" ||
    normalizedSegment === "NCO" ||
    normalizedSegment === "NCO_FO"
  ) {
    return 20
  }

  // Currency derivatives — typically lower than equity F&O retail, but flat ₹20 keeps the
  // preview simple until admin defines per-venue rates.
  if (
    normalizedSegment === "CDS" ||
    normalizedSegment === "CDS_FO" ||
    normalizedSegment === "BCD" ||
    normalizedSegment === "BCD_FO"
  ) {
    return 20
  }

  // Crypto — 0.1% per side is a common venue rate; cap at a sensible flat amount until
  // admin defines a per-venue config.
  if (
    normalizedSegment === "CRYPTO" ||
    normalizedSegment === "BINANCE" ||
    normalizedSegment === "SPOT"
  ) {
    return Math.max(1, turnover * 0.001)
  }

  // FX spot / index spot / US equity — generic ₹20 default
  return 20
}

/**
 * Convert stored `marginRate` into a margin fraction of turnover (e.g. 0.1 → 10% of notional).
 * Values greater than 1 are treated as percent (20 → 20%).
 */
export function resolveMarginFractionFromStoredRate(marginRate: number | null | undefined): number | null {
  if (marginRate == null || !Number.isFinite(marginRate) || marginRate < 0) {
    return null
  }
  if (marginRate === 0) {
    return null
  }
  const raw = marginRate > 1 ? marginRate / 100 : marginRate
  if (!Number.isFinite(raw) || raw <= 0) {
    return null
  }
  return Math.min(1, raw)
}
