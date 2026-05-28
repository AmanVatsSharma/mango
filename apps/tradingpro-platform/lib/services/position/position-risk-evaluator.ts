/**
 * File: lib/services/position/position-risk-evaluator.ts
 * Module: position
 * Purpose: Pure helpers to evaluate StopLoss/Target hits and account-level risk thresholds.
 * Author: StockTrade
 * @updated 2026-04-06 — comment examples aligned with product defaults.
 * Last-updated: 2026-02-13
 * Notes:
 * - Pure functions only (no DB/network).
 * - Used by PositionPnLWorker to trigger safe auto square-off decisions.
 */

export type RiskThresholds = {
  /**
   * Loss utilization threshold at which we create a warning alert (0..1).
   * Example: 0.75 means loss >= 75% of total funds.
   */
  warningThreshold: number
  /**
   * Loss utilization threshold at which we start auto-closing positions (0..1).
   * Example: 0.80 means loss >= 80% of total funds.
   */
  autoCloseThreshold: number
}

export type RiskPositionSnapshot = {
  positionId: string
  symbol: string
  quantity: number
  unrealizedPnL: number
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return null
  return n
}

export function isStopLossHit(quantity: number, currentPrice: number, stopLoss?: number | null): boolean {
  const q = toFiniteNumber(quantity)
  const px = toFiniteNumber(currentPrice)
  const sl = toFiniteNumber(stopLoss)
  if (q == null || px == null || sl == null) return false
  if (q === 0) return false
  if (px <= 0 || sl <= 0) return false

  // Long: price <= stopLoss triggers stop-loss. Short: price >= stopLoss triggers stop-loss.
  return q > 0 ? px <= sl : px >= sl
}

export function isTargetHit(quantity: number, currentPrice: number, target?: number | null): boolean {
  const q = toFiniteNumber(quantity)
  const px = toFiniteNumber(currentPrice)
  const tp = toFiniteNumber(target)
  if (q == null || px == null || tp == null) return false
  if (q === 0) return false
  if (px <= 0 || tp <= 0) return false

  // Long: price >= target triggers take-profit. Short: price <= target triggers take-profit.
  return q > 0 ? px >= tp : px <= tp
}

export function computeMarginUtilizationPercent(totalUnrealizedPnL: number, totalFunds: number): number {
  const pnl = toFiniteNumber(totalUnrealizedPnL) ?? 0
  const funds = toFiniteNumber(totalFunds) ?? 0
  if (funds <= 0) return 0

  const lossOnly = -Math.min(0, pnl)
  return lossOnly / funds
}

export type RiskAutoCloseSelection = {
  totalUnrealizedPnL: number
  marginUtilizationPercent: number
  shouldWarn: boolean
  shouldAutoClose: boolean
  positionsToClose: RiskPositionSnapshot[]
}

export function pickRiskAutoClosePositions(input: {
  positions: RiskPositionSnapshot[]
  totalFunds: number
  thresholds: RiskThresholds
  /**
   * Optional guardrail to avoid runaway close loops.
   * When provided, returns at most this many positions (worst first).
   */
  maxToClose?: number
}): RiskAutoCloseSelection {
  const totalUnrealizedPnL = input.positions.reduce((sum, p) => sum + (toFiniteNumber(p.unrealizedPnL) ?? 0), 0)
  const marginUtilizationPercent = computeMarginUtilizationPercent(totalUnrealizedPnL, input.totalFunds)

  const shouldWarn = marginUtilizationPercent >= input.thresholds.warningThreshold
  const shouldAutoClose = marginUtilizationPercent >= input.thresholds.autoCloseThreshold

  const losing = input.positions
    .filter((p) => (toFiniteNumber(p.unrealizedPnL) ?? 0) < 0)
    .sort((a, b) => (toFiniteNumber(a.unrealizedPnL) ?? 0) - (toFiniteNumber(b.unrealizedPnL) ?? 0))

  const max = input.maxToClose
  const positionsToClose = typeof max === "number" && Number.isFinite(max) && max > 0 ? losing.slice(0, max) : losing

  return {
    totalUnrealizedPnL,
    marginUtilizationPercent,
    shouldWarn,
    shouldAutoClose,
    positionsToClose,
  }
}

