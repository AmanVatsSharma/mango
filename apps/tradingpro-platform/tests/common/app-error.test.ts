/**
 * File: tests/common/app-error.test.ts
 * Module: common-errors
 * Purpose: Ensure AppError and domain errors behave consistently.
 * Author: StockTrade
 * Last-updated: 2026-01-15
 * Notes:
 * - Verifies status codes and error codes.
 * - Covers domain error inheritance.
 */

import {
  AppError,
  DuplicateOrderError,
  ExchangeDownError,
  InsufficientMarginError,
  OrderValidationError,
} from "@/src/common/errors"

describe("AppError", () => {
  it("sets code, status, and details", () => {
    const error = new AppError({
      code: "TEST_ERROR",
      message: "Test message",
      statusCode: 418,
      details: { note: "teapot" },
    })

    expect(error.code).toBe("TEST_ERROR")
    expect(error.message).toBe("Test message")
    expect(error.statusCode).toBe(418)
    expect(error.details).toEqual({ note: "teapot" })
  })

  it("defaults to status 500", () => {
    const error = new AppError({
      code: "DEFAULT_STATUS",
      message: "Default status",
    })

    expect(error.statusCode).toBe(500)
  })
})

describe("Domain errors", () => {
  it("sets expected codes and statuses", () => {
    expect(new OrderValidationError().statusCode).toBe(400)
    expect(new InsufficientMarginError().statusCode).toBe(409)
    expect(new DuplicateOrderError().statusCode).toBe(409)
    expect(new ExchangeDownError().statusCode).toBe(503)
  })
})
