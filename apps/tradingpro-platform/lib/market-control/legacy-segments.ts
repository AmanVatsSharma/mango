/**
 * @file legacy-segments.ts
 * @module lib/market-control
 * @description One-time helper that materialises the Phase-1 hardcoded user groups
 *              (VIP / STANDARD / HIGH_RISK / SCALPER) as real UserSegment rows the first
 *              time an admin PUTs the market-control config. Idempotent — safe to call on
 *              every PUT. Admins can rename or delete the rows afterwards.
 * @author StockTrade
 * @created 2026-04-16
 */

import { prisma } from "@/lib/prisma"

type LegacySeed = {
  slug: string
  name: string
  description: string
  color: string
}

const SEEDS: LegacySeed[] = [
  { slug: "LEGACY_VIP", name: "VIP", description: "Legacy: imported from Phase 1 user-group override", color: "#f59e0b" },
  { slug: "LEGACY_STANDARD", name: "Standard", description: "Legacy: imported from Phase 1 user-group override", color: "#64748b" },
  { slug: "LEGACY_HIGH_RISK", name: "High Risk", description: "Legacy: imported from Phase 1 user-group override", color: "#ef4444" },
  { slug: "LEGACY_SCALPER", name: "Scalper", description: "Legacy: imported from Phase 1 user-group override", color: "#a855f7" },
]

/** Creates the 4 legacy UserSegment rows if any are missing. No-op when all already exist. */
export async function ensureLegacySegmentsExist(createdById: string | null): Promise<void> {
  for (const seed of SEEDS) {
    try {
      const existingByName = await prisma.userSegment.findFirst({
        where: { name: seed.name },
        select: { id: true },
      })
      if (existingByName) continue

      await prisma.userSegment.create({
        data: {
          name: seed.name,
          description: seed.description,
          color: seed.color,
          isActive: true,
          ...(createdById ? { createdById } : {}),
        },
      })
    } catch {
      // ignore — idempotent best-effort
    }
  }
}
