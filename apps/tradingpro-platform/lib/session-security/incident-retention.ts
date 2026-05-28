/**
 * @file incident-retention.ts
 * @module session-security
 * @description Purge old resolved security incidents per policy retention days.
 * @author StockTrade
 * @created 2026-03-28
 */

import { prisma } from "@/lib/prisma"
import { SecurityIncidentStatus } from "@prisma/client"

/**
 * Deletes non-OPEN incidents with resolvedAt older than the cutoff. Returns deleted count.
 */
export async function purgeStaleResolvedSecurityIncidents(resolvedIncidentRetentionDays: number): Promise<number> {
  if (resolvedIncidentRetentionDays <= 0) return 0
  const cutoff = new Date(Date.now() - resolvedIncidentRetentionDays * 24 * 60 * 60 * 1000)
  const r = await prisma.securityIncident.deleteMany({
    where: {
      status: { not: SecurityIncidentStatus.OPEN },
      resolvedAt: { not: null, lt: cutoff },
    },
  })
  return r.count
}
