/**
 * File:        lib/winners/order-gate.ts
 * Module:      Winners · Order Admission Gate
 * Purpose:     Pure function — given an admin order intent + the client's winner
 *              control snapshot, decide whether the order is allowed and why not
 *              if rejected.
 *
 *              Wired into the order admission pipeline via OrderExecutionService.
 *              enforceWinnerMitigation (called from validateOrder). Also reused by:
 *                - Admin "what would happen if?" preview (Client 360 → Winner Controls tab)
 *                - The slippage simulator UI
 *
 * Exports:
 *   - GateDecision                    — { allowed, reason, code? }
 *   - evaluateOrderAgainstControl()   — sync, pure
 *   - GateOrderIntent                 — input shape
 *
 * Side-effects: none — pure function over inputs
 *
 * Key invariants:
 *   - Decisions are deterministic given the same inputs.
 *   - Rejection codes match the admin UI's reason chips: WINNER_INSTRUMENT_BLOCK |
 *     WINNER_SEGMENT_BLOCK | WINNER_NOTIONAL_CAP | WINNER_CLOSE_ONLY | WINNER_CLOSED_OUT.
 *   - Close-only ALLOWS opposite-side orders that net-reduce existing position quantity
 *     (caller must pre-compute `wouldReduceExisting`).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import { WINNER_RUNG_META, type WinnerControlSnapshot } from "./types"

export type GateRejectCode =
  | "WINNER_INSTRUMENT_BLOCK"
  | "WINNER_SEGMENT_BLOCK"
  | "WINNER_NOTIONAL_CAP"
  | "WINNER_CLOSE_ONLY"
  | "WINNER_CLOSED_OUT"

export interface GateDecision {
  allowed: boolean
  reason?: string
  code?: GateRejectCode
}

export interface GateOrderIntent {
  symbol: string
  segment: string | null
  /** Quantity × price in rupees (always positive). */
  notional: number
  /** True if this order would reduce or close an existing client position (vs opening new). */
  wouldReduceExisting: boolean
}

const ALLOWED: GateDecision = { allowed: true }

export function evaluateOrderAgainstControl(
  intent: GateOrderIntent,
  control: WinnerControlSnapshot | null,
): GateDecision {
  if (!control || control.rung === "NONE") return ALLOWED

  // Rung 7 — terminal. Account is liquidated + frozen; nothing trades.
  if (control.rung === "CLOSED_OUT") {
    return {
      allowed: false,
      code: "WINNER_CLOSED_OUT",
      reason: `Account is at rung "${WINNER_RUNG_META.CLOSED_OUT.label}" — no trading allowed.`,
    }
  }

  // Rung 6 — close-only. Reductive orders pass; new exposure is rejected.
  if (control.rung === "CLOSE_ONLY" && !intent.wouldReduceExisting) {
    return {
      allowed: false,
      code: "WINNER_CLOSE_ONLY",
      reason: "Client is in close-only mode — only orders that reduce existing positions are allowed.",
    }
  }

  // Rung 4 — instrument / segment block. Independent of opening vs closing —
  // a blocked instrument is blocked entirely.
  if (control.blockedInstruments.includes(intent.symbol)) {
    return {
      allowed: false,
      code: "WINNER_INSTRUMENT_BLOCK",
      reason: `Instrument ${intent.symbol} is blocked for this client.`,
    }
  }
  if (intent.segment && control.blockedSegments.includes(intent.segment)) {
    return {
      allowed: false,
      code: "WINNER_SEGMENT_BLOCK",
      reason: `Segment ${intent.segment} is blocked for this client.`,
    }
  }

  // Rung 5 — order rejection threshold.
  if (
    control.maxOrderNotional !== null &&
    intent.notional > control.maxOrderNotional
  ) {
    return {
      allowed: false,
      code: "WINNER_NOTIONAL_CAP",
      reason: `Order notional ₹${intent.notional.toLocaleString(
        "en-IN",
      )} exceeds per-order cap ₹${control.maxOrderNotional.toLocaleString("en-IN")}.`,
    }
  }

  return ALLOWED
}
