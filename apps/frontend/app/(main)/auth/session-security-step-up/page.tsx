/**
 * @file page.tsx
 * @module app/(main)/auth/session-security-step-up
 * @description Route entry for session security STEP_UP (MPIN) after clustered login.
 * @author StockTrade
 * @created 2026-03-28
 */

import { SessionSecurityStepUpClient } from "@/components/auth/SessionSecurityStepUpClient"

export default function SessionSecurityStepUpPage() {
  return <SessionSecurityStepUpClient />
}
