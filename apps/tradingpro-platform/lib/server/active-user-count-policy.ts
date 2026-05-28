/**
 * @file active-user-count-policy.ts
 * @module admin-analytics
 * @description Shared active-user eligibility policy resolver for admin stats/analytics/reporting APIs.
 * @author StockTrade
 * @created 2026-02-17
 */

import type { Prisma } from "@prisma/client"
import { OrderStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { ADMIN_SETTING_KEYS } from "@/lib/constants/admin-settings"
import { getLatestActiveGlobalSettings, parseBooleanSetting } from "@/lib/server/workers/system-settings"
import { parseFiniteWorkerNumber } from "@/lib/server/workers/worker-number-utils"

const ACTIVE_USER_POLICY_DEFAULTS = {
  enabled: false,
  lowBalanceThreshold: 1000,
  inactivityDays: 30,
} as const

function normalizeLowBalanceThreshold(value: unknown): number {
  const parsedValue = parseFiniteWorkerNumber(value)
  if (parsedValue === null) {
    return ACTIVE_USER_POLICY_DEFAULTS.lowBalanceThreshold
  }
  return Math.max(0, Math.min(1_000_000_000, Math.trunc(parsedValue)))
}

function normalizeInactivityDays(value: unknown): number {
  const parsedValue = parseFiniteWorkerNumber(value)
  if (parsedValue === null) {
    return ACTIVE_USER_POLICY_DEFAULTS.inactivityDays
  }
  return Math.max(1, Math.min(3650, Math.trunc(parsedValue)))
}

function resolveInactivityCutoff(now: Date, inactivityDays: number): Date {
  return new Date(now.getTime() - inactivityDays * 24 * 60 * 60 * 1000)
}

function buildLowBalanceCondition(lowBalanceThreshold: number): Prisma.UserWhereInput {
  return {
    OR: [
      { tradingAccount: { is: null } },
      {
        tradingAccount: {
          is: {
            balance: { lt: lowBalanceThreshold },
          },
        },
      },
    ],
  }
}

function buildNoRecentTradingCondition(inactivityCutoff: Date): Prisma.UserWhereInput {
  return {
    OR: [
      { tradingAccount: { is: null } },
      {
        tradingAccount: {
          is: {
            orders: {
              none: {
                status: "EXECUTED",
                createdAt: { gte: inactivityCutoff },
              },
            },
          },
        },
      },
    ],
  }
}

export type ActiveUserCountPolicyConfig = {
  enabled: boolean
  lowBalanceThreshold: number
  inactivityDays: number
  inactivityCutoff: Date
}

export async function getActiveUserCountPolicyConfig(now: Date = new Date()): Promise<ActiveUserCountPolicyConfig> {
  try {
    const rows = await getLatestActiveGlobalSettings([
      ADMIN_SETTING_KEYS.ACTIVE_USER_CLASSIFICATION_ENABLED,
      ADMIN_SETTING_KEYS.ACTIVE_USER_LOW_BALANCE_THRESHOLD,
      ADMIN_SETTING_KEYS.ACTIVE_USER_INACTIVITY_DAYS,
    ])
    const enabledSetting = rows.get(ADMIN_SETTING_KEYS.ACTIVE_USER_CLASSIFICATION_ENABLED)?.value ?? null
    const lowBalanceSetting = rows.get(ADMIN_SETTING_KEYS.ACTIVE_USER_LOW_BALANCE_THRESHOLD)?.value ?? null
    const inactivityDaysSetting = rows.get(ADMIN_SETTING_KEYS.ACTIVE_USER_INACTIVITY_DAYS)?.value ?? null

    const enabled = parseBooleanSetting(enabledSetting) ?? ACTIVE_USER_POLICY_DEFAULTS.enabled
    const lowBalanceThreshold = normalizeLowBalanceThreshold(lowBalanceSetting)
    const inactivityDays = normalizeInactivityDays(inactivityDaysSetting)

    return {
      enabled,
      lowBalanceThreshold,
      inactivityDays,
      inactivityCutoff: resolveInactivityCutoff(now, inactivityDays),
    }
  } catch {
    const inactivityDays = ACTIVE_USER_POLICY_DEFAULTS.inactivityDays
    return {
      enabled: ACTIVE_USER_POLICY_DEFAULTS.enabled,
      lowBalanceThreshold: ACTIVE_USER_POLICY_DEFAULTS.lowBalanceThreshold,
      inactivityDays,
      inactivityCutoff: resolveInactivityCutoff(now, inactivityDays),
    }
  }
}

export function applyActiveUserCountPolicy(
  baseWhere: Prisma.UserWhereInput,
  config: ActiveUserCountPolicyConfig,
): Prisma.UserWhereInput {
  if (!config.enabled) {
    return baseWhere
  }

  const lowBalanceCondition = buildLowBalanceCondition(config.lowBalanceThreshold)
  const noRecentTradingCondition = buildNoRecentTradingCondition(config.inactivityCutoff)

  return {
    AND: [
      baseWhere,
      {
        NOT: {
          AND: [lowBalanceCondition, noRecentTradingCondition],
        },
      },
    ],
  }
}

export async function resolveActiveUserCountWhere(
  baseWhere: Prisma.UserWhereInput,
  now: Date = new Date(),
): Promise<{ where: Prisma.UserWhereInput; config: ActiveUserCountPolicyConfig }> {
  const config = await getActiveUserCountPolicyConfig(now)
  return {
    where: applyActiveUserCountPolicy(baseWhere, config),
    config,
  }
}

/**
 * Base Prisma filter for “active” headcount: account enabled and not suspended.
 * Combine with eligibility policy via {@link resolveActiveUserCountWhere}.
 */
export function activeHeadcountBaseWhere(extra?: Prisma.UserWhereInput): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = {
    isActive: true,
    suspendedAt: null,
  }
  return extra ? { AND: [base, extra] } : base
}

export type UserRowForDormantTag = {
  tradingAccount: { id: string; balance: unknown } | null
}

/**
 * Batch-compute eligibility-policy “dormant” tag (low balance + no EXECUTED orders since cutoff).
 * Analytics-only; does not affect login.
 */
export async function attachEligibilityPolicyDormantFlags<T extends UserRowForDormantTag>(
  users: T[],
  config: ActiveUserCountPolicyConfig,
): Promise<Array<T & { eligibilityPolicyDormant: boolean }>> {
  if (!config.enabled || users.length === 0) {
    return users.map((u) => ({ ...u, eligibilityPolicyDormant: false }))
  }

  const accountIds = users
    .map((u) => u.tradingAccount?.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)

  const recentAccountIds = new Set<string>()
  if (accountIds.length > 0) {
    const rows = await prisma.order.findMany({
      where: {
        tradingAccountId: { in: accountIds },
        status: OrderStatus.EXECUTED,
        createdAt: { gte: config.inactivityCutoff },
      },
      select: { tradingAccountId: true },
      distinct: ["tradingAccountId"],
    })
    for (const r of rows) {
      recentAccountIds.add(r.tradingAccountId)
    }
  }

  return users.map((u) => {
    const bal = u.tradingAccount?.balance
    const balanceNum =
      typeof bal === "number" ? bal : bal != null && typeof (bal as { toNumber?: () => number }).toNumber === "function"
        ? (bal as { toNumber: () => number }).toNumber()
        : Number(bal ?? NaN)
    const lowBalance =
      !u.tradingAccount || !Number.isFinite(balanceNum) || balanceNum < config.lowBalanceThreshold
    const noRecentTrade =
      !u.tradingAccount || !recentAccountIds.has(u.tradingAccount.id)
    return {
      ...u,
      eligibilityPolicyDormant: lowBalance && noRecentTrade,
    }
  })
}
