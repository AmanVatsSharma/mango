/**
 * @file referral-admin-audit.ts
 * @module lib/services/referral
 * @description Best-effort TradingLog rows for referral admin actions (audit trail).
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-02
 */

import { LogCategory, LogLevel } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export type ReferralAdminAuditAction =
  | "REFERRAL_REWARD_CANCELLED"
  | "REFERRAL_PROGRAM_UPDATED"
  | "REFERRAL_RULE_SET_CREATED"

export async function logReferralAdminAction(input: {
  action: ReferralAdminAuditAction
  adminUserId: string | null | undefined
  requestId?: string | null
  message?: string
  details?: Record<string, unknown>
}): Promise<void> {
  const clientId = (input.adminUserId && input.adminUserId.trim()) || "ADMIN_CONSOLE"
  try {
    await prisma.tradingLog.create({
      data: {
        clientId,
        userId: input.adminUserId ?? null,
        level: LogLevel.INFO,
        category: LogCategory.SYSTEM,
        action: input.action,
        message: input.message ?? input.action,
        details: {
          requestId: input.requestId ?? null,
          ...(input.details ?? {}),
        } as object,
      },
    })
  } catch {
    /* best-effort */
  }
}
