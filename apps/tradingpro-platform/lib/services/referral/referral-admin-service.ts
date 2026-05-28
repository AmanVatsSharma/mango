/**
 * @file referral-admin-service.ts
 * @module lib/services/referral
 * @description Admin reads/writes for referral program settings, rule sets, attributions, and rewards.
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-03 — listAttributions/listRewards optional search (clientId/email).
 */

import { prisma } from "@/lib/prisma"
import { KycStatus, Prisma, ReferralRewardStatus } from "@prisma/client"
import { logReferralAdminAction } from "@/lib/services/referral/referral-admin-audit"

const QUALIFIED_DEPOSIT_EXCLUDE = ["admin_credit"] as const

const SEARCH_USER_TAKE = 80

async function resolveUserIdsByClientIdOrEmail(search: string): Promise<string[]> {
  const q = search.trim()
  if (q.length < 2) return []
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { clientId: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true },
    take: SEARCH_USER_TAKE,
  })
  return users.map((u) => u.id)
}

export async function getReferralProgramForAdmin() {
  const settings = await prisma.referralProgramSettings.findUnique({
    where: { id: 1 },
    include: {
      activeRuleSet: {
        include: {
          rules: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  })

  const ruleSets = await prisma.referralRuleSet.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, name: true, version: true, isActive: true, createdAt: true },
  })

  return { settings, ruleSets }
}

export async function getReferralAdminSummary() {
  const [attributionCount, rewardGroups, settings] = await Promise.all([
    prisma.referralAttribution.count(),
    prisma.referralReward.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.referralProgramSettings.findUnique({ where: { id: 1 } }),
  ])

  const rewardsByStatus: Record<string, number> = {}
  for (const g of rewardGroups) {
    rewardsByStatus[g.status] = g._count._all
  }

  return {
    attributionCount,
    rewardsByStatus,
    programActive: settings?.isActive ?? false,
    requireKycApprovedForPayout: settings?.requireKycApprovedForPayout ?? true,
    activeRuleSetId: settings?.activeRuleSetId ?? null,
    showRulesToUsers: settings?.showRulesToUsers ?? false,
    showBonusAmountsToUsers: settings?.showBonusAmountsToUsers ?? false,
  }
}

export async function patchReferralProgram(input: {
  isActive?: boolean
  activeRuleSetId?: string | null
  requireKycApprovedForPayout?: boolean
  showRulesToUsers?: boolean
  showBonusAmountsToUsers?: boolean
  publicRulesNotice?: string | null
}) {
  return prisma.referralProgramSettings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      isActive: input.isActive ?? false,
      activeRuleSetId: input.activeRuleSetId ?? null,
      requireKycApprovedForPayout: input.requireKycApprovedForPayout ?? true,
      showRulesToUsers: input.showRulesToUsers ?? false,
      showBonusAmountsToUsers: input.showBonusAmountsToUsers ?? false,
      publicRulesNotice: input.publicRulesNotice ?? null,
    },
    update: {
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.activeRuleSetId !== undefined ? { activeRuleSetId: input.activeRuleSetId } : {}),
      ...(input.requireKycApprovedForPayout !== undefined
        ? { requireKycApprovedForPayout: input.requireKycApprovedForPayout }
        : {}),
      ...(input.showRulesToUsers !== undefined ? { showRulesToUsers: input.showRulesToUsers } : {}),
      ...(input.showBonusAmountsToUsers !== undefined
        ? { showBonusAmountsToUsers: input.showBonusAmountsToUsers }
        : {}),
      ...(input.publicRulesNotice !== undefined ? { publicRulesNotice: input.publicRulesNotice } : {}),
    },
  })
}

export async function createRuleSetWithRules(input: {
  name: string
  createdById?: string | null
  rules: Array<{
    sortOrder: number
    minDepositTotal: number
    bonusReferrer: number
    bonusReferee: number
    isActive?: boolean
  }>
}) {
  return prisma.$transaction(async (tx) => {
    const set = await tx.referralRuleSet.create({
      data: {
        name: input.name,
        createdById: input.createdById ?? null,
        isActive: true,
        rules: {
          create: input.rules.map((r) => ({
            sortOrder: r.sortOrder,
            minDepositTotal: r.minDepositTotal,
            bonusReferrer: r.bonusReferrer,
            bonusReferee: r.bonusReferee,
            isActive: r.isActive !== false,
          })),
        },
      },
      include: { rules: { orderBy: { sortOrder: "asc" } } },
    })
    return set
  })
}

export async function listAttributions(params: {
  page: number
  limit: number
  referrerUserId?: string
  refereeUserId?: string
  /** Match referrer or referee by user clientId / email substring */
  search?: string
}) {
  const skip = (params.page - 1) * params.limit
  const andParts: Prisma.ReferralAttributionWhereInput[] = []
  if (params.referrerUserId) andParts.push({ referrerUserId: params.referrerUserId })
  if (params.refereeUserId) andParts.push({ refereeUserId: params.refereeUserId })
  if (params.search?.trim()) {
    const ids = await resolveUserIdsByClientIdOrEmail(params.search)
    if (ids.length === 0) {
      return { rows: [], total: 0, page: params.page, limit: params.limit }
    }
    andParts.push({
      OR: [{ referrerUserId: { in: ids } }, { refereeUserId: { in: ids } }],
    })
  }
  const where: Prisma.ReferralAttributionWhereInput =
    andParts.length > 0 ? { AND: andParts } : {}

  const [rows, total] = await Promise.all([
    prisma.referralAttribution.findMany({
      where,
      skip,
      take: params.limit,
      orderBy: { createdAt: "desc" },
      include: {
        referrer: { select: { id: true, name: true, email: true, clientId: true } },
        referee: { select: { id: true, name: true, email: true, clientId: true } },
        referralLink: { select: { id: true, code: true } },
        rewards: {
          select: {
            id: true,
            status: true,
            role: true,
            amount: true,
            milestoneKey: true,
          },
        },
      },
    }),
    prisma.referralAttribution.count({ where }),
  ])

  const refereeIds = Array.from(new Set(rows.map((r) => r.refereeUserId)))
  let depositTotals: Record<string, number> = {}
  const kycByUser: Record<string, KycStatus | "NONE"> = {}

  if (refereeIds.length > 0) {
    const [sums, kycRows] = await Promise.all([
      prisma.deposit.groupBy({
        by: ["userId"],
        where: {
          userId: { in: refereeIds },
          status: "COMPLETED",
          method: { notIn: [...QUALIFIED_DEPOSIT_EXCLUDE] },
        },
        _sum: { amount: true },
      }),
      prisma.kYC.findMany({
        where: { userId: { in: refereeIds } },
        select: { userId: true, status: true },
      }),
    ])
    depositTotals = Object.fromEntries(sums.map((s) => [s.userId, Number(s._sum.amount ?? 0)]))
    for (const k of kycRows) {
      kycByUser[k.userId] = k.status
    }
  }

  const enrichedRows = rows.map((r) => ({
    ...r,
    refereeQualifiedDepositTotal: depositTotals[r.refereeUserId] ?? 0,
    refereeKycStatus: kycByUser[r.refereeUserId] ?? ("NONE" as const),
  }))

  return { rows: enrichedRows, total, page: params.page, limit: params.limit }
}

export async function listRewards(params: {
  page: number
  limit: number
  status?: string
  /** Match beneficiary, referrer, or referee by clientId / email substring */
  search?: string
}) {
  const skip = (params.page - 1) * params.limit
  const andParts: Prisma.ReferralRewardWhereInput[] = []
  if (params.status && (Object.values(ReferralRewardStatus) as string[]).includes(params.status)) {
    andParts.push({ status: params.status as ReferralRewardStatus })
  }
  if (params.search?.trim()) {
    const ids = await resolveUserIdsByClientIdOrEmail(params.search)
    if (ids.length === 0) {
      return { rows: [], total: 0, page: params.page, limit: params.limit }
    }
    andParts.push({
      OR: [
        { beneficiaryUserId: { in: ids } },
        { attribution: { referrerUserId: { in: ids } } },
        { attribution: { refereeUserId: { in: ids } } },
      ],
    })
  }
  const where: Prisma.ReferralRewardWhereInput = andParts.length > 0 ? { AND: andParts } : {}

  const [rows, total] = await Promise.all([
    prisma.referralReward.findMany({
      where,
      skip,
      take: params.limit,
      orderBy: { createdAt: "desc" },
      include: {
        beneficiary: { select: { id: true, clientId: true, name: true } },
        attribution: {
          include: {
            referrer: { select: { id: true, clientId: true } },
            referee: { select: { id: true, clientId: true } },
          },
        },
        rule: { select: { id: true, minDepositTotal: true, sortOrder: true } },
      },
    }),
    prisma.referralReward.count({ where }),
  ])

  return { rows, total, page: params.page, limit: params.limit }
}

export async function cancelReferralReward(input: {
  rewardId: string
  reason: string
  adminUserId: string | null
  requestId?: string | null
}) {
  const reward = await prisma.referralReward.findUnique({ where: { id: input.rewardId } })
  if (!reward) {
    throw new Error("Reward not found")
  }
  if (reward.status === ReferralRewardStatus.PAID) {
    throw new Error("Cannot cancel a paid reward")
  }
  if (reward.status === ReferralRewardStatus.CANCELLED) {
    return reward
  }
  if (
    reward.status !== ReferralRewardStatus.PENDING &&
    reward.status !== ReferralRewardStatus.ELIGIBLE
  ) {
    throw new Error("Only PENDING or ELIGIBLE rewards can be cancelled")
  }

  const updated = await prisma.referralReward.update({
    where: { id: input.rewardId },
    data: {
      status: ReferralRewardStatus.CANCELLED,
      failureReason: input.reason.slice(0, 512),
      lastEvaluatedAt: new Date(),
    },
  })

  await logReferralAdminAction({
    action: "REFERRAL_REWARD_CANCELLED",
    adminUserId: input.adminUserId,
    requestId: input.requestId,
    message: `Referral reward ${input.rewardId} cancelled`,
    details: { rewardId: input.rewardId, reason: input.reason },
  })

  return updated
}

/** PATCH referral rule set: name, isActive */
export async function patchReferralRuleSet(
  ruleSetId: string,
  input: { name?: string; isActive?: boolean },
) {
  return prisma.referralRuleSet.update({
    where: { id: ruleSetId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    include: { rules: { orderBy: { sortOrder: "asc" } } },
  })
}

/** PATCH milestone rule row */
export async function patchReferralMilestoneRule(
  ruleId: string,
  input: {
    sortOrder?: number
    minDepositTotal?: number
    bonusReferrer?: number
    bonusReferee?: number
    isActive?: boolean
    activeFrom?: Date | null
    activeTo?: Date | null
  },
) {
  const existing = await prisma.referralMilestoneRule.findUnique({ where: { id: ruleId } })
  if (!existing) {
    throw new Error("Milestone rule not found")
  }
  if (
    input.sortOrder !== undefined &&
    input.sortOrder !== existing.sortOrder
  ) {
    const clash = await prisma.referralMilestoneRule.findFirst({
      where: {
        ruleSetId: existing.ruleSetId,
        sortOrder: input.sortOrder,
        NOT: { id: ruleId },
      },
    })
    if (clash) {
      throw new Error("Another milestone in this set already uses this sort order")
    }
  }

  const data: Prisma.ReferralMilestoneRuleUpdateInput = {}
  if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder
  if (input.minDepositTotal !== undefined) data.minDepositTotal = input.minDepositTotal
  if (input.bonusReferrer !== undefined) data.bonusReferrer = input.bonusReferrer
  if (input.bonusReferee !== undefined) data.bonusReferee = input.bonusReferee
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.activeFrom !== undefined) data.activeFrom = input.activeFrom
  if (input.activeTo !== undefined) data.activeTo = input.activeTo

  return prisma.referralMilestoneRule.update({
    where: { id: ruleId },
    data,
  })
}
