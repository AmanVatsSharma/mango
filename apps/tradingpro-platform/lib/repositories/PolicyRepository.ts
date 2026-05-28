/**
 * @file PolicyRepository.ts
 * @module repositories
 * @description Data-access layer for TradingPolicy model.
 */

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export type PolicyWithSegments = Awaited<ReturnType<typeof PolicyRepository.findMany>>[number]

export const PolicyRepository = {
  async findMany() {
    return prisma.tradingPolicy.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { segments: true } },
        segments: {
          include: { segment: { select: { id: true, name: true, color: true, isActive: true } } },
          orderBy: { priority: "desc" },
        },
      },
    })
  },

  async findById(id: string) {
    return prisma.tradingPolicy.findUnique({
      where: { id },
      include: {
        segments: {
          include: { segment: true },
          orderBy: { priority: "desc" },
        },
      },
    })
  },

  async create(data: Prisma.TradingPolicyCreateInput) {
    return prisma.tradingPolicy.create({ data })
  },

  async update(id: string, data: Prisma.TradingPolicyUpdateInput) {
    return prisma.tradingPolicy.update({ where: { id }, data })
  },

  async delete(id: string) {
    return prisma.tradingPolicy.delete({ where: { id } })
  },
}
