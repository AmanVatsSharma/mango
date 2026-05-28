/**
 * File: src/common/errors/app-error.ts
 * Module: common-errors
 * Purpose: Base error class with code, status, and details.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Extend this class for all domain errors.
 * - Start here to understand error payload shape.
 */

export type AppErrorOptions = {
  code: string
  message: string
  statusCode?: number
  details?: unknown
  cause?: unknown
}

export class AppError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly details?: unknown
  readonly cause?: unknown

  constructor(options: AppErrorOptions) {
    super(options.message)
    this.name = "AppError"
    this.code = options.code
    this.statusCode = options.statusCode ?? 500
    this.details = options.details
    this.cause = options.cause
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
