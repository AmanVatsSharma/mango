/**
 * @file lib/admin-v2/suspicious-flags.ts
 * @module admin-v2
 * @description Centralized suspicious-flag library for v2 — kills the magic-string proliferation
 *              that the Phase 1 explorer found across the v1 KYC components. Scoped to **B-book
 *              fraud signals**, NOT regulatory AML — terminology reflects the actual operational
 *              concerns of a B-book broker (multi-account farming, latency arb, bonus abuse,
 *              winning-pattern flags). Add new flags here only, never inline strings in components.
 *
 *              Exports:
 *                - SUSPICIOUS_FLAGS         — readonly catalog of all canonical flags.
 *                - SUSPICIOUS_FLAG_MAP      — code → metadata lookup.
 *                - getSuspiciousFlagMeta(c) — safe lookup that returns a "Custom" placeholder for unknown codes.
 *                - SuspiciousFlagCode       — union of canonical codes (don't use string elsewhere).
 *                - SuspiciousFlagSeverity   — "info" | "warn" | "danger".
 *
 *              Side-effects: none.
 *
 *              Key invariants:
 *                - The catalog is the single source of truth. Adding a new flag without updating
 *                  this file is a bug.
 *                - Severity drives the UI tone (info → cobalt, warn → amber, danger → crimson).
 *                - Existing v1 KYC records may carry historical AML flag strings (e.g., "PEP",
 *                  "SANCTION") — `getSuspiciousFlagMeta` falls back to a "Custom" entry rather
 *                  than throwing, so legacy data renders cleanly.
 *
 * @author StockTrade
 * @created 2026-04-26
 */

export type SuspiciousFlagSeverity = "info" | "warn" | "danger"

export interface SuspiciousFlagMeta {
  code: string
  label: string
  description: string
  severity: SuspiciousFlagSeverity
}

export const SUSPICIOUS_FLAGS = [
  {
    code: "MULTI_ACCOUNT",
    label: "Multi-account",
    description: "Linked to other accounts via email / phone / device / IP. Verify before approval.",
    severity: "warn",
  },
  {
    code: "BONUS_ABUSE",
    label: "Bonus abuse",
    description: "Pattern matches sign-up bonus farming (rapid deposit + low-risk flat trades).",
    severity: "warn",
  },
  {
    code: "ABNORMAL_WINRATE",
    label: "Abnormal win rate",
    description: "Win rate exceeds the configured Winner Mitigation threshold.",
    severity: "danger",
  },
  {
    code: "LATENCY_ARB",
    label: "Latency arbitrage",
    description: "Fills consistently land on stale quotes — inspect order timing vs feed updates.",
    severity: "danger",
  },
  {
    code: "DEVICE_OVERLAP",
    label: "Device overlap",
    description: "Same device fingerprint observed across multiple client accounts.",
    severity: "warn",
  },
  {
    code: "IP_OVERLAP",
    label: "IP overlap",
    description: "Funding / login IPs overlap with another flagged account.",
    severity: "info",
  },
  {
    code: "FUNDING_OVERLAP",
    label: "Funding overlap",
    description: "Bank account / UPI ID shared with another client.",
    severity: "warn",
  },
  {
    code: "RAPID_WITHDRAW",
    label: "Rapid withdraw",
    description: "Withdrawal requested shortly after first deposit + minimal trading activity.",
    severity: "warn",
  },
  {
    code: "DOC_MISMATCH",
    label: "Document mismatch",
    description: "Identity / bank / selfie documents do not align.",
    severity: "danger",
  },
  {
    code: "MANUAL_REVIEW",
    label: "Manual review",
    description: "Operator-initiated hold for follow-up; no automated signal.",
    severity: "info",
  },
] as const satisfies readonly SuspiciousFlagMeta[]

export type SuspiciousFlagCode = (typeof SUSPICIOUS_FLAGS)[number]["code"]

export const SUSPICIOUS_FLAG_MAP: Record<string, SuspiciousFlagMeta> = Object.fromEntries(
  SUSPICIOUS_FLAGS.map((f) => [f.code, f]),
)

/**
 * Safe lookup. Returns a "Custom" placeholder for unknown codes so legacy v1 AML strings
 * (e.g., "PEP", "SANCTION", "FRAUDSTER") render without crashing.
 */
export function getSuspiciousFlagMeta(code: string): SuspiciousFlagMeta {
  return (
    SUSPICIOUS_FLAG_MAP[code] ?? {
      code,
      label: code.replace(/_/g, " "),
      description: "Legacy / custom flag. Add to lib/admin-v2/suspicious-flags.ts to make canonical.",
      severity: "warn",
    }
  )
}

/** Maps severity → StatusTone for the StatusPill primitive. */
export function severityToTone(s: SuspiciousFlagSeverity): "info" | "warning" | "danger" {
  return s === "info" ? "info" : s === "warn" ? "warning" : "danger"
}
