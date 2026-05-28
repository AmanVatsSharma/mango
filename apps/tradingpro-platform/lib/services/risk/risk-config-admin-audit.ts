/**
 * @file risk-config-admin-audit.ts
 * @module lib/services/risk
 * @description Persists admin RiskConfig mutations to trading_logs (SYSTEM) for audit trail.
 * @author StockTrade
 * @created 2026-03-28
 */

import { LogCategory, LogLevel } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export type RiskConfigAuditAction = "RISK_CONFIG_CREATED" | "RISK_CONFIG_UPDATED"

export async function logRiskConfigAdminChange(input: {
  action: RiskConfigAuditAction
  adminUserId: string | null | undefined
  requestId: string | null | undefined
  before?: Record<string, unknown> | null
  after: Record<string, unknown>
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
        message: `Platform risk config ${input.action === "RISK_CONFIG_CREATED" ? "created" : "updated"}.`,
        details: {
          requestId: input.requestId ?? null,
          before: input.before ?? null,
          after: input.after,
        } as object,
      },
    })
  } catch {
    // Best-effort audit — do not fail admin API if log insert fails
  }
}
