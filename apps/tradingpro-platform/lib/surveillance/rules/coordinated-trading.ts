/**
 * File:        lib/surveillance/rules/coordinated-trading.ts
 * Module:      Surveillance · COORDINATED_TRADING
 * Purpose:     Batch rule. Identifies clusters of N+ accounts opening the same instrument
 *              on the same side within Δsec. Catches signal-sharing across linked accounts
 *              and pump rooms.
 *
 * Exports:
 *   - CoordinatedTradingParams  — { minAccounts, windowSec, lookbackHours, autoDismissBelow }
 *   - CoordinatedTradingContext — { batchAt }
 *   - evaluateCoordinatedTrading
 *
 * Depends on:
 *   - @/lib/prisma — reads Order + TradingAccount.userId in two passes (avoids nested-relation
 *     select typing surprises and is cheaper than join-on-every-row).
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - Cluster = (symbol, orderSide, time-bucket of windowSec). dedupeKey is a hash of the
 *     cluster signature; the same coordinated burst never emits twice across batch runs.
 *   - One alert per cluster, attributed to the *first* user in the cluster (alphabetical
 *     userId for determinism). The full member list is in `evidence.userIds`.
 *
 * Read order:
 *   1. evaluateCoordinatedTrading — bucket math + cluster grouping.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import { OrderStatus, OrderPurpose, type Prisma } from "@prisma/client"
import {
  parseConfidenceScore,
  type RuleSnapshot,
  type RuleFireResult,
  type SurveillanceParams,
  type SurveillanceEvaluator,
} from "../types"

export interface CoordinatedTradingParams extends SurveillanceParams {
  minAccounts: number
  windowSec: number
  lookbackHours: number
}

export interface CoordinatedTradingContext {
  batchAt: Date
}

const DEFAULTS: CoordinatedTradingParams = {
  minAccounts: 3,
  windowSec: 30,
  lookbackHours: 24,
  autoDismissBelow: 50,
}

interface ClusterKey {
  symbol: string
  orderSide: string
  bucket: number
}

export const evaluateCoordinatedTrading: SurveillanceEvaluator<
  CoordinatedTradingContext,
  CoordinatedTradingParams
> = async (rule, ctx) => {
  const params = { ...DEFAULTS, ...rule.params }
  const lookbackStart = new Date(ctx.batchAt.getTime() - params.lookbackHours * 60 * 60 * 1000)
  const windowMs = params.windowSec * 1000

  const orders = await prisma.order.findMany({
    where: {
      executedAt: { gte: lookbackStart, lte: ctx.batchAt },
      filledQuantity: { gt: 0 },
      orderPurpose: OrderPurpose.OPEN,
      status: OrderStatus.EXECUTED,
    },
    select: {
      id: true,
      symbol: true,
      orderSide: true,
      executedAt: true,
      tradingAccountId: true,
    },
  })
  if (orders.length === 0) return []

  // Resolve userId per tradingAccountId in one pass. Avoids nested-select complications
  // and keeps the typed Order shape predictable.
  const accountIds = Array.from(new Set(orders.map((o) => o.tradingAccountId)))
  const accounts = await prisma.tradingAccount.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, userId: true },
  })
  const userByAccount = new Map(accounts.map((a) => [a.id, a.userId]))

  const clusters = new Map<
    string,
    { key: ClusterKey; userIds: Set<string>; orderIds: string[] }
  >()
  for (const o of orders) {
    if (!o.executedAt) continue
    const userId = userByAccount.get(o.tradingAccountId)
    if (!userId) continue
    const bucket = Math.floor(o.executedAt.getTime() / windowMs)
    const sigKey = `${o.symbol}|${o.orderSide}|${bucket}`
    let entry = clusters.get(sigKey)
    if (!entry) {
      entry = {
        key: { symbol: o.symbol, orderSide: String(o.orderSide), bucket },
        userIds: new Set(),
        orderIds: [],
      }
      clusters.set(sigKey, entry)
    }
    entry.userIds.add(userId)
    if (entry.orderIds.length < 25) entry.orderIds.push(o.id)
  }

  const fires: RuleFireResult[] = []
  clusters.forEach((entry, sigKey) => {
    if (entry.userIds.size < params.minAccounts) return

    const sortedUsers = Array.from(entry.userIds).sort()
    const ringLeader = sortedUsers[0]
    const overshoot = entry.userIds.size / params.minAccounts
    const confidenceScore = parseConfidenceScore(rule.baseConfidence + (overshoot - 1) * 25)

    const evidence: Record<string, unknown> = {
      symbol: entry.key.symbol,
      orderSide: entry.key.orderSide,
      bucketStart: new Date(entry.key.bucket * windowMs).toISOString(),
      windowSec: params.windowSec,
      userCount: entry.userIds.size,
      userIds: sortedUsers,
      orderIdsSample: entry.orderIds,
      params: { ...params } as Record<string, unknown>,
    }

    fires.push({
      dedupeKey: `cluster:${sigKey}`,
      relatedUserId: ringLeader,
      confidenceScore,
      message: `Coordinated trading: ${entry.userIds.size} accounts opened ${entry.key.symbol} ${entry.key.orderSide} within ${params.windowSec}s.`,
      evidence,
    })
  })
  return fires
}
