/**
 * @file kyc-utils.ts
 * @module admin-console
 * @description Utility helpers for KYC queue SLA and AML flag normalization
 * @author StockTrade
 * @created 2026-01-15
 */

export type KycSlaState = "OVERDUE" | "DUE_SOON" | "ON_TRACK" | "NO_SLA"

const DUE_SOON_HOURS = 24

export const normalizeAmlFlags = (flags: string[]) => {
  const normalized = flags
    .map((flag) => flag.trim().toUpperCase())
    .filter(Boolean)

  return Array.from(new Set(normalized))
}

export const getSlaState = (slaDueAt?: Date | string | null, status?: string, now: Date = new Date()): KycSlaState => {
  if (!slaDueAt) return "NO_SLA"
  const due = typeof slaDueAt === "string" ? new Date(slaDueAt) : slaDueAt
  if (Number.isNaN(due.getTime())) return "NO_SLA"
  if (status && status !== "PENDING") return "ON_TRACK"

  const diffMs = due.getTime() - now.getTime()
  if (diffMs < 0) return "OVERDUE"

  const diffHours = diffMs / (1000 * 60 * 60)
  if (diffHours <= DUE_SOON_HOURS) return "DUE_SOON"

  return "ON_TRACK"
}
