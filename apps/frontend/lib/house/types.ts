/**
 * File:        lib/house/types.ts
 * Module:      House Book · Domain Types
 * Purpose:     Shared type definitions for the broker's counterparty book
 *              (B-book exposure, P&L, concentration, scenario VaR).
 *
 * Exports:
 *   - SymbolExposure           — per-symbol net position from broker POV
 *   - HouseExposureSnapshot    — single-instant book state used by /house/exposure
 *   - HousePnlSeriesPoint      — one bucket of daily/weekly/monthly P&L history
 *   - HousePnlSeries           — time-series wrapper used by /house/pnl
 *   - ScenarioRung             — one row of the VaR ladder (e.g., NIFTY ±2%)
 *   - ScenarioLadder           — collection of rungs for one scenario
 *
 * Side-effects: none — pure types
 *
 * Key invariants:
 *   - All P&L values are from the BROKER's perspective:
 *       brokerPnl = -clientPnl
 *     If clients are net long unrealised gains, the broker is net short losses.
 *   - All amounts in INR (rupees), never paise.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

export interface SymbolExposure {
  symbol: string
  segment: string | null
  /** Sum of signed position quantity across all clients (positive = clients net long → broker net short). */
  netQuantity: number
  /** Net notional in rupees (signed; broker view = client position × −1, so we surface this from the broker side). */
  netNotional: number
  /** Absolute notional — used for sorting + concentration math. */
  absNotional: number
  /** Number of distinct clients with an open position in this symbol. */
  clientCount: number
  /** Broker unrealised P&L for this symbol (rupees). Equals −Σ(client unrealised P&L). */
  brokerUnrealizedPnl: number
}

export interface HouseExposureSnapshot {
  /** ISO timestamp of the aggregation. */
  asOf: string
  /** Total open positions count (all clients). */
  openPositions: number
  /** Distinct clients with at least one open position. */
  activeClients: number
  /** Σ(absNotional) — gross book size in rupees. */
  grossNotional: number
  /** Σ(netNotional) — net broker exposure in rupees (signed). */
  netNotional: number
  /** Live broker P&L = −Σ(client unrealised P&L) in rupees. */
  brokerUnrealizedPnl: number
  /** Live broker day P&L = −Σ(client day P&L) in rupees. */
  brokerDayPnl: number
  /** Top-N exposures sorted by absNotional desc. */
  topSymbols: SymbolExposure[]
  /** Concentration metric: share of grossNotional held in topN symbols (0..1). */
  concentrationTop5: number
  /** Concentration metric: share of grossNotional held in topN clients (0..1). */
  concentrationTop5Clients: number
  /** Per-segment net broker exposure breakdown. */
  bySegment: Array<{ segment: string; netNotional: number; absNotional: number; brokerPnl: number }>
}

export type HousePnlPeriod = "day" | "week" | "month"

export interface HousePnlSeriesPoint {
  /** Bucket label (YYYY-MM-DD for day, ISO week for week, YYYY-MM for month). */
  bucket: string
  /** Net broker realised P&L in this bucket (rupees). */
  brokerPnl: number
  /** Trade count contributing to this bucket. */
  trades: number
}

export interface HousePnlSeries {
  period: HousePnlPeriod
  from: string
  to: string
  points: HousePnlSeriesPoint[]
  totalBrokerPnl: number
  totalTrades: number
}

export interface ScenarioRung {
  /** Underlying move applied to the position basket (e.g., -2, -1, 0, +1, +2 = percentage shock). */
  shockPct: number
  /** Projected broker P&L impact at this shock (rupees, signed; negative = broker loses money). */
  brokerPnlImpact: number
}

export interface ScenarioLadder {
  /** Scenario label (e.g., "NIFTY", "ALL_EQUITY", "NIFTY_FUT"). */
  scenario: string
  /** Symbols included in this scenario basket. */
  symbols: string[]
  /** Rungs sorted by shockPct ascending. */
  rungs: ScenarioRung[]
}
