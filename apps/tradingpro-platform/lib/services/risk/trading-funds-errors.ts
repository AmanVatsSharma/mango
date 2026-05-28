/**
 * @file trading-funds-errors.ts
 * @module risk
 * @description Typed trading-account fund errors for API mapping (`statusCode` → HTTP status via `resolveTradingErrorResponse`).
 * @author StockTrade
 * @created 2026-04-06
 *
 * Notes:
 * - Thrown from margin / fund validation paths; keep messages user-safe (no internals).
 */

/**
 * Account cash balance is below zero; order placement must be rejected.
 * `statusCode` is read by `resolveTradingErrorResponse` for HTTP 403.
 */
export class NegativeBalanceTradingError extends Error {
  readonly statusCode = 403

  constructor(
    message: string = "Account balance is negative. Add funds before placing orders.",
  ) {
    super(message)
    this.name = "NegativeBalanceTradingError"
  }
}

/**
 * Trading user has been suspended by an admin (RiskLimit.status === "SUSPENDED").
 * Pre-fix this status was stored but never enforced — suspended users could still
 * place orders. Mapped to HTTP 403 by resolveTradingErrorResponse.
 */
export class UserSuspendedTradingError extends Error {
  readonly statusCode = 403

  constructor(
    message: string = "Your account has been suspended by an administrator. Contact support to restore trading access.",
  ) {
    super(message)
    this.name = "UserSuspendedTradingError"
  }
}

/**
 * User has hit the per-day trade count cap from RiskLimit.maxDailyTrades.
 * Mapped to HTTP 403 by the generic statusCode mapper.
 */
export class DailyTradeCapTradingError extends Error {
  readonly statusCode = 403

  constructor(
    message: string = "Daily trade limit reached. New orders will resume after IST 00:00.",
  ) {
    super(message)
    this.name = "DailyTradeCapTradingError"
  }
}

/**
 * Order notional exceeds the per-user RiskLimit.maxPositionSize cap.
 * Mapped to HTTP 403 by the generic statusCode mapper.
 */
export class PositionSizeCapTradingError extends Error {
  readonly statusCode = 403

  constructor(
    message: string = "Order notional exceeds your per-position size cap.",
  ) {
    super(message)
    this.name = "PositionSizeCapTradingError"
  }
}

/**
 * Order notional exceeds the per-segment RiskConfig.maxOrderValue cap (Trading-vsb).
 * Mapped to HTTP 403 by the generic statusCode mapper.
 */
export class OrderValueCapTradingError extends Error {
  readonly statusCode = 403

  constructor(
    message: string = "Order notional exceeds the segment-wide order value cap.",
  ) {
    super(message)
    this.name = "OrderValueCapTradingError"
  }
}

/**
 * Account already at the per-segment RiskConfig.maxPositions cap and this is
 * a new opening order (Trading-vsb). Mapped to HTTP 403.
 */
export class MaxOpenPositionsCapTradingError extends Error {
  readonly statusCode = 403

  constructor(
    message: string = "Open-position cap for this segment reached. Close existing positions first.",
  ) {
    super(message)
    this.name = "MaxOpenPositionsCapTradingError"
  }
}

/**
 * Trading-upr: user's realized + unrealized PnL today is at or below
 * -RiskLimit.maxDailyLoss, and this order would OPEN new exposure (rather than reduce
 * it). Closing orders bypass the cap by design — admin's intent is to stop new losses,
 * not to trap users in losing positions. Mapped to HTTP 403.
 */
export class DailyLossCapTradingError extends Error {
  readonly statusCode = 403

  constructor(
    message: string = "Daily loss limit reached. Only closing orders (reducing exposure) are allowed for the rest of the IST trading day.",
  ) {
    super(message)
    this.name = "DailyLossCapTradingError"
  }
}
