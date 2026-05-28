/**
 * File:        lib/services/order/order-direction-classifier.ts
 * Module:      Order Execution · open-vs-close classifier (Trading-upr)
 * Purpose:     Determines whether an incoming order OPENS new exposure or CLOSES existing
 *              exposure for the user in this symbol. Used by the maxDailyLoss enforcement
 *              path: when a user is past their daily loss cap, we still want to allow
 *              CLOSING orders so they can exit losing positions; only OPENING orders are
 *              rejected.
 *
 *              The classification looks at the user's net signed quantity in the symbol:
 *                - net > 0 (long), order is BUY  → OPENING (growing the long)
 *                - net > 0 (long), order is SELL → CLOSING (reducing or flipping)
 *                - net < 0 (short), order is SELL → OPENING (growing the short)
 *                - net < 0 (short), order is BUY  → CLOSING (covering or flipping)
 *                - net == 0 (flat), order is anything → OPENING
 *
 *              When the new order's quantity exceeds the existing position's, the order
 *              is treated as CLOSING because at least PART of it reduces exposure — the
 *              flip portion is technically opening on the other side, but admin intent
 *              (let users exit losing positions) is preserved.
 *
 * Exports:
 *   - OrderDirection                          — "OPEN" | "CLOSE"
 *   - classifyOrderDirection(input)           — pure function, no I/O
 *
 * Depends on: nothing (pure data manipulation)
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - Symbol comparison is case-insensitive trimmed
 *   - When `existingPositions` is empty for the symbol, result is "OPEN"
 *   - When the only existing position has quantity == 0, treated as flat → "OPEN"
 *
 * Read order:
 *   1. classifyOrderDirection                 — sole entrypoint
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

export type OrderDirection = "OPEN" | "CLOSE"

export interface ClassifyOrderDirectionInput {
  /** Order side (case-insensitive). */
  orderSide: string
  /** Symbol the order targets (case-insensitive). */
  symbol: string
  /**
   * User's existing OPEN positions (closedAt IS NULL). Quantity carries sign:
   * positive = long, negative = short.
   */
  existingPositions: Array<{ symbol: string; quantity: number }>
}

export function classifyOrderDirection(input: ClassifyOrderDirectionInput): OrderDirection {
  const orderSide = input.orderSide.trim().toUpperCase()
  const symbol = input.symbol.trim().toUpperCase()

  const matchingPositions = input.existingPositions.filter(
    (p) => p.symbol.trim().toUpperCase() === symbol,
  )

  // Sum signed quantity for the symbol (handles multiple position rows from different
  // products, although usually there's only one).
  const netQuantity = matchingPositions.reduce((sum, p) => sum + p.quantity, 0)

  if (netQuantity === 0) return "OPEN"
  if (netQuantity > 0 && orderSide === "BUY") return "OPEN"
  if (netQuantity < 0 && orderSide === "SELL") return "OPEN"
  // BUY when short or SELL when long → reduces exposure → CLOSE
  return "CLOSE"
}
