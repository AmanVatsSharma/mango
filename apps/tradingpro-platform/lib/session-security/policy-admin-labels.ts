/**
 * @file policy-admin-labels.ts
 * @module session-security
 * @description Plain-language labels, tooltips, and presets for Session Security policy admin UI (values stay API-compatible).
 * @author StockTrade
 * @created 2026-03-28
 */

import type {
  ConcurrentSessionPolicy,
  MultiAccountAction,
  NetworkClusterMode,
  SessionSecurityPolicyV1,
} from "@/lib/session-security/types"

export const CONCURRENT_POLICY_OPTIONS: { value: ConcurrentSessionPolicy; label: string; hint: string }[] = [
  {
    value: "EVICT_OLDEST",
    label: "Allow new device; end oldest session",
    hint: "When the user signs in on a new device and the limit is reached, the oldest active session is ended. Best default for most businesses.",
  },
  {
    value: "REJECT_NEW",
    label: "Block new sign-in until a device is freed",
    hint: "The user must sign out from another device (or an admin revokes a session) before a new login is allowed. Stricter.",
  },
]

export const NETWORK_MODE_OPTIONS: { value: NetworkClusterMode; label: string; hint: string }[] = [
  {
    value: "IP_HASH",
    label: "Single public IP (default)",
    hint: "Treat users on the exact same IP address as potentially related. Simple and common for home/mobile users.",
  },
  {
    value: "SUBNET24",
    label: "Same office network (/24)",
    hint: "Groups nearby addresses (typical office NAT). Reduces false alerts when many staff share one outbound IP range.",
  },
  {
    value: "IP_HASH_WITH_ASN",
    label: "IP + carrier network (ASN)",
    hint: "Adds ISP/hosting context for large or mobile networks. Use when you see misleading clusters on mobile data.",
  },
]

export const MULTI_ACCOUNT_ACTION_OPTIONS: { value: MultiAccountAction; label: string; hint: string }[] = [
  {
    value: "ALERT",
    label: "Notify only (recommended default)",
    hint: "Create an incident for your team to review. Does not block users. Safest starting point.",
  },
  {
    value: "STEP_UP",
    label: "Extra verification (step-up)",
    hint: "User may be asked for MPIN or an extra check before continuing. Balances security and access.",
  },
  {
    value: "BLOCK_SIGNUP",
    label: "Block new registrations from that network",
    hint: "Stops new accounts when the pattern fires. Can affect shared Wi-Fi; use when abuse is confirmed.",
  },
  {
    value: "BLOCK_LOGIN",
    label: "Block sign-in from that network",
    hint: "Strong action: can lock out legitimate users on shared IPs (cafés, offices). Use only when sure.",
  },
]

export const INCIDENT_SEVERITY_OPTIONS: {
  value: "default" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  label: string
  hint: string
}[] = [
  { value: "default", label: "System default", hint: "Use the product default severity for this incident type." },
  { value: "LOW", label: "Low", hint: "Informational triage; monitor but no immediate escalation." },
  { value: "MEDIUM", label: "Medium", hint: "Standard operational review." },
  { value: "HIGH", label: "High", hint: "Prompt review; potential coordinated abuse." },
  { value: "CRITICAL", label: "Critical", hint: "Urgent response; likely widespread or high-impact abuse." },
]

export const POLICY_FIELD_HELP = {
  enabled: {
    title: "Session security on/off",
    body: "Master switch. When off, concurrent limits and network clustering rules do not run (not recommended in production).",
  },
  maxConcurrentSessions: {
    title: "How many devices at once",
    body: "Maximum active sessions per user (e.g. phone + laptop). Higher is more convenient; lower is stricter.",
  },
  sessionIdleTtlMinutes: {
    title: "Idle logout (minutes)",
    body: "How long a session can be idle before it is considered expired by policy (implementation may vary by app).",
  },
  concurrentSessionPolicy: {
    title: "When the device limit is hit",
    body: "Choose whether to end an old session or refuse the new login. See option hints below.",
  },
  networkClusterMode: {
    title: "How we group same network",
    body: "Controls how strictly we treat IP addresses when detecting multiple accounts from one place.",
  },
  multiAccountDistinctUserThreshold: {
    title: "How many accounts trigger attention",
    body: "If this many different users appear on the same network key within the lookback window, the action below runs.",
  },
  multiAccountLookbackHours: {
    title: "Lookback window (hours)",
    body: "We only count sign-ins seen in this recent period when evaluating shared-network rules.",
  },
  multiAccountAction: {
    title: "What happens when the threshold is met",
    body: "From harmless alerting to hard blocks. Prefer Alert or Step-up until you understand false positives.",
  },
  stepUpRequiresMpin: {
    title: "Step-up needs MPIN",
    body: "When action is Step-up, require the user's MPIN challenge (if your app supports it) before issuing a session.",
  },
  incidentCooldownMinutes: {
    title: "Duplicate incident cooldown",
    body: "Minimum minutes between repeated incidents of the same kind for the same context. Reduces noise.",
  },
  resolvedIncidentRetentionDays: {
    title: "Keep resolved incidents (days)",
    body: "After this many days, resolved incidents may be purged by the retention job. 0 = disabled.",
  },
  clusterIncidentSeverity: {
    title: "Severity: shared network",
    body: "Override default severity for multiple users, same network incidents.",
  },
  concurrentIncidentSeverity: {
    title: "Severity: too many devices",
    body: "Override default severity for concurrent session limit exceeded incidents.",
  },
} as const

export type PolicyPresetId = "recommended" | "shared_workspace" | "high_assurance"

export const POLICY_PRESET_META: Record<
  PolicyPresetId,
  { title: string; description: string }
> = {
  recommended: {
    title: "Recommended",
    description: "Alert on shared networks, allow reasonable multi-device use, evict oldest session when full.",
  },
  shared_workspace: {
    title: "Shared office / NAT",
    description: "Wider subnet grouping and higher user threshold to cut false positives on corporate Wi-Fi.",
  },
  high_assurance: {
    title: "High assurance",
    description: "Fewer devices, reject excess logins, step-up verification on shared-network signals.",
  },
}

export function applyPolicyPreset(
  base: SessionSecurityPolicyV1,
  preset: PolicyPresetId,
): SessionSecurityPolicyV1 {
  const v = base.version
  switch (preset) {
    case "recommended":
      return {
        ...base,
        version: v,
        enabled: true,
        maxConcurrentSessions: Math.max(base.maxConcurrentSessions, 4),
        concurrentSessionPolicy: "EVICT_OLDEST",
        networkClusterMode: "IP_HASH",
        multiAccountDistinctUserThreshold: 4,
        multiAccountLookbackHours: 24,
        multiAccountAction: "ALERT",
      }
    case "shared_workspace":
      return {
        ...base,
        version: v,
        enabled: true,
        networkClusterMode: "SUBNET24",
        multiAccountDistinctUserThreshold: Math.max(base.multiAccountDistinctUserThreshold, 8),
        multiAccountLookbackHours: Math.max(base.multiAccountLookbackHours, 72),
        multiAccountAction: "ALERT",
      }
    case "high_assurance":
      return {
        ...base,
        version: v,
        enabled: true,
        maxConcurrentSessions: 2,
        concurrentSessionPolicy: "REJECT_NEW",
        networkClusterMode: "IP_HASH",
        multiAccountDistinctUserThreshold: 3,
        multiAccountLookbackHours: 24,
        multiAccountAction: "STEP_UP",
        stepUpRequiresMpin: true,
      }
    default:
      return base
  }
}

function labelConcurrent(p: ConcurrentSessionPolicy): string {
  return CONCURRENT_POLICY_OPTIONS.find((o) => o.value === p)?.label ?? p
}

function labelNetwork(m: NetworkClusterMode): string {
  return NETWORK_MODE_OPTIONS.find((o) => o.value === m)?.label ?? m
}

function labelAction(a: MultiAccountAction): string {
  return MULTI_ACCOUNT_ACTION_OPTIONS.find((o) => o.value === a)?.label ?? a
}

export function buildPolicyFriendlySummary(policy: SessionSecurityPolicyV1): string {
  const lines: string[] = []
  lines.push(
    policy.enabled
      ? `Protection is on. Users may have up to ${policy.maxConcurrentSessions} active sessions; ${labelConcurrent(policy.concurrentSessionPolicy).toLowerCase()}.`
      : "Protection is off — limits and network checks are not enforced.",
  )
  lines.push(
    `Shared networks: we group traffic as "${labelNetwork(policy.networkClusterMode)}" and act when at least ${
      policy.multiAccountDistinctUserThreshold
    } distinct accounts appear within ${policy.multiAccountLookbackHours} hours — ${labelAction(
      policy.multiAccountAction,
    ).toLowerCase()}.`,
  )
  if (policy.multiAccountAction === "STEP_UP" && policy.stepUpRequiresMpin) {
    lines.push("Step-up uses MPIN when extra verification is required.")
  }
  if (policy.incidentCooldownMinutes > 0) {
    lines.push(`Repeated similar incidents are suppressed for ${policy.incidentCooldownMinutes} minutes.`)
  }
  if (policy.resolvedIncidentRetentionDays > 0) {
    lines.push(`Resolved incidents are kept for ${policy.resolvedIncidentRetentionDays} days (retention job).`)
  }
  return lines.join(" ")
}

export const SESSION_KIND_LABELS: Record<string, string> = {
  WEB_JWT: "Web browser",
  MOBILE_SESSION_AUTH: "Mobile app",
  REGISTRATION_SIGHTING: "Registration sighting",
}

export function sessionKindLabel(kind: string): string {
  return SESSION_KIND_LABELS[kind] ?? kind
}

export const REVOKE_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "USER_REQUEST", label: "User requested sign-out" },
  { value: "ADMIN_REVIEW", label: "Admin review / support" },
  { value: "DEVICE_LOST", label: "Lost or stolen device" },
  { value: "SUSPICIOUS_ACTIVITY", label: "Suspicious activity" },
  { value: "OTHER", label: "Other" },
]

export function truncateNetworkKey(key: string | null | undefined, max = 14): string {
  if (!key) return "—"
  if (key.length <= max) return key
  return `${key.slice(0, max)}…`
}
