/**
 * @file positions-management-pnl-display.ts
 * @module admin-console
 * @description Align admin position grid P&L semantics with user list API: closed rows store realized P&L in `unrealizedPnL`/`dayPnL` DB columns (see PositionRepository.close).
 * @author StockTrade
 * @created 2026-03-27
 */

export type AdminPositionRowStatus = "OPEN" | "CLOSED"

/**
 * For OPEN rows: `unrealizedPnL` / `dayPnL` are MTM-style marks from DB or Redis overlay.
 * For CLOSED rows: both fields hold the same **booked / realized** P&L (legacy column names).
 */
export function resolveAdminPositionPnLForDisplay(input: {
  status: AdminPositionRowStatus
  unrealizedPnL: number
  dayPnL: number
}): {
  openUnrealized: number | null
  openDay: number | null
  closedBooked: number | null
} {
  if (input.status === "CLOSED") {
    const booked = input.unrealizedPnL
    return {
      openUnrealized: null,
      openDay: null,
      closedBooked: Number.isFinite(booked) ? booked : null,
    }
  }
  return {
    openUnrealized: Number.isFinite(input.unrealizedPnL) ? input.unrealizedPnL : null,
    openDay: Number.isFinite(input.dayPnL) ? input.dayPnL : null,
    closedBooked: null,
  }
}

export function sumAdminOpenUnrealizedPnL(
  rows: Array<{ status: AdminPositionRowStatus; unrealizedPnL?: number }>,
  normalizeFinite: (v: unknown) => number,
): number {
  let sum = 0
  for (const row of rows) {
    if (row.status !== "OPEN") continue
    sum += normalizeFinite(row.unrealizedPnL)
  }
  return sum
}

export function sumAdminOpenDayPnL(
  rows: Array<{ status: AdminPositionRowStatus; dayPnL?: number }>,
  normalizeFinite: (v: unknown) => number,
): number {
  let sum = 0
  for (const row of rows) {
    if (row.status !== "OPEN") continue
    sum += normalizeFinite(row.dayPnL)
  }
  return sum
}

export function sumAdminClosedBookedPnL(
  rows: Array<{ status: AdminPositionRowStatus; unrealizedPnL?: number }>,
  normalizeFinite: (v: unknown) => number,
): number {
  let sum = 0
  for (const row of rows) {
    if (row.status !== "CLOSED") continue
    sum += normalizeFinite(row.unrealizedPnL)
  }
  return sum
}
