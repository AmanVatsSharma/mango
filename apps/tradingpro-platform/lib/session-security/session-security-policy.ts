/**
 * @file session-security-policy.ts
 * @module session-security
 * @description Load and merge SessionSecurityPolicyV1 from SystemSettings with safe defaults.
 * @author StockTrade
 * @created 2026-03-28
 */

import { prisma } from "@/lib/prisma"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import type { SessionSecurityPolicyV1 } from "./types"

const SEVERITY_SET = new Set<SessionSecurityPolicyV1["clusterIncidentSeverity"]>([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
])

export const DEFAULT_SESSION_SECURITY_POLICY_V1: SessionSecurityPolicyV1 = {
  version: 1,
  enabled: true,
  maxConcurrentSessions: 5,
  sessionIdleTtlMinutes: 10080,
  networkClusterMode: "IP_HASH",
  multiAccountDistinctUserThreshold: 2,
  multiAccountLookbackHours: 168,
  multiAccountAction: "ALERT",
  concurrentSessionPolicy: "EVICT_OLDEST",
  stepUpRequiresMpin: true,
  incidentCooldownMinutes: 60,
  resolvedIncidentRetentionDays: 0,
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

export function mergeSessionSecurityPolicy(raw: unknown): SessionSecurityPolicyV1 {
  const d = DEFAULT_SESSION_SECURITY_POLICY_V1
  if (!isRecord(raw) || raw.version !== 1) return { ...d }

  return {
    version: 1,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : d.enabled,
    maxConcurrentSessions:
      typeof raw.maxConcurrentSessions === "number" && raw.maxConcurrentSessions >= 1
        ? Math.min(100, raw.maxConcurrentSessions)
        : d.maxConcurrentSessions,
    sessionIdleTtlMinutes:
      typeof raw.sessionIdleTtlMinutes === "number" && raw.sessionIdleTtlMinutes >= 5
        ? Math.min(525600, raw.sessionIdleTtlMinutes)
        : d.sessionIdleTtlMinutes,
    networkClusterMode:
      raw.networkClusterMode === "SUBNET24" ||
      raw.networkClusterMode === "IP_HASH" ||
      raw.networkClusterMode === "IP_HASH_WITH_ASN"
        ? raw.networkClusterMode
        : d.networkClusterMode,
    multiAccountDistinctUserThreshold:
      typeof raw.multiAccountDistinctUserThreshold === "number" &&
      raw.multiAccountDistinctUserThreshold >= 1
        ? Math.min(50, raw.multiAccountDistinctUserThreshold)
        : d.multiAccountDistinctUserThreshold,
    multiAccountLookbackHours:
      typeof raw.multiAccountLookbackHours === "number" && raw.multiAccountLookbackHours >= 1
        ? Math.min(720, raw.multiAccountLookbackHours)
        : d.multiAccountLookbackHours,
    multiAccountAction:
      raw.multiAccountAction === "ALERT" ||
      raw.multiAccountAction === "STEP_UP" ||
      raw.multiAccountAction === "BLOCK_SIGNUP" ||
      raw.multiAccountAction === "BLOCK_LOGIN"
        ? raw.multiAccountAction
        : d.multiAccountAction,
    concurrentSessionPolicy:
      raw.concurrentSessionPolicy === "EVICT_OLDEST" || raw.concurrentSessionPolicy === "REJECT_NEW"
        ? raw.concurrentSessionPolicy
        : d.concurrentSessionPolicy,
    stepUpRequiresMpin: typeof raw.stepUpRequiresMpin === "boolean" ? raw.stepUpRequiresMpin : d.stepUpRequiresMpin,
    incidentCooldownMinutes:
      typeof raw.incidentCooldownMinutes === "number" && raw.incidentCooldownMinutes >= 0
        ? Math.min(10080, Math.floor(raw.incidentCooldownMinutes))
        : d.incidentCooldownMinutes,
    resolvedIncidentRetentionDays:
      typeof raw.resolvedIncidentRetentionDays === "number" && raw.resolvedIncidentRetentionDays >= 0
        ? Math.min(3650, Math.floor(raw.resolvedIncidentRetentionDays))
        : d.resolvedIncidentRetentionDays,
    clusterIncidentSeverity:
      raw.clusterIncidentSeverity != null &&
      SEVERITY_SET.has(raw.clusterIncidentSeverity as SessionSecurityPolicyV1["clusterIncidentSeverity"])
        ? (raw.clusterIncidentSeverity as SessionSecurityPolicyV1["clusterIncidentSeverity"])
        : undefined,
    concurrentIncidentSeverity:
      raw.concurrentIncidentSeverity != null &&
      SEVERITY_SET.has(raw.concurrentIncidentSeverity as SessionSecurityPolicyV1["concurrentIncidentSeverity"])
        ? (raw.concurrentIncidentSeverity as SessionSecurityPolicyV1["concurrentIncidentSeverity"])
        : undefined,
  }
}

export async function loadSessionSecurityPolicy(): Promise<SessionSecurityPolicyV1> {
  try {
    const row = await prisma.systemSettings.findFirst({
      where: { key: ADMIN_SETTING_KEYS.SESSION_SECURITY_POLICY_V1, ownerId: null },
    })
    if (!row?.value) return { ...DEFAULT_SESSION_SECURITY_POLICY_V1 }
    const parsed = JSON.parse(row.value) as unknown
    return mergeSessionSecurityPolicy(parsed)
  } catch {
    return { ...DEFAULT_SESSION_SECURITY_POLICY_V1 }
  }
}
