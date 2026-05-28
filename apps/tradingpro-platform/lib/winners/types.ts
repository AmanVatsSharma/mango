/**
 * File:        lib/winners/types.ts
 * Module:      Winners · Domain Types
 * Purpose:     Shared types for the Winner Mitigation Engine — the B-book
 *              counterparty defence ladder applied to clients who consistently
 *              win against the broker.
 *
 * Exports:
 *   - WINNER_RUNGS                    — ordered tuple of every rung (NONE → CLOSED_OUT)
 *   - WINNER_RUNG_META[rung]          — UI label, description, severity, tone
 *   - WinnerControlOverrides          — per-client override fields (spread × cap × blocks)
 *   - WinnerControlSnapshot           — what the API returns to admin UI
 *   - WinnerControlUpdateInput        — what PATCH endpoints accept
 *   - WinnerHistoryEntry              — one history row
 *   - WinnerListRow                   — flagged-winner table row shape
 *   - WinnerListResponse              — list endpoint envelope
 *   - WinnerRulesConfig               — auto-promotion thresholds (used by rule-engine.ts)
 *
 * Side-effects: none — pure types
 *
 * Key invariants:
 *   - Rung order is meaningful — auto-promotion advances ONE rung per evaluation cycle,
 *     never skips rungs (except severity-driven path documented in plan §13).
 *   - Reversing rungs is admin-only (rung CLOSED_OUT is irreversible without manual unfreeze).
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-26
 */

import type { WinnerRung } from "@prisma/client"

export type { WinnerRung } from "@prisma/client"

export const WINNER_RUNGS = [
  "NONE",
  "WATCH",
  "SPREAD_WIDEN",
  "POSITION_CAP",
  "INSTRUMENT_BLOCK",
  "ORDER_REJECT",
  "CLOSE_ONLY",
  "CLOSED_OUT",
] as const satisfies readonly WinnerRung[]

export type WinnerRungMeta = {
  rung: WinnerRung
  label: string
  description: string
  /** 0 = baseline, 7 = terminal */
  severity: number
  /** Tone bucket for UI pills/cards. */
  tone: "neutral" | "info" | "warning" | "danger"
  /** True = reversing this rung wipes overrides. */
  reversible: boolean
}

export const WINNER_RUNG_META: Record<WinnerRung, WinnerRungMeta> = {
  NONE: {
    rung: "NONE",
    label: "Baseline",
    description: "No restrictions. Tier defaults apply across spread, position cap, instruments.",
    severity: 0,
    tone: "neutral",
    reversible: true,
  },
  WATCH: {
    rung: "WATCH",
    label: "Watch",
    description: "Surfaced in surveillance queue + RM gets a heads-up. No client-side effect.",
    severity: 1,
    tone: "info",
    reversible: true,
  },
  SPREAD_WIDEN: {
    rung: "SPREAD_WIDEN",
    label: "Spread widen",
    description: "Per-client spread multiplier > 1× — client sees worse fills than tier baseline.",
    severity: 2,
    tone: "warning",
    reversible: true,
  },
  POSITION_CAP: {
    rung: "POSITION_CAP",
    label: "Position cap",
    description: "Per-client maxPositionSize override at < 100% of tier default.",
    severity: 3,
    tone: "warning",
    reversible: true,
  },
  INSTRUMENT_BLOCK: {
    rung: "INSTRUMENT_BLOCK",
    label: "Instrument block",
    description: "Specific instruments / segments blocked for this client (e.g., F&O block).",
    severity: 4,
    tone: "warning",
    reversible: true,
  },
  ORDER_REJECT: {
    rung: "ORDER_REJECT",
    label: "Order reject",
    description: "Auto-reject orders above maxOrderNotional. Caps single-trade damage.",
    severity: 5,
    tone: "danger",
    reversible: true,
  },
  CLOSE_ONLY: {
    rung: "CLOSE_ONLY",
    label: "Close-only",
    description: "Client may close existing positions but cannot open new ones. Hard quarantine.",
    severity: 6,
    tone: "danger",
    reversible: true,
  },
  CLOSED_OUT: {
    rung: "CLOSED_OUT",
    label: "Closed-out",
    description: "All positions liquidated + account frozen. Last resort. Manual reverse only.",
    severity: 7,
    tone: "danger",
    reversible: false,
  },
}

export interface WinnerControlOverrides {
  spreadMultiplier: number | null
  positionCapPct: number | null
  blockedInstruments: string[]
  blockedSegments: string[]
  maxOrderNotional: number | null
}

export interface WinnerControlSnapshot extends WinnerControlOverrides {
  id: string
  userId: string
  rung: WinnerRung
  pinned: boolean
  reason: string | null
  updatedById: string | null
  updatedAt: string
  createdAt: string
}

export interface WinnerControlUpdateInput {
  rung?: WinnerRung
  spreadMultiplier?: number | null
  positionCapPct?: number | null
  blockedInstruments?: string[]
  blockedSegments?: string[]
  maxOrderNotional?: number | null
  pinned?: boolean
  reason?: string | null
}

export interface WinnerHistoryEntry {
  id: string
  action: string
  fromRung: WinnerRung
  toRung: WinnerRung
  reason: string | null
  triggeredById: string | null
  triggeredByName: string | null
  triggeredByTransactionId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface WinnerListRow {
  userId: string
  name: string | null
  email: string | null
  phone: string | null
  clientId: string | null
  rung: WinnerRung
  pinned: boolean
  spreadMultiplier: number | null
  positionCapPct: number | null
  blockedInstruments: string[]
  blockedSegments: string[]
  maxOrderNotional: number | null
  /** Cached lifetime broker liability for sorting (rupees; positive = client up vs broker). */
  lifetimeBrokerLiability: number
  updatedAt: string
}

export interface WinnerListResponse {
  success: boolean
  rows: WinnerListRow[]
  total: number
  byRung: Record<WinnerRung, number>
}

export interface WinnerRulesConfig {
  /** Win-rate ≥ this fraction over the rolling window triggers Watch. */
  watchWinRate: number
  /** Min trades in the rolling window before win-rate is considered. */
  watchMinTrades: number
  /** Lifetime broker liability (rupees) ≥ this triggers SPREAD_WIDEN. */
  spreadWidenLiability: number
  /** Lifetime broker liability ≥ this triggers POSITION_CAP. */
  positionCapLiability: number
  /** Lifetime broker liability ≥ this triggers INSTRUMENT_BLOCK. */
  instrumentBlockLiability: number
  /** Default spread multiplier applied when auto-promoting to SPREAD_WIDEN. */
  defaultSpreadMultiplier: number
  /** Default position cap pct applied when auto-promoting to POSITION_CAP. */
  defaultPositionCapPct: number
  /** Debounce window — only one auto-decision per client per N seconds. */
  debounceSeconds: number
}

export const DEFAULT_WINNER_RULES: WinnerRulesConfig = {
  watchWinRate: 0.65,
  watchMinTrades: 100,
  spreadWidenLiability: 5_000_000, // ₹50 L
  positionCapLiability: 25_000_000, // ₹2.5 Cr
  instrumentBlockLiability: 100_000_000, // ₹10 Cr
  defaultSpreadMultiplier: 2.0,
  defaultPositionCapPct: 50,
  debounceSeconds: 60,
}
