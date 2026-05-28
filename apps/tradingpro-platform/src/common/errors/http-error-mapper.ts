/**
 * File: src/common/errors/http-error-mapper.ts
 * Module: common-errors
 * Purpose: Map AppError and ZodError instances to HTTP response payloads.
 * Author: StockTrade
 * Last-updated: 2026-03-25
 * Notes:
 * - Use in API handlers to standardize error responses.
 * - Map unknown errors to a safe fallback.
 */

import { ZodError } from "zod"
import { AppError } from "./app-error"

export type HttpErrorPayload = {
  status: number
  body: {
    error: string
    code: string
    details?: unknown
  }
}

const MAX_ZOD_ISSUES_IN_MESSAGE = 6

function zodErrorToAdminMessage(err: ZodError): string {
  const parts = err.issues
    .map((i) => (i.path?.length ? `${i.path.join(".")}: ${i.message}` : i.message))
    .filter(Boolean)
  const head = parts.slice(0, MAX_ZOD_ISSUES_IN_MESSAGE)
  const suffix = parts.length > MAX_ZOD_ISSUES_IN_MESSAGE ? ` (+${parts.length - MAX_ZOD_ISSUES_IN_MESSAGE} more)` : ""
  return head.length ? `${head.join("; ")}${suffix}` : "Validation failed"
}

export const mapErrorToHttp = (
  error: unknown,
  fallbackMessage: string = "Internal Server Error"
): HttpErrorPayload => {
  if (error instanceof AppError) {
    return {
      status: error.statusCode,
      body: {
        error: error.message,
        code: error.code,
        details: error.details,
      },
    }
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: zodErrorToAdminMessage(error),
        code: "VALIDATION_ERROR",
        details: {
          issues: error.issues.map((i) => ({
            path: i.path.map(String),
            message: i.message,
          })),
        },
      },
    }
  }

  return {
    status: 500,
    body: {
      error: fallbackMessage,
      code: "INTERNAL_ERROR",
    },
  }
}
