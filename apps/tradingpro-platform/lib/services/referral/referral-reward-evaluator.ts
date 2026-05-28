/**
 * @file referral-reward-evaluator.ts
 * @module lib/services/referral
 * @description Milestone evaluation after a qualified deposit is marked COMPLETED; creates ReferralReward rows and pays bonuses inside the same Prisma transaction when KYC/program rules allow.
 * @author StockTrade
 * @created 2026-04-01
 */

import type { Prisma } from "@prisma/client"
import type { Decimal } from "@prisma/client/runtime/library"
import { KycStatus, ReferralRewardStatus } from "@prisma/client"

const REFERRER_ROLE = "REFERRER"
const REFEREE_ROLE = "REFEREE"

const EXCLUDED_DEPOSIT_METHODS = new Set(["admin_credit"])

function ruleIsActiveAt(
  rule: { activeFrom: Date | null; activeTo: Date | null; isActive: boolean },
  at: Date,
): boolean {
  if (!rule.isActive) return false
  if (rule.activeFrom && at < rule.activeFrom) return false
  if (rule.activeTo && at > rule.activeTo) return false
  return true
}

async function cumulativeQualifiedDeposits(
  tx: Prisma.TransactionClient,
  refereeUserId: string,
): Promise<number> {
  const agg = await tx.deposit.aggregate({
    where: {
      userId: refereeUserId,
      status: "COMPLETED",
      method: { notIn: Array.from(EXCLUDED_DEPOSIT_METHODS) },
    },
    _sum: { amount: true },
  })
  return Number(agg._sum.amount ?? 0)
}

async function tryPayReward(
  tx: Prisma.TransactionClient,
  rewardId: string,
  requireKycApprovedForPayout: boolean,
): Promise<void> {
  const reward = await tx.referralReward.findUnique({
    where: { id: rewardId },
    include: {
      beneficiary: { include: { tradingAccount: true, kyc: true } },
    },
  })
  if (!reward) return
  if (reward.status === ReferralRewardStatus.PAID || reward.status === ReferralRewardStatus.CANCELLED) return
  if (Number(reward.amount) <= 0) return

  const kycOk =
    !requireKycApprovedForPayout || reward.beneficiary.kyc?.status === KycStatus.APPROVED
  if (!kycOk) {
    if (reward.status !== ReferralRewardStatus.ELIGIBLE) {
      await tx.referralReward.update({
        where: { id: rewardId },
        data: { status: ReferralRewardStatus.ELIGIBLE, lastEvaluatedAt: new Date() },
      })
    }
    return
  }

  const ta = reward.beneficiary.tradingAccount
  if (!ta) return

  const payAmount = Number(reward.amount)
  await tx.tradingAccount.update({
    where: { id: ta.id },
    data: {
      balance: { increment: payAmount },
      availableMargin: { increment: payAmount },
    },
  })
  const txRow = await tx.transaction.create({
    data: {
      tradingAccountId: ta.id,
      amount: reward.amount,
      type: "CREDIT",
      description: `Referral bonus (milestone). Reward ref …${reward.id.slice(-8)}. ${reward.role}.`,
    },
  })
  await tx.referralReward.update({
    where: { id: rewardId },
    data: {
      status: ReferralRewardStatus.PAID,
      paidAt: new Date(),
      paidTransactionId: txRow.id,
      lastEvaluatedAt: new Date(),
    },
  })
}

async function ensureRewardRow(
  tx: Prisma.TransactionClient,
  args: {
    attributionId: string
    ruleId: string
    milestoneKey: string
    role: string
    beneficiaryUserId: string
    amount: Decimal
    depositId: string
  },
): Promise<void> {
  const existing = await tx.referralReward.findFirst({
    where: {
      beneficiaryUserId: args.beneficiaryUserId,
      ruleId: args.ruleId,
      milestoneKey: args.milestoneKey,
      role: args.role,
    },
  })
  if (existing) {
    await tx.referralReward.update({
      where: { id: existing.id },
      data: { lastEvaluatedAt: new Date(), triggerDepositId: args.depositId },
    })
    return
  }
  await tx.referralReward.create({
    data: {
      attributionId: args.attributionId,
      ruleId: args.ruleId,
      milestoneKey: args.milestoneKey,
      beneficiaryUserId: args.beneficiaryUserId,
      role: args.role,
      amount: args.amount,
      status: ReferralRewardStatus.PENDING,
      triggerDepositId: args.depositId,
    },
  })
}

/**
 * Call only after a non–admin_credit deposit is COMPLETED, inside the same DB transaction.
 */
export async function evaluateReferralRewardsAfterQualifiedDeposit(
  tx: Prisma.TransactionClient,
  args: { refereeUserId: string; depositId: string },
): Promise<void> {
  const settings = await tx.referralProgramSettings.findUnique({ where: { id: 1 } })
  if (!settings?.isActive || !settings.activeRuleSetId) return

  const attribution = await tx.referralAttribution.findUnique({
    where: { refereeUserId: args.refereeUserId },
  })
  if (!attribution) return

  const depositMeta = await tx.deposit.findUnique({
    where: { id: args.depositId },
    select: { method: true, processedAt: true, createdAt: true },
  })
  if (!depositMeta) return
  if (EXCLUDED_DEPOSIT_METHODS.has(depositMeta.method)) return

  const at = depositMeta.processedAt ?? depositMeta.createdAt ?? new Date()
  const cumulative = await cumulativeQualifiedDeposits(tx, args.refereeUserId)

  const rules = await tx.referralMilestoneRule.findMany({
    where: { ruleSetId: settings.activeRuleSetId, isActive: true },
    orderBy: { sortOrder: "asc" },
  })

  for (const rule of rules) {
    if (!ruleIsActiveAt(rule, at)) continue
    const minTotal = Number(rule.minDepositTotal)
    if (cumulative < minTotal) continue

    const milestoneKey = rule.id
    if (Number(rule.bonusReferrer) > 0) {
      await ensureRewardRow(tx, {
        attributionId: attribution.id,
        ruleId: rule.id,
        milestoneKey,
        role: REFERRER_ROLE,
        beneficiaryUserId: attribution.referrerUserId,
        amount: rule.bonusReferrer,
        depositId: args.depositId,
      })
    }
    if (Number(rule.bonusReferee) > 0) {
      await ensureRewardRow(tx, {
        attributionId: attribution.id,
        ruleId: rule.id,
        milestoneKey,
        role: REFEREE_ROLE,
        beneficiaryUserId: attribution.refereeUserId,
        amount: rule.bonusReferee,
        depositId: args.depositId,
      })
    }
  }

  const pending = await tx.referralReward.findMany({
    where: {
      attributionId: attribution.id,
      status: { in: [ReferralRewardStatus.PENDING, ReferralRewardStatus.ELIGIBLE] },
    },
    select: { id: true },
  })

  for (const row of pending) {
    await tryPayReward(tx, row.id, settings.requireKycApprovedForPayout)
  }
}
