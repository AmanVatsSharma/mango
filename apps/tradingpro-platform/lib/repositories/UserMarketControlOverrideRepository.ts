/**
 * @file UserMarketControlOverrideRepository.ts
 * @module repositories
 * @description CRUD for the per-user market-control override table. Used by the admin API routes
 *              under /api/admin/market-controls/user-override/[userId] and by OrderExecutionService
 *              when resolving the final EffectiveControls for a placement.
 * @author StockTrade
 * @created 2026-04-16
 */

import { prisma } from "@/lib/prisma"
import type { Prisma, UserMarketControlOverride } from "@prisma/client"

export type UserMarketControlOverrideRow = UserMarketControlOverride

export const UserMarketControlOverrideRepository = {
  async findByUserId(userId: string): Promise<UserMarketControlOverrideRow | null> {
    return prisma.userMarketControlOverride.findUnique({ where: { userId } })
  },

  async upsert(
    userId: string,
    data: Omit<Prisma.UserMarketControlOverrideUncheckedCreateInput, "userId">,
  ): Promise<UserMarketControlOverrideRow> {
    return prisma.userMarketControlOverride.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    })
  },

  async remove(userId: string): Promise<void> {
    await prisma.userMarketControlOverride.deleteMany({ where: { userId } })
  },

  async listActive(limit = 100): Promise<UserMarketControlOverrideRow[]> {
    return prisma.userMarketControlOverride.findMany({
      where: { enabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { updatedAt: "desc" },
      take: limit,
    })
  },

  /** Cron sweep: disables rows whose expiresAt has passed. */
  async sweepExpired(now = new Date()): Promise<number> {
    const res = await prisma.userMarketControlOverride.updateMany({
      where: { enabled: true, expiresAt: { not: null, lt: now } },
      data: { enabled: false },
    })
    return res.count
  },
}
