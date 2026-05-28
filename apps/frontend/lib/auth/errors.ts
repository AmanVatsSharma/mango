/**
 * @file lib/auth/errors.ts
 * @module auth/errors
 * @purpose Standardized error types and result types for all auth actions.
 *          Provides machine-readable error codes so callers (and tests) can
 *          assert on specific failure modes rather than string matching.
 *
 * Exports:
 *   - AuthErrorCode        — discriminated union of known error codes
 *   - AuthActionResult<T> — {success:true, data:T} | {success:false, error:string, code:AuthErrorCode}
 *
 * Depends on: none (pure TypeScript, no Prisma/NextAuth imports needed)
 *
 * Side-effects: none
 *
 * Key invariants:
 *   - All auth action return values should narrow via `result.success === true/false`
 *   - Error codes are stable strings — never change them (breaks callers)
 *
 * Read order:
 *   1. AuthErrorCode — error taxonomy
 *   2. AuthActionResult — result shape
 *   3. authError() — factory helper
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-13
 */

export const AuthErrorCode = {
  // Credentials / identity
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  USER_NOT_FOUND:       "USER_NOT_FOUND",
  EMAIL_EXISTS:         "EMAIL_EXISTS",
  PHONE_EXISTS:         "PHONE_EXISTS",
  CLIENT_ID_EXISTS:     "CLIENT_ID_EXISTS",

  // Account state
  ACCOUNT_SUSPENDED:    "ACCOUNT_SUSPENDED",
  EMAIL_NOT_VERIFIED:    "EMAIL_NOT_VERIFIED",
  PHONE_NOT_VERIFIED:    "PHONE_NOT_VERIFIED",
  MPIN_NOT_SET:          "MPIN_NOT_SET",
  KYC_REQUIRED:         "KYC_REQUIRED",

  // Session / token
  SESSION_EXPIRED:      "SESSION_EXPIRED",
  SESSION_INVALID:      "SESSION_INVALID",
  TOKEN_EXPIRED:        "TOKEN_EXPIRED",
  TOKEN_INVALID:        "TOKEN_INVALID",
  TOKEN_REUSED:         "TOKEN_REUSED",

  // OTP / mPin
  INVALID_OTP:          "INVALID_OTP",
  OTP_EXPIRED:          "OTP_EXPIRED",
  OTP_MAX_ATTEMPTS:    "OTP_MAX_ATTEMPTS",
  INVALID_MPIN:        "INVALID_MPIN",
  MPIN_MISMATCH:        "MPIN_MISMATCH",

  // Policy / gates
  REGISTRATION_DISABLED:   "REGISTRATION_DISABLED",
  LOGIN_DISABLED:          "LOGIN_DISABLED",
  NETWORK_BLOCKED:         "NETWORK_BLOCKED",
  UNAUTHORIZED:            "UNAUTHORIZED",

  // Validation
  VALIDATION_ERROR:     "VALIDATION_ERROR",

  // Generic
  INTERNAL_ERROR:       "INTERNAL_ERROR",
} as const

export type AuthErrorCode = typeof AuthErrorCode[keyof typeof AuthErrorCode]

export type AuthActionResult<T = void> =
  | { success: true;  data: T }
  | { success: false; error: string; code: AuthErrorCode }

/** Shortcut to build an error result. */
export function authError(code: AuthErrorCode, message: string): AuthActionResult<never> {
  return { success: false, error: message, code }
}

/** Shortcut to build a success result. */
export function authSuccess<T>(data: T): AuthActionResult<T> {
  return { success: true, data }
}