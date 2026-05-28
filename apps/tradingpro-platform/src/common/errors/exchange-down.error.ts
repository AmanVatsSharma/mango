/**
 * File: src/common/errors/exchange-down.error.ts
 * Module: common-errors
 * Purpose: Error when upstream exchange is unavailable.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Use for exchange outage or upstream downtime.
 * - Extends AppError with 503 status.
 */

import { AppError } from "./app-error"

export class ExchangeDownError extends AppError {
  constructor(message: string = "Exchange is currently unavailable", details?: unknown) {
    super({
      code: "EXCHANGE_DOWN",
      message,
      statusCode: 503,
      details,
    })
    this.name = "ExchangeDownError"
  }
}
