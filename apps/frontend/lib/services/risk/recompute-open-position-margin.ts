/**
 * File:        lib/services/risk/recompute-open-position-margin.ts
 * Module:      Risk · open-position margin reconciliation (Trading-voj)
 * Purpose:     Recompute the margin reserved for OPEN positions under the *current* RiskConfig
 *              and apply the delta to TradingAccount.usedMargin / availableMargin. Solves the
 *              asymmetric-margin-on-leverage-change problem: when an admin lowers leverage
 *              from 10x to 5x, existing open positions still consume the old reserved margin
 *              (which was set at order admission). Without this reconciliation the user gets
 *              effectively MORE leverage on legacy positions than admin currently allows.
 *
 *              The Position table has no per-position blocked-margin column (margin is
 *              implicit in TradingAccount.usedMargin), so this function recomputes the WHOLE
 *              account's reserved margin as the sum of margins required for each open
 *              position under the current config — there's no surgical per-position fix to
 *              do here without a schema change.
 *
 * Exports:
 *   - RecomputeOpenPositionMarginResult     — per-user summary
 *   - recomputeOpenPositionMarginForUser()  — recompute one user's account; dry-run by default
 *   - recomputeOpenPositionMarginForAll()   — fan out across all accounts with open positions
 *
 * Depends on:
 *   - @/lib/prisma — TradingAccount + Position queries; transactional update on apply
 *   - @/lib/services/risk/MarginCalculator — current-config margin per position
 *   - @/lib/services/risk/risk-margin-side — long-side margin row resolution for SELL positions
 *   - @/lib/services/funds/FundManagementService — atomic margin block/release helpers
 *   - @/lib/observability/logger — structured Pino audit
 *
 * Side-effects:
 *   - When `dryRun: false`: ONE transaction per account: updates TradingAccount.usedMargin
 *     and availableMargin to reflect the new sum. Pino-logs the change with a structured
 *     audit shape (admin tooling can scrape these).
 *   - On dry-run: zero side-effects, returns the computed delta only.
 *
 * Key invariants:
 *   - newUsedMargin >= 0 (clamped — defensive against negative-delta edge cases)
 *   - newAvailableMargin = max(0, account.balance - newUsedMargin) (clamped — same)
 *   - Closed positions are filtered out (closedAt: null AND quantity != 0).
 *   - When an account has zero open positions: target usedMargin = 0 (releases everything).
 *   - Per-user RiskLimit.maxLeverage is honored in the recompute (Trading-woj).
 *
 * Read order:
 *   1. RecomputeOpenPositionMarginResult       — return shape
 *   2. recomputeOpenPositionMarginForUser      — single-account logic (call site for tests)
 *   3. recomputeOpenPositionMarginForAll       — fan-out wrapper
 *
 * Author:      StockTrade
 * Last-updated: 2026-05-08
 */

import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { MarginCalculator } from "@/lib/services/risk/MarginCalculator"
import { marginRiskSideForSignedPositionQty } from "@/lib/services/risk/risk-margin-side"
import { parseFiniteRiskNumber } from "@/lib/services/risk/risk-number-utils"
import { baseLogger } from "@/lib/observability/logger"

const log = baseLogger.child({ module: "recompute-open-position-margin" })

export interface RecomputeOpenPositionMarginResult {
  userId: string
  tradingAccountId: string
  positionsConsidered: number
  oldUsedMargin: number
  newUsedMargin: number
  delta: number
  oldAvailableMargin: number
  newAvailableMargin: number
  applied: boolean
  /** Per-position breakdown for audit. Order matches the input position rows. */
  perPosition: Array<{
    positionId: string
    symbol: string
    quantity: number
    requiredMargin: number
  }>
}

export interface RecomputeOpenPositionMarginInput {
  userId: string
  /** Default true. When true, computes deltas but does NOT persist. */
  dryRun?: boolean
}

/**
 * Recompute reserved margin for one user's open positions under the current RiskConfig.
 * On dry-run (default), returns the computed delta without touching the DB. With
 * `dryRun: false`, persists the new usedMargin / availableMargin atomically.
 */
export async function recomputeOpenPositionMarginForUser(
  input: RecomputeOpenPositionMarginInput,
): Promise<RecomputeOpenPositionMarginResult> {
  const dryRun = input.dryRun !== false

  const account = await prisma.tradingAccount.findFirst({
    where: { userId: input.userId },
    include: {
      positions: {
        where: { closedAt: null, quantity: { not: 0 } },
        include: {
          Stock: { select: { instrumentId: true, segment: true } },
        },
      },
    },
  })
  if (!account) {
    throw new Error(`No trading account for user ${input.userId}`)
  }

  // Per-user max leverage clamp (Trading-woj). Read once; passed to every position calc.
  const riskLimit = await prisma.riskLimit.findUnique({
    where: { userId: input.userId },
    select: { maxLeverage: true },
  })
  const userMaxLeverage = parseFiniteRiskNumber(riskLimit?.maxLeverage) ?? undefined

  const calculator = new MarginCalculator()
  const perPosition: RecomputeOpenPositionMarginResult["perPosition"] = []
  let newUsedMargin = 0

  for (const position of account.positions) {
    const segment = position.Stock?.segment || position.segment || "NSE"
    const productType = position.productType || "MIS"
    const avgPrice = parseFiniteRiskNumber(position.averagePrice) ?? 0
    if (avgPrice <= 0 || position.quantity === 0) {
      // No reliable basis to compute margin for this row — skip and don't reserve any.
      // (Same posture as MarginCalculator's parseFiniteRiskNumber → 0 short-circuit.)
      continue
    }
    // Long-vs-short margin row selection (option short side carries more margin).
    const marginRiskSide = marginRiskSideForSignedPositionQty(position.quantity)
    const calc = await calculator.calculateMargin(
      segment,
      productType,
      Math.abs(position.quantity),
      avgPrice,
      1, // lotSize: positions store actual quantity (not lots), so 1
      position.quantity > 0 ? "BUY" : "SELL",
      {
        optionType: position.optionType ?? null,
        marginRiskSide,
      },
      undefined, // marginMultiplier — recompute uses base config; admin multipliers are scoped to placement
      userMaxLeverage,
    )
    const required = Math.max(0, Math.trunc(calc.requiredMargin))
    newUsedMargin += required
    perPosition.push({
      positionId: position.id,
      symbol: position.symbol,
      quantity: position.quantity,
      requiredMargin: required,
    })
  }

  const oldUsedMargin = parseFiniteRiskNumber(account.usedMargin) ?? 0
  const oldAvailableMargin = parseFiniteRiskNumber(account.availableMargin) ?? 0
  const accountBalance = parseFiniteRiskNumber(account.balance) ?? 0
  const delta = newUsedMargin - oldUsedMargin
  const newAvailableMargin = Math.max(0, accountBalance - newUsedMargin)

  let applied = false
  if (!dryRun && delta !== 0) {
    await prisma.$transaction(async (tx) => {
      await tx.tradingAccount.update({
        where: { id: account.id },
        data: {
          usedMargin: newUsedMargin,
          availableMargin: newAvailableMargin,
        },
      })
    })
    applied = true
    log.info(
      {
        userId: input.userId,
        tradingAccountId: account.id,
        positionsConsidered: account.positions.length,
        oldUsedMargin,
        newUsedMargin,
        delta,
        oldAvailableMargin,
        newAvailableMargin,
      },
      "RECOMPUTE_OPEN_POSITION_MARGIN_APPLIED",
    )
  } else {
    log.info(
      {
        userId: input.userId,
        tradingAccountId: account.id,
        positionsConsidered: account.positions.length,
        oldUsedMargin,
        newUsedMargin,
        delta,
        dryRun,
      },
      "RECOMPUTE_OPEN_POSITION_MARGIN_DRY_RUN",
    )
  }

  return {
    userId: input.userId,
    tradingAccountId: account.id,
    positionsConsidered: account.positions.length,
    oldUsedMargin,
    newUsedMargin,
    delta,
    oldAvailableMargin,
    newAvailableMargin,
    applied,
    perPosition,
  }
}

/**
 * Fan out the recompute across every account with at least one open position. Caller is
 * expected to pass `dryRun: false` only after auditing a dry-run result.
 */
export async function recomputeOpenPositionMarginForAll(input: {
  dryRun?: boolean
} = {}): Promise<RecomputeOpenPositionMarginResult[]> {
  const accounts = await prisma.tradingAccount.findMany({
    where: {
      positions: {
        some: { closedAt: null, quantity: { not: 0 } },
      },
    },
    select: { userId: true },
    distinct: ["userId"],
  })

  const results: RecomputeOpenPositionMarginResult[] = []
  for (const a of accounts) {
    try {
      const r = await recomputeOpenPositionMarginForUser({
        userId: a.userId,
        dryRun: input.dryRun,
      })
      results.push(r)
    } catch (err) {
      log.warn(
        { err, userId: a.userId },
        "RECOMPUTE_OPEN_POSITION_MARGIN_FAILED — continuing",
      )
    }
  }
  return results
}
