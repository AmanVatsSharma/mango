/**
 * @file referral-user-dashboard.ts
 * @module lib/services/referral
 * @description Server-side aggregation for the user console referral tab (invite link, referee counts, reward history, program rules).
 * @author StockTrade
 * @created 2026-04-01
 * @updated 2026-04-02
 */

import { prisma } from "@/lib/prisma"
import { ReferralRewardStatus } from "@prisma/client"
import { buildReferralSignupUrl } from "@/lib/services/referral/referral-invite-url"

function maskClientId(clientId: string | null | undefined): string {
  if (!clientId || clientId.length < 4) return "****"
  return `••••${clientId.slice(-4)}`
}

function ruleActiveWindow(
  rule: { isActive: boolean; activeFrom: Date | null; activeTo: Date | null },
  at: Date,
): boolean {
  if (!rule.isActive) return false
  if (rule.activeFrom && at < rule.activeFrom) return false
  if (rule.activeTo && at > rule.activeTo) return false
  return true
}

async function getProgramRulesForUserConsole() {
  const settings = await prisma.referralProgramSettings.findUnique({
    where: { id: 1 },
    include: {
      activeRuleSet: {
        include: { rules: { orderBy: { sortOrder: "asc" } } },
      },
    },
  })

  if (!settings?.isActive || !settings.showRulesToUsers || !settings.activeRuleSet) {
    return null
  }

  const at = new Date()
  const showAmounts = settings.showBonusAmountsToUsers
  const milestones = settings.activeRuleSet.rules
    .filter((r) => ruleActiveWindow(r, at))
    .map((r) => ({
      sortOrder: r.sortOrder,
      minDepositTotal: String(r.minDepositTotal),
      bonusReferrer: showAmounts ? String(r.bonusReferrer) : null,
      bonusReferee: showAmounts ? String(r.bonusReferee) : null,
    }))

  return {
    milestones,
    publicRulesNotice: settings.publicRulesNotice ?? null,
  }
}

const REWARD_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  ELIGIBLE: "Eligible",
  PAID: "Paid",
  CANCELLED: "Cancelled",
  FROZEN: "Frozen",
}

function rewardStatusLabel(status: string): string {
  return REWARD_STATUS_LABELS[status] ?? status
}

export async function getReferralUserDashboard(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      clientId: true,
      referralUserPreference: { select: { marketingOptIn: true } },
    },
  })

  const programRules = await getProgramRulesForUserConsole()

  if (!user?.clientId) {
    return {
      refCode: null as string | null,
      inviteUrl: null as string | null,
      marketingOptIn: user?.referralUserPreference?.marketingOptIn !== false,
      refereeCount: 0,
      stats: {
        lifetimePaidTotal: "0",
        pendingCount: 0,
        eligibleCount: 0,
        paidCount: 0,
      },
      referees: [] as {
        clientIdMasked: string
        joinedAt: string
        attributedAt: string
      }[],
      myRewards: [] as {
        id: string
        amount: string
        status: string
        statusLabel: string
        role: string
        createdAt: string
        paidAt: string | null
        failureReason: string | null
        milestoneKey: string
      }[],
      programRules,
    }
  }

  const refCode = user.clientId
  const inviteUrl = buildReferralSignupUrl(refCode)

  const refereeCount = await prisma.referralAttribution.count({
    where: { referrerUserId: userId },
  })

  const [rewardAgg, attributions, myRewards] = await Promise.all([
    prisma.referralReward.groupBy({
      by: ["status"],
      where: { beneficiaryUserId: userId },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.referralAttribution.findMany({
      where: { referrerUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        referee: { select: { clientId: true, createdAt: true } },
      },
    }),
    prisma.referralReward.findMany({
      where: { beneficiaryUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        amount: true,
        status: true,
        role: true,
        createdAt: true,
        paidAt: true,
        failureReason: true,
        milestoneKey: true,
      },
    }),
  ])

  let lifetimePaidTotal = 0
  let pendingCount = 0
  let eligibleCount = 0
  let paidCount = 0
  for (const g of rewardAgg) {
    const c = g._count._all
    if (g.status === ReferralRewardStatus.PENDING) pendingCount = c
    else if (g.status === ReferralRewardStatus.ELIGIBLE) eligibleCount = c
    else if (g.status === ReferralRewardStatus.PAID) {
      paidCount = c
      lifetimePaidTotal += Number(g._sum.amount ?? 0)
    }
  }

  return {
    refCode,
    inviteUrl,
    marketingOptIn: user.referralUserPreference?.marketingOptIn !== false,
    refereeCount,
    stats: {
      lifetimePaidTotal: String(lifetimePaidTotal),
      pendingCount,
      eligibleCount,
      paidCount,
    },
    referees: attributions.map((a) => ({
      clientIdMasked: maskClientId(a.referee.clientId),
      joinedAt: a.referee.createdAt.toISOString(),
      attributedAt: a.createdAt.toISOString(),
    })),
    myRewards: myRewards.map((r) => ({
      id: r.id,
      amount: String(r.amount),
      status: r.status,
      statusLabel: rewardStatusLabel(r.status),
      role: r.role,
      createdAt: r.createdAt.toISOString(),
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      failureReason:
        r.failureReason && r.status !== "PAID"
          ? r.failureReason.length > 120
            ? `${r.failureReason.slice(0, 120)}…`
            : r.failureReason
          : null,
      milestoneKey: r.milestoneKey,
    })),
    programRules,
  }
}

/** Preferences + public program rules — Referral Settings tab (no heavy referee/reward lists). */
export async function getReferralUserSettingsOnly(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      referralUserPreference: { select: { marketingOptIn: true } },
    },
  })
  const programRules = await getProgramRulesForUserConsole()
  return {
    marketingOptIn: user?.referralUserPreference?.marketingOptIn !== false,
    programRules,
  }
}

export async function patchReferralUserMarketingOptIn(userId: string, marketingOptIn: boolean) {
  await prisma.referralUserPreference.upsert({
    where: { userId },
    create: { userId, marketingOptIn },
    update: { marketingOptIn },
  })
  return { marketingOptIn }
}
