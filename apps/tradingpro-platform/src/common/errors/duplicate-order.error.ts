/**
 * File: src/common/errors/duplicate-order.error.ts
 * Module: common-errors
 * Purpose: Error for duplicate order submissions.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Use when a duplicate order is detected.
 * - Extends AppError with 409 status.
 */

import { AppError } from "./app-error"

export class DuplicateOrderError extends AppError {
  constructor(message: string = "Duplicate order detected", details?: unknown) {
    super({
      code: "DUPLICATE_ORDER",
      message,
      statusCode: 409,
      details,
    })
    this.name = "DuplicateOrderError"
  }
}
