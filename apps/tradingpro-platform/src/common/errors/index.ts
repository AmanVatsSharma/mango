/**
 * File: src/common/errors/index.ts
 * Module: common-errors
 * Purpose: Barrel export for shared error types.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Re-export error classes for consistent imports.
 * - Start with `app-error.ts` for base semantics.
 */

export { AppError } from "./app-error"
export type { AppErrorOptions } from "./app-error"
export { mapErrorToHttp } from "./http-error-mapper"
export type { HttpErrorPayload } from "./http-error-mapper"
export { OrderValidationError } from "./order-validation.error"
export { InsufficientMarginError } from "./insufficient-margin.error"
export { ExchangeDownError } from "./exchange-down.error"
export { DuplicateOrderError } from "./duplicate-order.error"
