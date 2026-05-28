/**
 * @file account-access.ts
 * @module auth
 * @description Barrel re-exports for account login eligibility and session invalidation.
 * @author StockTrade
 * @created 2026-04-01
 */

export {
  ACCOUNT_ACCESS_ERROR_CODE,
  accountAccessToErrorCode,
  messageForCredentialsSigninCode,
  resolveAccountAccess,
  type AccountAccessCheckInput,
  type AccountAccessState,
} from "@/lib/auth/account-access-policy"

export { invalidateAllLoginSessionsForUser } from "@/lib/auth/account-session-invalidate"

export {
  AccountDeactivatedSignin,
  AccountSuspendedSignin,
  assertAccountAllowsLogin,
} from "@/lib/auth/account-credentials-guard"
