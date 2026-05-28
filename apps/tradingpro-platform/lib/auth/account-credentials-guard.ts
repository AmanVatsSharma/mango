/**
 * @file account-credentials-guard.ts
 * @module auth
 * @description CredentialsSignin subclasses and assert helper for NextAuth authorize / finalize.
 * @author StockTrade
 * @created 2026-04-01
 */

import { CredentialsSignin } from "next-auth"
import {
  ACCOUNT_ACCESS_ERROR_CODE,
  type AccountAccessCheckInput,
  resolveAccountAccess,
} from "@/lib/auth/account-access-policy"

export class AccountSuspendedSignin extends CredentialsSignin {
  constructor() {
    super()
    this.code = ACCOUNT_ACCESS_ERROR_CODE.SUSPENDED
  }
}

export class AccountDeactivatedSignin extends CredentialsSignin {
  constructor() {
    super()
    this.code = ACCOUNT_ACCESS_ERROR_CODE.DEACTIVATED
  }
}

export function assertAccountAllowsLogin(input: AccountAccessCheckInput): void {
  const { state } = resolveAccountAccess(input)
  if (state === "suspended") throw new AccountSuspendedSignin()
  if (state === "deactivated") throw new AccountDeactivatedSignin()
}
