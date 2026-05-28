/**
 * File:        lib/trade-adjust/types.ts
 * Module:      Trade Adjust · Domain Types
 * Purpose:     Shared types for the manual trade-adjustment workflow (admin only).
 *              All actions land in TradeAdjustmentLog with full context for audit.
 *
 * Exports:
 *   - TRADE_ADJUST_ACTIONS  — readonly tuple of allowed action codes
 *   - TradeAdjustAction     — union type
 *   - TradeAdjustInput      — admin write input
 *   - TradeAdjustLogRow     — log row exposed to UI
 *
 * Side-effects: none — pure types
 *
 * Key invariants:
 *   - Every action requires a `reason`. Audit trail is non-optional.
 *   - VOID is only valid on filled orders within the broker's claw-back window
 *     (engine enforces this — Phase 9 ships log-only; enforcement Phase 9.5).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

export const TRADE_ADJUST_ACTIONS = [
  "MANUAL_REJECT",
  "REQUOTE",
  "VOID",
  "FORCE_MARGIN_CALL",
  "FORCE_LIQUIDATE",
] as const

export type TradeAdjustAction = (typeof TRADE_ADJUST_ACTIONS)[number]

export interface TradeAdjustInput {
  action: TradeAdjustAction
  /** One of orderId or positionId is required. */
  orderId?: string | null
  positionId?: string | null
  /** Required user id of the trade owner (for audit + relation). */
  userId: string
  /** Required reason — surfaces in audit log + client-facing notification when applicable. */
  reason: string
  /** Snapshot of the BEFORE state (e.g., { price: 1234.5 }). */
  fromValue?: Record<string, unknown>
  /** Snapshot of the AFTER state (e.g., { price: 1230 } for REQUOTE). */
  toValue?: Record<string, unknown>
}

export interface TradeAdjustLogRow {
  id: string
  orderId: string | null
  positionId: string | null
  userId: string
  userName: string | null
  action: TradeAdjustAction
  fromValue: Record<string, unknown> | null
  toValue: Record<string, unknown> | null
  reason: string | null
  performedById: string
  performedByName: string | null
  createdAt: string
}
