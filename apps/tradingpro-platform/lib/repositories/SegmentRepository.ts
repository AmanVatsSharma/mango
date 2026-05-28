/**
 * @file SegmentRepository.ts
 * @module repositories
 * @description Data-access layer for UserSegment and UserSegmentMember models.
 */

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

export type SegmentWithCounts = Awaited<ReturnType<typeof SegmentRepository.findMany>>[number]
export type SegmentDetail = Awaited<ReturnType<typeof SegmentRepository.findById>>

export const SegmentRepository = {
  async findMany() {
    return prisma.userSegment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true, policies: true } },
        policies: {
          include: { policy: { select: { id: true, name: true, isActive: true } } },
          orderBy: { priority: "desc" },
        },
      },
    })
  },

  async findById(id: string) {
    return prisma.userSegment.findUnique({
      where: { id },
      include: {
        _count: { select: { members: true } },
        policies: {
          include: { policy: true },
          orderBy: { priority: "desc" },
        },
        members: {
          orderBy: { addedAt: "desc" },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                clientId: true,
                role: true,
                isActive: true,
              },
            },
          },
        },
      },
    })
  },

  async create(data: Prisma.UserSegmentCreateInput) {
    return prisma.userSegment.create({ data })
  },

  async update(id: string, data: Prisma.UserSegmentUpdateInput) {
    return prisma.userSegment.update({ where: { id }, data })
  },

  async delete(id: string) {
    return prisma.userSegment.delete({ where: { id } })
  },

  async addMember(segmentId: string, userId: string, addedById?: string) {
    return prisma.userSegmentMember.upsert({
      where: { userId_segmentId: { userId, segmentId } },
      create: { userId, segmentId, addedById },
      update: {},
    })
  },

  async removeMember(segmentId: string, userId: string) {
    return prisma.userSegmentMember.delete({
      where: { userId_segmentId: { userId, segmentId } },
    })
  },

  async assignPolicy(segmentId: string, policyId: string, priority = 0) {
    return prisma.userSegmentPolicy.upsert({
      where: { segmentId_policyId: { segmentId, policyId } },
      create: { segmentId, policyId, priority },
      update: { priority },
    })
  },

  async unassignPolicy(segmentId: string, policyId: string) {
    return prisma.userSegmentPolicy.delete({
      where: { segmentId_policyId: { segmentId, policyId } },
    })
  },

  async getSegmentsForUser(userId: string) {
    return prisma.userSegmentMember.findMany({
      where: { userId },
      include: {
        segment: {
          include: {
            policies: {
              include: { policy: true },
              orderBy: { priority: "desc" },
            },
          },
        },
      },
    })
  },
}
