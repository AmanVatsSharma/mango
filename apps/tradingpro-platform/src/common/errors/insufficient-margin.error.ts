/**
 * File: src/common/errors/insufficient-margin.error.ts
 * Module: common-errors
 * Purpose: Error for insufficient margin or funds.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Use when margin checks fail.
 * - Extends AppError with 409 status.
 */

import { AppError } from "./app-error"

export class InsufficientMarginError extends AppError {
  constructor(message: string = "Insufficient margin to place order", details?: unknown) {
    super({
      code: "INSUFFICIENT_MARGIN",
      message,
      statusCode: 409,
      details,
    })
    this.name = "InsufficientMarginError"
  }
}
