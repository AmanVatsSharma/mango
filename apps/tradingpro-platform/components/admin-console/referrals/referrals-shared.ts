/**
 * @file referrals-shared.ts
 * @module components/admin-console/referrals
 * @description Shared helpers and labels for admin referral screens.
 * @author StockTrade
 * @created 2026-04-03
 */

export async function readReferralAdminApiError(res: Response): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
  return j.error || j.message || `HTTP ${res.status}`
}

export const REFERRAL_REWARD_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ELIGIBLE: "Eligible",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  FROZEN: "Frozen",
}

export function rewardStatusLabel(status: string): string {
  return REFERRAL_REWARD_STATUS_LABELS[status] ?? status
}

export const KYC_STATUS_HINT =
  "KYC status for the referee at snapshot time of this list row; payout may still require approval per program rules."
