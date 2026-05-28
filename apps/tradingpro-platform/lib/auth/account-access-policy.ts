/**
 * @file account-access-policy.ts
 * @module auth
 * @description Pure login eligibility: suspended vs deactivated (no DB, no NextAuth).
 * @author StockTrade
 * @created 2026-04-01
 */

export type AccountAccessState = "ok" | "suspended" | "deactivated"

export type AccountAccessCheckInput = {
  isActive: boolean
  suspendedAt: Date | null
}

const MSG_SUSPENDED =
  "Your account has been temporarily suspended. Please contact your administrator or relationship manager for assistance."
const MSG_DEACTIVATED =
  "Your account has been deactivated. Please contact support if you believe this is an error."

export function resolveAccountAccess(input: AccountAccessCheckInput): {
  state: AccountAccessState
  userMessage: string
} {
  if (input.suspendedAt != null) {
    return { state: "suspended", userMessage: MSG_SUSPENDED }
  }
  if (!input.isActive) {
    return { state: "deactivated", userMessage: MSG_DEACTIVATED }
  }
  return { state: "ok", userMessage: "" }
}

export const ACCOUNT_ACCESS_ERROR_CODE = {
  SUSPENDED: "ACCOUNT_SUSPENDED",
  DEACTIVATED: "ACCOUNT_DEACTIVATED",
} as const

export function accountAccessToErrorCode(state: AccountAccessState): string | null {
  if (state === "suspended") return ACCOUNT_ACCESS_ERROR_CODE.SUSPENDED
  if (state === "deactivated") return ACCOUNT_ACCESS_ERROR_CODE.DEACTIVATED
  return null
}

export function messageForCredentialsSigninCode(code: string | undefined): string | null {
  if (code === ACCOUNT_ACCESS_ERROR_CODE.SUSPENDED) return MSG_SUSPENDED
  if (code === ACCOUNT_ACCESS_ERROR_CODE.DEACTIVATED) return MSG_DEACTIVATED
  return null
}
