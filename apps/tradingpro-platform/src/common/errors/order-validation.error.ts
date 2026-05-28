/**
 * File: src/common/errors/order-validation.error.ts
 * Module: common-errors
 * Purpose: Error for invalid order input or state.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Use when order payload fails validation checks.
 * - Extends AppError with 400 status.
 */

import { AppError } from "./app-error"

export class OrderValidationError extends AppError {
  constructor(message: string = "Order validation failed", details?: unknown) {
    super({
      code: "ORDER_VALIDATION_ERROR",
      message,
      statusCode: 400,
      details,
    })
    this.name = "OrderValidationError"
  }
}
