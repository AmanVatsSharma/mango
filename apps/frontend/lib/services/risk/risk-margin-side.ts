/**
 * @file risk-margin-side.ts
 * @module risk
 * @description Maps order flow context to BUY/SELL for option margin RiskConfig rows (long vs short exposure).
 * @author StockTrade
 * @created 2026-04-08
 *
 * Notes:
 * - Charges still use the executing order side; this type is only for risk row selection (NRML_OPT_BUY vs NRML_OPT_SELL).
 */

export type MarginRiskSide = "BUY" | "SELL"

/** Normalize user/API input to BUY or SELL. */
export function normalizeMarginRiskSide(value: unknown): MarginRiskSide {
  const u = String(value ?? "").trim().toUpperCase()
  return u === "SELL" ? "SELL" : "BUY"
}

/** Pending placement / admission: margin profile follows the order being placed. */
export function marginRiskSideForPlacementOrder(orderSide: string): MarginRiskSide {
  return normalizeMarginRiskSide(orderSide)
}

/**
 * Offset close: executing SELL reduces a long (opened BUY); executing BUY reduces a short (opened SELL).
 */
export function marginRiskSideForOffsetRelease(executingOrderSide: string): MarginRiskSide {
  return normalizeMarginRiskSide(executingOrderSide) === "SELL" ? "BUY" : "SELL"
}

/** Net position after fill: long qty → BUY margin row; short qty → SELL margin row. */
export function marginRiskSideForSignedPositionQty(signedQty: number): MarginRiskSide {
  return Math.trunc(signedQty) > 0 ? "BUY" : "SELL"
}

/** Position close: opening side of the closed line (long → BUY, short → SELL). */
export function marginRiskSideForPositionCloseOpening(openSignedQuantity: number): MarginRiskSide {
  return Math.trunc(openSignedQuantity) > 0 ? "BUY" : "SELL"
}
