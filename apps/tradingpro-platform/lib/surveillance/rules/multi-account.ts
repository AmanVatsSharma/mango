/**
 * File:        lib/surveillance/rules/multi-account.ts
 * Module:      Surveillance · MULTI_ACCOUNT
 * Purpose:     Batch rule. Detects clusters of accounts sharing IP fingerprint, network key,
 *              or device id. Reuses UserSessionRecord (Phase 5 contact-cluster source).
 *              Catches multi-accounting and IB collusion at the auth layer.
 *
 * Exports:
 *   - MultiAccountParams   — { minClusterSize, lookbackDays, autoDismissBelow }
 *   - MultiAccountContext  — { batchAt }
 *   - evaluateMultiAccount
 *
 * Depends on:
 *   - @/lib/prisma — reads UserSessionRecord.
 *
 * Side-effects: none.
 *
 * Key invariants:
 *   - Cluster signature = whichever fingerprint surfaced the cluster (network|ip|device, in
 *     that priority). dedupeKey = `${dimension}:${value}`. Stable across batch runs.
 *   - Affiliate/IB users are NOT auto-flagged (a single IB device shared by their team is
 *     legitimate). The rule emits the alert and the operator reviews.
 *
 * Read order:
 *   1. evaluateMultiAccount — three grouping passes.
 *
 * Author:      StockTrade
 * Last-updated: 2026-04-30
 */

import { prisma } from "@/lib/prisma"
import {
  parseConfidenceScore,
  type RuleFireResult,
  type SurveillanceParams,
  type SurveillanceEvaluator,
} from "../types"

export interface MultiAccountParams extends SurveillanceParams {
  minClusterSize: number
  lookbackDays: number
}

export interface MultiAccountContext {
  batchAt: Date
}

const DEFAULTS: MultiAccountParams = {
  minClusterSize: 3,
  lookbackDays: 30,
  autoDismissBelow: 55,
}

type Dimension = "networkKey" | "ipFingerprint" | "deviceId"

export const evaluateMultiAccount: SurveillanceEvaluator<
  MultiAccountContext,
  MultiAccountParams
> = async (rule, ctx) => {
  const params = { ...DEFAULTS, ...rule.params }
  const since = new Date(ctx.batchAt.getTime() - params.lookbackDays * 24 * 60 * 60 * 1000)

  const sessions = await prisma.userSessionRecord.findMany({
    where: { lastSeenAt: { gte: since }, revokedAt: null },
    select: {
      userId: true,
      ipFingerprint: true,
      networkKey: true,
      deviceId: true,
    },
  })

  const fires: RuleFireResult[] = []
  const seen = new Set<string>() // dedupe within this batch run; @@unique handles cross-run.

  for (const dim of ["networkKey", "ipFingerprint", "deviceId"] as Dimension[]) {
    const groups = new Map<string, Set<string>>()
    for (const s of sessions) {
      const value = s[dim]
      if (!value) continue
      let users = groups.get(value)
      if (!users) {
        users = new Set()
        groups.set(value, users)
      }
      users.add(s.userId)
    }
    groups.forEach((users, value) => {
      if (users.size < params.minClusterSize) return
      const dedupeKey = `${dim}:${value}`
      if (seen.has(dedupeKey)) return
      seen.add(dedupeKey)

      const sorted = Array.from(users).sort()
      const overshoot = users.size / params.minClusterSize
      const confidenceScore = parseConfidenceScore(rule.baseConfidence + (overshoot - 1) * 20)

      const evidence: Record<string, unknown> = {
        dimension: dim,
        fingerprintValue: value,
        userCount: users.size,
        userIds: sorted,
        lookbackDays: params.lookbackDays,
        params: { ...params } as Record<string, unknown>,
      }

      fires.push({
        dedupeKey,
        relatedUserId: sorted[0],
        confidenceScore,
        message: `Multi-account cluster: ${users.size} users share ${dim}.`,
        evidence,
      })
    })
  }

  return fires
}
