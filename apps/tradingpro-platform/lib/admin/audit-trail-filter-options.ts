/**
 * @file audit-trail-filter-options.ts
 * @module admin-console
 * @description Client-safe filter option lists for audit trail UI (mirrors Prisma enums; avoid @prisma/client in client bundles).
 * @author StockTrade
 * @created 2026-03-20
 */

/** Mirrors prisma AuthEventType — keep in sync with schema */
export const AUTH_EVENT_TYPE_VALUES: string[] = [
  "REGISTRATION_ATTEMPT",
  "REGISTRATION_SUCCESS",
  "REGISTRATION_FAILED",
  "LOGIN_ATTEMPT",
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "OTP_SENT",
  "OTP_VERIFIED",
  "OTP_FAILED",
  "OTP_RESEND",
  "MPIN_SETUP_ATTEMPT",
  "MPIN_SETUP_SUCCESS",
  "MPIN_SETUP_FAILED",
  "MPIN_VERIFY_ATTEMPT",
  "MPIN_VERIFY_SUCCESS",
  "MPIN_VERIFY_FAILED",
  "MPIN_RESET_ATTEMPT",
  "MPIN_RESET_SUCCESS",
  "MPIN_RESET_FAILED",
  "SESSION_CREATED",
  "SESSION_EXPIRED",
  "SESSION_INVALIDATED",
  "PHONE_VERIFIED",
  "KYC_SUBMITTED",
  "KYC_APPROVED",
  "KYC_REJECTED",
  "SECURITY_VIOLATION",
  "RATE_LIMIT_EXCEEDED",
  "ACCOUNT_LOCKED",
  "ACCOUNT_UNLOCKED",
]

/** LogCategory */
export const LOG_CATEGORY_VALUES: string[] = [
  "ORDER",
  "POSITION",
  "TRANSACTION",
  "FUNDS",
  "AUTH",
  "SYSTEM",
  "API",
]

/** LogLevel */
export const LOG_LEVEL_VALUES: string[] = ["INFO", "WARN", "ERROR", "DEBUG"]

export function formatEnumLabel(value: string): string {
  return value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}
