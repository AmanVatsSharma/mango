/**
 * @file incident-operator-guide.ts
 * @module session-security
 * @description Human-readable incident summaries and operator playbook steps for admin UI.
 * @author StockTrade
 * @created 2026-03-28
 * @updated 2026-03-28
 */

import type { SecurityIncidentType } from "@prisma/client"

export type IncidentOperatorGuide = {
  headline: string
  steps: string[]
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined
}

/**
 * Short table column text derived from type + stored payload.
 */
export function formatIncidentSummary(type: string, payload: unknown): string {
  const p = asRecord(payload)
  if (type === "MULTI_USER_SAME_NETWORK") {
    const d = p ? num(p.distinctUsers) ?? num(p.existingDistinctUsers) : undefined
    const action = typeof p?.action === "string" ? p.action : undefined
    if (d != null && action) return `${d} user(s) · same network · ${action}`
    if (d != null) return `${d} user(s) · shared network key`
    return "Multiple accounts · shared network"
  }
  if (type === "CONCURRENT_SESSIONS_EXCEEDED") {
    const active = p ? num(p.activeCount) : undefined
    const max = p ? num(p.max) : undefined
    if (active != null && max != null) return `${active} sessions · limit ${max}`
    return "Concurrent session cap exceeded"
  }
  if (type === "SESSION_POLICY_BLOCK") {
    return "Session / policy block"
  }
  return type.split("_").join(" ")
}

/**
 * Playbook for analysts: what to review and typical resolutions (not legal advice).
 */
export function getIncidentOperatorGuide(args: {
  type: SecurityIncidentType | string
  payload: unknown
  status: string
}): IncidentOperatorGuide {
  const type = args.type
  const p = asRecord(args.payload)
  const userId = typeof p?.userId === "string" ? p.userId : undefined

  if (type === "MULTI_USER_SAME_NETWORK") {
    const distinct = p ? num(p.distinctUsers) ?? num(p.existingDistinctUsers) : undefined
    const action = typeof p?.action === "string" ? p.action : undefined
    return {
      headline:
        distinct != null
          ? `${distinct} distinct accounts correlated on the same network fingerprint (often shared Wi‑Fi / NAT; not proof of one person).`
          : "Multiple accounts correlated on the same network fingerprint.",
      steps: [
        "Open each linked user in User Management and compare emails, signup dates, and RM notes.",
        "If this is a legitimate shared office or home network, set status to FALSE_POSITIVE and optionally note in internal docs.",
        "If accounts appear abusive or fraudulent, keep OPEN or ACKNOWLEDGED, review sessions for those users, and revoke suspicious devices from the Sessions tab.",
        "If noise is high, adjust Policy: threshold, lookback hours, or clustering mode (IP vs subnet) — avoid BLOCK_LOGIN until abuse is confirmed.",
        ...(action === "login" && p?.stepUpRequired === true
          ? [
              "STEP_UP may already have required MPIN for the latest login; confirm in auth logs if needed.",
            ]
          : []),
        "Review whether enforcement (ALERT / STEP_UP / BLOCK) matches your org risk appetite.",
      ],
    }
  }

  if (type === "CONCURRENT_SESSIONS_EXCEEDED") {
    return {
      headline:
        userId != null
          ? "A single user exceeded the configured maximum concurrent device sessions."
          : "A user exceeded the configured maximum concurrent device sessions.",
      steps: [
        "Open the affected user (Peers column) → Session registry; revoke unknown or stale devices.",
        "If the user legitimately needs more devices, raise max concurrent sessions in the Policy tab or switch eviction to EVICT_OLDEST.",
        "If REJECT_NEW was enforced, the newest login was blocked — confirm with the user and clear duplicate sessions.",
        "Mark ACKNOWLEDGED when reviewed; CLOSED after remediation.",
      ],
    }
  }

  if (type === "SESSION_POLICY_BLOCK") {
    return {
      headline: "A session or credential was blocked by session security policy.",
      steps: [
        "Read the incident message and payload for the exact rule that fired.",
        "Confirm intended policy in the Policy tab (clustering, limits, BLOCK_* actions).",
        "Unblock users only after risk review; document rationale if overriding.",
        "Mark FALSE_POSITIVE if the block was triggered by misconfiguration or test traffic.",
      ],
    }
  }

  return {
    headline: `Security incident type: ${type}`,
    steps: [
      "Review message and payload JSON.",
      "Identify affected users via related user list.",
      "Update status when triage is complete (ACKNOWLEDGED / FALSE_POSITIVE / CLOSED).",
    ],
  }
}
