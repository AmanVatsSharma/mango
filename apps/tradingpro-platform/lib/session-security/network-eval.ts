/**
 * @file network-eval.ts
 * @module session-security
 * @description Multi-account same-network detection: incidents + optional login/signup blocks and STEP_UP.
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-28
 */

import type { User } from "@prisma/client"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { authLogger } from "@/lib/auth-logger"
import type { SessionSecurityPolicyV1 } from "./types"
import { SecurityIncidentType, AuthEventSeverity } from "@prisma/client"
import { hasRecentIncidentDuplicate } from "./incident-dedupe"

function resolveClusterSeverity(policy: SessionSecurityPolicyV1): AuthEventSeverity {
  const s = policy.clusterIncidentSeverity
  if (s === "LOW") return AuthEventSeverity.LOW
  if (s === "HIGH") return AuthEventSeverity.HIGH
  if (s === "CRITICAL") return AuthEventSeverity.CRITICAL
  return AuthEventSeverity.MEDIUM
}

function resolveConcurrentSeverity(policy: SessionSecurityPolicyV1): AuthEventSeverity {
  const s = policy.concurrentIncidentSeverity
  if (s === "MEDIUM") return AuthEventSeverity.MEDIUM
  if (s === "HIGH") return AuthEventSeverity.HIGH
  if (s === "CRITICAL") return AuthEventSeverity.CRITICAL
  return AuthEventSeverity.LOW
}

async function createNetworkClusterIncident(
  args: {
    networkKey: string
    message: string
    relatedUserIds: string[]
    payload: Prisma.InputJsonValue
    severity: AuthEventSeverity
    policy: SessionSecurityPolicyV1
  }
): Promise<void> {
  const dup = await hasRecentIncidentDuplicate({
    type: SecurityIncidentType.MULTI_USER_SAME_NETWORK,
    networkKey: args.networkKey,
    cooldownMinutes: args.policy.incidentCooldownMinutes,
  })
  if (dup) return

  await prisma.securityIncident.create({
    data: {
      type: SecurityIncidentType.MULTI_USER_SAME_NETWORK,
      severity: args.severity,
      message: args.message,
      networkKey: args.networkKey,
      relatedUserIds: args.relatedUserIds,
      payload: args.payload,
    },
  })
}

export async function evaluateNetworkClusterForAction(args: {
  userId: string
  networkKey: string
  action: "login" | "signup"
  policy: SessionSecurityPolicyV1
}): Promise<{ blocked: boolean; distinctPeers: number; stepUpRequired: boolean }> {
  if (!args.policy.enabled) return { blocked: false, distinctPeers: 0, stepUpRequired: false }
  const since = new Date(Date.now() - args.policy.multiAccountLookbackHours * 60 * 60 * 1000)

  const grouped = await prisma.userSessionRecord.groupBy({
    by: ["userId"],
    where: {
      networkKey: args.networkKey,
      lastSeenAt: { gte: since },
      revokedAt: null,
    },
  })

  const peerIds = new Set(grouped.map((g) => g.userId))
  peerIds.add(args.userId)
  const distinct = peerIds.size

  const threshold = args.policy.multiAccountDistinctUserThreshold
  if (distinct < threshold) {
    return { blocked: false, distinctPeers: distinct, stepUpRequired: false }
  }

  const relatedUserIds = Array.from(peerIds)
  const message = `Network cluster: ${distinct} distinct user(s) on same network key within lookback window (threshold ${threshold}).`
  const sev = resolveClusterSeverity(args.policy)

  const stepUpRequired =
    args.action === "login" &&
    args.policy.multiAccountAction === "STEP_UP" &&
    args.policy.stepUpRequiresMpin

  await createNetworkClusterIncident({
    networkKey: args.networkKey,
    message,
    relatedUserIds,
    payload: {
      action: args.action,
      userId: args.userId,
      distinctUsers: distinct,
      lookbackHours: args.policy.multiAccountLookbackHours,
      stepUpRequired,
    } as Prisma.InputJsonValue,
    severity: sev,
    policy: args.policy,
  })

  await authLogger.logEvent({
    userId: args.userId,
    eventType: "NETWORK_CLUSTER_ALERT",
    severity: sev === AuthEventSeverity.CRITICAL || sev === AuthEventSeverity.HIGH ? "HIGH" : "MEDIUM",
    message,
    metadata: { networkKey: args.networkKey, action: args.action, distinctUsers: distinct },
  })

  if (stepUpRequired) {
    return { blocked: false, distinctPeers: distinct, stepUpRequired: true }
  }

  const action = args.policy.multiAccountAction
  if (args.action === "login" && action === "BLOCK_LOGIN") {
    return { blocked: true, distinctPeers: distinct, stepUpRequired: false }
  }
  if (args.action === "signup" && action === "BLOCK_SIGNUP") {
    return { blocked: true, distinctPeers: distinct, stepUpRequired: false }
  }

  return { blocked: false, distinctPeers: distinct, stepUpRequired: false }
}

/**
 * Before creating a new user: if enough distinct accounts already appear from this network in session registry, alert/block.
 */
export async function evaluateNetworkClusterBeforeSignup(args: {
  networkKey: string
  policy: SessionSecurityPolicyV1
}): Promise<{ blocked: boolean; existingPeers: number }> {
  if (!args.policy.enabled) return { blocked: false, existingPeers: 0 }
  const since = new Date(Date.now() - args.policy.multiAccountLookbackHours * 60 * 60 * 1000)
  const grouped = await prisma.userSessionRecord.groupBy({
    by: ["userId"],
    where: {
      networkKey: args.networkKey,
      lastSeenAt: { gte: since },
      revokedAt: null,
    },
  })
  const threshold = args.policy.multiAccountDistinctUserThreshold
  if (grouped.length < threshold) {
    return { blocked: false, existingPeers: grouped.length }
  }

  const relatedUserIds = grouped.map((g) => g.userId)
  const message = `Signup blocked or flagged: ${grouped.length} existing user(s) on same network (threshold ${threshold}).`
  const sev = resolveClusterSeverity(args.policy)

  const dup = await hasRecentIncidentDuplicate({
    type: SecurityIncidentType.MULTI_USER_SAME_NETWORK,
    networkKey: args.networkKey,
    cooldownMinutes: args.policy.incidentCooldownMinutes,
  })
  if (!dup) {
    await prisma.securityIncident.create({
      data: {
        type: SecurityIncidentType.MULTI_USER_SAME_NETWORK,
        severity: sev,
        message,
        networkKey: args.networkKey,
        relatedUserIds,
        payload: {
          action: "signup",
          existingDistinctUsers: grouped.length,
          lookbackHours: args.policy.multiAccountLookbackHours,
        } as Prisma.InputJsonValue,
      },
    })
  }

  await authLogger.logEvent({
    eventType: "NETWORK_CLUSTER_ALERT",
    severity: sev === AuthEventSeverity.CRITICAL || sev === AuthEventSeverity.HIGH ? "HIGH" : "MEDIUM",
    message,
    metadata: { networkKey: args.networkKey, existingDistinctUsers: grouped.length },
  })

  if (args.policy.multiAccountAction === "BLOCK_SIGNUP") {
    return { blocked: true, existingPeers: grouped.length }
  }
  return { blocked: false, existingPeers: grouped.length }
}

export async function assertConcurrentSessionsAllowed(
  user: Pick<User, "id">,
  policy: SessionSecurityPolicyV1,
  activeCount: number
): Promise<{ ok: true } | { ok: false; reason: "reject" }> {
  if (!policy.enabled) return { ok: true }
  const max = policy.maxConcurrentSessions
  if (activeCount < max) return { ok: true }
  if (policy.concurrentSessionPolicy === "REJECT_NEW") {
    const dup = await hasRecentIncidentDuplicate({
      type: SecurityIncidentType.CONCURRENT_SESSIONS_EXCEEDED,
      relatedUserId: user.id,
      cooldownMinutes: policy.incidentCooldownMinutes,
    })
    if (!dup) {
      await prisma.securityIncident.create({
        data: {
          type: SecurityIncidentType.CONCURRENT_SESSIONS_EXCEEDED,
          severity: resolveConcurrentSeverity(policy),
          message: `User ${user.id} exceeded concurrent session limit (${max}).`,
          relatedUserIds: [user.id],
          payload: { activeCount, max } as Prisma.InputJsonValue,
        },
      })
    }
    return { ok: false, reason: "reject" }
  }
  return { ok: true }
}
