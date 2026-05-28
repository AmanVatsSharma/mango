/**
 * @file login-finalize.ts
 * @module session-security
 * @description Apply session policy after credentials succeed; enqueue session registry + network checks.
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-04-01 — Enforce suspended / deactivated before session policy.
 *
 * Notes:
 * - `sessionRegistryJti` is stored on the JWT (not `jti`): Auth.js `encode()` always sets the standard `jti` claim to a random UUID.
 */

import type { SessionAuth, User } from "@prisma/client"
import { getTrustedClientIp } from "@/lib/server/trusted-client-ip"
import { computeNetworkKey, sessionSecuritySecret } from "./network-key"
import { loadSessionSecurityPolicy } from "./session-security-policy"
import {
  assertConcurrentSessionsAllowed,
  evaluateNetworkClusterForAction,
} from "./network-eval"
import {
  countActiveSessions,
  createOrRotateWebCredentialSession,
  revokeOldestSessions,
} from "./registry"
import { authLogger } from "@/lib/auth-logger"
import { assertAccountAllowsLogin } from "@/lib/auth/account-credentials-guard"
import { createSessionSecurityStepUpChallenge } from "./step-up"

export type FinalizedCredentialUser = User & {
  /** Maps to UserSessionRecord.jti; must not use JWT claim name `jti` (Auth.js overwrites it on every encode). */
  sessionRegistryJti?: string
  sessionSecurityStepUpPending?: boolean
  sessionSecurityStepUpChallengeId?: string
}

export async function finalizeCredentialLogin(args: {
  user: User
  request: Request
  sessionAuth: SessionAuth | null
  action: "login" | "signup"
  /** Skip network clustering when completing STEP_UP (already verified). */
  skipNetworkEval?: boolean
}): Promise<FinalizedCredentialUser | null> {
  assertAccountAllowsLogin({
    isActive: args.user.isActive,
    suspendedAt: args.user.suspendedAt,
  })

  const policy = await loadSessionSecurityPolicy()
  const ip = getTrustedClientIp({ headers: args.request.headers })
  const networkKey = computeNetworkKey(ip, policy.networkClusterMode, sessionSecuritySecret())

  if (policy.enabled && !args.skipNetworkEval) {
    const net = await evaluateNetworkClusterForAction({
      userId: args.user.id,
      networkKey,
      action: args.action === "signup" ? "signup" : "login",
      policy,
    })
    if (net.blocked) {
      await authLogger.logEvent({
        userId: args.user.id,
        eventType: "SECURITY_VIOLATION",
        severity: "HIGH",
        message: "Login blocked by network cluster policy",
        metadata: { networkKey, ip },
      })
      return null
    }

    if (net.stepUpRequired && args.action === "login") {
      const challengeId = await createSessionSecurityStepUpChallenge({
        userId: args.user.id,
        networkKey,
      })
      return {
        ...args.user,
        sessionSecurityStepUpPending: true,
        sessionSecurityStepUpChallengeId: challengeId,
      }
    }

    let active = await countActiveSessions(args.user.id)
    const concurrent = await assertConcurrentSessionsAllowed(args.user, policy, active)
    if (!concurrent.ok) {
      await authLogger.logEvent({
        userId: args.user.id,
        eventType: "CONCURRENT_SESSION_REJECTED",
        severity: "LOW",
        message: "Concurrent session limit enforced (reject new)",
        metadata: { activeCount: active },
      })
      return null
    }
    if (active >= policy.maxConcurrentSessions && policy.concurrentSessionPolicy === "EVICT_OLDEST") {
      const toEvict = active - policy.maxConcurrentSessions + 1
      await revokeOldestSessions(args.user.id, Math.max(0, toEvict))
      active = await countActiveSessions(args.user.id)
      if (active >= policy.maxConcurrentSessions) {
        await authLogger.logEvent({
          userId: args.user.id,
          eventType: "CONCURRENT_SESSION_REJECTED",
          severity: "LOW",
          message: "Concurrent session limit still exceeded after eviction",
          metadata: { activeCount: active },
        })
        return null
      }
    }
  } else if (policy.enabled && args.skipNetworkEval) {
    let active = await countActiveSessions(args.user.id)
    const concurrent = await assertConcurrentSessionsAllowed(args.user, policy, active)
    if (!concurrent.ok) {
      await authLogger.logEvent({
        userId: args.user.id,
        eventType: "CONCURRENT_SESSION_REJECTED",
        severity: "LOW",
        message: "Concurrent session limit enforced (reject new)",
        metadata: { activeCount: active },
      })
      return null
    }
    if (active >= policy.maxConcurrentSessions && policy.concurrentSessionPolicy === "EVICT_OLDEST") {
      const toEvict = active - policy.maxConcurrentSessions + 1
      await revokeOldestSessions(args.user.id, Math.max(0, toEvict))
      active = await countActiveSessions(args.user.id)
      if (active >= policy.maxConcurrentSessions) {
        await authLogger.logEvent({
          userId: args.user.id,
          eventType: "CONCURRENT_SESSION_REJECTED",
          severity: "LOW",
          message: "Concurrent session limit still exceeded after eviction",
          metadata: { activeCount: active },
        })
        return null
      }
    }
  }

  if (!policy.enabled) {
    return { ...args.user }
  }

  const { jti } = await createOrRotateWebCredentialSession({
    userId: args.user.id,
    request: args.request,
    sessionAuth: args.sessionAuth,
  })

  return { ...args.user, sessionRegistryJti: jti }
}
