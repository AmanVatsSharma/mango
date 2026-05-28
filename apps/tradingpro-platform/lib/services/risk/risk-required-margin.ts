/**
 * @file risk-required-margin.ts
 * @module risk
 * @description Shared base margin and short-option per-lot minimum floor (aligns MarginCalculator and order-form preview).
 * @author StockTrade
 * @created 2026-04-08
 */

import type { MarginRiskSide } from "@/lib/services/risk/risk-margin-side"

/**
 * Required margin from turnover using either margin fraction or leverage divisor.
 */
export function computeBaseRequiredMarginFromTurnover(
  turnover: number,
  leverage: number,
  marginFraction: number | null,
): number {
  if (marginFraction !== null) {
    return Math.floor(turnover * marginFraction)
  }
  return Math.floor(turnover / leverage)
}

/**
 * Raises margin when writing options (CE/PE + SELL) and `minMarginPerLot` is set on the resolved RiskConfig row.
 */
export function applyShortOptionMinMarginPerLotFloor(input: {
  baseRequiredMargin: number
  optionType?: string | null
  marginRiskSide?: MarginRiskSide | null
  quantity: number
  lotSize: number
  minMarginPerLot: number | null | undefined
}): number {
  const token = String(input.optionType ?? "").trim().toUpperCase()
  const isListedOption = token === "CE" || token === "PE"
  if (!isListedOption || input.marginRiskSide !== "SELL") {
    return input.baseRequiredMargin
  }
  const minPerLot = input.minMarginPerLot
  if (minPerLot == null || !Number.isFinite(minPerLot) || minPerLot <= 0) {
    return input.baseRequiredMargin
  }
  const lotSize = Math.max(1, Math.trunc(input.lotSize))
  const quantity = Math.max(0, Math.trunc(input.quantity))
  const lots = quantity / lotSize
  if (!Number.isFinite(lots) || lots <= 0) {
    return input.baseRequiredMargin
  }
  const floorInr = Math.ceil(lots * minPerLot)
  return Math.max(input.baseRequiredMargin, floorInr)
}
