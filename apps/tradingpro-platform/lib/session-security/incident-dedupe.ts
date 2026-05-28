/**
 * @file incident-dedupe.ts
 * @module session-security
 * @description Cooldown-based duplicate suppression for SecurityIncident rows to limit alert storms.
 * @author StockTrade
 * @created 2026-03-28
 */

import type { SecurityIncidentType } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export async function hasRecentIncidentDuplicate(args: {
  type: SecurityIncidentType
  networkKey?: string | null
  relatedUserId?: string
  cooldownMinutes: number
}): Promise<boolean> {
  if (args.cooldownMinutes <= 0) return false
  const since = new Date(Date.now() - args.cooldownMinutes * 60 * 1000)

  if (args.type === "CONCURRENT_SESSIONS_EXCEEDED" && args.relatedUserId) {
    const found = await prisma.securityIncident.findFirst({
      where: {
        type: args.type,
        createdAt: { gte: since },
        relatedUserIds: { has: args.relatedUserId },
      },
      select: { id: true },
    })
    return Boolean(found)
  }

  if (args.networkKey) {
    const found = await prisma.securityIncident.findFirst({
      where: {
        type: args.type,
        networkKey: args.networkKey,
        createdAt: { gte: since },
      },
      select: { id: true },
    })
    return Boolean(found)
  }

  return false
}
